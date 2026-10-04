from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from datetime import time
from django.utils import timezone
import mimetypes
from pathlib import Path
from django.db.models import Q

from .models import Chapter, ChapterProgress, Course, LearningMaterial, Quiz, Question, Choice, QuizAttempt, QuizAnswerAttachment
from .permissions import (
    IsAdminUserRole,
    IsInstructorUserRole,
    IsStudentUserRole,
    IsInstructorOwnerOrAdmin,
)
from .serializers import (
    UserProfileSerializer,
    AdminCreateInstructorSerializer,
    AdminCreateStudentSerializer,
    AdminUserUpdateSerializer,
    CourseListSerializer,
    CourseDetailSerializer,
    ChapterSerializer,
    LearningMaterialSerializer,
    QuizSerializer,
    QuizAttemptSerializer,
)
from .streaming import stream_video_file, stream_file_field
from .authentication import QueryParamJWTAuthentication

User = get_user_model()


# ----------------------------------------------------------------------
# AUTHENTICATION & PROFILE VIEWS
# ----------------------------------------------------------------------

class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Login endpoint. Returns JWT tokens along with institutional role and profile details.
    """
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        identifier = request.data.get('username', '')
        user = User.objects.filter(username__iexact=identifier).first()
        if not user and '@' in identifier:
            user = User.objects.filter(email__iexact=identifier).first()
        if user:
            request._full_data = request.data.copy()
            request._full_data['username'] = user.username

        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            if user:
                if not user.is_active:
                    return Response(
                        {"detail": "This institutional account has been deactivated by administration."},
                        status=status.HTTP_403_FORBIDDEN
                    )
                response.data['user'] = UserProfileSerializer(user).data
        return response


class CurrentUserProfileView(APIView):
    """
    Returns the authenticated user's current institutional profile.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)


# ----------------------------------------------------------------------
# COURSES & MATERIALS VIEWS
# ----------------------------------------------------------------------

