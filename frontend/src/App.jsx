import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StudentDashboard } from './pages/StudentDashboard';
import { InstructorDashboard } from './pages/InstructorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { SchoolLogo } from './components/SchoolLogo';
import { api } from './services/api';

export default function App() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadAccountData = async (user) => {
    setLoadError('');
    try {
      const [liveCourses, liveAttempts] = await Promise.all([api.getCourses(), api.getQuizAttempts()]);
      setCourses(liveCourses);
      setAttempts(liveAttempts);
      setUsers(user.role === 'ADMIN' ? await api.getUsers() : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load records from the server.');
    }
  };

  useEffect(() => {
    async function restoreSession() {
      if (!api.hasSession()) return;
      try {
        const user = await api.getCurrentUser();
        setCurrentUser(user);
        await loadAccountData(user);
      } catch {
        await api.clearTokens();
      }
    }
    restoreSession();
  }, []);

  // Authentication Handlers
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    loadAccountData(user);
  };

  const handleLogout = () => {
    api.clearTokens();
    setCurrentUser(null);
  };

  const handleQuizSubmit = (attempt) => {
    setAttempts((prev) => [attempt, ...prev]);
  };

  const handleUpdateAttempt = (updatedAttempt) => {
    setAttempts((prev) => prev.map((attempt) => attempt.id === updatedAttempt.id ? updatedAttempt : attempt));
  };

  // Instructor Actions
  const handleCreateCourse = (newCourse) => {
    setCourses((prev) => [newCourse, ...prev]);
  };

  const handleUpdateCourse = (updatedCourse) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c))
    );
  };

  const handleDeleteCourse = (courseId) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  // Admin Actions
  const handleAddInstructor = (newInstructor) => {
    setUsers((prev) => [...prev, newInstructor]);
  };

  const handleAddStudent = (newStudent) => {
    setUsers((prev) => {
      const updated = [...prev, newStudent];
      return updated;
    });
  };

  const handleUpdateUser = (updatedUser) => {
    setUsers((prev) => {
      const updated = prev.map((user) => (user.id === updatedUser.id ? updatedUser : user));
      return updated;
    });
    setCurrentUser((current) => current?.id === updatedUser.id ? updatedUser : current);
  };

  const handleToggleUserStatus = (userId) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u))
    );
  };

  const handleResetPassword = (userId, newPass) => {
    console.log(`Password reset for user ${userId}: ${newPass}`);
  };

  const handleDeleteUser = (userId) => {
    setUsers((prev) => {
      const updated = prev.filter((user) => user.id !== userId);
      return updated;
    });
  };

  const accessibleCourses = currentUser?.role === 'STUDENT'
    ? courses
        .map((course) => ({
          ...course,
          materials: course.materials,
          chapters: course.chapters,
        }))
        .filter((course) => course.academicLevels?.includes(currentUser.academicLevel))
    : courses;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <Navbar
        currentUser={currentUser}
        users={users}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{loadError}</p>}
        {!currentUser && (
          <div className="text-center py-16 px-4 bg-white rounded-2xl shadow-sm border border-slate-200 mt-4">
            <div className="flex justify-center mb-6">
              <SchoolLogo size={96} />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl font-serif">
              Shire Jama Learning Management System
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Access your courses, learning materials, and assessment progress in one place.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <p className="text-sm font-semibold text-emerald-800 bg-emerald-50 py-2.5 px-5 rounded-full border border-emerald-200 shadow-sm">
                Click &quot;Sign In / Portal Access&quot; in the header above to begin learning or instructing.
              </p>
            </div>
          </div>
        )}

        {currentUser?.role === 'STUDENT' && (
          <StudentDashboard
            student={currentUser}
            courses={accessibleCourses}
            attempts={attempts}
            onQuizSubmit={handleQuizSubmit}
          />
        )}

        {currentUser?.role === 'INSTRUCTOR' && (
          <InstructorDashboard
            instructor={currentUser}
            courses={courses}
            onCreateCourse={handleCreateCourse}
            onUpdateCourse={handleUpdateCourse}
            onDeleteCourse={handleDeleteCourse}
            allAttempts={attempts}
            onUpdateAttempt={handleUpdateAttempt}
          />
        )}

        {currentUser?.role === 'ADMIN' && (
          <AdminDashboard
            adminUser={currentUser}
            users={users}
            courses={courses}
            attempts={attempts}
            onAddInstructor={handleAddInstructor}
            onAddStudent={handleAddStudent}
            onUpdateUser={handleUpdateUser}
            onToggleUserStatus={handleToggleUserStatus}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteUser}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>Shire Jama Learning Center &copy; {new Date().getFullYear()} — Institutional LMS Architecture.</p>
      </footer>
    </div>
  );
}