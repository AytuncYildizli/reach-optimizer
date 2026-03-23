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
  lineBreaksRule,
} from './rules/structure-rules';
import {
  ctaPresenceRule,
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
  patternInterruptRule,
  boldClaimRule,
  listPromiseRule,
  compoundHookRule,
} from './rules/advanced-hook-rules';
import {
  choiceQuestionRule,
  deadEndingRule,
  combativeToneRule,
  mediaPresenceRule,
  grammarCheckRule,
  hashtagPlacementRule,
  allCapsSpamRule,
} from './rules/reply-potential-rules';
import {
  sentimentToneRule,
  readabilityRule,
  contrastSurpriseRule,
} from './rules/quality-signal-rules';

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
  patternInterruptRule,
  boldClaimRule,
  listPromiseRule,
  compoundHookRule,
  contrastSurpriseRule,
  // Structure rules
  characterLengthRule,
  hashtagCountRule,
  emojiCountRule,
  threadLengthRule,
  lineBreaksRule,
  readabilityRule,
  // Engagement rules
  ctaPresenceRule,
  bookmarkValueRule,
  choiceQuestionRule,
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
  hashtagPlacementRule,
  allCapsSpamRule,
  // Bonus / quality rules
  mediaPresenceRule,
  grammarCheckRule,
  sentimentToneRule,
];
