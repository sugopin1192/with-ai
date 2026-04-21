import { getSettings } from "~lib/storage"
import { createAIProvider } from "~lib/ai"
import type {
  TranscriptEntry,
  TranscriptLogItem,
  QuestionItem,
  SummaryEntry,
  AppState,
  DebugLog,
  ExtensionMessage,
  SummaryUpdateMessage,
  QuestionDetectedMessage,
  StateResponseMessage,
  DebugLogMessage
} from "~messages/types"

const ALARM_NAME = "summarize"

// Module-level rate limiting (resets on service worker restart, which is acceptable
// because state.isCapturing also resets, preventing immediate alarm-triggered calls)
let isSummaryRunning = false
let lastSummaryTimestamp = 0
let lastAlarmFiredTime = 0  // tracks when alarm last fired, for accurate countdown

// Meetの字幕DOMは伸びていく1つの長い文字列。要約後、次回以降の字幕には前バッチの内容が含まれている。
// このため「前バッチで既にAPIに送信した部分」を記憶し、差分のみを新バッチに入れる。
// MV3のService Worker再起動でメモリが消えるため、chrome.storage.session に永続化
let consumedPrefix = ""       // 既にAPIに送信済みのテキスト全体
let lastFullText = ""         // 直近に受信した「字幕の完全なテキスト」
const SESSION_CONSUMED_KEY = "with_ai_consumed_prefix"

async function loadConsumedPrefix() {
  try {
    const stored = await chrome.storage.session.get([SESSION_CONSUMED_KEY])
    const prev = stored[SESSION_CONSUMED_KEY]
    if (typeof prev === "string" && prev.length > 0) {
      consumedPrefix = prev
      lastFullText = prev  // 起動直後の比較基準として使う
    }
  } catch {
    // noop
  }
}

// SW起動と同時にロード開始。メッセージハンドラで必ずawaitする。
const initPromise = loadConsumedPrefix()

async function saveConsumedPrefix() {
  try {
    await chrome.storage.session.set({ [SESSION_CONSUMED_KEY]: consumedPrefix })
  } catch {
    // noop
  }
}

// 2つの文字列の先頭から一致する文字数を返す
function longestCommonPrefixLength(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i
  }
  return minLen
}

// 同一発話の判定：Meet字幕は途中でML修正で内容が書き換わるため、単純な include() では対応不可
function sameUtterance(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  // 先頭30文字が一致するなら同一発話ストリームとみなす
  const prefixLen = Math.min(30, a.length, b.length)
  if (prefixLen < 20) return false
  return a.slice(0, prefixLen) === b.slice(0, prefixLen)
}

// In-memory state
const state: {
  isEnabled: boolean
  transcript: TranscriptEntry[]          // 現在のバッチ（API送信対象、要約後クリア）
  transcriptLog: TranscriptLogItem[]     // 全履歴（区切り込み、UI表示用）
  summaries: SummaryEntry[]
  questions: QuestionItem[]
  isCapturing: boolean
  intervalSeconds: number
  debugLogs: DebugLog[]
} = {
  isEnabled: true,
  transcript: [],
  transcriptLog: [],
  summaries: [],
  questions: [],
  isCapturing: false,
  intervalSeconds: 30,
  debugLogs: []
}

function pushLog(level: DebugLog["level"], message: string) {
  const log: DebugLog = { level, message, timestamp: Date.now() }
  state.debugLogs.unshift(log)
  if (state.debugLogs.length > 50) state.debugLogs.length = 50
  const msg: DebugLogMessage = { type: "DEBUG_LOG", log }
  broadcastToSidePanel(msg)
  console[level](`[WITH-AI] ${message}`)
}

function formatApiError(err: unknown): { message: string; isRateLimit: boolean } {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return {
      message: `レート制限(429)に達しました。60秒後に再試行します。\n詳細: ${raw.slice(0, 200)}`,
      isRateLimit: true
    }
  }
  if (raw.includes("401") || raw.includes("403") || raw.includes("API_KEY_INVALID")) {
    return { message: `APIキーが無効です。設定画面で確認してください。\n詳細: ${raw.slice(0, 100)}`, isRateLimit: false }
  }
  if (raw.includes("404") || raw.includes("not found")) {
    return { message: `モデルが見つかりません。設定画面で別のモデルを選んでください。\n詳細: ${raw.slice(0, 100)}`, isRateLimit: false }
  }
  return { message: raw.slice(0, 300), isRateLimit: false }
}

