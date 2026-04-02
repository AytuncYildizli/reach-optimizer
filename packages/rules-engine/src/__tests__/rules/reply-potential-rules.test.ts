import { describe, it, expect } from 'vitest';
import {
  choiceQuestionRule,
  deadEndingRule,
  combativeToneRule,
  hashtagPlacementRule,
  allCapsSpamRule,
} from '../../rules/reply-potential-rules';
import type { TweetInput } from '@reach/shared-types';

const baseInput: TweetInput = {
  text: '',
  platform: 'x',
  isThread: false,
  hasMedia: false,
};

describe('choiceQuestionRule', () => {
  it('triggers on "Which framework do you prefer?"', () => {
    const result = choiceQuestionRule.evaluate({
      ...baseInput,
      text: 'Which framework do you prefer for building APIs?',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(10);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Choice question');
  });

  it('triggers on "A or B" choice', () => {
    const result = choiceQuestionRule.evaluate({
      ...baseInput,
      text: 'React or Vue? Pick one and explain why?',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(10);
  });

  it('does not trigger without question mark', () => {
    const result = choiceQuestionRule.evaluate({
      ...baseInput,
      text: 'I choose React every single time.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('deadEndingRule', () => {
  it('triggers on flat ending with no CTA (long tweet)', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building a SaaS product and learned a lot about marketing along the way.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('Dead ending');
  });

  it('does not trigger on short punchy tweets (<71 chars)', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'Ship it.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not trigger when tweet ends with question mark', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building this product from scratch. Was it worth it?',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });

  it('does not trigger when tweet ends with ellipsis', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building this product and the results were...',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('combativeToneRule', () => {
  it('triggers on "stupid"', () => {
    const result = combativeToneRule.evaluate({
      ...baseInput,
      text: 'This take is so stupid it hurts my brain.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-10);
    expect(result.severity).toBe('critical');
    expect(result.suggestion).toContain('Combative tone');
  });

  it('triggers on "shut up"', () => {
    const result = combativeToneRule.evaluate({
      ...baseInput,
      text: 'Just shut up about Web3 already. Nobody cares.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-10);
  });

  it('does not trigger on constructive criticism', () => {
    const result = combativeToneRule.evaluate({
      ...baseInput,
      text: 'I disagree with this approach. Here is a better alternative.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('hashtagPlacementRule', () => {
  it('penalizes tweet starting with hashtag', () => {
    const result = hashtagPlacementRule.evaluate({
      ...baseInput,
      text: '#AI is going to change everything about how we work.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
  });

  it('does not trigger when hashtag is mid-tweet', () => {
    const result = hashtagPlacementRule.evaluate({
      ...baseInput,
      text: 'Working on some #AI projects this weekend.',
    });
    expect(result.triggered).toBe(false);
  });
});

describe('allCapsSpamRule', () => {
  it('penalizes excessive ALL CAPS', () => {
    const result = allCapsSpamRule.evaluate({
      ...baseInput,
      text: 'THIS IS THE BEST THING EVER MADE FOR DEVELOPERS WHO CODE',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-4);
  });

  it('does not trigger on normal text with one caps word', () => {
    const result = allCapsSpamRule.evaluate({
      ...baseInput,
      text: 'This is absolutely AMAZING work from the team.',
    });
    expect(result.triggered).toBe(false);
  });
});
