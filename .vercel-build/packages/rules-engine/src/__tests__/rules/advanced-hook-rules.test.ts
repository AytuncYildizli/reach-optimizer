import { describe, it, expect } from 'vitest';
import {
  openLoopRule,
  contrarianClaimRule,
  storyOpenerRule,
} from '../../rules/advanced-hook-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('openLoopRule', () => {
  it('triggers on first line ending with colon', () => {
    const result = openLoopRule.evaluate({
      ...baseInput,
      text: "Here's what happened:\nI lost everything in 24 hours.",
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Open loop');
  });

  it('triggers on first line ending with ellipsis', () => {
    const result = openLoopRule.evaluate({
      ...baseInput,
      text: 'And then it all changed...\nI never saw it coming.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
  });

  it('triggers on "here\'s what" pattern', () => {
    const result = openLoopRule.evaluate({
      ...baseInput,
      text: "Here's what nobody tells you about startups.",
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
  });

  it('does not trigger on flat opener', () => {
    const result = openLoopRule.evaluate({
      ...baseInput,
      text: 'Good morning everyone. Hope you have a great day.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('contrarianClaimRule', () => {
  it('triggers on "overrated" in first 80 chars', () => {
    const result = contrarianClaimRule.evaluate({
      ...baseInput,
      text: 'React is overrated and here is why you should switch.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Contrarian claim');
  });

  it('triggers on "nobody talks about"', () => {
    const result = contrarianClaimRule.evaluate({
      ...baseInput,
      text: 'Nobody talks about the hidden cost of microservices.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
  });

  it('does not trigger on neutral statement', () => {
    const result = contrarianClaimRule.evaluate({
      ...baseInput,
      text: 'I built a new feature today and shipped it to production.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('storyOpenerRule', () => {
  it('triggers on "Last week"', () => {
    const result = storyOpenerRule.evaluate({
      ...baseInput,
      text: 'Last week I made a decision that changed my entire career.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Story opener');
  });

  it('triggers on "Yesterday"', () => {
    const result = storyOpenerRule.evaluate({
      ...baseInput,
      text: 'Yesterday I had the worst interview of my life.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
  });

  it('triggers on "Back in 2019"', () => {
    const result = storyOpenerRule.evaluate({
      ...baseInput,
      text: 'Back in 2019 I quit my job with no plan. Best decision ever.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
  });

  it('triggers on "True story:"', () => {
    const result = storyOpenerRule.evaluate({
      ...baseInput,
      text: 'True story: I almost got fired for deploying on Friday.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(5);
  });

  it('does not trigger on non-story opener', () => {
    const result = storyOpenerRule.evaluate({
      ...baseInput,
      text: 'TypeScript 5.0 just dropped with some amazing features.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
