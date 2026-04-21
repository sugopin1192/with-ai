import type { PlasmoCSConfig } from "plasmo"
import type { NewCaptionMessage, DebugLogMessage } from "~messages/types"

export const config: PlasmoCSConfig = {
  matches: ["https://meet.google.com/*"],
  run_at: "document_idle"
}

function sendLog(level: "info" | "warn" | "error", message: string) {
  const msg: DebugLogMessage = {
    type: "DEBUG_LOG",
    log: { level, message: `[CS] ${message}`, timestamp: Date.now() }
  }
  chrome.runtime.sendMessage(msg).catch(() => {})
}

// ── 非字幕テキストの判定 ─────────────────────────────────────────────
// 字幕以外のUI要素から拾ってしまうテキストを除外
const NON_CAPTION_PATTERNS = [
  // Material Symbolアイコン名（アイコンがテキストとして露出）
  /^(videocam|videocam_off|mic|mic_none|mic_off|volume_up|volume_off|volume_down|call_end|more_vert|people|chat_bubble|present_to_all|front_hand|closed_caption|settings|cast|photo_camera|videocam_on)/,
  // デバイスID末尾（例: (D288:CE50)）
  /\([0-9A-Fa-f]{4}:[0-9A-Fa-f]{4}\)\s*$/,
  // Built-inデバイス表記
  /\(Built-in\)\s*$/,
  // Meetのシステムアナウンス（日本語）
  /カメラは(オン|オフ)に/,
  /マイクは(オン|オフ)に/,
  /スピーカーは/,
  /背景を置き換え/,
  /背景(が|を)(変更|ぼかし)/,
  /画面の共有を(開始|停止)/,
  /会議に参加しました/,
  /会議から退出しました/,
  /が参加しました$/,
  /が退出しました$/,
  /手を(挙げ|下ろし)/,
  /ピン留め/,
  /字幕(が|を)(オン|オフ|表示|非表示)/,
  /録画(を開始|を停止)/,
  /会議は間もなく終了/,
  /会議が.*終了/,
  /終了まで(の残り時間|あと)/,
  // Meetのシステムアナウンス（英語）
  /^(camera|microphone|mic) (is |turned )(on|off)/i,
  /^background (replaced|changed|blurred)/i,
  /^screen sharing (started|stopped)/i,
  /^(started|stopped) presenting/i,
  /(joined|left) the (meeting|call)/i,
  /this (call|meeting) (will end|is ending)/i,
  /(raised|lowered) (their )?hand/i,
  /captions? (on|off|enabled|disabled)/i,
  /recording (started|stopped)/i,
  // 言語セレクターUI（字幕言語設定画面が展開された時のテキスト）
  /^language/i,
  /ベータ版.*ベータ版.*ベータ版/,
  /format_size/,
  /フォント\s*サイズ/,
  /フォントの色/,
]

function isNonCaption(text: string): boolean {
  return NON_CAPTION_PATTERNS.some((p) => p.test(text))
}

// ── 字幕テキスト内のUIノイズを除去 ────────────────────────────────────
// Material Symbols のアイコン名がテキストとしてDOMに出てしまう問題
// 例: "arrow_downward一番下に移動" のような文字列を除去
function cleanCaptionText(text: string): string {
  // 既知のMaterial Symbolアイコン名 + 直後の短いラベル（空白/改行までの最大30文字）
  const ICON_NAMES = [
    "arrow_downward", "arrow_upward", "arrow_back", "arrow_forward",
    "expand_more", "expand_less", "close", "settings",
    "more_vert", "more_horiz", "menu",
    "chevron_right", "chevron_left",
    "check", "check_circle", "info", "help", "warning",
    "closed_caption", "mic", "mic_off", "mic_none",
    "videocam", "videocam_off", "videocam_on",
    "volume_up", "volume_off", "volume_down",
    "present_to_all", "chat_bubble", "chat_bubble_outline",
    "people", "people_alt",
    "call_end", "front_hand", "raise_hand",
    "cast", "photo_camera", "fullscreen", "fullscreen_exit",
    "speaker", "speaker_notes"
  ]
  let result = text
  for (const icon of ICON_NAMES) {
    // アイコン名 + 直後の最大30文字（空白/改行含まない）を削除
    result = result.replace(new RegExp(`${icon}\\s*[^\\s]{0,30}`, "g"), " ")
    // 単独で残っているアイコン名も削除
    result = result.replace(new RegExp(`\\b${icon}\\b`, "g"), " ")
  }
  // 連続空白を1つに
  return result.replace(/\s+/g, " ").trim()
}

// ── Google Meet字幕コンテナの特定 ─────────────────────────────────────
// 字幕コンテナは特定の属性/クラスで識別できる
const MEET_CAPTION_SELECTORS = [
  ".a4cQT",                   // 字幕メインコンテナ
  "[jsname='YSg7Ge']",        // 字幕リスト
  "[jsname='tgaKEf']",        // 字幕アイテム
  ".iTTPOb",                  // 字幕スクロール領域
  ".VbkSUe",                  // 字幕行
  "[class*='caption' i]",     // 汎用（caption を含むクラス）
]

function findCaptionContainers(): Element[] {
  // 優先順位でセレクタを試し、最初にマッチしたものだけを使う。
  // 入れ子で複数マッチすると古い字幕行も送信されてしまうため。
  for (const sel of MEET_CAPTION_SELECTORS) {
    try {
      const matches = document.querySelectorAll(sel)
      if (matches.length > 0) {
        return Array.from(matches)
      }
    } catch {
      // 無効なセレクタは無視
    }
  }
  return []
}

