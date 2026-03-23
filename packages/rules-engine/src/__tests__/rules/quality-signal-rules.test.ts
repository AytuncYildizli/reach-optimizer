import { describe, it, expect } from 'vitest';
import { sentimentToneRule, readabilityRule, contrastSurpriseRule } from '../../rules/quality-signal-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('sentimentToneRule', () => {
  it('rewards positive constructive content', () => {
    const result = sentimentToneRule.evaluate({
      ...baseInput,
      text: "This is an amazing breakthrough! Here's how to apply it to your work:",
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
    expect(result.severity).toBe('positive');
  });

  it('rewards generally positive content', () => {
    const result = sentimentToneRule.evaluate({
      ...baseInput,
      text: 'Incredible work by the team! This is a beautiful and amazing product launch.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(3);
  });

  it('penalizes cynical/dismissive tone', () => {
    const result = sentimentToneRule.evaluate({
      ...baseInput,
      text: 'Wake up sheeple, this is all cope and you know it.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-5);
  });

  it('penalizes strongly negative tone', () => {
    const result = sentimentToneRule.evaluate({
      ...baseInput,
      text: 'This is terrible, awful, horrible garbage that is completely useless.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThan(0);
  });

  it('does not trigger on neutral content', () => {
    const result = sentimentToneRule.evaluate({
      ...baseInput,
      text: 'I built a new feature for the app today.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('readabilityRule', () => {
  it('rewards readable text in optimal grade range (4th-8th grade)', () => {
    // This text has ~13 words per sentence, ~1.4 syllables/word = ~grade 6
    const result = readabilityRule.evaluate({
      ...baseInput,
      text: 'I built my first app in three weeks. It was hard but I learned a lot. The best part was seeing real people use it every day and send me feedback.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(1);
  });

  it('penalizes overly complex academic text', () => {
    const result = readabilityRule.evaluate({
      ...baseInput,
      text: 'The multifaceted paradigmatic reconceptualization of organizational infrastructure necessitates a comprehensive recalibration of institutional methodologies for sustainable optimization.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThan(0);
  });

  it('skips very short tweets', () => {
    const result = readabilityRule.evaluate({
      ...baseInput,
      text: 'Ship it.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('contrastSurpriseRule', () => {
  it('detects dollar amount vs zero contrast', () => {
    const result = contrastSurpriseRule.evaluate({
      ...baseInput,
      text: '$47M ARR. 0 employees.\n\nHere is the entire playbook:',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
    expect(result.severity).toBe('positive');
  });

  it('detects before/after time contrast', () => {
    const result = contrastSurpriseRule.evaluate({
      ...baseInput,
      text: '6 months ago I was broke. Now I run a profitable company.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
  });

  it('does not trigger on normal content', () => {
    const result = contrastSurpriseRule.evaluate({
      ...baseInput,
      text: 'I shipped a new feature today and the team loved it.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
