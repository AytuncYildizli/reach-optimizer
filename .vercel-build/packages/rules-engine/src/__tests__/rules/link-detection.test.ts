import { describe, it, expect } from 'vitest';
import { linkDetectionRule } from '../../rules/link-detection';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('link-detection rule', () => {
  it('triggers on http links', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'Check out this article https://example.com/article for more info',
    };
    const result = linkDetectionRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThan(0);
    expect(result.severity).toBe('critical');
    expect(result.suggestion).toBeDefined();
  });

  it('triggers on www links', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'Visit www.example.com for details',
    };
    const result = linkDetectionRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBeLessThan(0);
  });

  it('does not trigger on text without links', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'Just a normal tweet without any links here',
    };
    const result = linkDetectionRule.evaluate(input);

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('highlights the link position correctly', () => {
    const text = 'Check out https://example.com for more';
    const input: TweetInput = {
      ...baseInput,
      text,
    };
    const result = linkDetectionRule.evaluate(input);

    expect(result.highlight).toBeDefined();
    expect(result.highlight!.start).toBe(text.indexOf('https://example.com'));
    expect(result.highlight!.end).toBe(
      text.indexOf('https://example.com') + 'https://example.com'.length,
    );
    expect(result.highlight!.severity).toBe('critical');
  });
});
