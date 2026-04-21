export type ApiProvider = "gemini" | "openai" | "claude"

export const GEMINI_MODELS = [
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite（推奨・高速）" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro（高精度）" }
] as const

export const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini（推奨）" },
  { value: "gpt-4o", label: "GPT-4o" }
] as const

export const CLAUDE_MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（推奨）" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }
] as const

export interface Settings {
  apiProvider: ApiProvider
  geminiApiKey: string
  openaiApiKey: string
  claudeApiKey: string
  geminiModel: string
  openaiModel: string
  claudeModel: string
  summaryInterval: number
}

const DEFAULTS: Settings = {
  apiProvider: "gemini",
  geminiApiKey: "",
  openaiApiKey: "",
  claudeApiKey: "",
  geminiModel: "gemini-2.0-flash-lite",
  openaiModel: "gpt-4o-mini",
  claudeModel: "claude-haiku-4-5-20251001",
  summaryInterval: 30
}

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (result) => {
      resolve(result as Settings)
    })
  })
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve)
  })
}

export function onSettingsChanged(
  callback: (settings: Partial<Settings>) => void
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    const updated: Partial<Settings> = {}
    for (const key of Object.keys(changes)) {
      ;(updated as Record<string, unknown>)[key] = changes[key].newValue
    }
    callback(updated)
  }
  chrome.storage.local.onChanged.addListener(listener)
  return () => chrome.storage.local.onChanged.removeListener(listener)
}
