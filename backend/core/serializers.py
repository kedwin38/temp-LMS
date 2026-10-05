from .models import User, QuizAnswerAttachment
from rest_framework import serializers
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Chapter, ChapterProgress, Course, LearningMaterial, Quiz, Question, Choice, QuizAttempt

User = get_user_model()


# ----------------------------------------------------------------------
# USER & PROFILE SERIALIZERS
# ----------------------------------------------------------------------

class UserProfileSerializer(serializers.ModelSerializer):
    fullName = serializers.SerializerMethodField()
    academicLevel = serializers.CharField(source='academic_level', allow_null=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'fullName',
            'role',
            'student_id',
            'instructor_code',
            'academicLevel',
            'is_active',
            'date_joined',
        ]
        read_only_fields = ['id', 'role', 'date_joined']

    def get_fullName(self, obj):
        return obj.get_full_name() or obj.username


class AdminCreateInstructorSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(write_only=True, required=True)
    temporaryPassword = serializers.CharField(write_only=True, required=False, default='ShireJama2024!')

    class Meta:
        model = User
        fields = ['fullName', 'email', 'username', 'instructor_code', 'temporaryPassword']

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("An instructor with this email already exists.")
        return normalized

    def validate_temporaryPassword(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        full_name = validated_data.pop('fullName').strip()
        password = validated_data.pop('temporaryPassword', 'ShireJama2024!')
        email = validated_data['email']

        names = full_name.split(' ', 1)
        first_name = names[0]
        last_name = names[1] if len(names) > 1 else ''

        username = validated_data.get('username') or email.split('@')[0]
        explicit_instructor_code = validated_data.get('instructor_code')

        max_attempts = 10
        for attempt in range(max_attempts):
            instructor_code = explicit_instructor_code
            if not instructor_code:
                code_num = User.objects.filter(role=User.Role.INSTRUCTOR).count() + 101 + attempt
                instructor_code = f"INST-{code_num}"
            try:
                with transaction.atomic():
                    return User.objects.create_user(
                        username=username,
                        email=email,
                        password=password,
                        first_name=first_name,
                        last_name=last_name,
                        role=User.Role.INSTRUCTOR,
                        instructor_code=instructor_code,
                        is_active=True
                    )
            except IntegrityError:
                # A collision on an auto-generated code is a transient race (another
                # request grabbed the same count-based number first) -- regenerate and
                # retry. A collision on an explicit code, a username race, or exhausting
                # all retries is a real conflict: surface it as a clean validation error
                # instead of a raw 500.
                if explicit_instructor_code or attempt == max_attempts - 1:
                    raise serializers.ValidationError(
                        {'detail': 'Could not provision this instructor account due to a conflicting username or instructor code. Please try again.'}
                    )
                continue


class AdminCreateStudentSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(write_only=True, required=True)
    temporaryPassword = serializers.CharField(write_only=True, required=True, min_length=6)
    academicLevel = serializers.ChoiceField(source='academic_level', choices=User.AcademicLevel.choices, required=True)

    class Meta:
        model = User
        fields = ['fullName', 'email', 'temporaryPassword', 'academicLevel']

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_temporaryPassword(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        full_name = validated_data.pop('fullName').strip()
        password = validated_data.pop('temporaryPassword')
        email = validated_data['email']
        names = full_name.split(' ', 1)
        base_username = email.split('@')[0]

        max_attempts = 10
        for attempt in range(max_attempts):
            username = base_username if attempt == 0 else f"{base_username}{attempt}"
            student_count = User.objects.filter(role=User.Role.STUDENT).count()
            student_id = f"STD-{timezone.now().year}-{student_count + 1001 + attempt}"
            try:
                with transaction.atomic():
                    return User.objects.create_user(
                        username=username,
                        email=email,
                        password=password,
                        first_name=names[0],
                        last_name=names[1] if len(names) > 1 else '',
                        role=User.Role.STUDENT,
                        student_id=student_id,
                        academic_level=validated_data['academic_level'],
                        is_active=True,
                    )
            except IntegrityError:
                if attempt == max_attempts - 1:
                    raise serializers.ValidationError(
                        {'detail': 'Could not provision this student account due to a conflicting username or student ID. Please try again.'}
                    )
                continue

class AdminUserUpdateSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(required=False, write_only=True)
    studentId = serializers.CharField(source='student_id', required=False, allow_blank=True, allow_null=True)
    instructorCode = serializers.CharField(source='instructor_code', required=False, allow_blank=True, allow_null=True)
    academicLevel = serializers.ChoiceField(source='academic_level', choices=User.AcademicLevel.choices, required=False, allow_null=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    dateJoined = serializers.DateTimeField(source='date_joined', read_only=True, format='%Y-%m-%d')

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'fullName', 'role', 'studentId', 'instructorCode', 'academicLevel', 'isActive', 'dateJoined']
        read_only_fields = ['id', 'role', 'dateJoined']

    def update(self, instance, validated_data):
        full_name = validated_data.pop('fullName', None)
        if full_name is not None:
            names = full_name.strip().split(' ', 1)
            instance.first_name = names[0]
            instance.last_name = names[1] if len(names) > 1 else ''
        # student_id/instructor_code are unique=True, null=True at the DB level.
        # Multiple NULLs don't collide under a unique constraint, but multiple empty
        # strings do -- normalize a cleared field to NULL instead of saving ''.
        for blank_ok_field in ('student_id', 'instructor_code'):
            if validated_data.get(blank_ok_field) == '':
                validated_data[blank_ok_field] = None
        for field, value in validated_data.items():
            setattr(instance, field, value)
        try:
            instance.save()
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {'detail': 'That student ID or instructor code is already in use by another account.'}
            ) from exc
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['fullName'] = instance.get_full_name() or instance.username
        return data


# ----------------------------------------------------------------------
# COURSE & MATERIAL SERIALIZERS
# ----------------------------------------------------------------------

class LearningMaterialSerializer(serializers.ModelSerializer):
    fileUrl = serializers.SerializerMethodField()
    fileSize = serializers.CharField(source='file_size_display', read_only=True)
    type = serializers.CharField(source='material_type')
    uploadDate = serializers.DateTimeField(source='uploaded_at', format='%Y-%m-%d', read_only=True)
    allowDownload = serializers.BooleanField(source='allow_download', read_only=True)
    chapterId = serializers.IntegerField(source='chapter_id', read_only=True)

    class Meta:
        model = LearningMaterial
        fields = [
            'id',
            'title',
            'type',
            'description',
            'fileUrl',
            'fileSize',
            'uploadDate',
            'allowDownload',
            'chapterId',
        ]

    def to_representation(self, instance):
        request = self.context.get('request')
        if request and request.user.is_authenticated and request.user.is_student():
            if request.user.academic_level not in instance.course.level_values:
                return None
        return super().to_representation(instance)

    def get_fileUrl(self, obj):
        request = self.context.get('request')
        if request and obj.file:
            return request.build_absolute_uri(reverse('material_stream', kwargs={'material_id': obj.id}))
        if obj.file:
            return obj.file.url
        return ''


# ----------------------------------------------------------------------
# QUIZ SERIALIZERS
# ----------------------------------------------------------------------

class ChoiceSerializer(serializers.ModelSerializer):
    isCorrect = serializers.SerializerMethodField()

    class Meta:
        model = Choice
        fields = ['id', 'text', 'isCorrect']

    def get_isCorrect(self, obj):
        request = self.context.get('request')
        # Only staff, admins, or instructors can view the correct answers
        if request and request.user.is_authenticated and request.user.role in [User.Role.INSTRUCTOR, User.Role.ADMIN]:
            return obj.is_correct
        return None  # Masked for students


class QuestionSerializer(serializers.ModelSerializer):
    choices = ChoiceSerializer(many=True, read_only=True)
    questionType = serializers.CharField(source='question_type')
    questionFile = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ['id', 'prompt', 'order', 'choices', 'questionType', 'questionFile']

    def get_questionFile(self, obj):
        if not obj.question_file:
            return None
        request = self.context.get('request')
        url = reverse('question_file_stream', kwargs={'question_id': obj.id})
        return request.build_absolute_uri(url) if request else url


class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    passingScorePercent = serializers.IntegerField(source='passing_score_percent')
    resultsVisibleToStudents = serializers.BooleanField(source='results_visible_to_students')
    opensAt = serializers.TimeField(source='opens_at', format='%H:%M', allow_null=True)
    closesAt = serializers.TimeField(source='closes_at', format='%H:%M', allow_null=True)
    chapterId = serializers.IntegerField(source='chapter_id', read_only=True)
    isTimed = serializers.BooleanField(source='is_timed', read_only=True)
    timeLimitMinutes = serializers.IntegerField(source='time_limit_minutes', read_only=True)
    maxAttempts = serializers.IntegerField(source='max_attempts', read_only=True, allow_null=True)
    attemptsUsed = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            'id',
            'title',
            'instructions',
            'passingScorePercent',
            'resultsVisibleToStudents',
            'opensAt',
            'closesAt',
            'questions',
            'chapterId',
            'isTimed',
            'timeLimitMinutes',
            'maxAttempts',
            'attemptsUsed',
        ]

    def get_attemptsUsed(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or not request.user.is_student():
            return None
        return obj.attempts.filter(student=request.user).count()


class ChapterSerializer(serializers.ModelSerializer):
    materials = serializers.SerializerMethodField()
    quizzes = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()

    class Meta:
        model = Chapter
        fields = ['id', 'title', 'order', 'materials', 'quizzes', 'completed']

    def get_materials(self, obj):
        request = self.context.get('request')
        materials = obj.materials.all()
        return LearningMaterialSerializer(materials, many=True, context=self.context).data

    def get_quizzes(self, obj):
        request = self.context.get('request')
        quizzes = obj.quizzes.all()
        return QuizSerializer(quizzes, many=True, context=self.context).data

    def get_completed(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and ChapterProgress.objects.filter(student=request.user, chapter=obj).exists())


class CourseDetailSerializer(serializers.ModelSerializer):
    instructorName = serializers.SerializerMethodField()
    instructorId = serializers.IntegerField(source='instructor.id', read_only=True)
    materials = serializers.SerializerMethodField()
    quizzes = serializers.SerializerMethodField()
    chapters = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', format='%Y-%m-%d', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', format='%Y-%m-%d', read_only=True)
    academicLevels = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'id',
            'title',
            'description',
            'instructorId',
            'instructorName',
            'createdAt',
            'updatedAt',
            'materials',
            'quizzes',
            'chapters',
            'academicLevels',
        ]

    def get_instructorName(self, obj):
        return obj.instructor.get_full_name() or obj.instructor.username

    def get_materials(self, obj):
        request = self.context.get('request')
        materials = obj.materials.all()
        return LearningMaterialSerializer(materials, many=True, context=self.context).data

    def get_academicLevels(self, obj):
        return obj.level_values

    def get_chapters(self, obj):
        return ChapterSerializer(obj.chapters.all(), many=True, context=self.context).data

    def get_quizzes(self, obj):
        request = self.context.get('request')
        quizzes = obj.quizzes.all()
        if request and request.user.is_authenticated and request.user.is_student():
            quizzes = [quiz for quiz in quizzes if request.user.academic_level in quiz.course.level_values]
        return QuizSerializer(quizzes, many=True, context=self.context).data


