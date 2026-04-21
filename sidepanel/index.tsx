import { useEffect, useRef, useState } from "react"
import { Trash2, Bug, MessageSquare } from "lucide-react"

import "~styles/globals.css"

import { StatusBar } from "~components/StatusBar"
import { SummarySection, type QuestionAnswerState } from "~components/SummarySection"
import type {
  AppState,
  DebugLog,
  ExtensionMessage
} from "~messages/types"
import { cn } from "~lib/utils"

const INITIAL_STATE: AppState = {
  isEnabled: true,
  isCapturing: false,
  transcriptCount: 0,
  transcript: [],
  transcriptLog: [],
  summaries: [],
  questions: [],
  nextSummaryIn: 30,
  debugLogs: []
}

type Tab = "summary" | "log" | "debug"

function SidePanel() {
  const [appState, setAppState] = useState<AppState>(INITIAL_STATE)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>("summary")
  const [hasNewError, setHasNewError] = useState(false)
  const [dismissedErrorTime, setDismissedErrorTime] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, QuestionAnswerState>>({})
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debugEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
      if (response?.type === "STATE_RESPONSE") {
        setAppState(response.state)
        resetCountdown(response.state.nextSummaryIn)
      }
    })
  }, [])

  useEffect(() => {
    const listener = (msg: ExtensionMessage) => {
      switch (msg.type) {
        case "SUMMARY_UPDATE":
          // 要約成功時に会話ログもクリア（バックグラウンド側でもクリアされる）
          setAppState((prev) => ({
            ...prev,
            summaries: [...prev.summaries, msg.entry],
            transcript: [],
            transcriptCount: 0
          }))
          setIsAnalyzing(false)
          resetCountdown(appState.nextSummaryIn)
          break

        case "QUESTION_DETECTED":
          setAppState((prev) => {
            const questions: QuestionItem[] = [
              msg.item,
              ...prev.questions.filter((q) => q.id !== msg.item.id)
            ].slice(0, 20)
            return { ...prev, questions }
          })
          break

        case "CAPTURE_STARTED":
          setAppState((prev) => ({ ...prev, isCapturing: true }))
          break

        case "CAPTURE_STOPPED":
          setAppState((prev) => ({
            ...INITIAL_STATE,
            isEnabled: prev.isEnabled,
            summaries: prev.summaries,
            questions: prev.questions,
            debugLogs: prev.debugLogs
          }))
          setIsAnalyzing(false)
          break

        case "STATE_RESPONSE":
          setAppState((prev) => ({
            ...msg.state,
            // サービスワーカー再起動でisCapturingがリセットされても表示を維持
            isCapturing: prev.isCapturing || msg.state.isCapturing,
            // 累積データは件数が多い方を優先（SW再起動保護）
            summaries: msg.state.summaries.length >= prev.summaries.length ? msg.state.summaries : prev.summaries,
            questions: msg.state.questions.length >= prev.questions.length ? msg.state.questions : prev.questions,
            transcriptLog: msg.state.transcriptLog.length >= prev.transcriptLog.length ? msg.state.transcriptLog : prev.transcriptLog
            // transcript/transcriptCountは要約時にクリアされるのでbackground側の値を信頼
          }))
          resetCountdown(msg.state.nextSummaryIn)
          break

        case "NEW_CAPTION":
          // transcriptLogはAPIに投げた単位で更新するためここでは触らない
          setAppState((prev) => ({
            ...prev,
            isCapturing: true,
            transcriptCount: prev.transcriptCount + 1
          }))
          break

        case "QUESTION_ANSWER_UPDATE": {
          setQuestionAnswers((prev) => ({
            ...prev,
            [msg.questionId]: {
              status: msg.status,
              answer: msg.answer,
              error: msg.error
            }
          }))
          break
        }

        case "DEBUG_LOG": {
          setAppState((prev) => ({
            ...prev,
            debugLogs: [msg.log, ...prev.debugLogs].slice(0, 50)
          }))
          if (msg.log.level === "error") {
            setHasNewError(true)
          }
          break
        }

        default:
          break
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [appState.nextSummaryIn])

  function resetCountdown(seconds: number) {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(seconds)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  function handleManualAnalyze() {
    setIsAnalyzing(true)
    chrome.runtime.sendMessage({ type: "MANUAL_ANALYZE" })
    setTimeout(() => setIsAnalyzing(false), 15_000)
  }

  function handleToggleEnabled() {
    const next = !appState.isEnabled
    chrome.runtime.sendMessage({ type: "SET_ENABLED", enabled: next })
    setAppState((prev) => ({ ...prev, isEnabled: next }))
  }

  function handleRecheckCaption() {
    chrome.runtime.sendMessage({ type: "RECHECK_CAPTION" })
  }

  function handleReloadMeetTab() {
    chrome.runtime.sendMessage({ type: "RELOAD_MEET_TAB" })
  }

  function handleAnswerQuestion(questionId: string, questionText: string) {
    setQuestionAnswers((prev) => ({ ...prev, [questionId]: { status: "loading" } }))
    chrome.runtime.sendMessage({
      type: "ANSWER_QUESTION",
      questionId,
      questionText
    })
  }

  function handleClearSession() {
    chrome.runtime.sendMessage({ type: "CLEAR_SESSION" })
    setAppState((prev) => ({ ...INITIAL_STATE, isEnabled: prev.isEnabled, debugLogs: [] }))
    setIsAnalyzing(false)
    setHasNewError(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(0)
  }

  function handleSettingsClick() {
    chrome.runtime.openOptionsPage()
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    if (tab === "debug") {
      setHasNewError(false)
      setDismissedErrorTime(Date.now())
    }
  }

  const logColors: Record<DebugLog["level"], string> = {
    info: "text-[var(--color-muted-foreground)]",
    warn: "text-yellow-600 dark:text-yellow-400",
    error: "text-red-600 dark:text-red-400"
  }

  const latestError = appState.debugLogs.find((l) => l.level === "error" && l.timestamp > dismissedErrorTime)

  return (
    <div className="flex flex-col h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
        <span className="text-sm font-bold tracking-wide">WITH-AI</span>
        <button
          onClick={handleClearSession}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          title="セッションをリセット">
          <Trash2 size={13} />
        </button>
      </div>

      {/* ON/OFF Toggle Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-foreground)]">
          {appState.isEnabled ? "AIアシスタント 稼働中" : "AIアシスタント 停止中"}
        </span>
        {/* Toggle switch */}
        <button
          onClick={handleToggleEnabled}
          role="switch"
          aria-checked={appState.isEnabled}
          title={appState.isEnabled ? "クリックして停止" : "クリックして開始"}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            backgroundColor: appState.isEnabled ? "#22c55e" : "#d1d5db",
            border: "none",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background-color 0.2s",
            padding: 0
          }}>
          <span style={{
            position: "absolute",
            top: 3,
            left: appState.isEnabled ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.2s"
          }} />
        </button>
      </div>

      {/* Status */}
      <StatusBar
        isEnabled={appState.isEnabled}
        isCapturing={appState.isCapturing}
        transcriptCount={appState.transcriptCount}
        nextSummaryIn={countdown}
        onSettingsClick={handleSettingsClick}
      />

      {/* Error banner */}
      {latestError && activeTab !== "debug" && (
        <button
          onClick={() => handleTabChange("debug")}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 text-left w-full">
          <span className="text-red-600 dark:text-red-400 text-xs font-medium truncate flex-1">
            エラー: {latestError.message.slice(0, 60)}
          </span>
          <span className="text-red-500 text-xs flex-shrink-0">詳細 →</span>
        </button>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-[var(--color-border)]">
        <button
          onClick={() => handleTabChange("summary")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium transition-colors",
            activeTab === "summary"
              ? "border-b-2 border-[var(--color-primary)] text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          )}>
          要約・Q&A
        </button>
        <button
          onClick={() => handleTabChange("log")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1",
            activeTab === "log"
              ? "border-b-2 border-[var(--color-primary)] text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          )}>
          <MessageSquare size={11} />
          会話ログ
        </button>
        <button
          onClick={() => handleTabChange("debug")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1",
            activeTab === "debug"
              ? "border-b-2 border-[var(--color-primary)] text-[var(--color-foreground)]"
              : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          )}>
          <Bug size={11} />
          デバッグ
          {hasNewError && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className={cn("flex-1 overflow-y-auto", !appState.isEnabled && "opacity-60")}>
        {activeTab === "summary" ? (
          <>
            <SummarySection
              summaries={appState.summaries}
              questions={appState.questions}
              isLoading={isAnalyzing}
              onManualAnalyze={handleManualAnalyze}
              questionAnswers={questionAnswers}
              onAnswerQuestion={handleAnswerQuestion}
            />
            {!appState.isCapturing && appState.summaries.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed mb-3">
                  Google Meet で字幕（CC）をオンにすると<br />
                  会議内容の自動要約が始まります
                </p>
                <div className="flex flex-col gap-2 items-center">
                  <button
                    onClick={handleRecheckCaption}
                    className="text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors">
                    字幕の状態を再確認
                  </button>
                  <button
                    onClick={handleReloadMeetTab}
                    className="text-xs px-3 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] transition-colors text-[var(--color-muted-foreground)]">
                    Meetタブを再読み込み
                  </button>
                </div>
              </div>
            )}
          </>
        ) : activeTab === "log" ? (
          <div className="p-2 space-y-1">
            {appState.transcriptLog.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)] p-2">
                会話ログはまだありません（要約実行時に記録されます）
              </p>
            ) : (
              [...appState.transcriptLog].reverse().map((item, i) => {
                if (item.kind === "separator") {
                  return (
                    <div key={i} className="flex items-center gap-2 py-2 my-1">
                      <div className="flex-1 h-px bg-[var(--color-border)]" />
                      <span className="text-[10px] text-[var(--color-muted-foreground)] whitespace-nowrap px-2 py-0.5 rounded-full bg-[var(--color-muted)]">
                        {new Date(item.timestamp).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        })} ✂️ {item.summarizedCount ?? 0}件を要約
                      </span>
                      <div className="flex-1 h-px bg-[var(--color-border)]" />
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex gap-2 text-xs py-1">
                    <span className="text-[var(--color-muted-foreground)] flex-shrink-0 tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </span>
                    <div className="flex-1 min-w-0">
                      {item.speaker && (
                        <span className="font-medium text-[var(--color-primary)] mr-1">{item.speaker}:</span>
                      )}
                      <span className="text-[var(--color-foreground)] break-words">{item.text}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {appState.debugLogs.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)] p-2">
                ログはまだありません
              </p>
            ) : (
              appState.debugLogs.map((log, i) => (
                <div key={i} className="flex gap-2 text-xs font-mono py-0.5">
                  <span className="text-[var(--color-muted-foreground)] flex-shrink-0 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    })}
                  </span>
                  <span className={cn("flex-1 leading-snug break-all", logColors[log.level])}>
                    {log.level === "error" && "❌ "}
                    {log.level === "warn" && "⚠️ "}
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={debugEndRef} />
          </div>
        )}
      </div>
    </div>
  )
}

export default SidePanel