class CourseListView(APIView):
    """
    GET: List courses (instructors see their own, students/admins see all).
    POST: Instructors create a new course.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == User.Role.INSTRUCTOR:
            courses = Course.objects.filter(instructor=user)
        elif user.role == User.Role.STUDENT:
            if user.academic_level:
                courses = [course for course in Course.objects.all() if user.academic_level in course.level_values]
            else:
                courses = Course.objects.none()
        else:
            courses = Course.objects.all()

        serializer = CourseDetailSerializer(courses, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        if request.user.role != User.Role.INSTRUCTOR and not request.user.is_superuser:
            return Response(
                {"detail": "Only faculty instructors can create new courses."},
                status=status.HTTP_403_FORBIDDEN
            )

        title = request.data.get('title', '').strip()
        description = request.data.get('description', '').strip()
        academic_levels = request.data.get('academicLevels', [])
        valid_levels = {value for value, _ in User.AcademicLevel.choices}
        if not isinstance(academic_levels, list) or not academic_levels or any(level not in valid_levels for level in academic_levels):
            return Response({'academicLevels': ['Select one or more valid classes or forms.']}, status=status.HTTP_400_BAD_REQUEST)

        if not title:
            return Response(
                {"title": ["Course title is required."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        course = Course.objects.create(
            title=title,
            description=description,
            instructor=request.user
            , academic_levels=academic_levels
        )
        serializer = CourseDetailSerializer(course, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CourseDetailView(APIView):
    """
    GET: Retrieve course details with materials and quizzes.
    PUT: Update course metadata (owner instructor or admin).
    DELETE: Delete course (owner instructor or admin).
    """
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def get_object(self, course_id):
        try:
            return Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return None

    def get(self, request, course_id):
        course = self.get_object(course_id)
        if not course:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.is_student() and request.user.academic_level not in course.level_values:
            return Response({"detail": "You do not have access to this course."}, status=status.HTTP_403_FORBIDDEN)

        self.check_object_permissions(request, course)
        serializer = CourseDetailSerializer(course, context={'request': request})
        return Response(serializer.data)

    def put(self, request, course_id):
        course = self.get_object(course_id)
        if not course:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, course)

        title = request.data.get('title', '').strip()
        description = request.data.get('description', '').strip()
        academic_levels = request.data.get('academicLevels')
        valid_levels = {value for value, _ in User.AcademicLevel.choices}

        if title:
            course.title = title
        if description:
            course.description = description
        if academic_levels is not None:
            if not isinstance(academic_levels, list) or not academic_levels or any(level not in valid_levels for level in academic_levels):
                return Response({'academicLevels': ['Select one or more valid classes or forms.']}, status=status.HTTP_400_BAD_REQUEST)
            course.academic_levels = academic_levels
        course.save()

        serializer = CourseDetailSerializer(course, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, course_id):
        course = self.get_object(course_id)
        if not course:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, course)
        course.delete()
        return Response({"message": "Course deleted successfully."}, status=status.HTTP_204_NO_CONTENT)


class MaterialUploadView(APIView):
    """
    Upload PDFs or large video lectures to a course.
    """
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def post(self, request, course_id):
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, course)

        file = request.FILES.get('file')
        title = request.data.get('title', '').strip()
        material_type = request.data.get('type', 'PDF').upper()
        description = request.data.get('description', '')
        file_size_display = request.data.get('fileSize', '')

        if not file or not title:
            return Response(
                {"detail": "Both a valid file and material title are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if material_type not in [LearningMaterial.MaterialType.PDF, LearningMaterial.MaterialType.VIDEO]:
            return Response(
                {"detail": "Type must be either PDF or VIDEO."},
                status=status.HTTP_400_BAD_REQUEST
            )

        allowed_extensions = {
            LearningMaterial.MaterialType.PDF: {'.pdf'},
            LearningMaterial.MaterialType.VIDEO: {'.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.ogv', '.3gp', '.mpeg', '.mpg'},
        }
        extension = Path(file.name).suffix.lower()
        if extension not in allowed_extensions[material_type]:
            return Response({'detail': f'Unsupported {material_type.lower()} format: {extension or "missing extension"}.'}, status=status.HTTP_400_BAD_REQUEST)

        if not request.data.get('chapterId'):
            return Response(
                {"chapterId": ["A chapter is required for uploaded material."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        chapter = None
        chapter_id = request.data.get('chapterId')
        if chapter_id:
            chapter = Chapter.objects.filter(id=chapter_id, course=course).first()
            if not chapter:
                return Response({'chapterId': ['Chapter does not belong to this course.']}, status=status.HTTP_400_BAD_REQUEST)

        material = LearningMaterial.objects.create(
            course=course,
            title=title,
            material_type=material_type,
            file=file,
            description=description,
            file_size_display=file_size_display,
            chapter=chapter,
            allow_download=str(request.data.get('allowDownload', '')).lower() == 'true',
        )

        serializer = LearningMaterialSerializer(material, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MaterialDetailView(APIView):
    """
    DELETE: Remove a course material (owner instructor or admin). The underlying
    file is removed too via the post_delete signal on LearningMaterial.
    """
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def delete(self, request, material_id):
        try:
            material = LearningMaterial.objects.get(id=material_id)
        except LearningMaterial.DoesNotExist:
            return Response({"detail": "Material not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, material)
        material.delete()
        return Response({"message": "Material deleted successfully."}, status=status.HTTP_204_NO_CONTENT)


class MaterialStreamView(APIView):
    """
    Streams large video lecture files with HTTP 206 Partial Content support,
    allowing instant seeking and scrubbing without high memory consumption.
    """
    permission_classes = [permissions.IsAuthenticated]
    # A native <video> tag issues its own Range-request GETs and can't attach
    # an Authorization header, so this view also accepts ?token=<access> --
    # see QueryParamJWTAuthentication.
    authentication_classes = [QueryParamJWTAuthentication]

    def get(self, request, material_id):
        try:
            material = LearningMaterial.objects.get(id=material_id)
        except LearningMaterial.DoesNotExist:
            return Response({"detail": "Material not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.is_student() and request.user.academic_level not in material.course.level_values:
            return Response({"detail": "You do not have access to this material."}, status=status.HTTP_403_FORBIDDEN)

        if not material.file or not material.file.name:
            return Response({"detail": "File not found on storage."}, status=status.HTTP_404_NOT_FOUND)

        if material.material_type == LearningMaterial.MaterialType.PDF and Path(material.file.name).suffix.lower() != '.pdf':
            return Response(
                {"detail": "This material is not a PDF. Ask the instructor to upload the document as a PDF."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
            )

        try:
            file_path = material.file.path
        except NotImplementedError:
            # Remote object storage (e.g. S3/R2) has no local filesystem path.
            # Redirect to a signed, time-limited URL so the browser streams
            # (and range-requests, for video scrubbing) directly from the
            # object store instead of proxying bytes through Django.
            from django.http import HttpResponseRedirect
            return HttpResponseRedirect(material.file.url)

        content_type = mimetypes.guess_type(material.file.name)[0] or ('video/mp4' if material.material_type == LearningMaterial.MaterialType.VIDEO else 'application/pdf')
        response = stream_video_file(request, file_path, content_type=content_type)
        if response is None:
            return Response({"detail": "Physical file missing on server disk."}, status=status.HTTP_404_NOT_FOUND)

        disposition = 'inline' if material.material_type == LearningMaterial.MaterialType.PDF else (
            'inline' if request.user.is_student() else ('attachment' if material.allow_download else 'inline')
        )
        response['Content-Disposition'] = f"{disposition}; filename=\"{material.file.name.split('/')[-1]}\""
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class QuestionFileStreamView(APIView):
    """
    Serves a quiz question's optional attached file -- a document a student
    must respond to (DOCUMENT questions) or an illustrative image/diagram a
    teacher optionally attaches to any question. Open to any student who can
    access the quiz's course, and to the course's instructor or an admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, question_id):
        question = Question.objects.select_related('quiz__course').filter(id=question_id).first()
        if not question or not question.question_file:
            return Response({"detail": "File not found."}, status=status.HTTP_404_NOT_FOUND)

        course = question.quiz.course
        user = request.user
        is_admin = user.role == User.Role.ADMIN or user.is_superuser
        is_owning_instructor = user.is_instructor() and course.instructor_id == user.id
        is_eligible_student = user.is_student() and user.academic_level in course.level_values
        if not (is_admin or is_owning_instructor or is_eligible_student):
            return Response({"detail": "You do not have access to this file."}, status=status.HTTP_403_FORBIDDEN)

        response = stream_file_field(request, question.question_file)
        if response is None:
            return Response({"detail": "Physical file missing on server disk."}, status=status.HTTP_404_NOT_FOUND)
        return response


