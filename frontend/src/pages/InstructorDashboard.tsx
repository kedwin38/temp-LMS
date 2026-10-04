import React, { useState } from 'react';
import { ACADEMIC_LEVELS, AcademicLevel, Chapter, Choice, Course, LearningMaterial, Question, Quiz, QuizAttempt, User } from '../types';
import { api } from '../services/api';
import { BookOpen, Plus, Upload, Trash2, FileText, Video, CheckCircle, Award, RefreshCw } from 'lucide-react';

interface InstructorDashboardProps {
  instructor: User;
  courses: Course[];
  onCreateCourse: (course: Course) => void;
  onUpdateCourse: (course: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  allAttempts: QuizAttempt[];
  onUpdateAttempt: (attempt: QuizAttempt) => void;
}

export const InstructorDashboard: React.FC<InstructorDashboardProps> = ({
  instructor,
  courses,
  onCreateCourse,
  onUpdateCourse,
  onDeleteCourse,
  allAttempts,
  onUpdateAttempt,
}) => {
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseAcademicLevels, setCourseAcademicLevels] = useState<AcademicLevel[]>([]);
  const [courseError, setCourseError] = useState('');
  const [selectedCourseForUpload, setSelectedCourseForUpload] = useState<string | null>(null);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [selectedCourseForChapter, setSelectedCourseForChapter] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [isCreatingQuiz, setIsCreatingQuiz] = useState(false);
  const [selectedCourseForQuiz, setSelectedCourseForQuiz] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizChapterId, setQuizChapterId] = useState('');
  const [quizIsTimed, setQuizIsTimed] = useState(false);
  const [quizTimeLimit, setQuizTimeLimit] = useState('30');
  const [quizOpensAt, setQuizOpensAt] = useState('');
  const [quizClosesAt, setQuizClosesAt] = useState('');
  const [quizResultsVisible, setQuizResultsVisible] = useState(false);
  const [quizMaxAttempts, setQuizMaxAttempts] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<Array<{ prompt: string; questionType: 'MULTIPLE_CHOICE' | 'DOCUMENT'; questionFile?: File; choices: Array<{ text: string; isCorrect: boolean }> }>>([]);
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [gradingScore, setGradingScore] = useState('');
  const [gradingPercentage, setGradingPercentage] = useState('');

  // Material Upload Form State
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialType, setMaterialType] = useState<'PDF' | 'VIDEO'>('PDF');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  // Filter courses authored by this instructor
  const myCourses = courses.filter((c) => c.instructorId === instructor.id || c.instructorName === instructor.fullName);
  const myQuizIds = new Set(myCourses.flatMap((course) => course.quizzes.map((quiz) => String(quiz.id))));
  const instructorAttempts = allAttempts.filter((attempt) => myQuizIds.has(String(attempt.quizId)));

  // Question/answer attachment endpoints are JWT-protected, so a plain <a href> navigation
  // (no Authorization header) would 401. Fetch the file with the token and open it as a blob.
  // The tab is opened synchronously inside the click handler (before the await) so it stays
  // attached to the user gesture -- opening it only after the fetch resolves gets silently
  // blocked as a popup by Chrome/Safari.
  const openAuthenticatedFile = async (url: string) => {
    const newTab = window.open('', '_blank', 'noopener,noreferrer');
    try {
      const blobUrl = await api.fetchAuthenticatedFile(url);
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        window.alert('Please allow pop-ups for this site to view the file.');
      }
    } catch {
      newTab?.close();
      window.alert('This file could not be opened.');
    }
  };

  const getAttemptReview = (attempt: QuizAttempt) => {
    if (attempt.answerReview) return attempt.answerReview;
    const quiz = courses.flatMap((course) => course.quizzes).find((item) => item.id === attempt.quizId);
    return quiz?.questions.map((question) => {
      const selected = question.choices.find((choice) => choice.id === attempt.answers[question.id]);
      const correct = question.choices.find((choice) => choice.isCorrect);
      return {
        questionId: question.id,
        question: question.prompt,
        questionType: question.questionType,
        questionFile: question.questionFileUrl || null,
        selectedAnswer: selected?.text || null,
        correctAnswer: correct?.text || null,
        isCorrect: Boolean(selected && correct && selected.id === correct.id),
        answerFile: attempt.answerFiles?.[question.id] || null,
      };
    }) || [];
  };

  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim() || courseAcademicLevels.length === 0) return;

    try {
      const newCourse = await api.createCourse(courseTitle.trim(), courseDesc.trim(), courseAcademicLevels);
      onCreateCourse(newCourse);
      setCourseError('');
      setCourseTitle('');
      setCourseDesc('');
      setCourseAcademicLevels([]);
      setIsCreatingCourse(false);
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : 'Course could not be saved. Please try again.');
    }
  };

  const handleMaterialUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseForUpload || !materialTitle.trim() || !selectedFile || !selectedChapterId) return;
    if (selectedFile.size > 2 * 1024 * 1024 * 1024) {
      setUploadError('This file is larger than the configured 2 GB upload limit.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('title', materialTitle.trim());
    formData.append('type', materialType);
    formData.append('file', selectedFile);
    formData.append('fileSize', `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`);
    formData.append('chapterId', selectedChapterId);
    formData.append('allowDownload', String(allowDownload));

    try {
      const res = await api.uploadMaterial(selectedCourseForUpload, formData);
      const targetCourse = courses.find((c) => c.id === selectedCourseForUpload);
      if (targetCourse) {
        const newMat: LearningMaterial = {
          id: String(res.id || Date.now()),
          courseId: selectedCourseForUpload,
          title: res.title || materialTitle.trim(),
          type: materialType,
          fileName: selectedFile.name,
          fileSize: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
          fileUrl: URL.createObjectURL(selectedFile),
          uploadDate: new Date().toISOString().split('T')[0],
          allowDownload,
        };
        onUpdateCourse({
          ...targetCourse,
          chapters: targetCourse.chapters.map((chapter) =>
            chapter.id === selectedChapterId
              ? { ...chapter, materials: [...chapter.materials, newMat] }
              : chapter
          ),
        });
      }
      setUploadSuccess('Material upload complete.');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Material could not be saved. Please try again.');
      setUploading(false);
      return;
    }

    setUploading(false);
    setSelectedCourseForUpload(null);
    setMaterialTitle('');
    setSelectedFile(null);
    setAllowDownload(false);
    setUploadError('');
    window.setTimeout(() => setUploadSuccess(''), 4000);
  };

  const handleCreateChapterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseForChapter || !chapterTitle.trim()) return;
    const targetCourse = courses.find((course) => course.id === selectedCourseForChapter);
    if (!targetCourse) return;
    const chapter = await api.createChapter(selectedCourseForChapter, chapterTitle);
    const newChapter: Chapter = { ...chapter, order: targetCourse.chapters.length + 1 };
    onUpdateCourse({ ...targetCourse, chapters: [...targetCourse.chapters, newChapter] });
    setChapterTitle('');
    setSelectedCourseForChapter(null);
    setIsCreatingChapter(false);
  };

  const handleCreateQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseForQuiz || !quizChapterId || !quizTitle.trim() || (quizIsTimed && Number(quizTimeLimit) < 1) || (Boolean(quizOpensAt) !== Boolean(quizClosesAt))) return;
    if (quizOpensAt && quizClosesAt && quizOpensAt === quizClosesAt) return;
    if (quizMaxAttempts.trim() && Number(quizMaxAttempts) < 1) return;
    if (quizQuestions.length === 0 || quizQuestions.some((question) => (
      question.questionType === 'DOCUMENT'
        ? !question.questionFile
        : !question.prompt.trim() || question.choices.length < 2 || question.choices.some((choice) => !choice.text.trim()) || question.choices.filter((choice) => choice.isCorrect).length !== 1
    ))) return;
    const targetCourse = courses.find((course) => course.id === selectedCourseForQuiz);
    if (!targetCourse) return;
    const questionsPayload = quizQuestions.map((question) => ({
      prompt: question.prompt.trim(),
      questionType: question.questionType,
      questionFile: question.questionFile,
      choices: question.choices.map((choice) => ({ text: choice.text.trim(), isCorrect: choice.isCorrect })),
    }));
    const quiz = await api.createQuiz(selectedCourseForQuiz, quizChapterId, quizTitle, quizIsTimed, Number(quizTimeLimit), questionsPayload, quizResultsVisible, quizOpensAt || null, quizClosesAt || null, quizMaxAttempts.trim() ? Number(quizMaxAttempts) : null);
    const updatedChapters = targetCourse.chapters.map((chapter) => chapter.id === quizChapterId ? { ...chapter, quizzes: [...chapter.quizzes, quiz] } : chapter);
    onUpdateCourse({ ...targetCourse, chapters: updatedChapters, quizzes: [...targetCourse.quizzes, quiz] });
    setQuizTitle('');
    setQuizChapterId('');
    setQuizIsTimed(false);
    setQuizOpensAt('');
    setQuizClosesAt('');
    setQuizResultsVisible(false);
    setQuizMaxAttempts('');
    setQuizQuestions([]);
    setIsCreatingQuiz(false);
  };

  const handleGradeAttempt = async (attempt: QuizAttempt) => {
    const hasScore = gradingScore.trim() !== '';
    const hasPercentage = gradingPercentage.trim() !== '';
    if (!hasScore && !hasPercentage) return;
    const score = hasScore ? Number(gradingScore) : undefined;
    const percentage = hasPercentage ? Number(gradingPercentage) : undefined;
    if ((score !== undefined && (!Number.isInteger(score) || score < 0)) ||
      (percentage !== undefined && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100))) return;
    const graded = await api.gradeAttempt(attempt, score, percentage);
    onUpdateAttempt(graded);
    setGradingAttemptId(null);
    setGradingScore('');
    setGradingPercentage('');
  };

  const handleReleaseResults = async (attempt: QuizAttempt) => {
    await api.releaseQuizResults(attempt.quizId);
    const targetCourse = courses.find((course) => course.quizzes.some((quiz) => String(quiz.id) === String(attempt.quizId)));
    if (targetCourse) {
      onUpdateCourse({
        ...targetCourse,
        quizzes: targetCourse.quizzes.map((quiz) => String(quiz.id) === String(attempt.quizId) ? { ...quiz, resultsVisibleToStudents: true } : quiz),
        chapters: targetCourse.chapters.map((chapter) => ({
          ...chapter,
          quizzes: chapter.quizzes.map((quiz) => String(quiz.id) === String(attempt.quizId) ? { ...quiz, resultsVisibleToStudents: true } : quiz),
        })),
      });
    }
    onUpdateAttempt({ ...attempt, resultAvailable: true });
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-amber-900 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-800 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
            <span>Teacher Portal</span>
            <span>&bull;</span>
            <span>{instructor.instructorCode || 'INST-2024'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-serif">{instructor.fullName}</h1>
          <p className="mt-1 text-sm text-slate-300">
            Author and publish coursework, upload PDF readers, stream video lectures, and review student grades.
          </p>
        </div>
        <button
          onClick={() => setIsCreatingCourse(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg shadow transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Course</span>
        </button>
      </div>

      {uploadSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle className="h-4 w-4" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {/* Course Creation Modal */}
      {isCreatingCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create New Instructional Course</h3>
            {courseError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{courseError}</p>}
            <form onSubmit={handleCreateCourseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Course Classes and Forms</label>
                <select
                  multiple
                  required
                  value={courseAcademicLevels}
                  onChange={(e) => setCourseAcademicLevels(Array.from(e.target.selectedOptions, (option) => option.value as AcademicLevel))}
                  className="w-full min-h-28 px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {ACADEMIC_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">Select every class or form that may access this course.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Course Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Advanced Somali Orthography & Composition"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Course Description</label>
                <textarea
                  rows={4}
                  placeholder="Outline topics covered, target adult competencies, and materials provided."
                  value={courseDesc}
                  onChange={(e) => setCourseDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingCourse(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-md shadow"
                >
                  Publish Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCreatingChapter && selectedCourseForChapter && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Course Chapter</h3>
            <form onSubmit={handleCreateChapterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Chapter Title</label>
                <input required value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="e.g. Chapter 1: Introduction" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsCreatingChapter(false)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-md shadow">Create Chapter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Material Upload Modal */}
      {selectedCourseForUpload && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Upload Course Learning Material</h3>
            <form onSubmit={handleMaterialUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Chapter</label>
                <select
                  required
                  value={selectedChapterId}
                  onChange={(e) => {
                    const chapter = courses.find((course) => course.id === selectedCourseForUpload)?.chapters.find((item) => item.id === e.target.value);
                    setSelectedChapterId(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Select a chapter</option>
                  {courses.find((course) => course.id === selectedCourseForUpload)?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Material Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 1: Phonemic Vowel Contrasts"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Format Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="materialType"
                      value="PDF"
                      checked={materialType === 'PDF'}
                      onChange={() => setMaterialType('PDF')}
                    />
                    <span>PDF Reading Primer</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="materialType"
                      value="VIDEO"
                      checked={materialType === 'VIDEO'}
                      onChange={() => setMaterialType('VIDEO')}
                    />
                    <span>Video Lecture (MP4)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Select File</label>
                <input
                  type="file"
                  required
                  accept={materialType === 'PDF' ? '.pdf,application/pdf' : 'video/*,.mp4,.webm,.mov,.m4v,.avi,.mkv,.ogv,.3gp,.mpeg,.mpg'}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (materialType === 'PDF' && file && !file.name.toLowerCase().endsWith('.pdf')) {
                      setSelectedFile(null);
                      setUploadError('PDF Reading Primer files must use the .pdf format.');
                      e.target.value = '';
                      return;
                    }
                    setUploadError('');
                    setSelectedFile(file);
                  }}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />
              </div>

              {uploadError && <p className="text-xs font-semibold text-rose-700">{uploadError}</p>}

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
                <span>Allow students to download this file</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCourseForUpload(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-md shadow"
                >
                  {uploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{uploading ? 'Uploading...' : 'Save Material'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCreatingQuiz && selectedCourseForQuiz && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Chapter Quiz</h3>
            <form onSubmit={handleCreateQuizSubmit} className="space-y-4">
              <input required value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
              <select required value={quizChapterId} onChange={(e) => setQuizChapterId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm">
                <option value="">Select a chapter</option>
                {courses.find((course) => course.id === selectedCourseForQuiz)?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={quizIsTimed} onChange={(e) => setQuizIsTimed(e.target.checked)} /> Timed quiz</label>
              {quizIsTimed && <>
                <input required min="1" type="number" value={quizTimeLimit} onChange={(e) => setQuizTimeLimit(e.target.value)} placeholder="Duration in minutes" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
                <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Opens at<input type="time" value={quizOpensAt} onChange={(e) => setQuizOpensAt(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md text-sm" /></label><label className="text-xs font-semibold text-slate-600">Closes at<input type="time" value={quizClosesAt} onChange={(e) => setQuizClosesAt(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md text-sm" /></label></div>
                <p className="text-xs text-slate-500">Optional daily availability window. Leave both blank to keep the quiz open all day.</p>
              </>}
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={quizResultsVisible} onChange={(e) => setQuizResultsVisible(e.target.checked)} /> Show automatically marked results to students</label>
              <label className="block text-xs font-semibold text-slate-600">Max attempts per student
                <input min="1" type="number" value={quizMaxAttempts} onChange={(e) => setQuizMaxAttempts(e.target.value)} placeholder="Leave blank for unlimited" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
              </label>
              <div className="space-y-3 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Questions</h4>
                  <button type="button" onClick={() => setQuizQuestions((current) => [...current, { prompt: '', questionType: 'MULTIPLE_CHOICE', choices: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] }])} className="px-2.5 py-1.5 bg-blue-50 text-blue-800 text-xs font-bold rounded">Add Question</button>
                </div>
                {quizQuestions.map((question, questionIndex) => (
                  <div key={questionIndex} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={question.questionType} onChange={(e) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, questionType: e.target.value as 'MULTIPLE_CHOICE' | 'DOCUMENT', choices: e.target.value === 'DOCUMENT' ? [] : (item.choices.length ? item.choices : [{ text: '', isCorrect: true }, { text: '', isCorrect: false }]) } : item))} className="px-2 py-2 border border-slate-300 rounded-md text-xs">
                        <option value="MULTIPLE_CHOICE">Multiple choice</option>
                        <option value="DOCUMENT">Document question</option>
                      </select>
                      <input required={question.questionType === 'MULTIPLE_CHOICE'} value={question.prompt} onChange={(e) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, prompt: e.target.value } : item))} placeholder={question.questionType === 'DOCUMENT' ? 'Instructions for the document question (optional)' : `Question ${questionIndex + 1}`} className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm" />
                      <button type="button" onClick={() => setQuizQuestions((current) => current.filter((_, index) => index !== questionIndex))} className="px-2 text-rose-600 text-xs font-bold">Remove</button>
                    </div>
                    {question.questionType === 'DOCUMENT' ? <input required type="file" accept=".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, questionFile: e.target.files?.[0] } : item))} className="w-full text-xs text-slate-500" /> : <>
                      <label className="block text-xs text-slate-500">
                        Attach an image to this question (optional)
                        <input type="file" accept="image/*" onChange={(e) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, questionFile: e.target.files?.[0] } : item))} className="mt-1 block w-full text-xs text-slate-500" />
                      </label>
                      {question.questionFile && <p className="text-xs font-semibold text-emerald-700">Attached: {question.questionFile.name}</p>}
                      {question.choices.map((choice, choiceIndex) => (
                      <div key={choiceIndex} className="flex items-center gap-2 pl-3">
                        <input type="radio" name={`correct-${questionIndex}`} checked={choice.isCorrect} onChange={() => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, choices: item.choices.map((option, optionIndex) => ({ ...option, isCorrect: optionIndex === choiceIndex })) } : item))} title="Correct answer" />
                        <input required value={choice.text} onChange={(e) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, choices: item.choices.map((option, optionIndex) => optionIndex === choiceIndex ? { ...option, text: e.target.value } : option) } : item))} placeholder={`Option ${choiceIndex + 1}`} className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm" />
                        {question.choices.length > 2 && <button type="button" onClick={() => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, choices: item.choices.filter((_, optionIndex) => optionIndex !== choiceIndex) } : item))} className="text-xs text-slate-500">Remove</button>}
                      </div>
                      ))}
                      <button type="button" onClick={() => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, choices: [...item.choices, { text: '', isCorrect: false }] } : item))} className="ml-3 text-xs font-semibold text-blue-700">Add option</button>
                    </>}
                  </div>
                ))}
                {quizQuestions.length === 0 && <p className="text-xs text-slate-500">Add at least one question. Select the radio button beside the correct option.</p>}
              </div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsCreatingQuiz(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button><button type="submit" className="px-4 py-2 bg-amber-600 text-white font-bold text-sm rounded-md">Create Quiz</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Courses List */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-600" />
          <span>Courses Under Your Instruction</span>
        </h2>

        {myCourses.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
            <p className="text-slate-500 text-sm">You have not created any courses yet. Click &quot;New Course&quot; to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {myCourses.map((c) => (
              <div key={c.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-bold text-slate-900 font-serif">{c.title}</h3>
                  <button
                    onClick={() => onDeleteCourse(c.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete Course"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-slate-600">{c.description}</p>
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Course Chapters</p>
                  {c.chapters.length === 0 ? (
                    <p className="text-xs text-slate-400">Create a chapter before adding materials or quizzes.</p>
                  ) : c.chapters.map((chapter) => (
                    <div key={chapter.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800">{chapter.title}</span>
                        <span className="text-xs text-slate-500">{chapter.materials.length} materials &bull; {chapter.quizzes.length} quizzes</span>
                      </div>
                      {chapter.materials.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {chapter.materials.map((material) => <span key={material.id} className="text-xs text-slate-600">{material.type}: {material.title}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Materials Upload Action */}
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500 font-semibold">
                    {c.materials.length} Materials &bull; {c.quizzes.length} Quizzes
                  </span>
                  <button
                    onClick={() => { setSelectedCourseForQuiz(c.id); setIsCreatingQuiz(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Quiz</span>
                  </button>
                  <button
                    onClick={() => { setSelectedCourseForChapter(c.id); setIsCreatingChapter(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Chapter</span>
                  </button>
                  <button
                    onClick={() => { setSelectedCourseForUpload(c.id); setSelectedChapterId(''); setAllowDownload(false); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Material</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student Attempt Oversight */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-600" />
          <span>Student Submissions Overview</span>
        </h2>
        {instructorAttempts.length === 0 ? (
          <p className="text-xs text-slate-400">No attempts submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Assessment</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {instructorAttempts.map((a) => (
                  <React.Fragment key={a.id}>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900">{a.studentName}</td>
                      <td className="py-3 px-4 text-xs">{a.quizTitle}</td>
                      <td className="py-3 px-4">
                        {a.score == null ? 'Pending review' : `${a.score} / ${a.totalQuestions}`}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-600">{a.percentage == null ? 'Pending' : `${a.percentage}%`}</td>
                      <td className="py-3 px-4 text-xs text-slate-400">{a.completedAt}</td>
                      <td className="py-3 px-4">
                        {a.score == null && (
                          <button type="button" onClick={() => { setGradingAttemptId(a.id); setGradingScore(''); setGradingPercentage(''); }} className="mr-3 text-xs font-bold text-emerald-700 hover:text-emerald-900">Enter grade</button>
                        )}
                        {a.score != null && a.resultAvailable === false && (
                          <button type="button" onClick={() => void handleReleaseResults(a)} className="mr-3 text-xs font-bold text-amber-700 hover:text-amber-900">Release result</button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedAttemptId(expandedAttemptId === a.id ? null : a.id)}
                          className="text-xs font-bold text-blue-700 hover:text-blue-900"
                        >
                          {expandedAttemptId === a.id ? 'Hide answers' : 'Review answers'}
                        </button>
                      </td>
                    </tr>
                    {expandedAttemptId === a.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 px-4 py-4">
                          <div className="space-y-3">
                            {getAttemptReview(a).length === 0 ? (
                              <p className="text-xs text-slate-500">Answer details are not available for this attempt.</p>
                            ) : getAttemptReview(a).map((review) => (
                              <div key={review.questionId} className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-sm font-semibold text-slate-900">{review.question}</p>
                                {review.questionFile && (
                                  <button type="button" onClick={() => void openAuthenticatedFile(review.questionFile!)} className="mt-1 inline-flex text-xs font-bold text-slate-500 hover:text-slate-700">
                                    View question attachment
                                  </button>
                                )}
                                <p className="mt-1 text-xs text-slate-600">
                                  Student answer: <span className="font-semibold">{review.selectedAnswer || 'No answer'}</span>
                                </p>
                                {review.answerFile && (
                                  <button type="button" onClick={() => void openAuthenticatedFile(review.answerFile!)} className="mt-2 block text-xs font-bold text-blue-700 hover:text-blue-900">
                                    View student answer file
                                  </button>
                                )}
                                {review.questionType !== 'DOCUMENT' && (
                                  <>
                                    <p className="text-xs text-emerald-700">
                                      Correct answer: <span className="font-semibold">{review.correctAnswer || 'Not set'}</span>
                                    </p>
                                    <p className={`mt-1 text-xs font-bold ${review.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                      {review.isCorrect ? 'Correct' : 'Incorrect'}
                                    </p>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {gradingAttemptId === a.id && (
                      <tr>
                        <td colSpan={6} className="bg-emerald-50 px-4 py-3">
                          <form onSubmit={(event) => { event.preventDefault(); void handleGradeAttempt(a); }} className="flex flex-wrap items-center gap-3">
                            <label className="text-xs font-bold text-slate-700">Score (custom scale)</label>
                            <input type="number" min="0" value={gradingScore} onChange={(event) => setGradingScore(event.target.value)} placeholder="Enter score" className="w-28 px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
                            <label className="text-xs font-bold text-slate-700">Percentage</label>
                            <input type="number" min="0" max="100" step="0.1" value={gradingPercentage} onChange={(event) => setGradingPercentage(event.target.value)} placeholder="0-100%" className="w-24 px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
                            <button type="submit" className="px-3 py-1.5 bg-emerald-700 text-white rounded-md text-xs font-bold">Publish grade</button>
                            <button type="button" onClick={() => { setGradingAttemptId(null); setGradingScore(''); setGradingPercentage(''); }} className="text-xs font-semibold text-slate-600">Cancel</button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};