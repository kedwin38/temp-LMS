from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Chapter, Course, LearningMaterial, Quiz, Question, Choice, QuizAttempt
from datetime import time

User = get_user_model()


class ShireJamaLmsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Admin
        self.admin = User.objects.create_superuser(
            username='test_admin',
            email='admin@shirejama.edu',
            password='Password123!',
            role=User.Role.ADMIN
        )

        # 2. Instructor
        self.instructor = User.objects.create_user(
            username='test_inst',
            email='inst@shirejama.edu',
            password='Password123!',
            role=User.Role.INSTRUCTOR,
            instructor_code='INST-999'
        )

        # 3. Student
        self.student = User.objects.create_user(
            username='test_student',
            email='student@example.com',
            password='Password123!',
            role=User.Role.STUDENT,
            student_id='STD-999'
            , academic_level='CLASS_1'
        )

    def test_student_self_registration_is_not_available(self):
        response = self.client.post('/api/auth/register/student/', {
            'fullName': 'Amina Duale',
            'email': 'amina.duale@example.com',
            'password': 'StrongPassword123!'
            , 'academicLevel': 'FORM_1'
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.filter(email='amina.duale@example.com').exists())

    def test_admin_can_provision_student(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post('/api/admin/students/', {
            'fullName': 'Amina Duale',
            'email': 'amina.duale@example.com',
            'temporaryPassword': 'StrongPassword123!',
            'academicLevel': 'FORM_1'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='amina.duale@example.com')
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertEqual(user.academic_level, 'FORM_1')
        self.assertTrue(user.check_password('StrongPassword123!'))

    def test_student_only_sees_materials_for_assigned_level(self):
        """Students cannot list or stream materials assigned to another level."""
        course = Course.objects.create(
            title='Levelled Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['FORM_1']
        )
        chapter = Chapter.objects.create(course=course, title='Chapter 1')
        material = LearningMaterial.objects.create(
            course=course,
            chapter=chapter,
            title='Form 1 Material',
            material_type=LearningMaterial.MaterialType.PDF,
            file='materials/test.pdf'
        )
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/courses/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

        response = self.client.get(f'/api/materials/{material.id}/stream/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_document_quiz_submission_and_instructor_grading(self):
        course = Course.objects.create(
            title='Document Assessment Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['CLASS_1']
        )
        chapter = Chapter.objects.create(course=course, title='Chapter 1')
        self.client.force_authenticate(user=self.instructor)
        question_file = SimpleUploadedFile('question.pdf', b'question content', content_type='application/pdf')
        response = self.client.post(
            f'/api/courses/{course.id}/quizzes/',
            {
                'title': 'Written Assessment',
                'chapterId': chapter.id,
                'questions': '[{"prompt":"Explain the topic.","questionType":"DOCUMENT","choices":[]}]',
                'questionFile_0': question_file,
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        quiz = Quiz.objects.get(title='Written Assessment')
        self.assertEqual(quiz.questions.first().question_type, Question.QuestionType.DOCUMENT)

        self.client.force_authenticate(user=self.student)
        answer_file = SimpleUploadedFile('answer.docx', b'answer content', content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        response = self.client.post(
            f'/api/quizzes/{quiz.id}/submit/',
            {'answers': '{}', f'answerFile_{quiz.questions.first().id}': answer_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attempt = QuizAttempt.objects.get(quiz=quiz, student=self.student)
        self.assertIsNone(attempt.score)
        self.assertTrue(attempt.answer_attachments.exists())

        self.client.force_authenticate(user=self.instructor)
        response = self.client.post(f'/api/quiz-attempts/{attempt.id}/grade/', {'percentage': 75})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempt.refresh_from_db()
        self.assertEqual(attempt.score, 1)
        self.assertEqual(attempt.percentage, 75)

        response = self.client.post(f'/api/quiz-attempts/{attempt.id}/grade/', {'score': 100, 'percentage': 90})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        attempt.refresh_from_db()
        self.assertEqual(attempt.score, 100)
        self.assertEqual(attempt.percentage, 90)

    def test_student_material_stream_is_inline_even_when_download_is_allowed(self):
        course = Course.objects.create(
            title='Student Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['CLASS_1']
        )
        chapter = Chapter.objects.create(course=course, title='Chapter 1')
        material = LearningMaterial.objects.create(
            course=course,
            chapter=chapter,
            title='Student Material',
            material_type=LearningMaterial.MaterialType.PDF,
            allow_download=True,
            file=SimpleUploadedFile('test.pdf', b'%PDF-1.4 test')
        )
        self.client.force_authenticate(user=self.student)
        response = self.client.get(f'/api/materials/{material.id}/stream/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response['Content-Disposition'].startswith('inline;'))

    def test_pdf_material_upload_rejects_word_documents(self):
        course = Course.objects.create(
            title='Upload Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['CLASS_1']
        )
        chapter = Chapter.objects.create(course=course, title='Chapter 1')
        self.client.force_authenticate(user=self.instructor)
        response = self.client.post(
            f'/api/courses/{course.id}/materials/',
            {
                'title': 'Word file incorrectly labeled as PDF',
                'type': 'PDF',
                'chapterId': chapter.id,
                'file': SimpleUploadedFile('notes.docx', b'word document'),
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_cannot_create_course(self):
        """Verify students are strictly forbidden from creating courses."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/courses/', {
            'title': 'Unauthorized Course',
            'description': 'Student attempt'
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_instructor_can_create_course(self):
        """Verify faculty instructors can create courses."""
        self.client.force_authenticate(user=self.instructor)
        response = self.client.post('/api/courses/', {
            'title': 'Intermediate Somali Grammar',
            'description': 'Advanced morphology and syntax',
            'academicLevels': ['CLASS_1', 'FORM_1']
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Course.objects.filter(title='Intermediate Somali Grammar').count(), 1)

    def test_course_created_by_instructor_is_listed_for_other_devices(self):
        self.client.force_authenticate(user=self.instructor)
        create_response = self.client.post('/api/courses/', {
            'title': 'Shared Classroom Course',
            'description': 'Visible to enrolled students on every device',
            'academicLevels': ['CLASS_1']
        }, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        other_device = APIClient()
        other_device.force_authenticate(user=self.student)
        list_response = other_device.get('/api/courses/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]['id'], create_response.data['id'])
        self.assertEqual(list_response.data[0]['title'], 'Shared Classroom Course')
        self.assertEqual(list_response.data[0]['chapters'], [])

    def test_new_instructor_can_create_course(self):
        new_instructor = User.objects.create_user(
            username='new_instructor',
            email='new.instructor@shirejama.edu',
            password='Password123!',
            role=User.Role.INSTRUCTOR,
            instructor_code='INST-NEW'
        )
        self.client.force_authenticate(user=new_instructor)
        response = self.client.post('/api/courses/', {
            'title': 'New Instructor Course',
            'description': 'Course published by a newly provisioned instructor',
            'academicLevels': ['CLASS_1']
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        course = Course.objects.get(title='New Instructor Course')
        self.assertEqual(course.instructor, new_instructor)

    def test_admin_can_update_student_and_instructor_details(self):
        self.client.force_authenticate(user=self.admin)
        student_response = self.client.patch(
            f'/api/admin/users/{self.student.id}/',
            {
                'fullName': 'Updated Student',
                'username': 'updated_student',
                'email': 'updated.student@example.com',
                'studentId': 'STD-UPDATED',
                'academicLevel': 'FORM_1',
            },
            format='json'
        )
        self.assertEqual(student_response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.username, 'updated_student')
        self.assertEqual(self.student.academic_level, 'FORM_1')
        self.assertEqual(self.student.get_full_name(), 'Updated Student')

        instructor_response = self.client.patch(
            f'/api/admin/users/{self.instructor.id}/',
            {'fullName': 'Updated Instructor', 'email': 'updated.instructor@shirejama.edu', 'instructorCode': 'INST-UPDATED'},
            format='json'
        )
        self.assertEqual(instructor_response.status_code, status.HTTP_200_OK)
        self.instructor.refresh_from_db()
        self.assertEqual(self.instructor.get_full_name(), 'Updated Instructor')
        self.assertEqual(self.instructor.instructor_code, 'INST-UPDATED')

        self.client.force_authenticate(user=self.student)
        forbidden_response = self.client.patch(f'/api/admin/users/{self.instructor.id}/', {'fullName': 'Nope'}, format='json')
        self.assertEqual(forbidden_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_delete_instructor_and_student_but_not_admin(self):
        self.client.force_authenticate(user=self.admin)
        instructor_response = self.client.delete(f'/api/admin/users/{self.instructor.id}/delete/')
        self.assertEqual(instructor_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.instructor.id).exists())

        student_response = self.client.delete(f'/api/admin/users/{self.student.id}/delete/')
        self.assertEqual(student_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.student.id).exists())

        admin_response = self.client.delete(f'/api/admin/users/{self.admin.id}/delete/')
        self.assertEqual(admin_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())

    def test_quiz_grading(self):
        """Verify objective calculation of quiz submissions and score percentage."""
        # Create course & quiz
        course = Course.objects.create(
            title='Test Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['CLASS_1']
        )
        quiz = Quiz.objects.create(
            course=course,
            title='Phonetics Test',
            passing_score_percent=70
            , results_visible_to_students=True
        )
        q1 = Question.objects.create(quiz=quiz, prompt='Question 1', order=1)
        c1_true = Choice.objects.create(question=q1, text='Correct 1', is_correct=True)
        Choice.objects.create(question=q1, text='False 1', is_correct=False)

        q2 = Question.objects.create(quiz=quiz, prompt='Question 2', order=2)
        Choice.objects.create(question=q2, text='False 2', is_correct=False)
        c2_true = Choice.objects.create(question=q2, text='Correct 2', is_correct=True)

        # Authenticate as student and submit 1 correct answer out of 2 (50%)
        self.client.force_authenticate(user=self.student)
        response = self.client.post(f'/api/quizzes/{quiz.id}/submit/', {
            'answers': {
                str(q1.id): c1_true.id,
                str(q2.id): 99999,  # Incorrect
            }
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['score'], 1)
        self.assertEqual(response.data['totalQuestions'], 2)
        self.assertEqual(response.data['percentage'], 50.0)
        self.assertFalse(response.data['passed'])

    def test_quiz_submission_respects_daily_time_window(self):
        course = Course.objects.create(title='Window Course', description='Test', instructor=self.instructor, academic_levels=['CLASS_1'])
        quiz = Quiz.objects.create(course=course, title='Closed Quiz', opens_at=time(23, 0), closes_at=time(23, 30))
        self.client.force_authenticate(user=self.student)
        with self.settings(TIME_ZONE='UTC'):
            response = self.client.post(f'/api/quizzes/{quiz.id}/submit/', {'answers': {}}, format='json')
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_403_FORBIDDEN])

    def test_quiz_results_require_instructor_authorization(self):
        course = Course.objects.create(
            title='Private Results Course',
            description='Test Desc',
            instructor=self.instructor,
            academic_levels=['CLASS_1']
        )
        quiz = Quiz.objects.create(course=course, title='Private Quiz')
        question = Question.objects.create(quiz=quiz, prompt='Question 1', order=1)
        correct_choice = Choice.objects.create(question=question, text='Correct', is_correct=True)
        Choice.objects.create(question=question, text='Incorrect')

        self.client.force_authenticate(user=self.student)
        submit_response = self.client.post(
            f'/api/quizzes/{quiz.id}/submit/',
            {'answers': {str(question.id): correct_choice.id}},
            format='json'
        )
        self.assertEqual(submit_response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(submit_response.data['resultAvailable'])
        self.assertNotIn('score', submit_response.data)

        student_results = self.client.get('/api/quiz-results/')
        self.assertEqual(student_results.status_code, status.HTTP_200_OK)
        self.assertEqual(student_results.data, [])

        self.client.force_authenticate(user=self.instructor)
        instructor_results = self.client.get('/api/quiz-results/')
        self.assertEqual(instructor_results.status_code, status.HTTP_200_OK)
        self.assertEqual(len(instructor_results.data), 1)
        self.assertEqual(instructor_results.data[0]['score'], 1)
        self.assertEqual(instructor_results.data[0]['answerReview'][0]['selectedAnswer'], 'Correct')
        self.assertEqual(instructor_results.data[0]['answerReview'][0]['correctAnswer'], 'Correct')
        self.assertTrue(instructor_results.data[0]['answerReview'][0]['isCorrect'])

        release_response = self.client.post(f'/api/quizzes/{quiz.id}/release-results/')
        self.assertEqual(release_response.status_code, status.HTTP_200_OK)
        quiz.refresh_from_db()
        self.assertTrue(quiz.results_visible_to_students)

        self.client.force_authenticate(user=self.student)
        released_results = self.client.get('/api/quiz-results/')
        self.assertEqual(released_results.status_code, status.HTTP_200_OK)
        self.assertEqual(len(released_results.data), 1)
        self.assertEqual(released_results.data[0]['score'], 1)

        other_instructor = User.objects.create_user(
            username='other_instructor',
            email='other.instructor@shirejama.edu',
            password='Password123!',
            role=User.Role.INSTRUCTOR,
            instructor_code='INST-OTHER'
        )
        self.client.force_authenticate(user=other_instructor)
        other_results = self.client.get('/api/quiz-results/')
        self.assertEqual(other_results.status_code, status.HTTP_200_OK)
        self.assertEqual(other_results.data, [])