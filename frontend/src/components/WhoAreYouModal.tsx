import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { SchoolLogo } from './SchoolLogo';
import { GraduationCap, BookOpen, Shield, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';

interface WhoAreYouModalProps {
  users: User[];
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export const WhoAreYouModal: React.FC<WhoAreYouModalProps> = ({
  users,
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  // Form Inputs
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleBackToRoles = () => {
    setSelectedRole(null);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter both username/email and password.');
      return;
    }

    setLoading(true);

    try {
      const { user } = await api.login(identifier.trim(), password);
      if (user.role !== selectedRole && user.role !== 'ADMIN') {
        setErrorMsg(`Authenticated as ${user.role}, but you selected ${selectedRole}. Please select your correct role.`);
        setLoading(false);
        return;
      }
      onLoginSuccess(user);
      setLoading(false);
      return;
    } catch (error) {
      setLoading(false);
      setErrorMsg(error instanceof Error ? error.message : 'Could not sign in. Check your connection and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 text-center border-b border-slate-800">
          <div className="flex justify-center mb-2">
            <SchoolLogo size={48} />
          </div>
          <h2 className="text-xl font-extrabold font-serif">Shire Jama Institutional Portal</h2>
          <p className="text-xs text-slate-400 mt-1">
            Access your courses, teacher management, or adult learner dashboard
          </p>
        </div>

        <div className="p-6">
          {/* Step 1: Role Selection Cards */}
          {!selectedRole && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-700 text-center mb-4">
                Please select your institutional role to proceed:
              </p>

              <div className="grid grid-cols-1 gap-3">
                {/* Student Card */}
                <button
                  onClick={() => handleSelectRole('STUDENT')}
                  className="flex items-center gap-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 transition-all text-left group"
                >
                  <div className="p-3 rounded-lg bg-blue-600 text-white group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Student</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Access your courses, watch lectures, and complete quizzes.
                    </p>
                  </div>
                </button>

                {/* Instructor Card */}
                <button
                  onClick={() => handleSelectRole('INSTRUCTOR')}
                  className="flex items-center gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-300 transition-all text-left group"
                >
                  <div className="p-3 rounded-lg bg-amber-600 text-white group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Teacher</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Publish courses, upload PDF readers & video lectures, and evaluate students.
                    </p>
                  </div>
                </button>

                {/* Admin Card */}
                <button
                  onClick={() => handleSelectRole('ADMIN')}
                  className="flex items-center gap-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition-all text-left group"
                >
                  <div className="p-3 rounded-lg bg-emerald-800 text-white group-hover:scale-105 transition-transform">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Administrator</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Provision teacher accounts, manage active user statuses, and view analytics.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Role Sign-In / Student Registration */}
          {selectedRole && (
            <div className="space-y-4">
              <button
                onClick={handleBackToRoles}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Switch Role</span>
              </button>

              {/* Status Notifications */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              {selectedRole === 'STUDENT' ? (
                <div>
                  <form onSubmit={handleSignIn} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                          Username or Student Email
                        </label>
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="e.g. faiza or faiza.hassan@example.com"
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                          Password
                        </label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                        Sign In as Student
                      </button>

                  </form>
                </div>
              ) : (
                /* Instructor / Admin Form */
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      {selectedRole === 'INSTRUCTOR' ? 'Teacher Username / Email' : 'Admin Username'}
                    </label>
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={selectedRole === 'INSTRUCTOR' ? 'e.g. alinur' : 'e.g. admin'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2.5 px-4 text-white font-bold text-sm rounded-md transition-colors shadow-sm flex items-center justify-center gap-2 ${
                      selectedRole === 'INSTRUCTOR'
                        ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
                        : 'bg-emerald-800 hover:bg-emerald-900 disabled:bg-emerald-700'
                    }`}
                  >
                    {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Sign In as {selectedRole === 'INSTRUCTOR' ? 'Teacher' : 'Administrator'}
                  </button>

                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};