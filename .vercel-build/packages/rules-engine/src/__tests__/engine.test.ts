import { describe, it, expect } from 'vitest';
import { ScoreEngine } from '../engine';
import { linkDetectionRule } from '../rules/link-detection';
import type { TweetInput, RuleDefinition } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('ScoreEngine', () => {
  it('returns base score of 45 with no rules', () => {
    const engine = new ScoreEngine([]);
    const result = engine.evaluate({ ...baseInput, text: 'Hello world' });

    expect(result.reachScore).toBe(45);
  });

  it('applies link penalty correctly (45 + (-12) = 33)', () => {
    const engine = new ScoreEngine([linkDetectionRule]);
    const result = engine.evaluate({
      ...baseInput,
      text: 'Check this out https://example.com',
    });

    expect(result.reachScore).toBe(33);
  });

  it('clamps score between 0 and 100', () => {
    // Create a rule that gives massive negative points
    const extremePenaltyRule: RuleDefinition = {
      id: 'test-extreme-penalty',
      name: 'Extreme Penalty',
      category: 'penalty',
      runOn: 'client',
      evaluate: () => ({
        ruleId: 'test-extreme-penalty',
        triggered: true,
        points: -200,
        severity: 'critical',
      }),
    };

    const engine = new ScoreEngine([extremePenaltyRule]);
    const result = engine.evaluate({ ...baseInput, text: 'test' });

    expect(result.reachScore).toBeGreaterThanOrEqual(0);
    expect(result.reachScore).toBeLessThanOrEqual(100);
  });

  it('assigns correct tier for score 45 (below_average)', () => {
    const engine = new ScoreEngine([]);
    const result = engine.evaluate({ ...baseInput, text: 'Hello world' });

    expect(result.reachScore).toBe(45);
    expect(result.tier).toBe('below_average');
  });

  it('collects suggestions from triggered rules', () => {
    const engine = new ScoreEngine([linkDetectionRule]);
    const result = engine.evaluate({
      ...baseInput,
      text: 'Visit https://example.com now',
    });

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].ruleId).toBe('penalty-link-external');
    expect(result.suggestions[0].severity).toBe('critical');
  });
});
