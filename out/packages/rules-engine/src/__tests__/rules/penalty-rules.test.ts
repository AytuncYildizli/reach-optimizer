import { describe, it, expect } from 'vitest';
import { engagementBaitRule, textWallRule } from '../../rules/penalty-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('engagementBaitRule', () => {
  it('triggers on "Like if you agree"', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'Working hard is the key to success. Like if you agree!',
    };
    const result = engagementBaitRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-6);
    expect(result.severity).toBe('critical');
    expect(result.suggestion).toContain('Engagement bait detected');
    expect(result.highlight).toBeDefined();
  });

  it('triggers on "RT if you\'re a developer"', () => {
    const input: TweetInput = {
      ...baseInput,
      text: "RT if you're a developer who loves clean code",
    };
    const result = engagementBaitRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-6);
    expect(result.severity).toBe('critical');
  });

  it('does not trigger on organic question', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'What do you think about TypeScript vs JavaScript?',
    };
    const result = engagementBaitRule.evaluate(input);

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('textWallRule', () => {
  it('triggers on long text without line breaks', () => {
    const longText = 'A'.repeat(300);
    const input: TweetInput = {
      ...baseInput,
      text: longText,
    };
    const result = textWallRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('Wall of text');
  });

  it('does not trigger on long text WITH line breaks', () => {
    const longText = 'A'.repeat(150) + '\n' + 'B'.repeat(150);
    const input: TweetInput = {
      ...baseInput,
      text: longText,
    };
    const result = textWallRule.evaluate(input);

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not trigger when isThread is true', () => {
    const longText = 'A'.repeat(300);
    const input: TweetInput = {
      ...baseInput,
      text: longText,
      isThread: true,
    };
    const result = textWallRule.evaluate(input);

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
