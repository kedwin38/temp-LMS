from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CustomTokenObtainPairView,
    CurrentUserProfileView,
    CourseListView,
    CourseDetailView,
    MaterialUploadView,
    ChapterCreateView,
    ChapterProgressView,
    MaterialStreamView,
    QuestionFileStreamView,
    QuizAnswerAttachmentStreamView,
    QuizCreateView,
    QuizSubmitView,
    QuizResultsOverviewView,
    QuizAttemptGradeView,
    QuizReleaseResultsView,
    AdminInstructorManagementView,
    AdminStudentManagementView,
    AdminToggleInstructorStatusView,
        AdminUserUpdateView,
    AdminUserDeleteView,
    AdminResetPasswordView,
)

urlpatterns = [
    # ------------------------------------------------
    # Authentication & Profile
    # ------------------------------------------------
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='auth_login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', CurrentUserProfileView.as_view(), name='current_user_profile'),

    # ------------------------------------------------
    # Courses & Learning Materials
    # ------------------------------------------------
    path('courses/', CourseListView.as_view(), name='course_list'),
    path('courses/<int:course_id>/', CourseDetailView.as_view(), name='course_detail'),
    path('courses/<int:course_id>/materials/', MaterialUploadView.as_view(), name='material_upload'),
    path('courses/<int:course_id>/chapters/', ChapterCreateView.as_view(), name='chapter_create'),
    path('courses/<int:course_id>/progress/', ChapterProgressView.as_view(), name='chapter_progress'),
    path('materials/<int:material_id>/stream/', MaterialStreamView.as_view(), name='material_stream'),

    # ------------------------------------------------
    # Quizzes & Assessments
    # ------------------------------------------------
    path('courses/<int:course_id>/quizzes/', QuizCreateView.as_view(), name='quiz_create'),
    path('quizzes/<int:quiz_id>/submit/', QuizSubmitView.as_view(), name='quiz_submit'),
    path('quiz-results/', QuizResultsOverviewView.as_view(), name='quiz_results_overview'),
    path('quiz-attempts/<int:attempt_id>/grade/', QuizAttemptGradeView.as_view(), name='quiz_attempt_grade'),
    path('quizzes/<int:quiz_id>/release-results/', QuizReleaseResultsView.as_view(), name='quiz_release_results'),
    path('questions/<int:question_id>/file/', QuestionFileStreamView.as_view(), name='question_file_stream'),
    path('quiz-answers/<int:attachment_id>/file/', QuizAnswerAttachmentStreamView.as_view(), name='quiz_answer_attachment_stream'),

    # ------------------------------------------------
    # Institutional Admin Management
    # ------------------------------------------------
    path('admin/instructors/', AdminInstructorManagementView.as_view(), name='admin_instructors'),
    path('admin/students/', AdminStudentManagementView.as_view(), name='admin_students'),
    path('admin/instructors/<int:instructor_id>/toggle-status/', AdminToggleInstructorStatusView.as_view(), name='admin_toggle_instructor_status'),
        path('admin/users/<int:user_id>/', AdminUserUpdateView.as_view(), name='admin_user_update'),
    path('admin/users/<int:user_id>/delete/', AdminUserDeleteView.as_view(), name='admin_user_delete'),
    path('admin/users/<int:user_id>/reset-password/', AdminResetPasswordView.as_view(), name='admin_reset_password'),
]