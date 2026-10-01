from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Course, LearningMaterial, Quiz, Question, Choice, QuizAttempt, QuizAnswerAttachment


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'student_id', 'instructor_code', 'is_active')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        ('Institutional LMS Information', {
            'fields': ('role', 'student_id', 'instructor_code')
        }),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Institutional LMS Information', {
            'fields': ('role', 'student_id', 'instructor_code')
        }),
    )


class LearningMaterialInline(admin.TabularInline):
    model = LearningMaterial
    extra = 1


class QuizInline(admin.TabularInline):
    model = Quiz
    extra = 1


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('title', 'instructor', 'created_at', 'updated_at')
    search_fields = ('title', 'description', 'instructor__username')
    inlines = [LearningMaterialInline, QuizInline]


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 4


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('prompt', 'quiz', 'order')
    inlines = [ChoiceInline]


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'passing_score_percent', 'created_at')


@admin.register(LearningMaterial)
class LearningMaterialAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'material_type', 'file_size_display', 'uploaded_at')
    list_filter = ('material_type',)


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'quiz', 'score', 'total_questions', 'percentage', 'completed_at')
    list_filter = ('quiz', 'completed_at')


@admin.register(QuizAnswerAttachment)
class QuizAnswerAttachmentAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'uploaded_at')