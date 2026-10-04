export type UserRole = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
export type AcademicLevel =
  | 'CLASS_1' | 'CLASS_2' | 'CLASS_3' | 'CLASS_4' | 'CLASS_5' | 'CLASS_6' | 'CLASS_7' | 'CLASS_8'
  | 'FORM_1' | 'FORM_2' | 'FORM_3' | 'FORM_4';

export const ACADEMIC_LEVELS: { value: AcademicLevel; label: string }[] = [
  ...Array.from({ length: 8 }, (_, index) => ({ value: `CLASS_${index + 1}` as AcademicLevel, label: `Class ${index + 1}` })),
  ...Array.from({ length: 4 }, (_, index) => ({ value: `FORM_${index + 1}` as AcademicLevel, label: `Form ${index + 1}` })),
];

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  dateJoined: string;
  studentId?: string;
  instructorCode?: string;
  academicLevel?: AcademicLevel;
}

export type MaterialType = 'PDF' | 'VIDEO';

export interface LearningMaterial {
  id: string;
  courseId: string;
  title: string;
  type: MaterialType;
  fileName: string;
  fileSize: string;
  fileUrl: string;
  uploadDate: string;
  description?: string;
  academicLevel?: AcademicLevel;
  allowDownload?: boolean;
}

export interface Choice {
  id: string;
  text: string;
  isCorrect?: boolean; // Masked for students, present for instructors/admins
}

export interface Question {
  id: string;
  prompt: string;
  choices: Choice[];
  questionType?: 'MULTIPLE_CHOICE' | 'DOCUMENT';
  questionFileUrl?: string;
}

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  passingScorePercent: number;
  resultsVisibleToStudents?: boolean;
  questions: Question[];
  chapterId?: string;
  isTimed?: boolean;
  timeLimitMinutes?: number | null;
  opensAt?: string | null;
  closesAt?: string | null;
  maxAttempts?: number | null;
  attemptsUsed?: number | null;
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  order: number;
  materials: LearningMaterial[];
  quizzes: Quiz[];
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  score: number | null;
  totalQuestions: number;
  percentage: number | null;
  completedAt: string;
  answers: Record<string, string>; // questionId -> choiceId or typed answer
  answerFiles?: Record<string, string>;
  resultAvailable?: boolean;
  answerReview?: Array<{
    questionId: string;
    question: string;
    questionType?: 'MULTIPLE_CHOICE' | 'DOCUMENT';
    questionFile?: string | null;
    selectedAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean;
    answerFile?: string | null;
  }>;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  instructorId: string;
  instructorName: string;
  createdAt: string;
  updatedAt: string;
  materials: LearningMaterial[];
  quizzes: Quiz[];
  chapters: Chapter[];
  academicLevels: AcademicLevel[];
}