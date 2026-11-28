import { GoogleGenAI } from '@google/genai'
import type { DocumentType } from '@lomi/contracts'
import { extractionResponseSchema } from './contract'

export async function generateGemini(
  prompt: string,
  apiKey: string,
  model: string,
  type: DocumentType,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: extractionResponseSchema(type),
    },
  })
  if (!response.text) throw new Error('Empty model response')
  return response.text
}
