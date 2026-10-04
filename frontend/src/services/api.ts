import { AcademicLevel, Chapter, Course, Quiz, QuizAttempt, User } from '../types';

const tokenStorageKey = 'shire-jama-auth-tokens';
const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

type ApiTokens = { access: string; refresh: string };
type ApiUser = {
  id: number | string;
  username: string;
  email: string;
  fullName?: string;
  role: User['role'];
  student_id?: string | null;
  instructor_code?: string | null;
  academicLevel?: AcademicLevel | null;
  academic_level?: AcademicLevel | null;
  is_active?: boolean;
  isActive?: boolean;
  date_joined?: string;
  dateJoined?: string;
};

const readTokens = (): ApiTokens | null => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(tokenStorageKey) || 'null') as ApiTokens | null;
  } catch {
    return null;
  }
};

const saveTokens = (tokens: ApiTokens) => {
  window.localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
};

const toUser = (user: ApiUser): User => ({
  id: String(user.id),
  username: user.username,
  fullName: user.fullName || user.username,
  email: user.email,
  role: user.role,
  isActive: user.is_active ?? user.isActive ?? true,
  dateJoined: user.date_joined || user.dateJoined || '',
  studentId: user.student_id || undefined,
  instructorCode: user.instructor_code || undefined,
  academicLevel: user.academicLevel || user.academic_level || undefined,
});

const mapQuiz = (quiz: Record<string, any>, courseId: string): Quiz => ({
  ...quiz,
  id: String(quiz.id),
  courseId,
  chapterId: quiz.chapterId == null ? undefined : String(quiz.chapterId),
  questions: (quiz.questions || []).map((question: Record<string, any>) => ({
    ...question,
    id: String(question.id),
    questionFileUrl: question.questionFile || question.questionFileUrl || undefined,
    choices: (question.choices || []).map((choice: Record<string, any>) => ({ ...choice, id: String(choice.id) })),
  })),
});

const mapCourse = (course: Record<string, any>): Course => {
  const courseId = String(course.id);
  const mapMaterial = (material: Record<string, any>) => ({
    ...material,
    id: String(material.id),
    courseId,
    chapterId: material.chapterId == null ? undefined : String(material.chapterId),
    fileName: material.fileName || material.fileUrl?.split('/').pop() || '',
    fileSize: material.fileSize || '',
  });
  return {
    ...course,
    id: courseId,
    instructorId: String(course.instructorId),
    materials: (course.materials || []).map(mapMaterial),
    quizzes: (course.quizzes || []).map((quiz: Record<string, any>) => mapQuiz(quiz, courseId)),
    chapters: (course.chapters || []).map((chapter: Record<string, any>) => ({
      ...chapter,
      id: String(chapter.id),
      courseId,
      materials: (chapter.materials || []).map(mapMaterial),
      quizzes: (chapter.quizzes || []).map((quiz: Record<string, any>) => mapQuiz(quiz, courseId)),
    })),
  } as Course;
};

const apiRequest = async <T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> => {
  const tokens = readTokens();
  const headers = new Headers(options.headers);
  if (tokens?.access) headers.set('Authorization', `Bearer ${tokens.access}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  if (response.status === 401 && allowRefresh && tokens?.refresh && path !== '/auth/token/refresh/') {
    const refreshResponse = await fetch(`${apiBaseUrl}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: tokens.refresh }),
    });
    if (refreshResponse.ok) {
      const refreshed = await refreshResponse.json() as Partial<ApiTokens>;
      if (refreshed.access) {
        saveTokens({ access: refreshed.access, refresh: refreshed.refresh || tokens.refresh });
        return apiRequest<T>(path, options, false);
      }
    }
    window.localStorage.removeItem(tokenStorageKey);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || body.message || Object.values(body).flat().join(' ') || message;
    } catch {
      // Keep the status-based message for non-JSON responses.
    }
    throw new Error(String(message));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const mapAttempt = (attempt: Record<string, any>): QuizAttempt => ({
  id: String(attempt.id),
  quizId: String(attempt.quizId),
  quizTitle: attempt.quizTitle,
  courseTitle: attempt.courseTitle,
  studentId: String(attempt.studentId),
  studentName: attempt.studentName,
  score: attempt.score,
  totalQuestions: attempt.totalQuestions,
  percentage: attempt.percentage,
  completedAt: attempt.completedAt,
  answers: attempt.answers || {},
  resultAvailable: attempt.resultAvailable,
  answerReview: attempt.answerReview?.map((entry: Record<string, any>) => ({
    questionId: String(entry.questionId),
    question: entry.question,
    questionType: entry.questionType,
    questionFile: entry.questionFile,
    selectedAnswer: entry.selectedAnswer,
    correctAnswer: entry.correctAnswer,
    isCorrect: entry.isCorrect,
    answerFile: entry.answerFile,
  })),
});