async function runSummary(force = false) {
  if (isSummaryRunning) {
    pushLog("warn", "要約スキップ: 前回の処理がまだ実行中です")
    return
  }
  if (!force) {
    const MIN_INTERVAL = Math.max(state.intervalSeconds * 1000 * 0.8, 15_000)
    const elapsed = Date.now() - lastSummaryTimestamp
    if (lastSummaryTimestamp > 0 && elapsed < MIN_INTERVAL) {
      pushLog("warn", `要約スキップ: 前回から${Math.round(elapsed / 1000)}秒しか経っていません`)
      return
    }
  }
  const MIN_TRANSCRIPT = 1
  if (state.transcript.length < MIN_TRANSCRIPT) {
    pushLog("warn", `要約スキップ: 字幕データが${state.transcript.length}件です`)
    return
  }

  isSummaryRunning = true
  lastSummaryTimestamp = Date.now()

  try {
    pushLog("info", `要約開始: ${state.transcript.length}件の字幕を処理中...`)

    const settings = await getSettings()
    const activeKey = settings.apiProvider === "gemini" ? settings.geminiApiKey
      : settings.apiProvider === "openai" ? settings.openaiApiKey
      : settings.claudeApiKey
    const activeModel = settings.apiProvider === "gemini" ? settings.geminiModel
      : settings.apiProvider === "openai" ? settings.openaiModel
      : settings.claudeModel
    pushLog("info", `プロバイダー: ${settings.apiProvider} / モデル: ${activeModel} / キー: ${activeKey ? activeKey.slice(0, 8) + "..." : "未設定"}`)

    const ai = createAIProvider(settings)
    if (!ai) {
      pushLog("error", `APIキーが未設定です (プロバイダー: ${settings.apiProvider})。設定画面でAPIキーを入力してください。`)
      return
    }

    // 会話記録をAPIに投げて要約＋質問抽出を1回のコールで実施
    const result = await ai.summarize(state.transcript)
    const entry: SummaryEntry = {
      id: `s_${Date.now()}`,
      timestamp: Date.now(),
      points: result.points,
      overview: result.overview
    }
    state.summaries.push(entry)
    pushLog("info", `要約完了: 要点${result.points.length}点 / 質問${result.questions.length}件`)
    broadcastToSidePanel({ type: "SUMMARY_UPDATE", entry } as SummaryUpdateMessage)

    // AIが抽出した質問を登録
    for (const q of result.questions) {
      const item: QuestionItem = {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        question: q.question,
        answer: q.answer,
        timestamp: Date.now()
      }
      state.questions.unshift(item)
      if (state.questions.length > 50) state.questions.length = 50
      broadcastToSidePanel({ type: "QUESTION_DETECTED", item } as QuestionDetectedMessage)
    }

    // APIに投げた時点のstate.transcriptをスナップショットとしてtranscriptLogに追加
    for (const entry of state.transcript) {
      state.transcriptLog.push({
        kind: "caption",
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp
      })
    }
    const clearedCount = state.transcript.length
    state.transcriptLog.push({
      kind: "separator",
      timestamp: Date.now(),
      summarizedCount: clearedCount
    })
    if (state.transcriptLog.length > 500) {
      state.transcriptLog.splice(0, state.transcriptLog.length - 500)
    }
    // 次バッチで重複送信しないよう、「この時点までの完全テキスト」を記憶
    consumedPrefix = lastFullText
    saveConsumedPrefix()  // SW再起動に備えて永続化
    // APIに投げたバッチをクリア（次回要約は新しい発言のみ対象）
    state.transcript = []
    pushLog("info", `✂️ 会話履歴を区切りました（${clearedCount}件をAPI送信済み / ${consumedPrefix.length}文字を消費済み）`)
    broadcastToSidePanel({ type: "STATE_RESPONSE", state: buildAppState() })
  } catch (err) {
    const { message, isRateLimit } = formatApiError(err)
    pushLog("error", `要約エラー: ${message}`)
    if (isRateLimit) {
      lastSummaryTimestamp = Date.now() + 50_000  // 429時は追加50秒クールダウン
    }
  } finally {
    isSummaryRunning = false
  }
}

