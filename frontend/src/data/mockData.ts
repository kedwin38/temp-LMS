import { Course, QuizAttempt, User } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'u-admin-1',
    username: 'admin',
    fullName: 'Mohamed Ibrahim',
    email: 'admin@shirejama.edu',
    role: 'ADMIN',
    isActive: true,
    dateJoined: '2024-01-10',
  },
];


export const INITIAL_COURSES_WITH_CHAPTERS: Course[] = [];

export const INITIAL_QUIZ_ATTEMPTS: QuizAttempt[] = [];