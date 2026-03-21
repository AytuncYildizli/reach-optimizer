import type {
  RuleDefinition,
  TweetInput,
  RuleResult,
  TextHighlight,
} from '@reach/shared-types';
import type { AnalysisResult, ScoreBreakdown, ScoreTier, Suggestion } from '@reach/shared-types';
import weights from './config/weights.json';

export class ScoreEngine {
  private rules: RuleDefinition[];

  constructor(rules: RuleDefinition[]) {
    this.rules = rules;
  }

  evaluate(input: TweetInput): AnalysisResult {
    const results: RuleResult[] = this.rules.map((rule) => rule.evaluate(input));

    const breakdown = this.calculateBreakdown(results);
    const rawScore =
      weights.baseScore +
      breakdown.hook +
      breakdown.structure +
      breakdown.engagement +
      breakdown.penalties +
      breakdown.bonuses;

    const reachScore = Math.max(0, Math.min(100, rawScore));
    const tier = this.assignTier(reachScore);
    const suggestions = this.collectSuggestions(results);
    const highlights = this.collectHighlights(results);

    return {
      reachScore,
      tier,
      breakdown,
      aiSlopScore: null,
      suggestions,
      highlights,
      isServerEnhanced: false,
    };
  }

  private calculateBreakdown(results: RuleResult[]): ScoreBreakdown {
    let hook = 0;
    let structure = 0;
    let engagement = 0;
    let penalties = 0;
    let bonuses = 0;

    for (const result of results) {
      if (!result.triggered) continue;

      const rule = this.rules.find((r) => r.id === result.ruleId);
      if (!rule) continue;

      switch (rule.category) {
        case 'hook':
          hook += result.points;
          break;
        case 'structure':
          structure += result.points;
          break;
        case 'engagement':
          engagement += result.points;
          break;
        case 'penalty':
          penalties += result.points;
          break;
        case 'bonus':
          bonuses += result.points;
          break;
      }
    }

    // Clamp per-category to limits from weights.json
    hook = Math.max(0, Math.min(weights.categories.hook.maxPoints, hook));
    structure = Math.max(0, Math.min(weights.categories.structure.maxPoints, structure));
    engagement = Math.max(0, Math.min(weights.categories.engagement.maxPoints, engagement));
    penalties = Math.max(weights.categories.penalty.maxPenalty, Math.min(0, penalties));
    bonuses = Math.max(0, Math.min(weights.categories.bonus.maxBonus, bonuses));

    return { hook, structure, engagement, penalties, bonuses };
  }

  private assignTier(score: number): ScoreTier {
    const tiers = weights.tiers;

    if (score >= tiers.perfect.min && score <= tiers.perfect.max) return 'perfect';
    if (score >= tiers.excellent.min && score <= tiers.excellent.max) return 'excellent';
    if (score >= tiers.good.min && score <= tiers.good.max) return 'good';
    if (score >= tiers.below_average.min && score <= tiers.below_average.max) return 'below_average';
    return 'critical';
  }

  private collectSuggestions(results: RuleResult[]): Suggestion[] {
    return results
      .filter((r) => r.triggered && r.suggestion)
      .map((r) => {
        const rule = this.rules.find((def) => def.id === r.ruleId);
        return {
          ruleId: r.ruleId,
          severity: r.severity,
          title: rule?.name ?? r.ruleId,
          description: r.suggestion!,
          highlight: r.highlight,
        };
      });
  }

  private collectHighlights(results: RuleResult[]): TextHighlight[] {
    return results
      .filter((r) => r.triggered && r.highlight)
      .map((r) => r.highlight!);
  }
}