class CourseListSerializer(serializers.ModelSerializer):
    instructorName = serializers.SerializerMethodField()
    instructorId = serializers.IntegerField(source='instructor.id', read_only=True)
    materialsCount = serializers.IntegerField(source='materials.count', read_only=True)
    quizzesCount = serializers.IntegerField(source='quizzes.count', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', format='%Y-%m-%d', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', format='%Y-%m-%d', read_only=True)
    academicLevels = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'id',
            'title',
            'description',
            'instructorId',
            'instructorName',
            'materialsCount',
            'quizzesCount',
            'createdAt',
            'updatedAt',
            'academicLevels',
        ]

    def get_instructorName(self, obj):
        return obj.instructor.get_full_name() or obj.instructor.username

    def get_academicLevels(self, obj):
        return obj.level_values


# ----------------------------------------------------------------------
# QUIZ SUBMISSION & ATTEMPT SERIALIZERS
# ----------------------------------------------------------------------

class QuizAttemptSerializer(serializers.ModelSerializer):
    studentName = serializers.SerializerMethodField()
    studentId = serializers.IntegerField(source='student_id', read_only=True)
    quizId = serializers.IntegerField(source='quiz_id', read_only=True)
    quizTitle = serializers.CharField(source='quiz.title', read_only=True)
    courseTitle = serializers.CharField(source='quiz.course.title', read_only=True)
    completedAt = serializers.DateTimeField(source='completed_at', format='%Y-%m-%d %H:%M', read_only=True)
    answerReview = serializers.SerializerMethodField()
    totalQuestions = serializers.IntegerField(source='total_questions')
    resultAvailable = serializers.SerializerMethodField()
    answers = serializers.JSONField(read_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            'id',
            'quizId',
            'studentId',
            'studentName',
            'quizTitle',
            'courseTitle',
            'answers',
            'score',
            'totalQuestions',
            'percentage',
            'completedAt',
            'answerReview',
            'resultAvailable',
        ]

    def get_studentName(self, obj):
        return obj.student.get_full_name() or obj.student.username

    def get_answerReview(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated or request.user.role not in [User.Role.INSTRUCTOR, User.Role.ADMIN]:
            return []

        review = []
        request = self.context.get('request')
        for question in obj.quiz.questions.prefetch_related('choices').all():
            selected_id = str(obj.answers.get(str(question.id), ''))
            selected = next((choice for choice in question.choices.all() if str(choice.id) == selected_id), None)
            correct = next((choice for choice in question.choices.all() if choice.is_correct), None)
            answer_attachment = next((attachment for attachment in obj.answer_attachments.all() if attachment.question_id == question.id), None)
            answer_file = None
            if answer_attachment:
                answer_file = reverse('quiz_answer_attachment_stream', kwargs={'attachment_id': answer_attachment.id})
                if request:
                    answer_file = request.build_absolute_uri(answer_file)
            question_file = None
            if question.question_file:
                question_file = reverse('question_file_stream', kwargs={'question_id': question.id})
                if request:
                    question_file = request.build_absolute_uri(question_file)
            review.append({
                'questionId': question.id,
                'question': question.prompt,
                'questionType': question.question_type,
                'questionFile': question_file,
                'selectedAnswer': selected.text if selected else obj.answers.get(str(question.id)),
                'correctAnswer': correct.text if question.question_type == Question.QuestionType.MULTIPLE_CHOICE and correct else None,
                'isCorrect': bool(question.question_type == Question.QuestionType.MULTIPLE_CHOICE and selected and correct and selected.id == correct.id),
                'answerFile': answer_file,
            })
        return review

    def get_resultAvailable(self, obj):
        return obj.score is not None and (
            obj.quiz.results_visible_to_students or
            obj.quiz.questions.filter(question_type=Question.QuestionType.DOCUMENT).exists()
        )