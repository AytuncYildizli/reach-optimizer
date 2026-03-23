import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

export const characterLengthRule: RuleDefinition = {
  id: 'structure-char-length',
  name: 'Character Length',
  category: 'structure',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const len = input.text.length;

    if (len < 30) {
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: -5,
        severity: 'warning',
        suggestion: 'Too short — add more context or detail',
      };
    }

    if (len >= 30 && len <= 70) {
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: 2,
        severity: 'info',
      };
    }

    if (len >= 71 && len <= 110) {
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: 7,
        severity: 'positive',
        suggestion: 'Optimal tweet length — 71-110 chars gets 17% higher engagement',
      };
    }

    if (len >= 111 && len <= 200) {
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: 4,
        severity: 'positive',
        suggestion: 'Good length for content with context',
      };
    }

    if (len >= 201 && len <= 280) {
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: 1,
        severity: 'info',
      };
    }

    if (len > 280 && !input.isThread) {
      // Media tweets get lighter penalty — video/image context justifies length
      return {
        ruleId: 'structure-char-length',
        triggered: true,
        points: input.hasMedia ? -2 : -6,
        severity: input.hasMedia ? 'info' : 'warning',
        suggestion: input.hasMedia
          ? 'Long text with media — generally fine'
          : '"See more" truncation kills 40-60% of engagement — break into a thread',
      };
    }

    return {
      ruleId: 'structure-char-length',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const HASHTAG_REGEX = /#\w+/g;

export const hashtagCountRule: RuleDefinition = {
  id: 'penalty-hashtag-spam',
  name: 'Hashtag Spam Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const matches = input.text.match(HASHTAG_REGEX);
    const count = matches ? matches.length : 0;

    if (count >= 3) {
      return {
        ruleId: 'penalty-hashtag-spam',
        triggered: true,
        points: -6,
        severity: 'warning',
        suggestion:
          'Too many hashtags — 3+ hashtags reduce engagement by ~40%. Use 1-2 max.',
      };
    }

    return {
      ruleId: 'penalty-hashtag-spam',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu;

export const emojiCountRule: RuleDefinition = {
  id: 'penalty-emoji-spam',
  name: 'Emoji Spam Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const matches = input.text.match(EMOJI_REGEX);
    const count = matches ? matches.length : 0;

    if (count >= 5) {
      return {
        ruleId: 'penalty-emoji-spam',
        triggered: true,
        points: -3,
        severity: 'warning',
        suggestion:
          'Too many emojis. Keep to 1-2 for emphasis, not decoration.',
      };
    }

    return {
      ruleId: 'penalty-emoji-spam',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

export const threadLengthRule: RuleDefinition = {
  id: 'structure-thread-length',
  name: 'Thread Length',
  category: 'structure',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (!input.isThread || input.threadLength === undefined) {
      return {
        ruleId: 'structure-thread-length',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    const len = input.threadLength;

    if (len >= 5 && len <= 8) {
      return {
        ruleId: 'structure-thread-length',
        triggered: true,
        points: 6,
        severity: 'positive',
        suggestion: 'Thread length in sweet spot (5-8 tweets) — 2.4x engagement',
      };
    }

    if (len >= 9 && len <= 12) {
      return {
        ruleId: 'structure-thread-length',
        triggered: true,
        points: 3,
        severity: 'positive',
        suggestion: 'Good thread length',
      };
    }

    if (len >= 3 && len <= 4) {
      return {
        ruleId: 'structure-thread-length',
        triggered: true,
        points: 0,
        severity: 'info',
      };
    }

    if (len < 3) {
      return {
        ruleId: 'structure-thread-length',
        triggered: true,
        points: -4,
        severity: 'warning',
        suggestion:
          'Thread too short — consider expanding or posting as single tweet',
      };
    }

    if (len >= 13 && len <= 15) {
      return {
        ruleId: 'structure-thread-length',
        triggered: true,
        points: -1,
        severity: 'info',
      };
    }

    // >15
    return {
      ruleId: 'structure-thread-length',
      triggered: true,
      points: -3,
      severity: 'warning',
      suggestion:
        'Thread too long — consider splitting into multiple threads',
    };
  },
};

// NEW: Line Breaks Rule — rewards Twitter-native formatting
export const lineBreaksRule: RuleDefinition = {
  id: 'structure-line-breaks',
  name: 'Line Break Formatting',
  category: 'structure',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    // Only relevant for longer content
    if (text.length < 100) {
      return { ruleId: 'structure-line-breaks', triggered: false, points: 0, severity: 'info' };
    }

    const hasLineBreaks = text.includes('\n');

    if (hasLineBreaks) {
      return {
        ruleId: 'structure-line-breaks',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion: 'Good formatting — line breaks boost readability by 20-30%',
      };
    }

    return {
      ruleId: 'structure-line-breaks',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
