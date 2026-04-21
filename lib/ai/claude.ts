import Anthropic from "@anthropic-ai/sdk"
import type { TranscriptEntry } from "~messages/types"
import {
  buildSummarizePrompt,
  buildQuestionPrompt,
  buildAnalyzePointPrompt,
  parseSummaryResult,
  parseJsonArray,
  parsePointQA,
  type AIProvider,
  type SummaryResult,
  type PointQA
} from "./types"

export function createClaudeProvider(apiKey: string, model: string): AIProvider {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  return {
    async summarize(transcript: TranscriptEntry[]): Promise<SummaryResult> {
      const prompt = buildSummarizePrompt(transcript)
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
      const block = response.content[0]
      const text = block.type === "text" ? block.text : ""
      return parseSummaryResult(text)
    },

    async answerQuestion(question: string, context: string): Promise<string[]> {
      const prompt = buildQuestionPrompt(question, context)
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
      const block = response.content[0]
      const text = block.type === "text" ? block.text : ""
      return parseJsonArray(text)
    },

    async analyzePoint(pointText: string, overview: string): Promise<PointQA> {
      const prompt = buildAnalyzePointPrompt(pointText, overview)
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
      const block = response.content[0]
      const text = block.type === "text" ? block.text : ""
      return parsePointQA(text)
    }
  }
}
