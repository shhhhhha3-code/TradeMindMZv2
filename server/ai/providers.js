import { getServerAIConfig } from "./aiConfig.js";

async function callGroq(payload) {
  const config = getServerAIConfig();

  if (!config.groq.configured) {
    throw new Error("Groq API key is not configured.");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:
          process.env.GROQ_MODEL ||
          "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: payload.systemPrompt,
          },
          {
            role: "user",
            content: payload.userPrompt,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Groq request failed: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  return JSON.parse(
    data.choices?.[0]?.message?.content || "{}"
  );
}

async function callOpenAI(payload) {
  const config = getServerAIConfig();

  if (!config.openai.configured) {
    throw new Error("OpenAI API key is not configured.");
  }

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_MODEL ||
          "gpt-4o-mini",
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: payload.systemPrompt,
          },
          {
            role: "user",
            content: payload.userPrompt,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `OpenAI request failed: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  return JSON.parse(
    data.choices?.[0]?.message?.content || "{}"
  );
}

export async function callAIProvider(
  provider,
  payload
) {
  if (provider === "groq") {
    return callGroq(payload);
  }

  if (provider === "openai") {
    return callOpenAI(payload);
  }

  throw new Error(
    `Unsupported AI provider: ${provider}`
  );
}