function broadcastToSidePanel(msg: ExtensionMessage) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Side panel may not be open; ignore
  })
}

function buildAppState(): AppState {
  const elapsed = lastAlarmFiredTime > 0 ? Math.floor((Date.now() - lastAlarmFiredTime) / 1000) : 0
  const nextSummaryIn = Math.max(0, state.intervalSeconds - elapsed)
  return {
    isEnabled: state.isEnabled,
    isCapturing: state.isCapturing,
    transcriptCount: state.transcript.length,  // 現在のバッチの件数（API送信対象）
    transcript: state.transcript.slice(-100),
    transcriptLog: state.transcriptLog.slice(-300),  // UI表示用・区切り込み全履歴
    summaries: state.summaries,
    questions: state.questions,
    nextSummaryIn,
    debugLogs: state.debugLogs
  }
}

async function setupAlarm() {
  const settings = await getSettings()
  state.intervalSeconds = settings.summaryInterval ?? 30
  await chrome.alarms.clear(ALARM_NAME)
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: state.intervalSeconds / 60,
    periodInMinutes: state.intervalSeconds / 60
  })
  lastAlarmFiredTime = Date.now()  // treat setup as a "reset" so countdown starts fresh
  pushLog("info", `起動完了 / タイマー: ${state.intervalSeconds}秒間隔`)
}

// ─── Event Listeners ────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  lastAlarmFiredTime = Date.now()
  // カウントダウンをリセットするためにbroadcast（nextSummaryInが更新されるため）
  broadcastToSidePanel({ type: "STATE_RESPONSE", state: buildAppState() })
  if (state.isEnabled && state.isCapturing) {
    pushLog("info", "定期要約タイマー発火")
    runSummary()
  }
})

