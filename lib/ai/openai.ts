import OpenAI from "openai"
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

export function createOpenAIProvider(apiKey: string, model: string): AIProvider {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

  return {
    async summarize(transcript: TranscriptEntry[]): Promise<SummaryResult> {
      const prompt = buildSummarizePrompt(transcript)
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
      return parseSummaryResult(response.choices[0]?.message?.content ?? "")
    },

    async answerQuestion(question: string, context: string): Promise<string[]> {
      const prompt = buildQuestionPrompt(question, context)
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
      return parseJsonArray(response.choices[0]?.message?.content ?? "")
    },

    async analyzePoint(pointText: string, overview: string): Promise<PointQA> {
      const prompt = buildAnalyzePointPrompt(pointText, overview)
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
      return parsePointQA(response.choices[0]?.message?.content ?? "")
    }
  }
}