class QuizAnswerAttachmentStreamView(APIView):
    """
    Serves a student's uploaded answer file for a document question. Visible
    only to the student who submitted it and to the owning instructor/admin
    who can grade it -- never to other students.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, attachment_id):
        attachment = QuizAnswerAttachment.objects.select_related(
            'attempt__student', 'attempt__quiz__course'
        ).filter(id=attachment_id).first()
        if not attachment or not attachment.file:
            return Response({"detail": "File not found."}, status=status.HTTP_404_NOT_FOUND)

        attempt = attachment.attempt
        course = attempt.quiz.course
        user = request.user
        is_admin = user.role == User.Role.ADMIN or user.is_superuser
        is_owning_instructor = user.is_instructor() and course.instructor_id == user.id
        is_owning_student = user.is_student() and attempt.student_id == user.id
        if not (is_admin or is_owning_instructor or is_owning_student):
            return Response({"detail": "You do not have access to this file."}, status=status.HTTP_403_FORBIDDEN)

        response = stream_file_field(request, attachment.file)
        if response is None:
            return Response({"detail": "Physical file missing on server disk."}, status=status.HTTP_404_NOT_FOUND)
        return response


# ----------------------------------------------------------------------
# QUIZZES & STUDENT ASSESSMENT VIEWS
# ----------------------------------------------------------------------

class QuizCreateView(APIView):
    """
    Create a new assessment with multiple choice questions and answers.
    """
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def post(self, request, course_id):
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, course)

        title = request.data.get('title', '').strip()
        instructions = request.data.get('instructions', '')
        try:
            passing_score = int(request.data.get('passingScorePercent', 70))
        except (TypeError, ValueError):
            return Response({'passingScorePercent': ['Passing score must be a whole number.']}, status=status.HTTP_400_BAD_REQUEST)
        results_visible = str(request.data.get('resultsVisibleToStudents', '')).lower() == 'true'
        is_timed = str(request.data.get('isTimed', '')).lower() == 'true'
        time_limit_minutes = request.data.get('timeLimitMinutes')
        opens_at_raw = request.data.get('opensAt') or None
        closes_at_raw = request.data.get('closesAt') or None
        max_attempts_raw = request.data.get('maxAttempts')
        max_attempts = None
        if max_attempts_raw not in (None, ''):
            try:
                max_attempts = int(max_attempts_raw)
            except (TypeError, ValueError):
                return Response({'maxAttempts': ['Max attempts must be a whole number.']}, status=status.HTTP_400_BAD_REQUEST)
            if max_attempts < 1:
                return Response({'maxAttempts': ['Max attempts must be at least 1, or left blank for unlimited.']}, status=status.HTTP_400_BAD_REQUEST)
        if is_timed:
            try:
                time_limit_valid = time_limit_minutes and int(time_limit_minutes) >= 1
            except (TypeError, ValueError):
                return Response({'timeLimitMinutes': ['Time limit must be a whole number.']}, status=status.HTTP_400_BAD_REQUEST)
            if not time_limit_valid:
                return Response({'timeLimitMinutes': ['A positive time limit is required for timed quizzes.']}, status=status.HTTP_400_BAD_REQUEST)
        if bool(opens_at_raw) != bool(closes_at_raw):
            return Response({'detail': 'Both opening and closing times are required for a quiz time window.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            opens_at = time.fromisoformat(opens_at_raw) if opens_at_raw else None
            closes_at = time.fromisoformat(closes_at_raw) if closes_at_raw else None
        except ValueError:
            return Response({'detail': 'Quiz times must use HH:MM format.'}, status=status.HTTP_400_BAD_REQUEST)
        if opens_at and closes_at == opens_at:
            return Response({'detail': 'Opening and closing times must be different.'}, status=status.HTTP_400_BAD_REQUEST)
        questions_data = request.data.get('questions', [])
        if isinstance(questions_data, str):
            import json
            try:
                questions_data = json.loads(questions_data)
            except json.JSONDecodeError:
                return Response({'questions': ['Questions payload must be valid JSON.']}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(questions_data, list):
            return Response({'questions': ['Questions payload must be a list.']}, status=status.HTTP_400_BAD_REQUEST)
        chapter = None
        chapter_id = request.data.get('chapterId')
        if chapter_id:
            chapter = Chapter.objects.filter(id=chapter_id, course=course).first()
            if not chapter:
                return Response({'chapterId': ['Chapter does not belong to this course.']}, status=status.HTTP_400_BAD_REQUEST)

        if not title:
            return Response({"detail": "Quiz title is required."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            quiz = Quiz.objects.create(
                course=course,
                title=title,
                instructions=instructions,
                passing_score_percent=passing_score,
                results_visible_to_students=results_visible,
                chapter=chapter,
                is_timed=is_timed,
                time_limit_minutes=int(time_limit_minutes) if is_timed else None,
                opens_at=opens_at,
                closes_at=closes_at,
                max_attempts=max_attempts,
            )

            for idx, q_data in enumerate(questions_data, start=1):
                prompt = q_data.get('prompt', '').strip()
                question_type = q_data.get('questionType', 'MULTIPLE_CHOICE')
                question_file = request.FILES.get(f'questionFile_{idx - 1}')
                if not prompt and not question_file:
                    continue
                question = Question.objects.create(
                    quiz=quiz,
                    prompt=prompt,
                    question_type=question_type,
                    question_file=question_file,
                    order=idx,
                )
                if question_type == Question.QuestionType.DOCUMENT:
                    continue
                for c_data in q_data.get('choices', []):
                    text = c_data.get('text', '').strip()
                    if text:
                        Choice.objects.create(
                            question=question,
                            text=text,
                            is_correct=c_data.get('isCorrect', False)
                        )

        serializer = QuizSerializer(quiz, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class QuizSubmitView(APIView):
    """
    Students submit their answers for a quiz.
    The backend evaluates the submitted choices against correct answers,
    records the attempt, and returns the score and percentage.
    """
    permission_classes = [permissions.IsAuthenticated, IsStudentUserRole]

    def post(self, request, quiz_id):
        try:
            quiz = Quiz.objects.get(id=quiz_id)
        except Quiz.DoesNotExist:
            return Response({"detail": "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.academic_level not in quiz.course.level_values:
            return Response({'detail': 'You do not have access to this chapter.'}, status=status.HTTP_403_FORBIDDEN)

        if quiz.max_attempts is not None:
            previous_attempts = QuizAttempt.objects.filter(student=request.user, quiz=quiz).count()
            if previous_attempts >= quiz.max_attempts:
                return Response(
                    {'detail': f'You have used all {quiz.max_attempts} allowed attempt(s) for this quiz.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        now = timezone.localtime().time()
        if quiz.opens_at and quiz.closes_at:
            within_window = quiz.opens_at <= now < quiz.closes_at if quiz.opens_at < quiz.closes_at else now >= quiz.opens_at or now < quiz.closes_at
            if not within_window:
                return Response({'detail': 'This quiz is currently closed.'}, status=status.HTTP_403_FORBIDDEN)

        answers = request.data.get('answers', {})  # Dict: { str(question_id): choice_id or typed answer }
        if isinstance(answers, str):
            import json
            try:
                answers = json.loads(answers)
            except json.JSONDecodeError:
                return Response({'answers': ['Answers payload must be valid JSON.']}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(answers, dict):
            return Response({'answers': ['Answers payload must be an object mapping question IDs to choice IDs.']}, status=status.HTTP_400_BAD_REQUEST)
        total_questions = quiz.questions.count()
        correct_count = 0

        for question in quiz.questions.all():
            if question.question_type == Question.QuestionType.DOCUMENT:
                continue
            selected_choice_id = answers.get(str(question.id))
            if selected_choice_id:
                is_correct = Choice.objects.filter(
                    id=selected_choice_id,
                    question=question,
                    is_correct=True
                ).exists()
                if is_correct:
                    correct_count += 1

        percentage = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0

        has_document_questions = quiz.questions.filter(question_type=Question.QuestionType.DOCUMENT).exists()
        attempt = QuizAttempt.objects.create(
            student=request.user,
            quiz=quiz,
            score=None if has_document_questions else correct_count,
            total_questions=total_questions,
            percentage=None if has_document_questions else percentage,
            answers={str(question_id): choice_id for question_id, choice_id in answers.items()},
        )

        for key, answer_file in request.FILES.items():
            if not key.startswith('answerFile_'):
                continue
            try:
                question_id = int(key.removeprefix('answerFile_'))
                question = quiz.questions.get(id=question_id)
            except (ValueError, Question.DoesNotExist):
                continue
            QuizAnswerAttachment.objects.create(attempt=attempt, question=question, file=answer_file)

        response_data = {
            'attemptId': attempt.id,
            'resultAvailable': quiz.results_visible_to_students and not has_document_questions,
            'completedAt': attempt.completed_at.strftime('%Y-%m-%d %H:%M'),
        }
        if quiz.results_visible_to_students and attempt.percentage is not None:
            response_data.update({
                'score': attempt.score,
                'totalQuestions': total_questions,
                'percentage': attempt.percentage,
                'passed': attempt.percentage >= quiz.passing_score_percent,
            })
        return Response(response_data, status=status.HTTP_201_CREATED)


class QuizAttemptGradeView(APIView):
    """Allows the course instructor or an administrator to grade an attempt."""
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def post(self, request, attempt_id):
        attempt = QuizAttempt.objects.select_related('quiz__course').filter(id=attempt_id).first()
        if not attempt:
            return Response({'detail': 'Quiz attempt not found.'}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, attempt.quiz.course)

        score_raw = request.data.get('score')
        percentage_raw = request.data.get('percentage')
        if score_raw in (None, '') and percentage_raw in (None, ''):
            return Response({'detail': 'Enter a score, a percentage, or both.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            score = int(score_raw) if score_raw not in (None, '') else None
            percentage = float(percentage_raw) if percentage_raw not in (None, '') else None
        except (TypeError, ValueError):
            return Response({'detail': 'Score and percentage must be numeric.'}, status=status.HTTP_400_BAD_REQUEST)

        if score is not None and score < 0:
            return Response({'score': ['Score cannot be negative.']}, status=status.HTTP_400_BAD_REQUEST)
        if percentage is not None and (percentage < 0 or percentage > 100):
            return Response({'percentage': ['Percentage must be between 0 and 100.']}, status=status.HTTP_400_BAD_REQUEST)
        if score is None:
            score = round((percentage / 100) * attempt.total_questions) if attempt.total_questions else 0
        if percentage is None:
            percentage = round((score / attempt.total_questions) * 100, 1) if attempt.total_questions else 0

        attempt.score = score
        attempt.percentage = percentage
        attempt.save(update_fields=['score', 'percentage'])
        return Response(QuizAttemptSerializer(attempt, context={'request': request}).data)


class QuizReleaseResultsView(APIView):
    """Allows the quiz owner or an administrator to release objective results."""
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def post(self, request, quiz_id):
        quiz = Quiz.objects.select_related('course').filter(id=quiz_id).first()
        if not quiz:
            return Response({'detail': 'Quiz not found.'}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, quiz.course)
        quiz.results_visible_to_students = True
        quiz.save(update_fields=['results_visible_to_students', 'updated_at'])
        return Response({'quizId': quiz.id, 'resultsVisibleToStudents': True})


class ChapterCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsInstructorOwnerOrAdmin]

    def post(self, request, course_id):
        course = Course.objects.filter(id=course_id).first()
        if not course:
            return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, course)
        title = request.data.get('title', '').strip()
        if not title:
            return Response({'title': ['Chapter title is required.']}, status=status.HTTP_400_BAD_REQUEST)

        explicit_order = request.data.get('order')
        if explicit_order not in (None, ''):
            try:
                explicit_order = int(explicit_order)
            except (TypeError, ValueError):
                return Response({'order': ['Order must be a whole number.']}, status=status.HTTP_400_BAD_REQUEST)
            if explicit_order < 1:
                return Response({'order': ['Order must be at least 1.']}, status=status.HTTP_400_BAD_REQUEST)
        else:
            explicit_order = None

        max_attempts = 10
        for attempt in range(max_attempts):
            order = explicit_order if explicit_order is not None else course.chapters.count() + 1 + attempt
            try:
                with transaction.atomic():
                    chapter = Chapter.objects.create(course=course, title=title, order=order)
                    break
            except IntegrityError:
                if explicit_order is not None or attempt == max_attempts - 1:
                    return Response({'order': ['That chapter order is already taken for this course.']}, status=status.HTTP_400_BAD_REQUEST)
                continue
        return Response(ChapterSerializer(chapter, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ChapterProgressView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStudentUserRole]

    def get(self, request, course_id):
        course = Course.objects.filter(id=course_id).first()
        if not course:
            return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.academic_level not in course.level_values:
            return Response({'detail': 'You do not have access to this course.'}, status=status.HTTP_403_FORBIDDEN)
        chapter_ids = Chapter.objects.filter(course_id=course_id).values_list('id', flat=True)
        completed = set(ChapterProgress.objects.filter(student=request.user, chapter_id__in=chapter_ids).values_list('chapter_id', flat=True))
        total = len(chapter_ids)
        return Response({'completedChapterIds': list(completed), 'completedCount': len(completed), 'totalChapters': total, 'percentage': round((len(completed) / total) * 100) if total else 0})

    def post(self, request, course_id):
        course = Course.objects.filter(id=course_id).first()
        if not course or request.user.academic_level not in course.level_values:
            return Response({'detail': 'You do not have access to this course.'}, status=status.HTTP_403_FORBIDDEN)
        chapter = Chapter.objects.filter(id=request.data.get('chapterId'), course_id=course_id).first()
        if not chapter:
            return Response({'detail': 'Chapter not found.'}, status=status.HTTP_404_NOT_FOUND)
        progress, _ = ChapterProgress.objects.get_or_create(student=request.user, chapter=chapter)
        return Response({'chapterId': chapter.id, 'completed': True, 'completedAt': progress.completed_at}, status=status.HTTP_200_OK)


class QuizResultsOverviewView(APIView):
    """
    List quiz attempts based on role:
    - Admin: All institutional attempts.
    - Instructor: Attempts for quizzes belonging to their courses.
    - Student: Their own quiz history.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == User.Role.ADMIN or user.is_superuser:
            attempts = QuizAttempt.objects.select_related('quiz', 'quiz__course', 'student').all()
        elif user.role == User.Role.INSTRUCTOR:
            attempts = QuizAttempt.objects.select_related('quiz', 'quiz__course', 'student').filter(
                quiz__course__instructor=user
            )
        else:
            attempts = QuizAttempt.objects.select_related('quiz', 'quiz__course', 'student').filter(
                student=user,
            ).filter(
                Q(quiz__results_visible_to_students=True) |
                Q(quiz__questions__question_type=Question.QuestionType.DOCUMENT, score__isnull=False)
            ).distinct()

        serializer = QuizAttemptSerializer(attempts, many=True, context={'request': request})
        return Response(serializer.data)