function handleMessage(
  msg: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean | undefined {
  switch (msg.type) {
      case "NEW_CAPTION": {
        if (!state.isEnabled) break
        if (!state.isCapturing) {
          state.isCapturing = true
          pushLog("info", "字幕キャプチャ開始")
          broadcastToSidePanel({ type: "CAPTURE_STARTED" })
        }

        // 直近の完全テキストを保持（要約時にconsumedPrefixへ反映するため）
        lastFullText = msg.text

        // 前バッチで既に送信した部分を差し引く。完全なstartsWithではなく
        // 最長共通プレフィックス長で判定（MLが句読点を書き換えるケースに対応）
        let effectiveText = msg.text
        if (consumedPrefix) {
          const lcp = longestCommonPrefixLength(consumedPrefix, msg.text)
          // 消費済みテキストの80%以上、または30文字以上一致していれば「継続」とみなし差分を使用
          const isContinuation = lcp >= Math.min(consumedPrefix.length * 0.8, 30) && lcp >= 10
          if (isContinuation) {
            effectiveText = msg.text.slice(lcp).trimStart()
          } else {
            // 発散（DOMリセット/発言者変更など）→ プレフィックスをリセットして全文を新規として扱う
            consumedPrefix = ""
            effectiveText = msg.text
          }
        }
        if (effectiveText.length < 3) break  // 新しい内容がほぼない

        // state.transcriptのdedup：同一発話か判定し、該当なら最新版で上書き
        // rapidUpdate（3秒以内無条件上書き）は削除：異なる発話を誤って上書きしていた
        const last = state.transcript[state.transcript.length - 1]
        const continuedStream =
          last &&
          msg.timestamp - last.timestamp < 60_000 &&
          sameUtterance(last.text, effectiveText)

        if (continuedStream) {
          if (effectiveText.length >= last!.text.length) {
            last!.text = effectiveText
            last!.timestamp = msg.timestamp
            if (msg.speaker && !last!.speaker) {
              last!.speaker = msg.speaker
            }
          }
        } else {
          state.transcript.push({
            speaker: msg.speaker,
            text: effectiveText,
            timestamp: msg.timestamp
          })
        }
        // NOTE: transcriptLogはここでは更新しない（API送信時にスナップショットとして追加）
        break
      }

      case "SET_ENABLED": {
        state.isEnabled = msg.enabled
        pushLog("info", `WITH-AI: ${msg.enabled ? "ON" : "OFF"}`)
        if (!msg.enabled) {
          state.isCapturing = false
          broadcastToSidePanel({ type: "CAPTURE_STOPPED" })
        } else {
          triggerCaptionCheckForAllMeetTabs()
        }
        broadcastToSidePanel({ type: "STATE_RESPONSE", state: buildAppState() })
        break
      }

      case "CAPTION_STATUS": {
        pushLog("info", `字幕ステータス受信: ${msg.isActive ? "ON" : "OFF"}`)
        if (msg.isActive && state.isEnabled) {
          if (!state.isCapturing) {
            state.isCapturing = true
            pushLog("info", "✅ 字幕がONです。取得を開始します")
            broadcastToSidePanel({ type: "CAPTURE_STARTED" })
          }
        } else if (!msg.isActive) {
          // 字幕が確認できない場合、isCapturingをfalseに戻す
          if (state.isCapturing && state.transcript.length === 0) {
            state.isCapturing = false
          }
          pushLog("warn", "⚠️ Meetの字幕がOFFです。画面下部「CC 字幕を表示」をクリックしてください")
        }
        broadcastToSidePanel({ type: "STATE_RESPONSE", state: buildAppState() })
        break
      }

      case "MANUAL_ANALYZE": {
        pushLog("info", "手動分析ボタン押下（強制実行）")
        lastAlarmFiredTime = Date.now()
        broadcastToSidePanel({ type: "STATE_RESPONSE", state: buildAppState() })
        runSummary(true)  // force=true: クールダウン/MIN_INTERVALを無視
        break
      }

      case "RECHECK_CAPTION": {
        pushLog("info", "🔄 字幕の状態を再確認します")
        triggerCaptionCheckForAllMeetTabs()
        break
      }

      case "ANALYZE_POINT": {
        analyzePointAsync(msg.summaryId, msg.pointIndex, msg.pointText)
        break
      }

      case "ANSWER_QUESTION": {
        answerQuestionAsync(msg.questionId, msg.questionText)
        break
      }

      case "RELOAD_MEET_TAB": {
        pushLog("info", "Meetタブを再読み込みします")
        chrome.tabs.query({ url: "https://meet.google.com/*" }, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.reload(tab.id).catch((err) => {
                pushLog("error", `再読み込み失敗: ${String(err)}`)
              })
            }
          })
          pushLog("info", `${tabs.length}件のMeetタブを再読み込みしました`)
        })
        break
      }

      case "CLEAR_SESSION": {
        state.transcript = []
        state.transcriptLog = []
        state.summaries = []
        state.questions = []
        state.isCapturing = false
        state.debugLogs = []
        consumedPrefix = ""
        lastFullText = ""
        saveConsumedPrefix()  // リセットを永続化
        broadcastToSidePanel({ type: "CAPTURE_STOPPED" })
        pushLog("info", "セッションリセット")
        break
      }

      case "DEBUG_LOG": {
        state.debugLogs.unshift(msg.log)
        if (state.debugLogs.length > 50) state.debugLogs.length = 50
        broadcastToSidePanel(msg)
        break
      }

      case "GET_STATE": {
        if (state.isEnabled) {
          triggerCaptionCheckForAllMeetTabs()
        }
        const response: StateResponseMessage = {
          type: "STATE_RESPONSE",
          state: buildAppState()
        }
        sendResponse(response)
        return true
      }

      default:
        break
    }
}

chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender, sendResponse) => {
  // consumedPrefix がストレージから復元されるまで待ってから処理
  // （SW再起動直後の NEW_CAPTION が古いデータを消費済みと誤認しないため）
  initPromise.then(() => {
    handleMessage(msg, sender, sendResponse)
  })
  return true  // 非同期応答のため true を返す
})

