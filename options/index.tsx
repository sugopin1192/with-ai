import { useEffect, useState } from "react"
import { Check, ChevronDown, Eye, EyeOff, Save } from "lucide-react"

import "~styles/globals.css"

import {
  getSettings,
  saveSettings,
  GEMINI_MODELS,
  OPENAI_MODELS,
  CLAUDE_MODELS,
  type ApiProvider,
  type Settings
} from "~lib/storage"
import { cn } from "~lib/utils"

const PROVIDERS: {
  value: ApiProvider
  label: string
  keyLabel: string
  placeholder: string
  docsUrl: string
}[] = [
  {
    value: "gemini",
    label: "Gemini",
    keyLabel: "Google AI Studio API キー",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey"
  },
  {
    value: "openai",
    label: "OpenAI",
    keyLabel: "OpenAI API キー",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys"
  },
  {
    value: "claude",
    label: "Claude",
    keyLabel: "Anthropic API キー",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys"
  }
]

const MODEL_OPTIONS: Record<ApiProvider, readonly { value: string; label: string }[]> = {
  gemini: GEMINI_MODELS,
  openai: OPENAI_MODELS,
  claude: CLAUDE_MODELS
}

const MODEL_KEY: Record<ApiProvider, keyof Settings> = {
  gemini: "geminiModel",
  openai: "openaiModel",
  claude: "claudeModel"
}

const API_KEY_FIELD: Record<ApiProvider, keyof Settings> = {
  gemini: "geminiApiKey",
  openai: "openaiApiKey",
  claude: "claudeApiKey"
}

const INTERVALS = [
  { value: 15, label: "15秒" },
  { value: 30, label: "30秒" },
  { value: 60, label: "60秒" },
  { value: 120, label: "2分" }
]

function OptionsPage() {
  const [settings, setSettings] = useState<Settings>({
    apiProvider: "gemini",
    geminiApiKey: "",
    openaiApiKey: "",
    claudeApiKey: "",
    geminiModel: "gemini-1.5-flash",
    openaiModel: "gpt-4o-mini",
    claudeModel: "claude-haiku-4-5-20251001",
    summaryInterval: 30
  })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (!loaded) return null

  const activeProvider = PROVIDERS.find((p) => p.value === settings.apiProvider)!
  const apiKeyValue = settings[API_KEY_FIELD[settings.apiProvider]] as string
  const modelKey = MODEL_KEY[settings.apiProvider]
  const modelValue = settings[modelKey] as string
  const models = MODEL_OPTIONS[settings.apiProvider]

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-6">
      <div className="max-w-md mx-auto space-y-6">

        {/* Header */}
        <div className="border-b border-[var(--color-border)] pb-4">
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">WITH-AI 設定</h1>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
            APIキーとモデルを設定してください
          </p>
        </div>

        {/* Step 1: Provider */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            1. AIプロバイダーを選択
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((p) => {
              const hasKey = !!(settings[API_KEY_FIELD[p.value]] as string)
              return (
                <button
                  key={p.value}
                  onClick={() => set("apiProvider", p.value)}
                  className={cn(
                    "relative px-3 py-2.5 text-sm rounded-lg border-2 transition-all text-center font-medium",
                    settings.apiProvider === p.value
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-foreground)]"
                  )}>
                  {p.label}
                  {hasKey && (
                    <span className={cn(
                      "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2",
                      settings.apiProvider === p.value
                        ? "bg-green-400 border-[var(--color-primary)]"
                        : "bg-green-500 border-[var(--color-background)]"
                    )} title="APIキー設定済み" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2: API Key for selected provider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              2. {activeProvider.keyLabel}
            </label>
            <a
              href={activeProvider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-500 hover:underline">
              キーを取得 →
            </a>
          </div>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKeyValue}
              onChange={(e) =>
                set(API_KEY_FIELD[settings.apiProvider], e.target.value as never)
              }
              placeholder={activeProvider.placeholder}
              className={cn(
                "w-full px-3 py-2.5 pr-10 text-sm rounded-lg border-2 transition-colors",
                "bg-[var(--color-background)] text-[var(--color-foreground)]",
                "focus:outline-none focus:border-[var(--color-ring)]",
                "font-mono placeholder:font-sans placeholder:text-[var(--color-muted-foreground)]",
                apiKeyValue
                  ? "border-green-500"
                  : "border-[var(--color-border)]"
              )}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {apiKeyValue && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Check size={11} /> APIキーが設定されています
            </p>
          )}
          {!apiKeyValue && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              ※ APIキーはブラウザのローカルストレージにのみ保存されます
            </p>
          )}
        </div>

        {/* Step 3: Model */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            3. モデルを選択
          </label>
          <div className="relative">
            <select
              value={modelValue}
              onChange={(e) => set(modelKey, e.target.value as never)}
              className={cn(
                "w-full appearance-none px-3 py-2.5 pr-8 text-sm rounded-lg border-2",
                "bg-[var(--color-background)] text-[var(--color-foreground)]",
                "border-[var(--color-border)] focus:outline-none focus:border-[var(--color-ring)]",
                "cursor-pointer"
              )}>
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] pointer-events-none"
            />
          </div>
        </div>

        {/* Step 4: Interval */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            4. 自動要約の間隔
          </label>
          <div className="grid grid-cols-4 gap-2">
            {INTERVALS.map((i) => (
              <button
                key={i.value}
                onClick={() => set("summaryInterval", i.value)}
                className={cn(
                  "py-2 text-sm rounded-lg border-2 transition-all font-medium",
                  settings.summaryInterval === i.value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-foreground)]"
                )}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all",
            saved
              ? "bg-green-600 text-white"
              : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 active:scale-[0.98]"
          )}>
          {saved ? <><Check size={15} /> 保存しました</> : <><Save size={15} /> 設定を保存</>}
        </button>

      </div>
    </div>
  )
}

export default OptionsPage