# ----------------------------------------------------------------------
# INSTITUTIONAL ADMINISTRATION VIEWS
# ----------------------------------------------------------------------

class AdminInstructorManagementView(APIView):
    """
    Allows the Administrator to list instructors or provision new faculty accounts.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get(self, request):
        instructors = User.objects.filter(role=User.Role.INSTRUCTOR).order_by('-date_joined')
        data = [
            {
                'id': i.id,
                'fullName': i.get_full_name() or i.username,
                'username': i.username,
                'email': i.email,
                'instructorCode': i.instructor_code,
                'isActive': i.is_active,
                'dateJoined': i.date_joined.strftime('%Y-%m-%d'),
                'coursesCount': i.courses.count(),
            }
            for i in instructors
        ]
        return Response(data)

    def post(self, request):
        serializer = AdminCreateInstructorSerializer(data=request.data)
        if serializer.is_valid():
            instructor = serializer.save()
            return Response(
                {
                    "message": "Instructor account successfully provisioned.",
                    "instructor": {
                        "id": instructor.id,
                        "fullName": instructor.get_full_name(),
                        "username": instructor.username,
                        "email": instructor.email,
                        "instructorCode": instructor.instructor_code,
                        "temporaryPassword": request.data.get('temporaryPassword', 'ShireJama2024!'),
                    }
                },
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminStudentManagementView(APIView):
    """Allows administrators to provision student accounts."""
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def get(self, request):
        students = User.objects.filter(role=User.Role.STUDENT).order_by('-date_joined')
        return Response(UserProfileSerializer(students, many=True).data)

    def post(self, request):
        serializer = AdminCreateStudentSerializer(data=request.data)
        if serializer.is_valid():
            student = serializer.save()
            return Response(
                {
                    "message": "Student account successfully provisioned.",
                    "student": UserProfileSerializer(student).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminToggleInstructorStatusView(APIView):
    """
    Administrator deactivates or reactivates an instructor.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def post(self, request, instructor_id):
        try:
            instructor = User.objects.get(id=instructor_id, role=User.Role.INSTRUCTOR)
        except User.DoesNotExist:
            return Response({"detail": "Instructor not found."}, status=status.HTTP_404_NOT_FOUND)

        instructor.is_active = not instructor.is_active
        instructor.save()

        return Response({
            "message": f"Account for {instructor.get_full_name()} is now {'active' if instructor.is_active else 'deactivated'}.",
            "isActive": instructor.is_active
        })


