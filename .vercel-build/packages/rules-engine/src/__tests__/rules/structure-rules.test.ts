import { describe, it, expect } from 'vitest';
import {
  characterLengthRule,
  hashtagCountRule,
  emojiCountRule,
  threadLengthRule,
} from '../../rules/structure-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('characterLengthRule', () => {
  it('penalizes text under 30 characters', () => {
    const result = characterLengthRule.evaluate({
      ...baseInput,
      text: 'Too short',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-2);
    expect(result.severity).toBe('warning');
  });

  it('gives bonus for optimal length (71-100 chars)', () => {
    const text = 'A'.repeat(85);
    const result = characterLengthRule.evaluate({
      ...baseInput,
      text,
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
    expect(result.severity).toBe('positive');
  });

  it('penalizes text wall over 280 chars for non-thread', () => {
    const text = 'A'.repeat(300);
    const result = characterLengthRule.evaluate({
      ...baseInput,
      text,
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('thread');
  });

  it('does not penalize text wall over 280 when isThread is true', () => {
    const text = 'A'.repeat(300);
    const result = characterLengthRule.evaluate({
      ...baseInput,
      text,
      isThread: true,
    });

    // Should not trigger the wall penalty; over 280 in a thread is fine
    expect(result.points).not.toBe(-4);
  });
});

describe('hashtagCountRule', () => {
  it('does not trigger for 0-2 hashtags', () => {
    const result = hashtagCountRule.evaluate({
      ...baseInput,
      text: 'Great tweet #hello #world',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('triggers penalty for 3+ hashtags', () => {
    const result = hashtagCountRule.evaluate({
      ...baseInput,
      text: 'Spam tweet #one #two #three',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
    expect(result.severity).toBe('warning');
  });
});

describe('emojiCountRule', () => {
  it('does not trigger for 0-4 emojis', () => {
    const result = emojiCountRule.evaluate({
      ...baseInput,
      text: 'Nice tweet with some emojis \u{1F600}\u{1F600}\u{1F600}',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('triggers penalty for 5+ emojis', () => {
    const result = emojiCountRule.evaluate({
      ...baseInput,
      text: 'Too many emojis \u{1F600}\u{1F601}\u{1F602}\u{1F603}\u{1F604}',
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.severity).toBe('warning');
  });
});

describe('threadLengthRule', () => {
  it('does not trigger for non-thread input', () => {
    const result = threadLengthRule.evaluate({
      ...baseInput,
      text: 'Just a regular tweet',
    });

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('gives bonus for 8 tweets (sweet spot)', () => {
    const result = threadLengthRule.evaluate({
      ...baseInput,
      text: 'Thread content',
      isThread: true,
      threadLength: 8,
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
    expect(result.severity).toBe('positive');
  });

  it('penalizes thread under 4 tweets', () => {
    const result = threadLengthRule.evaluate({
      ...baseInput,
      text: 'Short thread',
      isThread: true,
      threadLength: 3,
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.severity).toBe('warning');
  });

  it('penalizes thread over 15 tweets', () => {
    const result = threadLengthRule.evaluate({
      ...baseInput,
      text: 'Very long thread',
      isThread: true,
      threadLength: 16,
    });

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-2);
    expect(result.severity).toBe('warning');
  });
});
