import { describe, expect, it } from 'vitest';
import { ScoreEngine } from '../engine';
import weights from '../config/weights.json';
import { SIGNAL_NAMES } from '@reach/shared-types';

const engine = new ScoreEngine();

describe('ScoreEngine v4', () => {
  it('returns the v4 response shape', () => {
    const r = engine.evaluate({
      text: 'Hot take: you should ship faster. Change my mind?',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('baseScore', 30);
    expect(r).toHaveProperty('signalScores');
    expect(r).toHaveProperty('applicableSignals');
    expect(r).not.toHaveProperty('reachScore');
    expect(r).not.toHaveProperty('breakdown');
  });

  it('signalScores contains all 22 signals', () => {
    const r = engine.evaluate({
      text: 'Normal tweet content.',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    const keys = Object.keys(r.signalScores).sort();
    expect(keys).toEqual([...SIGNAL_NAMES].sort());
  });

  it('score is clamped to 0..100', () => {
    const r = engine.evaluate({
      text: 'a'.repeat(2000),
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('empty text returns score 0 critical tier', () => {
    const r = engine.evaluate({
      text: '',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(r.score).toBe(0);
    expect(r.tier).toBe('critical');
  });

  it('applicable signals exclude inert conditional signals when no media/quote', () => {
    const r = engine.evaluate({
      text: 'Plain tweet, no media, no link.',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(r.applicableSignals).not.toContain('photo_expand');
    expect(r.applicableSignals).not.toContain('vqv');
    expect(r.applicableSignals).not.toContain('quoted_click');
    expect(r.applicableSignals).not.toContain('quoted_vqv');
  });

  it('applicable signals include photo_expand when image present', () => {
    const r = engine.evaluate({
      text: 'Look at this. Notice the corner.',
      platform: 'x',
      isThread: false,
      hasMedia: true,
      mediaType: 'image',
    });
    expect(r.applicableSignals).toContain('photo_expand');
  });

  it('high-engagement post scores higher than dead post', () => {
    const dead = engine.evaluate({
      text: 'ok',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    const great = engine.evaluate({
      text:
        "Hot take: most teams over-engineer auth. I built 3 SaaS products and the simplest one made $50K MRR. The complex one made $200.\n\nAgree or change my mind?",
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(great.score).toBeGreaterThan(dead.score);
    expect(great.score).toBeGreaterThanOrEqual(50);
  });

  it('weights.json has version 4.0.0', () => {
    expect(weights.version).toBe('4.0.0');
    expect(weights.baseScore).toBe(30);
  });

  it('suggestions reference signals, not v3 categories', () => {
    const r = engine.evaluate({
      text: 'a'.repeat(400),
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    for (const s of r.suggestions) {
      expect(s.ruleId).toMatch(/^signal:/);
    }
  });
});
