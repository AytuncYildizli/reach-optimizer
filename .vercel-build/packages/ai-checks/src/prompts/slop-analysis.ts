export function buildSlopAnalysisPrompt(text: string) {
  return {
    system: `You are an AI text detection expert. Analyze text for AI-generated writing patterns.
Return ONLY valid JSON, no other text.`,
    user: `Analyze this tweet/post for AI writing patterns. Score 0-100 where 0 is clearly human-written and 100 is obviously AI-generated.

Look for:
- Overuse of words like "delve", "landscape", "tapestry", "leverage"
- Overly formal or flowery language uncommon in social media
- Perfect grammar and structure (real tweets have casual style)
- Generic platitudes without personal experience
- "Furthermore", "Moreover" transitions
- Vague attribution ("studies show", "experts agree")

Return JSON: {"score": <number 0-100>, "patterns_found": ["pattern1", ...], "verdict": "natural"|"mild"|"moderate"|"high"|"obvious", "explanation": "<one sentence>"}

Text to analyze:
"${text.replace(/"/g, '\\"')}"`,
  };
}
