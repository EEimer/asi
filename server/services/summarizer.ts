import { OPENAI_API_KEY, loadSettings } from '../config'

export async function summarizeTranscript(transcript: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const settings = loadSettings()
  const prompt = settings.summaryPrompt + transcript

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: settings.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as any
  return data.choices?.[0]?.message?.content ?? ''
}
