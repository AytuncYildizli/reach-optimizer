import Anthropic from '@anthropic-ai/sdk';
import { createClaudeClient, analyzeWithClaude, parseClaudeJSON } from './claude-client';
import { detectSlopHeuristic, type SlopResult } from './slop-detector';
import { buildSlopAnalysisPrompt } from './prompts/slop-analysis';
import { buildHookQualityPrompt, type HookQualityResult } from './prompts/hook-quality';
import { buildHookSuggestionsPrompt } from './prompts/hook-suggestions';
import type { RuleResult } from '@reach/shared-types';

export interface ServerAnalysisResult {
  slopScore: number;
  slopVerdict: string;
  hookQuality: HookQualityResult | null;
  hookSuggestions: string[];
  serverRuleResults: RuleResult[];
}

export class AIAnalyzer {
  private client: Anthropic;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = createClaudeClient(apiKey);
  }

  async analyzeSlop(text: string): Promise<SlopResult> {
    // 1. Run heuristic first (fast, always available)
    const heuristic = detectSlopHeuristic(text);

    // 2. If heuristic score > 30, also run Claude for confirmation
    if (heuristic.score > 30) {
      const prompt = buildSlopAnalysisPrompt(text);
      const response = await analyzeWithClaude(this.client, prompt.system, prompt.user);
      const aiResult = parseClaudeJSON<{ score: number; verdict: string; patterns_found: string[] }>(response);

      if (aiResult) {
        // Average heuristic and AI scores
        const mergedScore = Math.round((heuristic.score + aiResult.score) / 2);
        return {
          ...heuristic,
          score: mergedScore,
          verdict: this.getVerdict(mergedScore),
        };
      }
    }

    return heuristic;
  }

  async assessHookQuality(text: string): Promise<HookQualityResult | null> {
    const prompt = buildHookQualityPrompt(text);
    const response = await analyzeWithClaude(this.client, prompt.system, prompt.user);
    return parseClaudeJSON<HookQualityResult>(response);
  }

  async generateHookSuggestions(text: string, lang?: 'tr' | 'en'): Promise<string[]> {
    const prompt = buildHookSuggestionsPrompt(text, lang);

    // Use fetch directly (SDK has connection issues on Vercel serverless)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          temperature: 0.3,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      const raw = data.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleaned) as { suggestions: string[] };
      return result?.suggestions ?? [];
    } catch (error) {
      throw new Error('Claude hook suggestions failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async fullAnalysis(text: string): Promise<ServerAnalysisResult> {
    // Run all checks in parallel
    const [slopResult, hookQuality, hookSuggestions] = await Promise.all([
      this.analyzeSlop(text),
      this.assessHookQuality(text),
      this.generateHookSuggestions(text),
    ]);

    // Convert AI results to RuleResult format for merging
    const serverRuleResults: RuleResult[] = [];

    // AI Slop as a server rule result
    if (slopResult.score > 20) {
      serverRuleResults.push({
        ruleId: 'server-ai-slop',
        triggered: true,
        points: -Math.round(slopResult.score / 10), // -2 to -10 based on score
        severity: slopResult.score > 60 ? 'critical' : 'warning',
        suggestion: `AI Slop Score: ${slopResult.score}/100 (${slopResult.verdict}). ${slopResult.matches.length} AI patterns detected.`,
      });
    }

    // Hook quality as a server rule result
    if (hookQuality) {
      const hookPoints = hookQuality.overall >= 7 ? 8 : hookQuality.overall >= 5 ? 4 : -2;
      serverRuleResults.push({
        ruleId: 'server-hook-quality',
        triggered: true,
        points: hookPoints,
        severity: hookQuality.overall >= 7 ? 'positive' : hookQuality.overall >= 5 ? 'info' : 'warning',
        suggestion: hookQuality.feedback || `Hook quality: ${hookQuality.overall}/10 (${hookQuality.hook_type})`,
      });
    }

    return {
      slopScore: slopResult.score,
      slopVerdict: slopResult.verdict,
      hookQuality,
      hookSuggestions,
      serverRuleResults,
    };
  }

  private getVerdict(score: number): SlopResult['verdict'] {
    if (score <= 20) return 'natural';
    if (score <= 40) return 'mild';
    if (score <= 60) return 'moderate';
    if (score <= 80) return 'high';
    return 'obvious';
  }
}
