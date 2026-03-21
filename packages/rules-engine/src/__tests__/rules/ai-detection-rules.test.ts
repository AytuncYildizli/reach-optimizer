import { describe, it, expect } from 'vitest';
import {
  aiSlopWordsRule,
  aiSlopStructureRule,
  staleFormulaRule,
  hedgingOpenerRule,
} from '../../rules/ai-detection-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('aiSlopWordsRule', () => {
  it('does not trigger on natural writing', () => {
    const result = aiSlopWordsRule.evaluate({
      ...baseInput,
      text: 'I built this in 3 weeks and it changed my life',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('triggers warning on 2 AI slop words', () => {
    const result = aiSlopWordsRule.evaluate({
      ...baseInput,
      text: 'We must delve into the tapestry of modern tech to understand growth.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-5);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('AI writing patterns detected');
  });

  it('triggers critical on 4+ AI slop words', () => {
    const result = aiSlopWordsRule.evaluate({
      ...baseInput,
      text: 'We must delve into the tapestry of this landscape and leverage our paradigm for synergy.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-10);
    expect(result.severity).toBe('critical');
  });

  it('does not trigger on single AI word', () => {
    const result = aiSlopWordsRule.evaluate({
      ...baseInput,
      text: 'We need to leverage our existing audience for growth.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('aiSlopStructureRule', () => {
  it('does not trigger on clean text', () => {
    const result = aiSlopStructureRule.evaluate({
      ...baseInput,
      text: 'Short and punchy. No AI patterns here.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('triggers on excessive em dashes', () => {
    const result = aiSlopStructureRule.evaluate({
      ...baseInput,
      text: 'This is great \u2014 really great \u2014 absolutely fantastic \u2014 no doubt about it.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThanOrEqual(-4);
    expect(result.suggestion).toContain('Structural AI patterns');
  });

  it('triggers on structural opener words', () => {
    const result = aiSlopStructureRule.evaluate({
      ...baseInput,
      text: "Furthermore, this approach is clearly the best way to handle the situation.",
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThanOrEqual(-4);
  });

  it('caps penalty at -8', () => {
    const result = aiSlopStructureRule.evaluate({
      ...baseInput,
      text: "Furthermore, this is great \u2014 really great \u2014 absolutely fantastic \u2014 no doubt.",
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-8);
  });
});

describe('staleFormulaRule', () => {
  it('triggers on "Unpopular opinion:"', () => {
    const result = staleFormulaRule.evaluate({
      ...baseInput,
      text: 'Unpopular opinion: TypeScript is overrated.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.suggestion).toContain('Overused formula');
  });

  it('triggers on "Read that again"', () => {
    const result = staleFormulaRule.evaluate({
      ...baseInput,
      text: 'Read that again. Let it sink in.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
  });

  it('triggers on "Let that sink in"', () => {
    const result = staleFormulaRule.evaluate({
      ...baseInput,
      text: 'Let that sink in for a moment.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
  });

  it('does not trigger on original content', () => {
    const result = staleFormulaRule.evaluate({
      ...baseInput,
      text: 'I spent 200 hours analyzing viral tweets. Here is what I found.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('hedgingOpenerRule', () => {
  it('triggers on "I think maybe"', () => {
    const result = hedgingOpenerRule.evaluate({
      ...baseInput,
      text: 'I think maybe we should reconsider our approach to content.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.suggestion).toContain('Hedging opener');
  });

  it('triggers on "Not sure if"', () => {
    const result = hedgingOpenerRule.evaluate({
      ...baseInput,
      text: 'Not sure if this is the right take but here goes.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
  });

  it('triggers on "Honestly,"', () => {
    const result = hedgingOpenerRule.evaluate({
      ...baseInput,
      text: 'Honestly, I have no idea why people keep doing this.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
  });

  it('does not trigger on bold opening', () => {
    const result = hedgingOpenerRule.evaluate({
      ...baseInput,
      text: 'TypeScript is the best language for web development. Period.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