// ─── 要点ごとの深堀り分析 ────────────────────────────────────────────
async function analyzePointAsync(summaryId: string, pointIndex: number, pointText: string) {
  const summary = state.summaries.find((s) => s.id === summaryId)
  const overview = summary?.overview ?? ""

  // ローディング状態を通知
  broadcastToSidePanel({
    type: "POINT_QA_UPDATE",
    summaryId,
    pointIndex,
    status: "loading"
  })

  try {
    const settings = await getSettings()
    const ai = createAIProvider(settings)
    if (!ai) {
      broadcastToSidePanel({
        type: "POINT_QA_UPDATE",
        summaryId,
        pointIndex,
        status: "error",
        error: "APIキーが未設定です"
      })
      return
    }

    pushLog("info", `要点を分析中: "${pointText.slice(0, 40)}..."`)
    const result = await ai.analyzePoint(pointText, overview)
    pushLog("info", `要点分析完了: ${result.question.slice(0, 40)}`)

    broadcastToSidePanel({
      type: "POINT_QA_UPDATE",
      summaryId,
      pointIndex,
      status: "success",
      question: result.question,
      answer: result.answer
    })
  } catch (err) {
    const { message } = formatApiError(err)
    pushLog("error", `要点分析エラー: ${message}`)
    broadcastToSidePanel({
      type: "POINT_QA_UPDATE",
      summaryId,
      pointIndex,
      status: "error",
      error: message
    })
  }
}

// ─── 質問への回答を再生成 ────────────────────────────────────────────
async function answerQuestionAsync(questionId: string, questionText: string) {
  broadcastToSidePanel({
    type: "QUESTION_ANSWER_UPDATE",
    questionId,
    status: "loading"
  })

  try {
    const settings = await getSettings()
    const ai = createAIProvider(settings)
    if (!ai) {
      broadcastToSidePanel({
        type: "QUESTION_ANSWER_UPDATE",
        questionId,
        status: "error",
        error: "APIキーが未設定です"
      })
      return
    }

    // 最新の要約の概要を文脈として使う
    const latestSummary = state.summaries[state.summaries.length - 1]
    const context = latestSummary?.overview ?? ""

    pushLog("info", `質問を再回答中: "${questionText.slice(0, 40)}..."`)
    const answer = await ai.answerQuestion(questionText, context)
    pushLog("info", `質問回答完了: ${answer.length}点`)

    // state.questions も更新
    const q = state.questions.find((q) => q.id === questionId)
    if (q) q.answer = answer

    broadcastToSidePanel({
      type: "QUESTION_ANSWER_UPDATE",
      questionId,
      status: "success",
      answer
    })
  } catch (err) {
    const { message } = formatApiError(err)
    pushLog("error", `質問回答エラー: ${message}`)
    broadcastToSidePanel({
      type: "QUESTION_ANSWER_UPDATE",
      questionId,
      status: "error",
      error: message
    })
  }
}

// ─── 字幕チェックのフォールバック ─────────────────────────────────────
// コンテンツスクリプトが未注入のMeetタブでもscripting APIで直接DOMチェック
async function checkCaptionViaScripting(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = [
          ".a4cQT",
          "[jsname='YSg7Ge']",
          "[jsname='tgaKEf']",
          ".iTTPOb",
          ".VbkSUe"
        ]
        for (const sel of selectors) {
          if (document.querySelector(sel)) return true
        }
        return false
      }
    })
    return results?.[0]?.result === true
  } catch (err) {
    pushLog("error", `scripting.executeScript失敗: ${String(err)}`)
    return false
  }
}

async function triggerCaptionCheckForAllMeetTabs() {
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" })
  if (tabs.length === 0) {
    pushLog("warn", "Google Meetのタブが見つかりません。Meetを開いてから有効化してください。")
    return
  }
  for (const tab of tabs) {
    if (!tab.id) continue
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "CHECK_CAPTION" })
      // 成功した場合、content script側がCAPTION_STATUSを返す
    } catch {
      // コンテンツスクリプト未注入 → scripting APIでフォールバック
      pushLog("info", `コンテンツスクリプト未注入。scripting APIで直接確認します (tab=${tab.id})`)
      const isActive = await checkCaptionViaScripting(tab.id)
      pushLog("info", `scripting確認結果: ${isActive ? "字幕あり" : "字幕なし"}`)
      // 自身にCAPTION_STATUSを注入（同じハンドラーで処理）
      chrome.runtime.sendMessage({ type: "CAPTION_STATUS", isActive }).catch(() => {})
      if (isActive) {
        pushLog("warn", "字幕はONですが、会話キャプチャには Meet タブの再読み込みが必要です。「Meetタブを再読み込み」ボタンを押してください。")
      }
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(console.error)
  }
})

// SW起動時に永続化済みの消費プレフィックスをロード（これがないと再起動後に重複送信）
loadConsumedPrefix().then(() => {
  setupAlarm()
})
