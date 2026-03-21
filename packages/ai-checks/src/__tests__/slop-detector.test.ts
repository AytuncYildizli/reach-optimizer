import { describe, it, expect } from 'vitest';
import { detectSlopHeuristic } from '../slop-detector';

describe('detectSlopHeuristic', () => {
  it('scores human-written tweet low (<20)', () => {
    const text =
      "I spent 6 months building this product and here's what happened";
    const result = detectSlopHeuristic(text);
    expect(result.score).toBeLessThan(20);
    expect(result.verdict).toBe('natural');
  });

  it('scores AI-generated text high (>60)', () => {
    const text =
      "Let me delve into the transformative landscape of AI. It's worth noting that this groundbreaking technology stands as a testament to human innovation. Furthermore, many experts agree that this is a robust and seamless solution.";
    const result = detectSlopHeuristic(text);
    expect(result.score).toBeGreaterThan(60);
    expect(['high', 'obvious']).toContain(result.verdict);
  });

  it('scores mixed text medium (20-60)', () => {
    const text =
      "Here's my take on the AI landscape \u2014 it's genuinely game-changing for developers";
    const result = detectSlopHeuristic(text);
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThanOrEqual(60);
  });

  it('returns score 0 for empty text', () => {
    const result = detectSlopHeuristic('');
    expect(result.score).toBe(0);
    expect(result.verdict).toBe('natural');
    expect(result.matches).toHaveLength(0);
  });

  it('does not score too high for short text with one AI word', () => {
    const text = 'We need to leverage this opportunity.';
    const result = detectSlopHeuristic(text);
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].pattern).toBe('leverage');
  });

  it('includes correct positions in matches', () => {
    const text = 'We should delve deeper into this topic.';
    const result = detectSlopHeuristic(text);
    const delveMatch = result.matches.find((m) => m.pattern === 'delve');
    expect(delveMatch).toBeDefined();
    expect(delveMatch!.position).toBe(text.indexOf('delve'));
  });

  it('verdict matches score range', () => {
    // Natural
    const natural = detectSlopHeuristic('Just a normal tweet about my day.');
    expect(natural.verdict).toBe('natural');
    expect(natural.score).toBeLessThanOrEqual(20);

    // High/obvious - stack many AI patterns
    const heavy = detectSlopHeuristic(
      "Let me delve into this tapestry of innovation. In conclusion, it stands as a testament to the transformative power of synergy. Furthermore, many experts agree that this groundbreaking, holistic approach is seamless and robust. It's worth noting that in today's digital world, studies show profound impact."
    );
    expect(heavy.score).toBeGreaterThan(80);
    expect(heavy.verdict).toBe('obvious');
  });

  it('finds expected pattern count for known AI text', () => {
    const text =
      "Let me delve into the transformative landscape of AI. It's worth noting that this groundbreaking technology stands as a testament to human innovation. Furthermore, many experts agree that this is robust.";
    const result = detectSlopHeuristic(text);
    // Should match: delve, transformative, landscape, it's worth noting,
    // groundbreaking, stands as a testament, Furthermore, many experts agree, robust
    expect(result.matches.length).toBe(9);
  });
});
