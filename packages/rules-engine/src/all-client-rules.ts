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
import {
  aiSlopWordsRule,
  aiSlopStructureRule,
  staleFormulaRule,
  hedgingOpenerRule,
} from './rules/ai-detection-rules';
import {
  openLoopRule,
  contrarianClaimRule,
  storyOpenerRule,
} from './rules/advanced-hook-rules';
import {
  choiceQuestionRule,
  directAddressRule,
  deadEndingRule,
  combativeToneRule,
  specificNumberRule,
} from './rules/reply-potential-rules';

export const allClientRules: RuleDefinition[] = [
  // Hook rules
  genericHookRule,
  hookLengthRule,
  numberDataHookRule,
  multiSentenceHookRule,
  firstPersonVoiceRule,
  // Advanced hook rules
  openLoopRule,
  contrarianClaimRule,
  storyOpenerRule,
  // Structure rules
  characterLengthRule,
  hashtagCountRule,
  emojiCountRule,
  threadLengthRule,
  // Engagement rules
  ctaPresenceRule,
  questionTypeRule,
  bookmarkValueRule,
  choiceQuestionRule,
  directAddressRule,
  // Penalty rules
  linkDetectionRule,
  engagementBaitRule,
  textWallRule,
  aiSlopWordsRule,
  aiSlopStructureRule,
  staleFormulaRule,
  hedgingOpenerRule,
  deadEndingRule,
  combativeToneRule,
  // Bonus rules
  specificNumberRule,
];
