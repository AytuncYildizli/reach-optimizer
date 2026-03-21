import Anthropic from '@anthropic-ai/sdk';

export function createClaudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export interface ClaudeAnalysisOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function analyzeWithClaude(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  options: ClaudeAnalysisOptions = {}
): Promise<string | null> {
  const { maxTokens = 512, temperature = 0.3, timeoutMs = 25000 } = options;

  try {
    const response = await Promise.race([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Claude API timeout')), timeoutMs)
      ),
    ]);

    // Extract text from response
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text ?? null;
  } catch (error) {
    console.error('[ReachOS] Claude API error:', error instanceof Error ? error.message : error);
    return null; // Graceful degradation
  }
}

// Helper to parse JSON from Claude response (handles markdown code blocks)
export function parseClaudeJSON<T>(response: string | null): T | null {
  if (!response) return null;
  try {
    // Strip markdown code blocks if present
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    console.error('[ReachOS] Failed to parse Claude JSON response');
    return null;
  }
}
