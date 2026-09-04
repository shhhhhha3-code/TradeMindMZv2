import {
  callAIProvider,
} from "./providers.js";

import {
  buildPositionSystemPrompt,
  buildPositionUserPrompt,
} from "./positionPrompt.js";

export async function analyzePositionWithAI(
  position
) {
  const result =
    await callAIProvider({
      systemPrompt:
        buildPositionSystemPrompt(),

      userPrompt:
        buildPositionUserPrompt(
          position
        ),
    });

  return result;
}


/**
 * Compatibility entry point for the API route.
 *
 * Analysis only.
 * No BUY.
 * No SELL.
 * No CLOSE.
 * No CANCEL.
 * No Pionex order execution.
 */
export async function analyzeServerPositionAI(payload = {}) {
  return analyzePositionWithAI(payload);
}
