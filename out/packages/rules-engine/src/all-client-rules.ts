import type { RuleDefinition } from '@reach/shared-types';

import { linkDetectionRule } from './rules/link-detection';
import {
  genericHookRule,
  hookLengthRule,
  numberDataHookRule,
  multiSentenceHookRule,
  firstPersonVoiceRule,
} from './rules/hook-rules';
import {
  characterLengthRule,
  hashtagCountRule,
  emojiCountRule,
  threadLengthRule,
} from './rules/structure-rules';
import {
  ctaPresenceRule,
  questionTypeRule,
  bookmarkValueRule,
} from './rules/engagement-rules';
import { engagementBaitRule, textWallRule } from './rules/penalty-rules';

export const allClientRules: RuleDefinition[] = [
  // Hook rules
  genericHookRule,
  hookLengthRule,
  numberDataHookRule,
  multiSentenceHookRule,
  firstPersonVoiceRule,
  // Structure rules
  characterLengthRule,
  hashtagCountRule,
  emojiCountRule,
  threadLengthRule,
  // Engagement rules
  ctaPresenceRule,
  questionTypeRule,
  bookmarkValueRule,
  // Penalty rules
  linkDetectionRule,
  engagementBaitRule,
  textWallRule,
];
