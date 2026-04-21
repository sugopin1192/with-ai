import type { TranscriptEntry } from "~messages/types"

export interface SummaryResult {
  points: string[]
  overview: string
  questions: Array<{ question: string; answer: string[] }>
}

export interface PointQA {
  question: string
  answer: string[]
}

export interface AIProvider {
  summarize(transcript: TranscriptEntry[]): Promise<SummaryResult>
  answerQuestion(question: string, context: string): Promise<string[]>
  analyzePoint(pointText: string, overview: string): Promise<PointQA>
}

export function buildSummarizePrompt(transcript: TranscriptEntry[]): string {
  const lines = transcript
    .map((e) => `${e.speaker ? e.speaker + ": " : ""}${e.text}`)
    .join("\n")

  return `以下は会議の会話記録です。言語を自動検出し、同じ言語で回答してください。
カメラ・マイクのON/OFF、背景変更、参加/退出などのシステム通知は無視し、実際の会話内容のみを対象にしてください。
次の3点をJSON形式で返してください:
1. "points": 会話の主な内容・議論の要点。**最大5点まで**の箇条書き配列（少なくてもOK、超えないこと）。重要な主張や決定には「（発言者名）」を末尾に付けてください。発言者が不明な場合は省略。
2. "overview": 会話全体を俯瞰した概要を2〜3文で記述。
3. "questions": 会話の中で明示的に質問された内容があれば抽出し、回答を3点以内で記述。質問がなければ空配列 []。字幕の途中切れで不完全な文、単なる相槌、独り言は含めないこと。

必ずこのJSON形式のみを返してください:
{"points":["要点1（発言者名）","要点2"],"overview":"概要文章","questions":[{"question":"質問文","answer":["回答1","回答2"]}]}

会話記録:
${lines}`
}

export function buildAnalyzePointPrompt(pointText: string, overview: string): string {
  return `以下は会議の要約に含まれる特定の要点です。この要点について、聞き手が持ちそうな質問と、その質問への詳しい回答を生成してください。
言語を自動検出し、同じ言語で回答してください。

会議全体の概要:
${overview}

特に取り上げる要点:
${pointText}

以下のJSON形式のみで返してください:
{"question":"関連する質問","answer":["回答1","回答2","回答3"]}`
}

export function parsePointQA(text: string): PointQA {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (typeof parsed.question === "string") {
        const answer = Array.isArray(parsed.answer)
          ? parsed.answer.map(String).map((s: string) => s.trim()).filter(Boolean)
          : typeof parsed.answer === "string"
            ? [parsed.answer.trim()]
            : []
        return { question: parsed.question.trim(), answer }
      }
    }
  } catch {
    // fall through
  }
  return { question: "要点についての質問", answer: [text.slice(0, 300)] }
}

export function buildQuestionPrompt(question: string, context: string): string {
  return `以下の質問に対して、会話の文脈を踏まえて回答してください。
言語を自動検出し、同じ言語で回答してください。
回答は1〜5点の箇条書き配列のみをJSON形式で返してください:
["回答1","回答2","回答3"]

質問: ${question}

会話の文脈:
${context}`
}

export function parseSummaryResult(text: string): SummaryResult {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed.points) && typeof parsed.overview === "string") {
        const questions = Array.isArray(parsed.questions)
          ? parsed.questions
              .filter((q: unknown): q is { question: string; answer: unknown } =>
                !!q && typeof q === "object" && typeof (q as { question: unknown }).question === "string"
              )
              .map((q: { question: string; answer: unknown }) => ({
                question: q.question.trim(),
                answer: Array.isArray(q.answer)
                  ? q.answer.map(String).map((s) => s.trim()).filter(Boolean)
                  : typeof q.answer === "string"
                    ? [q.answer.trim()]
                    : []
              }))
              .filter((q) => q.question.length > 0)
          : []
        return {
          points: parsed.points.map(String).filter(Boolean).slice(0, 5),
          overview: parsed.overview.trim(),
          questions
        }
      }
    }
  } catch {
    // fallback below
  }

  // Fallback: treat entire text as overview, extract lines as points
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[\s•\-\*\d\.]+/, "").trim())
    .filter((l) => l.length > 0)

  return {
    points: lines.slice(0, 5),
    overview: lines.join(" ").slice(0, 200),
    questions: []
  }
}

export function parseJsonArray(text: string): string[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return [text.trim()]
    const arr = JSON.parse(match[0])
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((s: unknown) => String(s)).filter(Boolean)
    }
  } catch {
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^[\s•\-\*\d\.]+/, "").trim())
      .filter(Boolean)
    if (lines.length > 0) return lines
  }
  return [text.trim()]
}
