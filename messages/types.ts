export type MessageType =
  | "NEW_CAPTION"
  | "SUMMARY_UPDATE"
  | "QUESTION_DETECTED"
  | "MANUAL_ANALYZE"
  | "CLEAR_SESSION"
  | "GET_STATE"
  | "STATE_RESPONSE"
  | "CAPTURE_STARTED"
  | "CAPTURE_STOPPED"
  | "ERROR"
  | "DEBUG_LOG"
  | "SET_ENABLED"
  | "CHECK_CAPTION"
  | "CAPTION_STATUS"
  | "RECHECK_CAPTION"
  | "RELOAD_MEET_TAB"
  | "ANALYZE_POINT"
  | "POINT_QA_UPDATE"
  | "ANSWER_QUESTION"
  | "QUESTION_ANSWER_UPDATE"

export interface TranscriptEntry {
  speaker: string
  text: string
  timestamp: number
}

// 会話ログ表示用：会話entryと要約区切りが混在
export interface TranscriptLogItem {
  kind: "caption" | "separator"
  timestamp: number
  speaker?: string
  text?: string
  summarizedCount?: number
}

export interface SummaryEntry {
  id: string
  timestamp: number
  points: string[]
  overview: string
}

export interface QuestionItem {
  id: string
  question: string
  answer: string[]
  timestamp: number
}

export interface DebugLog {
  level: "info" | "warn" | "error"
  message: string
  timestamp: number
}

export interface AppState {
  isEnabled: boolean
  isCapturing: boolean
  transcriptCount: number          // 現在の区切り内の字幕件数（API送信対象）
  transcript: TranscriptEntry[]    // 現在のバッチ（API送信対象、要約後クリア）
  transcriptLog: TranscriptLogItem[]  // 全履歴（区切りマーカー込み、UIの会話ログ表示用）
  summaries: SummaryEntry[]
  questions: QuestionItem[]
  nextSummaryIn: number
  debugLogs: DebugLog[]
}

export interface NewCaptionMessage {
  type: "NEW_CAPTION"
  speaker: string
  text: string
  timestamp: number
  lineId?: string   // 字幕行ごとの識別子（DOM要素ベース）
}

export interface SummaryUpdateMessage {
  type: "SUMMARY_UPDATE"
  entry: SummaryEntry
}

export interface QuestionDetectedMessage {
  type: "QUESTION_DETECTED"
  item: QuestionItem
}

export interface ManualAnalyzeMessage {
  type: "MANUAL_ANALYZE"
}

export interface ClearSessionMessage {
  type: "CLEAR_SESSION"
}

export interface GetStateMessage {
  type: "GET_STATE"
}

export interface StateResponseMessage {
  type: "STATE_RESPONSE"
  state: AppState
}

export interface CaptureStartedMessage {
  type: "CAPTURE_STARTED"
}

export interface CaptureStoppedMessage {
  type: "CAPTURE_STOPPED"
}

export interface ErrorMessage {
  type: "ERROR"
  message: string
}

export interface DebugLogMessage {
  type: "DEBUG_LOG"
  log: DebugLog
}

export interface SetEnabledMessage {
  type: "SET_ENABLED"
  enabled: boolean
}

export interface CheckCaptionMessage {
  type: "CHECK_CAPTION"
}

export interface CaptionStatusMessage {
  type: "CAPTION_STATUS"
  isActive: boolean
}

export interface RecheckCaptionMessage {
  type: "RECHECK_CAPTION"
}

export interface ReloadMeetTabMessage {
  type: "RELOAD_MEET_TAB"
}

export interface AnalyzePointMessage {
  type: "ANALYZE_POINT"
  summaryId: string
  pointIndex: number
  pointText: string
}

export interface PointQAUpdateMessage {
  type: "POINT_QA_UPDATE"
  summaryId: string
  pointIndex: number
  status: "loading" | "success" | "error"
  question?: string
  answer?: string[]
  error?: string
}

export interface AnswerQuestionMessage {
  type: "ANSWER_QUESTION"
  questionId: string
  questionText: string
}

export interface QuestionAnswerUpdateMessage {
  type: "QUESTION_ANSWER_UPDATE"
  questionId: string
  status: "loading" | "success" | "error"
  answer?: string[]
  error?: string
}

export type ExtensionMessage =
  | NewCaptionMessage
  | SummaryUpdateMessage
  | QuestionDetectedMessage
  | ManualAnalyzeMessage
  | ClearSessionMessage
  | GetStateMessage
  | StateResponseMessage
  | CaptureStartedMessage
  | CaptureStoppedMessage
  | ErrorMessage
  | DebugLogMessage
  | SetEnabledMessage
  | CheckCaptionMessage
  | CaptionStatusMessage
  | RecheckCaptionMessage
  | ReloadMeetTabMessage
  | AnalyzePointMessage
  | PointQAUpdateMessage
  | AnswerQuestionMessage
  | QuestionAnswerUpdateMessage
