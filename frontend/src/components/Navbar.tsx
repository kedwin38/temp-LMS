import React, { useState } from 'react';
import { User } from '../types';
import { SchoolLogo } from './SchoolLogo';
import { WhoAreYouModal } from './WhoAreYouModal';
import { LogOut, User as UserIcon, Shield, BookOpen, GraduationCap } from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  users: User[];
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  users,
  onLoginSuccess,
  onLogout,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Shield className="w-3 h-3" /> Administrator
          </span>
        );
      case 'INSTRUCTOR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <BookOpen className="w-3 h-3" /> Teacher
          </span>
        );
      case 'STUDENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <GraduationCap className="w-3 h-3" /> Student
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Institution Brand */}
            <div className="flex items-center gap-3">
              <SchoolLogo size={46} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold tracking-tight text-white font-serif">
                    SHIRE JAMA
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Center for Adult Learning
                </p>
              </div>
            </div>

            {/* User Session Action Panel */}
            <div className="flex items-center gap-4">
              {currentUser ? (
                <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700 py-1.5 px-3 rounded-lg">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-white leading-tight">{currentUser.fullName}</p>
                    <div className="mt-0.5">{getRoleBadge(currentUser.role)}</div>
                  </div>
                  <button
                    onClick={onLogout}
                    title="Sign Out"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-md bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 px-5 rounded-lg shadow transition-colors"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Sign In / Portal Access</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* "Who are you?" Modal */}
      {isModalOpen && (
        <WhoAreYouModal
          users={users}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onLoginSuccess={(user) => {
            onLoginSuccess(user);
            setIsModalOpen(false);
          }}
        />
      )}
    </>
  );
};