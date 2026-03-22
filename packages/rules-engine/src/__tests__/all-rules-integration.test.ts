import { describe, it, expect } from 'vitest';
import { ScoreEngine } from '../engine';
import { allClientRules } from '../all-client-rules';

describe('allClientRules registry', () => {
  it('contains 28 rules', () => {
    expect(allClientRules).toHaveLength(28);
  });

  it('every rule has required fields', () => {
    for (const rule of allClientRules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(typeof rule.evaluate).toBe('function');
    }
  });

  it('has no duplicate rule ids', () => {
    const ids = allClientRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ScoreEngine with all client rules', () => {
  const engine = new ScoreEngine(allClientRules);

  it('plain "Hello world" gets penalized for short text and no CTA', () => {
    const result = engine.evaluate({
      text: 'Hello world',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // Short text: hookLength -2, charLength -2, no CTA -4 -> all flow to penalties
    // Score = 45 + penalties -> well below 45
    expect(result.reachScore).toBeLessThan(45);
    expect(result.breakdown.penalties).toBeLessThan(0);
  });

  it('heavily penalized tweet: generic hook + link + engagement bait', () => {
    const text =
      "Here's why you should check this https://example.com Like if you agree";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // Generic hook -5 (hook, clamped to 0), link -12 (penalty), engagement bait -10 (penalty)
    // Penalties heavily stack; score well below 45
    expect(result.reachScore).toBeLessThanOrEqual(35);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('well-optimized tweet: first person + number + good length + CTA', () => {
    const text =
      "I spent 6 months building this and went from $0 to $50k ARR. Here's what I learned — what's your biggest challenge with building in public?";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // firstPerson +5 (bonus), numberData +5 (hook), CTA +7 (engagement),
    // questionType +4 (engagement), good char length (101-280 = +2 structure),
    // hookLength 41-100 = +3 (structure), bookmarkValue possibly triggered
    // Score should be well above base 45
    expect(result.reachScore).toBeGreaterThanOrEqual(60);
  });

  it('thread with good length gets structure bonus', () => {
    const result = engine.evaluate({
      text: 'A great thread about building startups and scaling revenue',
      platform: 'x',
      isThread: true,
      threadLength: 8,
      hasMedia: false,
    });
    // threadLength 7-12 -> +5 structure
    expect(result.breakdown.structure).toBeGreaterThan(0);
  });

  it('returns zero critical suggestions for a well-crafted tweet', () => {
    const text =
      "I made $300k in 6 months doing this one thing differently. What's your experience?";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    const criticals = result.suggestions.filter(
      (s) => s.severity === 'critical',
    );
    expect(criticals.length).toBe(0);
  });

  it('penalizes hashtag spam', () => {
    const text = 'Great content #one #two #three #four';
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(result.breakdown.penalties).toBeLessThan(0);
  });

  it('penalizes text wall (long text, no thread, no line breaks)', () => {
    const longText = 'A'.repeat(300);
    const result = engine.evaluate({
      text: longText,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // textWall -5 (penalty), charLength -4 (structure, clamped to 0)
    expect(result.breakdown.penalties).toBeLessThan(0);
  });
});
