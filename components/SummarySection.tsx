import { RefreshCw, FileText, HelpCircle, Sparkles, Loader2 } from "lucide-react"
import { cn } from "~lib/utils"
import type { SummaryEntry, QuestionItem } from "~messages/types"

export interface QuestionAnswerState {
  status: "loading" | "success" | "error"
  answer?: string[]
  error?: string
}

interface SummarySectionProps {
  summaries: SummaryEntry[]
  questions: QuestionItem[]
  isLoading?: boolean
  onManualAnalyze: () => void
  questionAnswers: Record<string, QuestionAnswerState>  // key: questionId
  onAnswerQuestion: (questionId: string, questionText: string) => void
}

type TimelineItem =
  | { kind: "summary"; data: SummaryEntry }
  | { kind: "question"; data: QuestionItem }

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

export function SummarySection({
  summaries,
  questions,
  isLoading,
  onManualAnalyze,
  questionAnswers,
  onAnswerQuestion
}: SummarySectionProps) {
  const items: TimelineItem[] = [
    ...summaries.map((s) => ({ kind: "summary" as const, data: s })),
    ...questions.map((q) => ({ kind: "question" as const, data: q }))
  ].sort((a, b) => b.data.timestamp - a.data.timestamp)

  const isEmpty = summaries.length === 0 && questions.length === 0

  return (
    <div className="p-3">
      {/* Header row with "今すぐ分析" button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--color-foreground)]">
          会議の分析タイムライン
        </span>
        <button
          onClick={onManualAnalyze}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-[var(--color-border)]",
            "hover:bg-[var(--color-muted)] transition-colors disabled:opacity-50"
          )}
          title="今すぐ分析">
          <RefreshCw size={11} className={cn(isLoading && "animate-spin")} />
          今すぐ分析
        </button>
      </div>

      {isLoading && isEmpty && (
        <p className="text-xs text-[var(--color-muted-foreground)] italic mb-2">
          要約を生成中...
        </p>
      )}

      {isEmpty && !isLoading ? null : (
        <div className="space-y-3">
          {items.map((item) => {
            if (item.kind === "summary") {
              const s = item.data
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2.5 animate-fade-in">
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText size={12} className="text-[var(--color-primary)]" />
                    <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                      要約
                    </span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto">
                      {formatTime(s.timestamp)}
                    </span>
                  </div>
                  <ul className="space-y-1 mb-2">
                    {s.points.map((point, i) => (
                      <li key={i} className="flex gap-2 text-xs text-[var(--color-foreground)]">
                        <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-[9px] flex items-center justify-center font-bold">
                          {i + 1}
                        </span>
                        <span className="leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                  {s.overview && (
                    <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed border-t border-[var(--color-border)] pt-2 mt-1">
                      {s.overview}
                    </p>
                  )}
                </div>
              )
            }

            // question
            const q = item.data
            const qaState = questionAnswers[q.id]
            // AIボタンで取得した最新answerがあればそれを優先、なければ元のanswer
            const displayAnswer = qaState?.status === "success" && qaState.answer ? qaState.answer : q.answer
            return (
              <div
                key={q.id}
                className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-2.5 animate-fade-in">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <HelpCircle size={12} className="text-blue-500" />
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                    質問への回答
                  </span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto">
                    {formatTime(q.timestamp)}
                  </span>
                </div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5 leading-snug">
                  Q: {q.question}
                </p>
                {displayAnswer.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {displayAnswer.map((point, i) => (
                      <li key={i} className="flex gap-2 text-xs text-[var(--color-foreground)]">
                        <span className="flex-shrink-0 text-[var(--color-muted-foreground)] mt-0.5">•</span>
                        <span className="leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {qaState?.status === "loading" ? (
                  <div className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                    <Loader2 size={10} className="animate-spin" />
                    AIに問い合わせ中...
                  </div>
                ) : qaState?.status === "error" ? (
                  <div className="text-[10px] text-red-600 dark:text-red-400 mb-1">エラー: {qaState.error}</div>
                ) : null}
                <button
                  onClick={() => onAnswerQuestion(q.id, q.question)}
                  disabled={qaState?.status === "loading"}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
                    "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300",
                    "hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                  )}>
                  <Sparkles size={9} />
                  AIで回答
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
