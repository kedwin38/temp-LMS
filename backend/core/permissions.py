from rest_framework import permissions
from .models import User


class IsAdminUserRole(permissions.BasePermission):
    """
    Allows access only to authenticated users with the institutional ADMIN role or superusers.
    """
    message = "Administrator privileges are required to perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_active and
            (request.user.role == User.Role.ADMIN or request.user.is_superuser)
        )


class IsInstructorUserRole(permissions.BasePermission):
    """
    Allows access only to authenticated users with the INSTRUCTOR role.
    """
    message = "Faculty Instructor privileges are required to perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_active and
            (request.user.role == User.Role.INSTRUCTOR or request.user.is_superuser)
        )


class IsStudentUserRole(permissions.BasePermission):
    """
    Allows access only to authenticated users with the STUDENT role.
    """
    message = "Student privileges are required to perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_active and
            request.user.role == User.Role.STUDENT
        )


class IsInstructorOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission: allows access only to the instructor who owns the course,
    or an institutional administrator.
    """
    message = "You do not have permission to modify another instructor's course materials."

    def has_object_permission(self, request, view, obj):
        # Safe methods (GET, HEAD, OPTIONS) are allowed for any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return True

        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role == User.Role.ADMIN or request.user.is_superuser:
            return True

        # Check course ownership
        if hasattr(obj, 'instructor'):
            return obj.instructor == request.user
        elif hasattr(obj, 'course'):
            return obj.course.instructor == request.user

        return False