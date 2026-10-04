from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    class AcademicLevel(models.TextChoices):
        CLASS_1 = 'CLASS_1', 'Class 1'
        CLASS_2 = 'CLASS_2', 'Class 2'
        CLASS_3 = 'CLASS_3', 'Class 3'
        CLASS_4 = 'CLASS_4', 'Class 4'
        CLASS_5 = 'CLASS_5', 'Class 5'
        CLASS_6 = 'CLASS_6', 'Class 6'
        CLASS_7 = 'CLASS_7', 'Class 7'
        CLASS_8 = 'CLASS_8', 'Class 8'
        FORM_1 = 'FORM_1', 'Form 1'
        FORM_2 = 'FORM_2', 'Form 2'
        FORM_3 = 'FORM_3', 'Form 3'
        FORM_4 = 'FORM_4', 'Form 4'

    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        INSTRUCTOR = 'INSTRUCTOR', 'Instructor'
        STUDENT = 'STUDENT', 'Student'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        help_text="Exact institutional role: ADMIN, INSTRUCTOR, or STUDENT"
    )
    student_id = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text="Institutional Student ID (e.g. STD-2024-001)"
    )
    instructor_code = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text="Faculty Staff Code (e.g. INST-101)"
    )
    academic_level = models.CharField(
        max_length=7,
        choices=AcademicLevel.choices,
        blank=True,
        null=True,
        help_text="Class or form assigned to the user"
    )

    def is_administrator(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    def is_instructor(self):
        return self.role == self.Role.INSTRUCTOR

    def is_student(self):
        return self.role == self.Role.STUDENT

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class Course(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField()
    instructor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='courses',
        limit_choices_to={'role': User.Role.INSTRUCTOR}
    )
    academic_levels = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def level_values(self):
        return self.academic_levels or []


class Chapter(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='chapters')
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['course', 'order'], name='unique_course_chapter_order'),
        ]

    def __str__(self):
        return f'{self.course.title} - {self.title}'


def course_material_upload_path(instance, filename):
    # Organizes files cleanly by course: materials/course_<id>/<filename>
    return f"materials/course_{instance.course.id}/{instance.material_type.lower()}s/{filename}"


class LearningMaterial(models.Model):
    class MaterialType(models.TextChoices):
        PDF = 'PDF', 'PDF Document'
        VIDEO = 'VIDEO', 'Video Lecture'

    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='materials'
    )
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='materials', null=True, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    material_type = models.CharField(
        max_length=10,
        choices=MaterialType.choices
    )
    allow_download = models.BooleanField(default=False)
    file = models.FileField(upload_to=course_material_upload_path)
    file_size_display = models.CharField(max_length=50, blank=True, default='')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"{self.title} ({self.material_type}) - {self.course.title}"


class Quiz(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name='quizzes'
    )
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='quizzes', null=True, blank=True)
    title = models.CharField(max_length=255)
    instructions = models.TextField(
        blank=True,
        default='Please read each question carefully and select the best answer.'
    )
    passing_score_percent = models.PositiveIntegerField(default=70)
    results_visible_to_students = models.BooleanField(default=False)
    is_timed = models.BooleanField(default=False)
    time_limit_minutes = models.PositiveIntegerField(null=True, blank=True)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True)
    max_attempts = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of times a student may submit this quiz. Blank means unlimited."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Quizzes'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.title} - {self.course.title}"


class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = 'MULTIPLE_CHOICE', 'Multiple choice'
        DOCUMENT = 'DOCUMENT', 'Document response'

    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.CASCADE,
        related_name='questions'
    )
    prompt = models.TextField(blank=True, default='')
    question_type = models.CharField(max_length=20, choices=QuestionType.choices, default=QuestionType.MULTIPLE_CHOICE)
    question_file = models.FileField(upload_to='quiz/questions/', blank=True, null=True)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Q: {self.prompt[:60]}"


class Choice(models.Model):
    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name='choices'
    )
    text = models.CharField(max_length=350)
    is_correct = models.BooleanField(
        default=False,
        help_text="Specifies if this option is the correct answer"
    )

    def __str__(self):
        return f"{self.text} ({'Correct' if self.is_correct else 'Incorrect'})"


class QuizAttempt(models.Model):
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='quiz_attempts',
        limit_choices_to={'role': User.Role.STUDENT}
    )
    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.CASCADE,
        related_name='attempts'
    )
    score = models.PositiveIntegerField(null=True, blank=True)
    total_questions = models.PositiveIntegerField()
    percentage = models.FloatField(null=True, blank=True)
    answers = models.JSONField(default=dict)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-completed_at']

    def __str__(self):
        return f"{self.student.get_full_name()} - {self.quiz.title}: {self.score}/{self.total_questions}"


class QuizAnswerAttachment(models.Model):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name='answer_attachments')
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answer_attachments')
    file = models.FileField(upload_to='quiz/answers/')
    uploaded_at = models.DateTimeField(auto_now_add=True)


class ChapterProgress(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chapter_progress')
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='student_progress')
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['student', 'chapter'], name='unique_student_chapter_progress'),
        ]

    def __str__(self):
        return f'{self.student} - {self.chapter}'