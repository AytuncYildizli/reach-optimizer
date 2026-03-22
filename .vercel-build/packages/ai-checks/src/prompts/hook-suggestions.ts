export function buildHookSuggestionsPrompt(text: string) {
  return {
    system: `You are an elite X/Twitter ghostwriter. You rewrite entire tweets to maximize reach while keeping the EXACT same message and facts. You never add fake data or change the meaning. You write like a human, not AI. Return ONLY valid JSON.`,
    user: `Rewrite this tweet 3 different ways to get more reach. CRITICAL RULES:

1. Keep the EXACT SAME facts, claims, and message — do NOT invent new information
2. Each rewrite must be a COMPLETE tweet (not just a hook — the full thing)
3. Use these proven patterns:
   - Version 1: Start with a bold/contrarian claim from the tweet's content
   - Version 2: Start with a specific number or data point from the tweet
   - Version 3: Start with a provocative question that the tweet answers
4. End each with a reply-triggering element (question, "thoughts?", choice)
5. Keep under 280 characters each
6. Sound human — NO "delve", "landscape", "it's worth noting"
7. Do NOT add emojis unless the original has them

Original tweet:
"${text.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["full_rewrite_1", "full_rewrite_2", "full_rewrite_3"]}`,
  };
}