function isCaptionActive(): boolean {
  // 字幕コンテナが存在すれば字幕ON
  return findCaptionContainers().length > 0
}

// ── 字幕抽出 ──────────────────────────────────────────────────────────
// Meet字幕の典型的な構造：
//   <div class="caption-container">
//     <div>                       <- 字幕行
//       <div>話者名</div>
//       <div>発言テキスト</div>
//     </div>
//   </div>
// textContent は改行なしで結合されるため、子要素を個別に取得する

interface CaptionLine {
  speaker: string
  text: string
}

function extractCaptionsFromContainer(container: Element): CaptionLine[] {
  const lines: CaptionLine[] = []

  // 字幕行候補を探す
  const candidates = container.querySelectorAll(
    ":scope > div, [role='listitem'], [data-message-text]"
  )

  if (candidates.length === 0) {
    // 子要素が取れない場合、コンテナ全体の textContent を使う
    const text = (container.textContent ?? "").trim()
    if (text.length >= 3) {
      lines.push({ speaker: "", text })
    }
    return lines
  }

  for (const line of Array.from(candidates)) {
    // 直接の子要素を取得し、話者名と本文を分離
    const directChildren = Array.from(line.children) as Element[]

    if (directChildren.length >= 2) {
      const speaker = (directChildren[0].textContent ?? "").trim()
      const textParts = directChildren
        .slice(1)
        .map((el) => (el.textContent ?? "").trim())
        .filter((s) => s.length > 0)
      const text = textParts.join(" ")
      if (text.length >= 3) {
        lines.push({ speaker, text })
      }
    } else {
      const text = (line.textContent ?? "").trim()
      if (text.length >= 3) {
        lines.push({ speaker: "", text })
      }
    }
  }

  return lines
}

// ── 送信制御 ──────────────────────────────────────────────────────────
const sentTextCache = new Set<string>()

function sendCaption(speaker: string, text: string) {
  const cleaned = cleanCaptionText(text)
  const trimmed = cleaned.trim()
  if (trimmed.length < 3) return
  if (isNonCaption(trimmed)) return
  if (sentTextCache.has(trimmed)) return

  sentTextCache.add(trimmed)
  // キャッシュ肥大化防止：200件超えたら古いものを削除
  if (sentTextCache.size > 200) {
    const firstKey = sentTextCache.values().next().value
    if (firstKey) sentTextCache.delete(firstKey)
  }

  const msg: NewCaptionMessage = {
    type: "NEW_CAPTION",
    speaker: speaker.trim(),
    text: trimmed,
    timestamp: Date.now()
  }
  chrome.runtime.sendMessage(msg).catch(() => {})
}

// ── 監視ループ ────────────────────────────────────────────────────────
let bodyObserver: MutationObserver | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let rescanTimer: ReturnType<typeof setTimeout> | null = null
const containerObservers = new WeakMap<Element, MutationObserver>()
const observedContainers = new WeakSet<Element>()

function processAllCaptions() {
  const containers = findCaptionContainers()
  for (const container of containers) {
    const lines = extractCaptionsFromContainer(container)
    // 複数の字幕行が同時に存在する場合、最新（最後）の1行のみ送信する。
    // 古い字幕行が再送信されると consumedPrefix のマッチを壊すため。
    if (lines.length > 0) {
      const latest = lines[lines.length - 1]
      sendCaption(latest.speaker, latest.text)
    }
  }
}

function observeContainer(el: Element) {
  if (observedContainers.has(el)) return
  observedContainers.add(el)

  const obs = new MutationObserver(() => {
    const lines = extractCaptionsFromContainer(el)
    for (const line of lines) {
      sendCaption(line.speaker, line.text)
    }
  })
  obs.observe(el, { subtree: true, childList: true, characterData: true })
  containerObservers.set(el, obs)

  sendLog(
    "info",
    `字幕コンテナ監視開始: ${el.tagName}.${(el.className || "").toString().split(" ")[0]}`
  )
}

function rescanContainers() {
  const containers = findCaptionContainers()
  containers.forEach(observeContainer)
  // 初回スキャン時のテキストも送信
  processAllCaptions()
  return containers.length
}

function init() {
  sendLog("info", "WITH-AI Content Script 起動")

  const found = rescanContainers()
  sendLog("info", `初回スキャン: 字幕コンテナ=${found}件`)

  // body全体の変化を監視（字幕ON/OFFで要素が追加・削除されるため）
  bodyObserver = new MutationObserver(() => {
    if (rescanTimer) clearTimeout(rescanTimer)
    rescanTimer = setTimeout(() => {
      rescanContainers()
    }, 500)
  })
  bodyObserver.observe(document.body, { childList: true, subtree: true })

  // ポーリングフォールバック（1秒ごと）
  pollTimer = setInterval(processAllCaptions, 1000)

  // 5秒後に診断
  setTimeout(() => {
    const containers = findCaptionContainers()
    sendLog("info", `診断(5s後): 字幕コンテナ=${containers.length}件`)
    if (containers.length === 0) {
      sendLog(
        "warn",
        "字幕コンテナが見つかりません。Meet画面下部の「CC 字幕を表示」をクリックしてONにしてください。"
      )
    }
  }, 5000)
}

// ── バックグラウンドからのリクエスト処理 ──────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CHECK_CAPTION") {
    // まずコンテナを再スキャン（SPA遷移後にも対応）
    rescanContainers()
    const active = isCaptionActive()
    sendLog("info", `字幕確認: active=${active}`)
    chrome.runtime
      .sendMessage({ type: "CAPTION_STATUS", isActive: active })
      .catch(() => {})
  }
})

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
