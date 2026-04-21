import { HelpCircle } from "lucide-react"
import type { QuestionItem } from "~messages/types"

interface QuestionSectionProps {
  questions: QuestionItem[]
}

export function QuestionSection({ questions }: QuestionSectionProps) {
  if (questions.length === 0) return null

  return (
    <div className="p-3 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-1.5 mb-2">
        <HelpCircle size={14} className="text-blue-500" />
        <span className="text-xs font-semibold text-[var(--color-foreground)]">
          質問への回答
        </span>
      </div>

      <div className="space-y-3">
        {questions.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-2.5 animate-fade-in">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1.5 leading-snug">
              Q: {item.question}
            </p>
            <ul className="space-y-1">
              {item.answer.map((point, i) => (
                <li key={i} className="flex gap-2 text-xs text-[var(--color-foreground)]">
                  <span className="flex-shrink-0 text-[var(--color-muted-foreground)] mt-0.5">
                    •
                  </span>
                  <span className="leading-snug">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
