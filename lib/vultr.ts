import "server-only";

import OpenAI from "openai";

const defaultBaseUrl = "https://api.vultrinference.com/v1";
const defaultModel = "moonshotai/Kimi-K2.6";

function createVultrClient() {
  const apiKey = process.env.VULTR_INFERENCE_KEY;

  if (!apiKey) {
    throw new Error("Missing VULTR_INFERENCE_KEY.");
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.VULTR_INFERENCE_BASE_URL ?? defaultBaseUrl,
  });
}

export async function requestInference(prompt: string): Promise<string> {
  const client = createVultrClient();

  const completion = await client.chat.completions.create({
    model: process.env.VULTR_MODEL ?? defaultModel,
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You are WiseGate, a read-only clinical trial payment governance assistant. Recommend review boundaries and evidence needs, but never approve payments or release funds.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return (
    completion.choices[0]?.message.content?.trim() ??
    "No recommendation returned."
  );
}
