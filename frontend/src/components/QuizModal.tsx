import React, { useEffect, useState } from 'react';
import { Quiz, QuizAttempt, User } from '../types';
import { api } from '../services/api';
import { X, CheckCircle2, Award, ArrowRight, FileUp } from 'lucide-react';

interface QuizModalProps {
  quiz: Quiz | null;
  courseTitle: string;
  student: User;
  onClose: () => void;
  onSubmitAttempt: (attempt: QuizAttempt) => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  quiz,
  courseTitle,
  student,
  onClose,
  onSubmitAttempt,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [answerFiles, setAnswerFiles] = useState<Record<string, File>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [attemptResult, setAttemptResult] = useState<QuizAttempt | null>(null);
  const [secondsLeft, setSecondsLeft] = useState((quiz?.timeLimitMinutes ?? 0) * 60);
  const [submitError, setSubmitError] = useState('');
  const [questionFileBlobs, setQuestionFileBlobs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!quiz?.isTimed || attemptResult || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [quiz?.isTimed, quiz?.id, attemptResult, secondsLeft]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Question/answer files are served from auth-protected endpoints (a plain <a>/<img>
  // navigation carries no Authorization header), so each one is fetched as a blob here.
  useEffect(() => {
    if (!quiz) return undefined;
    const objectUrls: string[] = [];
    const filesToLoad = quiz.questions.filter((q) => q.questionFileUrl);

    Promise.all(
      filesToLoad.map(async (q) => {
        try {
          const blobUrl = await api.fetchAuthenticatedFile(q.questionFileUrl!);
          objectUrls.push(blobUrl);
          setQuestionFileBlobs((prev) => ({ ...prev, [q.id]: blobUrl }));
        } catch {
          // leave this question's file unresolved; the UI simply won't show a preview
        }
      }),
    );

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [quiz]);

  if (!quiz) return null;

  const handleSelect = (questionId: string, choiceId: string) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const answerReview = quiz.questions.map((question) => {
      const selectedId = selectedAnswers[question.id];
      const selected = question.choices.find((choice) => choice.id === selectedId);
      const correct = question.choices.find((choice) => choice.isCorrect);
      return {
        questionId: question.id,
        question: question.prompt,
        questionType: question.questionType,
        selectedAnswer: question.questionType === 'DOCUMENT' ? selectedAnswers[question.id] || answerFiles[question.id]?.name || null : selected?.text || null,
        correctAnswer: correct?.text || null,
        isCorrect: Boolean(selected && correct && selected.id === correct.id),
        answerFile: answerFiles[question.id] ? URL.createObjectURL(answerFiles[question.id]) : null,
      };
    });

    try {
      const res = await api.submitQuiz(quiz.id, selectedAnswers, answerFiles);
      const attemptId = res.attemptId != null ? String(res.attemptId) : `${quiz.id}-${Date.now()}`;
      const attempt: QuizAttempt = {
        id: attemptId,
        quizId: quiz.id,
        quizTitle: quiz.title,
        courseTitle,
        studentId: student.id,
        studentName: student.fullName,
        score: res.score,
        totalQuestions: res.totalQuestions,
        percentage: res.percentage,
        answerFiles: Object.fromEntries(Object.entries(answerFiles).map(([questionId, file]) => [questionId, file.name])),
        completedAt: res.completedAt || new Date().toLocaleString(),
        answers: selectedAnswers,
        resultAvailable: res.resultAvailable ?? true,
        answerReview,
      };
      setAttemptResult(attempt);
      onSubmitAttempt(attempt);
      setIsSubmitted(true);
      setSubmitError('');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Your assessment could not be saved. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allAnswered = quiz.questions.every((q) => q.questionType === 'DOCUMENT'
    ? selectedAnswers[q.id]?.trim() || answerFiles[q.id]
    : selectedAnswers[q.id]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold">{quiz.title}</h2>
            <p className="text-xs text-slate-400">
              {courseTitle}
              {quiz.isTimed && ` • ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} remaining`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
          {!isSubmitted ? (
            <>
              {submitError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{submitError}</p>}
              {quiz.instructions && (
                <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-sm">
                  {quiz.instructions}
                </div>
              )}

              <div className="space-y-6">
                {quiz.questions.map((q, idx) => (
                  <div key={q.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <p className="font-semibold text-slate-900 text-sm flex items-start gap-2">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <span>{q.prompt}</span>
                    </p>
                    {q.questionFileUrl && (
                      questionFileBlobs[q.id] ? (
                        q.questionType === 'DOCUMENT' ? (
                          <a href={questionFileBlobs[q.id]} target="_blank" rel="noreferrer" className="ml-8 inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:text-blue-900">
                            <FileUp className="w-4 h-4" /> View question file
                          </a>
                        ) : (
                          <div className="ml-8">
                            <img src={questionFileBlobs[q.id]} alt="" className="max-h-64 rounded-lg border border-slate-200" />
                          </div>
                        )
                      ) : (
                        <p className="ml-8 text-xs text-slate-400">Loading attachment...</p>
                      )
                    )}
                    {q.questionType === 'DOCUMENT' ? (
                      <div className="pl-8 space-y-2">
                        <textarea
                          value={selectedAnswers[q.id] || ''}
                          onChange={(e) => setSelectedAnswers((previous) => ({ ...previous, [q.id]: e.target.value }))}
                          placeholder="Type your answer here, or attach a file below"
                          className="w-full min-h-24 px-3 py-2 border border-slate-300 rounded-md text-sm"
                        />
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setAnswerFiles((previous) => ({ ...previous, [q.id]: file }));
                          }}
                          className="w-full text-xs text-slate-500"
                        />
                        {answerFiles[q.id] && <p className="text-xs font-semibold text-emerald-700">Attached: {answerFiles[q.id].name}</p>}
                      </div>
                    ) : <div className="grid grid-cols-1 gap-2 pl-8">
                      {q.choices.map((c) => {
                        const isSelected = selectedAnswers[q.id] === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelect(q.id, c.id)}
                            className={`text-left text-sm py-2.5 px-4 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-medium'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            {c.text}
                          </button>
                        );
                      })}
                    </div>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Result Screen */
            <div className="text-center py-8 space-y-6">
              <div className="inline-flex p-4 rounded-full bg-emerald-100 text-emerald-700">
                <Award className="w-12 h-12" />
              </div>
              {attemptResult?.resultAvailable === false ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-amber-900">
                  <h3 className="text-xl font-bold">Assessment submitted</h3>
                  <p className="mt-2 text-sm">Your instructor has received your answers. Results will be available if your instructor authorizes student score visibility.</p>
                </div>
              ) : <div>
                <h3 className="text-2xl font-bold text-slate-900">Assessment Complete</h3>
                <p className="text-slate-600 text-sm mt-1">
                  Candidate: {student.fullName} ({student.studentId || student.username})
                </p>
              </div>}

              {attemptResult?.resultAvailable !== false && <div className="inline-flex items-center gap-6 px-8 py-4 rounded-xl bg-slate-100 border border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Score</p>
                  <p className="text-2xl font-black text-slate-900">
                    {attemptResult?.score == null ? 'Pending review' : `${attemptResult.score} / ${attemptResult.totalQuestions}`}
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-300" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Percentage</p>
                  <p
                    className={`text-2xl font-black ${
                      (attemptResult?.percentage ?? 0) >= quiz.passingScorePercent
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {attemptResult?.percentage == null ? 'Pending' : `${attemptResult.percentage}%`}
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-300" />
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Status</p>
                  <p
                    className={`text-sm font-bold uppercase tracking-wider ${
                      attemptResult?.percentage != null && attemptResult.percentage >= quiz.passingScorePercent
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {attemptResult?.percentage == null ? 'Awaiting grade' : attemptResult.percentage >= quiz.passingScorePercent ? 'Passed' : 'Needs Review'}
                  </p>
                </div>
              </div>}

              {attemptResult?.resultAvailable !== false && attemptResult?.answerReview && (
                <div className="text-left space-y-3">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Answer review</h4>
                  {attemptResult.answerReview.map((review, index) => (
                    <div key={review.questionId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{index + 1}. {review.question}</p>
                      <p className="mt-1 text-xs text-slate-600">Your answer: <span className="font-semibold">{review.selectedAnswer || 'No answer'}</span></p>
                      <p className="text-xs text-emerald-700">Correct answer: <span className="font-semibold">{review.correctAnswer || 'Not set'}</span></p>
                      <p className={`mt-1 text-xs font-bold ${review.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {review.isCorrect ? 'Correct' : 'Incorrect'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          {!isSubmitted ? (
            <>
              <p className="text-xs text-slate-500">
                {Object.keys(selectedAnswers).length} of {quiz.questions.length} answered
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!allAnswered || isSubmitting || (quiz.isTimed === true && secondsLeft === 0)}
                  onClick={handleSubmit}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-sm shadow transition-colors"
                >
                  <span>{isSubmitting ? 'Evaluating...' : (quiz.isTimed && secondsLeft === 0 ? 'Time Expired' : 'Submit Assessment')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow"
              >
                Close & Return to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};