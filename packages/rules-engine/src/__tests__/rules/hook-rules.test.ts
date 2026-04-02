import { describe, it, expect } from 'vitest';
import {
  genericHookRule,
  hookLengthRule,
  numberDataHookRule,
  multiSentenceHookRule,
  firstPersonVoiceRule,
} from '../../rules/hook-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('genericHookRule', () => {
  it('triggers on "Here\'s why you should care about this"', () => {
    const result = genericHookRule.evaluate({
      ...baseInput,
      text: "Here's why you should care about this topic",
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-8);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('Generic hook detected');
  });

  it('does not trigger on "I spent 6 months building this"', () => {
    const result = genericHookRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building this product from scratch',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('hookLengthRule', () => {
  it('penalizes very short hooks (<=15 chars)', () => {
    const result = hookLengthRule.evaluate({
      ...baseInput,
      text: 'Short hook here',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('too short');
  });

  it('rewards good length hooks (16-80 chars)', () => {
    const result = hookLengthRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building a product that changed everything for me',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(+5);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Good hook length');
  });

  it('gives moderate bonus for 81-120 char hooks', () => {
    const result = hookLengthRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building a product that changed everything about how I approach my morning routine daily',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(+2);
  });

  it('penalizes hooks over 120 chars', () => {
    const result = hookLengthRule.evaluate({
      ...baseInput,
      text: 'This is a very long hook that goes on and on and on and keeps going because the author just cannot stop writing more words here please',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('too long');
  });
});

describe('numberDataHookRule', () => {
  it('triggers on "$300k in 6 months"', () => {
    const result = numberDataHookRule.evaluate({
      ...baseInput,
      text: 'I made $300k in 6 months doing this one thing',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(+8);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Data point in hook');
  });

  it('triggers on "50% increase"', () => {
    const result = numberDataHookRule.evaluate({
      ...baseInput,
      text: 'We saw a 50% increase in engagement after this change',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(+8);
    expect(result.severity).toBe('positive');
  });

  it('does not trigger on "building something"', () => {
    const result = numberDataHookRule.evaluate({
      ...baseInput,
      text: 'building something incredible right now',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('multiSentenceHookRule', () => {
  it('triggers on long multi-sentence hook (first sentence >= 60 chars)', () => {
    const result = multiSentenceHookRule.evaluate({
      ...baseInput,
      text: 'This is a really long first sentence that definitely exceeds sixty characters total. And then more.',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('multiple sentences');
  });

  it('does not trigger on short setup sentence (< 60 chars)', () => {
    const result = multiSentenceHookRule.evaluate({
      ...baseInput,
      text: 'This is bad. Really bad.\nMore text here',
    });

    // "This is bad" is under 60 chars, so this is a valid story-format hook
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not trigger on mention-based story hook', () => {
    const result = multiSentenceHookRule.evaluate({
      ...baseInput,
      text: "ran @karpathy's autoresearch on my memory system. thousands of config permutations tested simultaneously.",
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not trigger on a single powerful hook', () => {
    const result = multiSentenceHookRule.evaluate({
      ...baseInput,
      text: 'This is a single powerful hook\nWith more details below',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('firstPersonVoiceRule', () => {
  it('triggers on "I built this in 3 weeks"', () => {
    const result = firstPersonVoiceRule.evaluate({
      ...baseInput,
      text: 'I built this in 3 weeks and it changed my life',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(+4);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('First-person voice');
  });

  it('does not trigger on "The team built this"', () => {
    const result = firstPersonVoiceRule.evaluate({
      ...baseInput,
      text: 'The team built this in 3 weeks and shipped it',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
