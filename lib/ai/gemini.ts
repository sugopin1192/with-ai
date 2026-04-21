import { GoogleGenAI } from "@google/genai"
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

export function createGeminiProvider(apiKey: string, model: string): AIProvider {
  const ai = new GoogleGenAI({ apiKey })

  return {
    async summarize(transcript: TranscriptEntry[]): Promise<SummaryResult> {
      const prompt = buildSummarizePrompt(transcript)
      const response = await ai.models.generateContent({ model, contents: prompt })
      return parseSummaryResult(response.text ?? "")
    },

    async answerQuestion(question: string, context: string): Promise<string[]> {
      const prompt = buildQuestionPrompt(question, context)
      const response = await ai.models.generateContent({ model, contents: prompt })
      return parseJsonArray(response.text ?? "")
    },

    async analyzePoint(pointText: string, overview: string): Promise<PointQA> {
      const prompt = buildAnalyzePointPrompt(pointText, overview)
      const response = await ai.models.generateContent({ model, contents: prompt })
      return parsePointQA(response.text ?? "")
    }
  }
}
