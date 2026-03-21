export function buildHookSuggestionsPrompt(text: string) {
  return {
    system: `You are a social media content optimizer. You help improve tweet hooks while preserving the author's authentic voice.
Return ONLY valid JSON, no other text.`,
    user: `Generate 3 alternative opening hooks for this tweet. Rules:
- Keep the same core message/idea
- Use stronger hook patterns (bold claims, specific numbers, questions, pattern interrupts)
- Preserve the author's natural voice — don't make it sound AI-written
- Each alternative should use a DIFFERENT hook strategy

Return JSON: {"suggestions": ["hook1", "hook2", "hook3"]}

Original tweet:
"${text.replace(/"/g, '\\"')}"`,
  };
}
