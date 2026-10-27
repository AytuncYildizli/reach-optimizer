import { describe, expect, it } from 'vitest';
import { MAX_LEARNED_ADJUSTMENT, ScoreEngine } from '../engine';
import type { SignalName, TweetInput } from '@reach/shared-types';

const input: TweetInput = {
  text: 'What is the one tool you could not ship without? Mine is a boring checklist.',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

const base = new ScoreEngine().evaluate(input);
const fired = (Object.keys(base.signalScores) as SignalName[]).filter(
  (n) => base.signalScores[n].applicable && base.signalScores[n].score > 0,
);
const unfired = (Object.keys(base.signalScores) as SignalName[]).find(
  (n) => base.signalScores[n].applicable && base.signalScores[n].score === 0,
);

describe('learned weight adjustments', () => {
  it('fixture fires at least one positive signal', () => {
    expect(fired.length).toBeGreaterThan(0);
  });

  it('no adjustments leaves the score unchanged', () => {
    expect(new ScoreEngine({}).evaluate(input).score).toBe(base.score);
    expect(new ScoreEngine(null).evaluate(input).score).toBe(base.score);
  });

  it('accepts the learner key format (signal:<name>) and raises a fired signal', () => {
    const name = fired[0]!;
    const r = new ScoreEngine({ [`signal:${name}`]: 6 }).evaluate(input);
    const s = r.signalScores[name];
    expect(s.learnedAdjustment).toBeGreaterThan(0);
    expect(s.score).toBe(base.signalScores[name].score + s.learnedAdjustment!);
    expect(r.score).toBe(Math.min(100, base.score + s.learnedAdjustment!));
  });

  it('a negative adjustment never pushes a positive signal below 0', () => {
    const name = fired[0]!;
    const r = new ScoreEngine({ [name]: -MAX_LEARNED_ADJUSTMENT }).evaluate(input);
    expect(r.signalScores[name].score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(base.score);
  });

  it('does not touch signals that did not fire', () => {
    if (!unfired) return;
    const r = new ScoreEngine({ [unfired]: 6 }).evaluate(input);
    expect(r.signalScores[unfired].score).toBe(0);
    expect(r.score).toBe(base.score);
  });

  it('clamps oversized adjustments and ignores unknown keys or bad values', () => {
    const name = fired[0]!;
    const big = new ScoreEngine({ [name]: 999 }).evaluate(input);
    const max = new ScoreEngine({ [name]: MAX_LEARNED_ADJUSTMENT }).evaluate(input);
    expect(big.score).toBe(max.score);

    const junk = new ScoreEngine({
      'hook-generic-pattern': 6,
      'signal:not_a_signal': 6,
      [fired[0]!]: Number.NaN,
    }).evaluate(input);
    expect(junk.score).toBe(base.score);
  });

  it('setAdjustments(null) clears earlier adjustments', () => {
    const engine = new ScoreEngine({ [fired[0]!]: 6 });
    engine.setAdjustments(null);
    expect(engine.evaluate(input).score).toBe(base.score);
  });
});
