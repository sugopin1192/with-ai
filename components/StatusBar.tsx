import { Mic, MicOff, Settings } from "lucide-react"

interface StatusBarProps {
  isEnabled: boolean
  isCapturing: boolean
  transcriptCount: number
  nextSummaryIn: number
  onSettingsClick: () => void
}

export function StatusBar({
  isEnabled,
  isCapturing,
  transcriptCount,
  nextSummaryIn,
  onSettingsClick
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="flex items-center gap-2">
        {!isEnabled ? (
          <>
            <span className="w-2 h-2 rounded-full bg-[var(--color-muted-foreground)]" />
            <MicOff size={14} className="text-[var(--color-muted-foreground)]" />
            <span className="text-xs text-[var(--color-muted-foreground)]">停止中</span>
          </>
        ) : isCapturing ? (
          <>
            <span
              className="w-2 h-2 rounded-full bg-green-500"
              style={{ animation: "pulseDot 1.5s ease-in-out infinite" }}
            />
            <Mic size={14} className="text-green-500" />
            <span className="text-xs text-[var(--color-muted-foreground)]">
              取得中 {transcriptCount}件
            </span>
            {nextSummaryIn > 0 && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                · 次の要約まで {nextSummaryIn}s
              </span>
            )}
          </>
        ) : (
          <>
            <span
              className="w-2 h-2 rounded-full bg-yellow-500"
              style={{ animation: "pulseDot 2s ease-in-out infinite" }}
            />
            <Mic size={14} className="text-yellow-500" />
            <span className="text-xs text-[var(--color-muted-foreground)]">
              Meet の字幕をONにしてください
            </span>
          </>
        )}
      </div>

      <button
        onClick={onSettingsClick}
        className="p-1 rounded-md hover:bg-[var(--color-muted)] transition-colors"
        title="設定">
        <Settings size={14} className="text-[var(--color-muted-foreground)]" />
      </button>
    </div>
  )
}
