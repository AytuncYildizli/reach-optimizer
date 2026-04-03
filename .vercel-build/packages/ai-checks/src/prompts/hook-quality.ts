export interface HookQualityResult {
  overall: number; // 1-10
  dimensions: {
    attention_power: number;
    curiosity_gap: number;
    specificity: number;
    emotional_trigger: number;
    identity_targeting: number;
    length_efficiency: number;
  };
  hook_type: 'bold_claim' | 'contrarian' | 'vulnerability' | 'interrupt' | 'identity' | 'question' | 'story' | 'generic';
  feedback: string;
}

export function buildHookQualityPrompt(text: string) {
  return {
    system: `You are a social media content expert specializing in tweet hooks and viral content.
Return ONLY valid JSON, no other text.`,
    user: `Rate the opening hook of this tweet on 6 dimensions (1-10 each):

1. attention_power: Does it stop the scroll?
2. curiosity_gap: Does it create an information gap the reader wants to fill?
3. specificity: Does it include specific numbers, names, or details?
4. emotional_trigger: Does it evoke surprise, anger, humor, fear, or inspiration?
5. identity_targeting: Does it speak to a specific audience?
6. length_efficiency: How much impact per word?

Also classify the hook type and give one sentence of feedback.

Return JSON: {"overall": <1-10>, "dimensions": {"attention_power": N, "curiosity_gap": N, "specificity": N, "emotional_trigger": N, "identity_targeting": N, "length_efficiency": N}, "hook_type": "<type>", "feedback": "<one sentence>"}

Hook types: bold_claim, contrarian, vulnerability, interrupt, identity, question, story, generic

Tweet:
"${text.replace(/"/g, '\\"')}"`,
  };
}
