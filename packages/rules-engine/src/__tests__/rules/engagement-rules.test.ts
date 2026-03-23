import { describe, it, expect } from 'vitest';
import { ctaPresenceRule, bookmarkValueRule } from '../../rules/engagement-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('ctaPresenceRule', () => {
  it('triggers on a question CTA', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'AI is changing everything about how we work. What do you think about this?',
    };
    const result = ctaPresenceRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(8);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Reply-triggering CTA detected');
  });

  it('does not penalize when open loop is present', () => {
    const input: TweetInput = {
      ...baseInput,
      text: "$47M ARR. 0 employees.\n\nHere's the entire playbook:",
    };
    const result = ctaPresenceRule.evaluate(input);

    // Open loop neutralizes the CTA penalty
    expect(result.points).toBeGreaterThanOrEqual(0);
  });

  it('penalizes rhetorical questions', () => {
    const input: TweetInput = {
      ...baseInput,
      text: "Isn't it great that we can build anything these days, right?",
    };
    const result = ctaPresenceRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-3);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('Rhetorical question');
  });

  it('penalizes plain statement without CTA', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'I just shipped a new feature today and it feels great.',
    };
    const result = ctaPresenceRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-6);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('No call-to-action');
  });
});

describe('bookmarkValueRule', () => {
  it('triggers on list/step content', () => {
    const input: TweetInput = {
      ...baseInput,
      text: '3 steps to build a personal brand:\n1) Be consistent\n2) Share value\n3) Engage daily',
    };
    const result = bookmarkValueRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(8);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Bookmarkable content');
  });

  it('triggers on playbook/roadmap content', () => {
    const input: TweetInput = {
      ...baseInput,
      text: "Here's the entire playbook for scaling your startup:",
    };
    const result = bookmarkValueRule.evaluate(input);

    expect(result.triggered).toBe(true);
    expect(result.points).toBe(8);
  });

  it('does not trigger on casual content', () => {
    const input: TweetInput = {
      ...baseInput,
      text: 'Just had a great day at the park.',
    };
    const result = bookmarkValueRule.evaluate(input);

    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