export const api = {
  hasSession: () => Boolean(readTokens()?.access || readTokens()?.refresh),

  clearTokens: async () => {
    window.localStorage.removeItem(tokenStorageKey);
  },

  getCourses: async (): Promise<Course[]> => (await apiRequest<Record<string, any>[]>('/courses/')).map(mapCourse),

  getQuizAttempts: async (): Promise<QuizAttempt[]> => {
    const attempts = await apiRequest<Record<string, any>[]>('/quiz-results/');
    return attempts.map(mapAttempt);
  },

  getUsers: async (): Promise<User[]> => {
    const [instructors, students] = await Promise.all([
      apiRequest<ApiUser[]>('/admin/instructors/'),
      apiRequest<ApiUser[]>('/admin/students/'),
    ]);
    return [
      ...instructors.map((user) => toUser({ ...user, role: 'INSTRUCTOR' })),
      ...students.map((user) => toUser({ ...user, role: 'STUDENT' })),
    ];
  },

  login: async (identifier: string, password: string) => {
    const result = await apiRequest<{ access: string; refresh: string; user: ApiUser }>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username: identifier.trim(), password }),
    });
    saveTokens({ access: result.access, refresh: result.refresh });
    return { user: toUser(result.user), accessToken: result.access, refreshToken: result.refresh };
  },

  getCurrentUser: async (): Promise<User> => toUser(await apiRequest<ApiUser>('/auth/me/')),

  adminProvisionStudent: async (payload: { fullName: string; email: string; academicLevel: AcademicLevel; temporaryPassword: string }) => {
    const result = await apiRequest<{ student: ApiUser }>('/admin/students/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return toUser(result.student);
  },

  createCourse: async (title: string, description: string, academicLevels: AcademicLevel[]) =>
    mapCourse(await apiRequest<Record<string, any>>('/courses/', {
      method: 'POST',
      body: JSON.stringify({ title, description, academicLevels }),
    })),

  updateCourse: async (course: Course): Promise<Course> => mapCourse(await apiRequest<Record<string, any>>(`/courses/${course.id}/`, {
    method: 'PUT',
    body: JSON.stringify({ title: course.title, description: course.description, academicLevels: course.academicLevels }),
  })),

  deleteCourse: async (courseId: string) => apiRequest<void>(`/courses/${courseId}/`, { method: 'DELETE' }),

  uploadMaterial: async (courseId: string, formData: FormData) => {
    const result = await apiRequest<Record<string, any>>(`/courses/${courseId}/materials/`, { method: 'POST', body: formData });
    const file = formData.get('file');
    return {
      ...result,
      id: String(result.id),
      courseId,
      type: result.type,
      fileName: file instanceof File ? file.name : '',
      fileSize: result.fileSize,
      fileUrl: result.fileUrl,
      uploadDate: result.uploadDate,
      chapterId: String(result.chapterId || ''),
    };
  },

  createChapter: async (courseId: string, title: string): Promise<Chapter> => {
    const chapter = await apiRequest<Omit<Chapter, 'courseId'>>(`/courses/${courseId}/chapters/`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return { ...chapter, id: String(chapter.id), courseId, materials: chapter.materials || [], quizzes: chapter.quizzes || [] };
  },

  createQuiz: async (
    courseId: string,
    chapterId: string,
    title: string,
    isTimed: boolean,
    timeLimitMinutes?: number,
    questions: Array<{ prompt: string; questionType?: string; questionFile?: File; choices: Array<{ text: string; isCorrect?: boolean }> }> = [],
    resultsVisibleToStudents = false,
    opensAt: string | null = null,
    closesAt: string | null = null,
    maxAttempts?: number | null,
  ): Promise<Quiz> => {
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('chapterId', chapterId);
    formData.append('isTimed', String(isTimed));
    if (isTimed && timeLimitMinutes) formData.append('timeLimitMinutes', String(timeLimitMinutes));
    formData.append('resultsVisibleToStudents', String(resultsVisibleToStudents));
    if (opensAt) formData.append('opensAt', opensAt);
    if (closesAt) formData.append('closesAt', closesAt);
    if (maxAttempts) formData.append('maxAttempts', String(maxAttempts));
    formData.append('questions', JSON.stringify(questions.map((question, index) => {
      if (question.questionFile) formData.append(`questionFile_${index}`, question.questionFile);
      return {
        prompt: question.prompt,
        questionType: question.questionType || 'MULTIPLE_CHOICE',
        choices: question.choices,
      };
    })));
    const quiz = await apiRequest<Quiz>(`/courses/${courseId}/quizzes/`, { method: 'POST', body: formData });
    return { ...quiz, id: String(quiz.id), courseId, chapterId: String(quiz.chapterId || chapterId) };
  },

  completeChapter: async (courseId: string, chapterId: string) => apiRequest<{ chapterId: string; completed: boolean }>(`/courses/${courseId}/progress/`, {
    method: 'POST',
    body: JSON.stringify({ chapterId }),
  }),

  getCourseProgress: async (courseId: string) => apiRequest<{ completedChapterIds: number[] }>(`/courses/${courseId}/progress/`),

  submitQuiz: async (
    quizId: string,
    answers: Record<string, string>,
    answerFiles: Record<string, File> = {},
  ): Promise<{
    attemptId?: string | number;
    totalQuestions: number;
    score: number | null;
    percentage: number | null;
    completedAt?: string;
    resultAvailable?: boolean;
    passed?: boolean;
  }> => {
    const formData = new FormData();
    formData.append('answers', JSON.stringify(answers));
    Object.entries(answerFiles).forEach(([questionId, file]) => formData.append(`answerFile_${questionId}`, file));
    const result = await apiRequest<Record<string, any>>(`/quizzes/${quizId}/submit/`, { method: 'POST', body: formData });
    return {
      attemptId: result.attemptId,
      totalQuestions: result.totalQuestions ?? 0,
      score: result.score ?? null,
      percentage: result.percentage ?? null,
      completedAt: result.completedAt,
      resultAvailable: result.resultAvailable,
      passed: result.passed,
    };
  },

  gradeAttempt: async (attempt: QuizAttempt, score?: number, percentage?: number) => {
    const graded = await apiRequest<Record<string, any>>(`/quiz-attempts/${attempt.id}/grade/`, {
      method: 'POST',
      body: JSON.stringify({ score, percentage }),
    });
    return { ...attempt, ...mapAttempt({ ...graded, quizId: attempt.quizId, studentId: attempt.studentId }), resultAvailable: true };
  },

  releaseQuizResults: async (quizId: string) => apiRequest<{ quizId: string; resultsVisibleToStudents: boolean }>(`/quizzes/${quizId}/release-results/`, { method: 'POST' }),

  adminProvisionInstructor: async (payload: { fullName: string; email: string; instructorCode?: string; temporaryPassword: string }) => {
    const result = await apiRequest<{ instructor: ApiUser }>('/admin/instructors/', {
      method: 'POST',
      body: JSON.stringify({
        fullName: payload.fullName,
        email: payload.email,
        username: payload.email.trim().toLowerCase().split('@')[0],
        instructor_code: payload.instructorCode || '',
        temporaryPassword: payload.temporaryPassword,
      }),
    });
    return toUser({ ...result.instructor, role: 'INSTRUCTOR' });
  },

  adminToggleStatus: async (userId: string) => apiRequest<{ isActive: boolean }>(`/admin/instructors/${userId}/toggle-status/`, { method: 'POST' }),

  adminResetPassword: async (userId: string, newPassword: string) => apiRequest<void>(`/admin/users/${userId}/reset-password/`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  }),

  adminUpdateUser: async (userId: string, user: User): Promise<User> => {
    const updated = await apiRequest<ApiUser>(`/admin/users/${userId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        studentId: user.studentId,
        instructorCode: user.instructorCode,
        academicLevel: user.academicLevel,
        isActive: user.isActive,
      }),
    });
    return toUser(updated);
  },

  adminDeleteUser: async (userId: string) => apiRequest<void>(`/admin/users/${userId}/delete/`, { method: 'DELETE' }),
};

export default api;
