import { describe, it, expect } from 'vitest';
import {
  choiceQuestionRule,
  directAddressRule,
  deadEndingRule,
  combativeToneRule,
  specificNumberRule,
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
    expect(result.points).toBe(8);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Choice question');
  });

  it('triggers on "A or B" choice', () => {
    const result = choiceQuestionRule.evaluate({
      ...baseInput,
      text: 'React or Vue? Pick one and explain why?',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(8);
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

describe('directAddressRule', () => {
  it('triggers on "what do you think" in last 30% of text', () => {
    const result = directAddressRule.evaluate({
      ...baseInput,
      text: 'AI in code review. What do you think?',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Direct address');
  });

  it('triggers on "share your" at the end', () => {
    const result = directAddressRule.evaluate({
      ...baseInput,
      text: 'Failing taught me everything. Share your lesson.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
  });

  it('does not trigger when CTA is only in the first part', () => {
    const result = directAddressRule.evaluate({
      ...baseInput,
      text: 'Tell me why you think this is important. Anyway, I shipped my new project today and it went well.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});

describe('deadEndingRule', () => {
  it('triggers on flat ending with no CTA and no engagement signals (long tweet)', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'I spent 6 months building a SaaS product and learned a lot about marketing along the way.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-2);
    expect(result.severity).toBe('warning');
    expect(result.suggestion).toContain('question or open loop');
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

  it('does not trigger when tweet has a question anywhere', () => {
    const result = deadEndingRule.evaluate({
      ...baseInput,
      text: 'Ever wonder why some products grow fast? I spent 6 months building a SaaS and learned the answer.',
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
    expect(result.points).toBe(-6);
    expect(result.severity).toBe('critical');
    expect(result.suggestion).toContain('Combative tone');
  });

  it('triggers on "shut up"', () => {
    const result = combativeToneRule.evaluate({
      ...baseInput,
      text: 'Just shut up about Web3 already. Nobody cares.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(-6);
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

describe('specificNumberRule', () => {
  it('triggers on "$50k"', () => {
    const result = specificNumberRule.evaluate({
      ...baseInput,
      text: 'I made $50k from a side project in 6 months.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(3);
    expect(result.severity).toBe('positive');
    expect(result.suggestion).toContain('Specific numbers');
  });

  it('triggers on "47%"', () => {
    const result = specificNumberRule.evaluate({
      ...baseInput,
      text: 'Conversion rate improved by 47% after the redesign.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(3);
  });

  it('triggers on "8/10"', () => {
    const result = specificNumberRule.evaluate({
      ...baseInput,
      text: 'I would rate this experience an 8/10 overall.',
    });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(3);
  });

  it('does not trigger on text without specific numbers', () => {
    const result = specificNumberRule.evaluate({
      ...baseInput,
      text: 'Building cool stuff every day.',
    });
    expect(result.triggered).toBe(false);
    expect(result.points).toBe(0);
  });
});
