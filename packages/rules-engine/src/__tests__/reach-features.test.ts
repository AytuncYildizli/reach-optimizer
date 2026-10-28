import { describe, expect, it } from 'vitest';
import { auc, brier } from '../forecast/stats';
import { hookParts, reachFeatureRecord, textLooksTurkish, threadPosition } from '../forecast/reach-features';
import { BREAKOUT_AUC_MIN, breakoutLabel } from '../forecast/breakout';
import { ABLATION_CANDIDATES } from '../forecast/ablation';

describe('reach features', () => {
  it('marks topic, Turkish text, hooks, length, and gif without using a future thread length', () => {
    const features = reachFeatureRecord({
      text: 'Solana agent\nfun fact: 12 kullanıcı İstanbul',
      lang: 'und',
      mediaType: 'gif',
      threadPos: 2,
    });
    expect(features.topic_crypto).toBe(1);
    expect(features.topic_ai).toBe(1);
    expect(features.topic_turkey).toBe(1);
    expect(features.text_tr).toBe(1);
    expect(features.hook_fun_fact).toBe(0);
    expect(features.chars_over_200).toBe(0);
    expect(features.thread_pos).toBe(2);
    expect(features.has_gif).toBe(1);
    expect(textLooksTurkish('bugün ve bir için çok', 'und')).toBe(true);
    expect(textLooksTurkish('shipping the log', 'en')).toBe(false);
    const hook = hookParts('wow\nsecond');
    expect(hook.oneWord).toBe(true);
    expect(hookParts('?').question).toBe(true);
    expect(hookParts('🔥').emojiOnly).toBe(true);
    const start = Date.parse('2024-01-01T00:00:00.000Z');
    expect(threadPosition(true, start, start + 60 * 60 * 1000, 0)).toBe(1);
    expect(threadPosition(true, start, start + 7 * 60 * 60 * 1000, 1)).toBe(0);
    expect(threadPosition(false, start, start + 1000, 3)).toBe(0);
  });

  it('keeps the breakout rule at 3× and the AUC display bar at 0.65', () => {
    expect(breakoutLabel({ impressions: 301, baselineImpressions: 100 })).toBe(1);
    expect(breakoutLabel({ impressions: 300, baselineImpressions: 100 })).toBe(0);
    expect(BREAKOUT_AUC_MIN).toBe(0.65);
    expect(auc([0.9, 0.8, 0.1, 0.2], [1, 1, 0, 0])).toBe(1);
    expect(brier([1, 0], [1, 0])).toBe(0);
    expect(ABLATION_CANDIDATES.map((row) => row.id)).toContain('current');
    expect(ABLATION_CANDIDATES.map((row) => row.id)).toContain('two_part');
    expect(ABLATION_CANDIDATES.some((row) => row.id.includes('quote'))).toBe(false);
  });
});
