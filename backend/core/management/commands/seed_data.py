from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from core.models import Course, Quiz, Question, Choice

User = get_user_model()


class Command(BaseCommand):
    help = 'Seeds initial Shire Jama Adult School demo accounts and curriculum'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Shire Jama Adult School institutional data...")

        # 1. Institutional Administrator
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@shirejama.edu',
                'first_name': 'Hassan',
                'last_name': 'Warsame',
                'role': User.Role.ADMIN,
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
            }
        )
        admin_user.set_password('Admin2024!')
        admin_user.role = User.Role.ADMIN
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
        self.stdout.write(self.style.SUCCESS("✓ Administrator account ready (username: admin, pass: Admin2024!)"))

        # 2. Faculty Instructor 1
        inst1, _ = User.objects.get_or_create(
            username='alinur',
            defaults={
                'email': 'ali.nur@shirejama.edu',
                'first_name': 'Ali',
                'last_name': 'Nur',
                'role': User.Role.INSTRUCTOR,
                'instructor_code': 'INST-101',
                'is_active': True,
            }
        )
        inst1.set_password('Instructor2024!')
        inst1.save()

        # 3. Faculty Instructor 2
        inst2, _ = User.objects.get_or_create(
            username='megal',
            defaults={
                'email': 'm.egal@shirejama.edu',
                'first_name': 'Maryan',
                'last_name': 'Egal',
                'role': User.Role.INSTRUCTOR,
                'instructor_code': 'INST-102',
                'is_active': True,
            }
        )
        inst2.set_password('Instructor2024!')
        inst2.save()
        self.stdout.write(self.style.SUCCESS("✓ Instructors ready (alinur, megal / pass: Instructor2024!)"))

        # 4. Adult Learner (Student)
        student, _ = User.objects.get_or_create(
            username='faiza',
            defaults={
                'email': 'faiza.jama@example.com',
                'first_name': 'Faiza',
                'last_name': 'Jama',
                'role': User.Role.STUDENT,
                'student_id': 'STD-2024-001',
                'is_active': True,
            }
        )
        student.set_password('Student2024!')
        student.save()
        self.stdout.write(self.style.SUCCESS("✓ Student ready (faiza / pass: Student2024!)"))

        # 5. Course: Somali Literacy & Shire Jama Script
        course1, _ = Course.objects.get_or_create(
            title='Somali Script & Functional Adult Literacy',
            instructor=inst1,
            defaults={
                'description': 'Foundational literacy program focusing on reading fluency, grammar, and official written Somali using the script formalized by Shire Jama Ahmed in 1972.'
            }
        )

        # 6. Sample Quiz for Course 1
        quiz1, _ = Quiz.objects.get_or_create(
            course=course1,
            title='Module 1: Somali Orthography & Phonetics Quiz',
            defaults={
                'instructions': 'Answer all 3 questions on the official Latin orthography introduced by Shire Jama Ahmed.',
                'passing_score_percent': 70
            }
        )

        # Question 1
        if not quiz1.questions.exists():
            q1 = Question.objects.create(
                quiz=quiz1,
                prompt='In what year did Shire Jama Ahmed’s modified Latin orthography become officially adopted for the Somali language?',
                order=1
            )
            Choice.objects.create(question=q1, text='1960', is_correct=False)
            Choice.objects.create(question=q1, text='1972', is_correct=True)
            Choice.objects.create(question=q1, text='1985', is_correct=False)
            Choice.objects.create(question=q1, text='1991', is_correct=False)

            q2 = Question.objects.create(
                quiz=quiz1,
                prompt='How are long vowel sounds represented in written Somali orthography?',
                order=2
            )
            Choice.objects.create(question=q2, text='By doubling the vowel letter (e.g., aa, ee, oo)', is_correct=True)
            Choice.objects.create(question=q2, text='By using diacritical accent marks', is_correct=False)
            Choice.objects.create(question=q2, text='By adding an "h" at the end of each syllable', is_correct=False)
            Choice.objects.create(question=q2, text='Vowels are never elongated in written text', is_correct=False)

            q3 = Question.objects.create(
                quiz=quiz1,
                prompt='Which letter represents the voiceless pharyngeal fricative sound (ح) in the Somali alphabet?',
                order=3
            )
            Choice.objects.create(question=q3, text='Letter "X"', is_correct=True)
            Choice.objects.create(question=q3, text='Letter "C"', is_correct=False)
            Choice.objects.create(question=q3, text='Letter "Q"', is_correct=False)
            Choice.objects.create(question=q3, text='Letter "KH"', is_correct=False)

        # 7. Course: Practical English & Numeracy
        Course.objects.get_or_create(
            title='Practical Workplace English & Everyday Numeracy',
            instructor=inst2,
            defaults={
                'description': 'Essential vocabulary, practical conversational skills, and practical mathematical operations for adults in commerce and modern workplaces.'
            }
        )

        self.stdout.write(self.style.SUCCESS("All seed data created successfully!"))