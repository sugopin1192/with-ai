import type { Settings } from "~lib/storage"
import type { AIProvider } from "./types"
import { createGeminiProvider } from "./gemini"
import { createOpenAIProvider } from "./openai"
import { createClaudeProvider } from "./claude"

export function createAIProvider(settings: Settings): AIProvider | null {
  const { apiProvider, geminiApiKey, openaiApiKey, claudeApiKey,
    geminiModel, openaiModel, claudeModel } = settings

  switch (apiProvider) {
    case "gemini":
      if (!geminiApiKey) return null
      return createGeminiProvider(geminiApiKey, geminiModel || "gemini-1.5-flash")
    case "openai":
      if (!openaiApiKey) return null
      return createOpenAIProvider(openaiApiKey, openaiModel || "gpt-4o-mini")
    case "claude":
      if (!claudeApiKey) return null
      return createClaudeProvider(claudeApiKey, claudeModel || "claude-haiku-4-5-20251001")
    default:
      return null
  }
}

export type { AIProvider }
