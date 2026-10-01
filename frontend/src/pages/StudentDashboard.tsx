import React, { useEffect, useState } from 'react';
import { Chapter, Course, LearningMaterial, Quiz, QuizAttempt, User } from '../types';
import { api } from '../services/api';
import { PdfViewerModal } from '../components/PdfViewerModal';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { QuizModal } from '../components/QuizModal';
import { BookOpen, FileText, Video, Award, CheckCircle2, ChevronRight, Clock } from 'lucide-react';

interface StudentDashboardProps {
  student: User;
  courses: Course[];
  attempts: QuizAttempt[];
  onQuizSubmit: (attempt: QuizAttempt) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  student,
  courses,
  attempts,
  onQuizSubmit,
}) => {
  const [activePdf, setActivePdf] = useState<LearningMaterial | null>(null);
  const [activeVideo, setActiveVideo] = useState<LearningMaterial | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<{ quiz: Quiz; courseTitle: string } | null>(null);
  const [completedChapters, setCompletedChapters] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(courses.map(async (course) => {
      const progress = await api.getCourseProgress(course.id);
      return progress.completedChapterIds.map((chapterId) => `${course.id}:${chapterId}`);
    })).then((completedKeys) => {
      if (!cancelled) setCompletedChapters(Object.fromEntries(completedKeys.flat().map((key) => [key, true])));
    }).catch(() => {
      if (!cancelled) setCompletedChapters({});
    });
    return () => { cancelled = true; };
  }, [courses]);

  const studentAttempts = attempts.filter((a) => a.studentId === student.id || a.studentName === student.fullName);
  const markChapterDone = async (course: Course, chapter: Chapter) => {
    await api.completeChapter(course.id, chapter.id);
    setCompletedChapters((previous) => ({ ...previous, [`${course.id}:${chapter.id}`]: true }));
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-blue-900 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider mb-1">
              <span>Student Learning Portal</span>
              <span>&bull;</span>
              <span>{student.studentId || 'STD-2024'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-serif">Welcome back, {student.fullName}</h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Access your assigned course materials, stream instructional lectures, and track your assessment progress.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/15">
            <Award className="w-8 h-8 text-amber-400" />
            <div>
              <p className="text-xs text-slate-300 font-medium">Completed Quizzes</p>
              <p className="text-xl font-black">{studentAttempts.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Course Listing */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <span>Curriculum Courses & Learning Materials</span>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 transition-colors"
            >
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Teacher: {course.instructorName}
                  </span>
                  <span className="text-xs text-slate-400">Updated {course.updatedAt}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-serif leading-snug">{course.title}</h3>
                <p className="mt-2 text-sm text-slate-600 line-clamp-3">{course.description}</p>

                {course.chapters.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Course Chapters</p>
                      <span className="text-xs font-bold text-blue-700">
                        {Math.round((course.chapters.filter((chapter) => completedChapters[`${course.id}:${chapter.id}`]).length / course.chapters.length) * 100)}% complete
                      </span>
                    </div>
                    {course.chapters.map((chapter) => {
                      const chapterKey = `${course.id}:${chapter.id}`;
                      const completed = Boolean(completedChapters[chapterKey]);
                      return (
                        <div key={chapter.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{chapter.title}</p>
                              <p className="text-xs text-slate-500 mt-1">{chapter.materials.length} materials &bull; {chapter.quizzes.length} quizzes</p>
                            </div>
                            <button onClick={() => markChapterDone(course, chapter)} disabled={completed} className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded ${completed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                              {completed ? 'Completed' : 'Mark Done'}
                            </button>
                          </div>
                          {chapter.materials.map((material) => (
                            <button key={material.id} onClick={() => material.type === 'PDF' ? setActivePdf(material) : setActiveVideo(material)} className="mt-2 mr-2 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100">
                              {material.type === 'PDF' ? <FileText className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}{material.type === 'PDF' ? 'View PDF: ' : 'Watch Video: '}{material.title}
                            </button>
                          ))}
                          {chapter.quizzes.map((quiz) => <button key={quiz.id} onClick={() => setActiveQuiz({ quiz, courseTitle: course.title })} className="mt-2 mr-2 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"><CheckCircle2 className="w-3.5 h-3.5" />Start Quiz: {quiz.title}</button>)}
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiz Attempt History */}
      {studentAttempts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <span>Your Assessment Records</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Assessment Title</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4">Completed On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {studentAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/50">
                    {(() => {
                      const resultsReleased = att.resultAvailable !== false;
                      return <>
                    <td className="py-3 px-4 font-semibold text-slate-900">{att.quizTitle}</td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{att.courseTitle}</td>
                    <td className="py-3 px-4">
                      {resultsReleased && att.score != null ? `${att.score} / ${att.totalQuestions}` : 'Not released'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          !resultsReleased || att.percentage == null ? 'bg-slate-100 text-slate-700' : att.percentage >= 70 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {resultsReleased && att.percentage != null ? `${att.percentage}%` : 'Not released'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{att.completedAt}</td>
                      </>;
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <PdfViewerModal material={activePdf} onClose={() => setActivePdf(null)} />
      <VideoPlayerModal material={activeVideo} onClose={() => setActiveVideo(null)} />
      {activeQuiz && (
        <QuizModal
          quiz={activeQuiz.quiz}
          courseTitle={activeQuiz.courseTitle}
          student={student}
          onClose={() => setActiveQuiz(null)}
          onSubmitAttempt={onQuizSubmit}
        />
      )}
    </div>
  );
};