class AdminUserUpdateView(APIView):
    """Allow administrators to update active profile and role-specific details."""
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def patch(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminUserUpdateSerializer(target_user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminUserDeleteView(APIView):
    """Allow administrators to permanently delete instructor or student accounts."""
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def delete(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        if target_user == request.user or target_user.role == User.Role.ADMIN or target_user.is_superuser:
            return Response({'detail': 'Administrator accounts cannot be deleted here.'}, status=status.HTTP_400_BAD_REQUEST)

        if target_user.role == User.Role.INSTRUCTOR:
            course_count = target_user.courses.count()
            if course_count:
                return Response(
                    {'detail': (
                        f"Cannot delete this instructor: they still own {course_count} course(s), which would "
                        "permanently destroy all of that course's chapters, materials, quizzes, and student grades. "
                        "Deactivate the account instead, or reassign/delete their courses first."
                    )},
                    status=status.HTTP_400_BAD_REQUEST
                )

        target_user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminResetPasswordView(APIView):
    """
    Administrator resets credentials for any user account.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminUserRole]

    def post(self, request, user_id):
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        new_password = request.data.get('newPassword', '').strip()
        if not new_password:
            return Response(
                {"detail": "A new password is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            validate_password(new_password, user=target_user)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        target_user.set_password(new_password)
        target_user.save()

        return Response({
            "message": f"Password for {target_user.get_full_name() or target_user.username} successfully updated."
        })