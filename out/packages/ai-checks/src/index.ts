import type { TweetInput, RuleResult } from '@reach/shared-types';
import { detectSlopHeuristic } from './slop-detector';

// Core exports
export { detectSlopHeuristic } from './slop-detector';
export type { SlopMatch, SlopVerdict, SlopResult } from './slop-detector';
export { SLOP_PATTERNS } from './slop-patterns';
export type { SlopPattern } from './slop-patterns';

// AI pipeline exports
export { AIAnalyzer } from './analyzer';
export type { ServerAnalysisResult } from './analyzer';
export { createClaudeClient, analyzeWithClaude, parseClaudeJSON } from './claude-client';
export type { HookQualityResult } from './prompts/hook-quality';

// Backward-compatible stubs — use AIAnalyzer for full functionality
export async function analyzeWithAI(_input: TweetInput): Promise<RuleResult[]> {
  return [];
}

export async function detectAISlop(text: string): Promise<number> {
  const result = detectSlopHeuristic(text);
  return result.score;
}

export async function suggestHooks(_text: string): Promise<string[]> {
  return [];
}
