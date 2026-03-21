export type RuleCategory = 'hook' | 'structure' | 'engagement' | 'penalty' | 'bonus';

export type RuleSeverity = 'critical' | 'warning' | 'info' | 'positive';

export type RuleRuntime = 'client' | 'server' | 'both';

export interface TweetInput {
  text: string;
  platform: 'x' | 'linkedin' | 'threads';
  isThread: boolean;
  threadLength?: number;
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
}

export interface TextHighlight {
  start: number;
  end: number;
  severity: RuleSeverity;
}

export interface RuleResult {
  ruleId: string;
  triggered: boolean;
  points: number;
  severity: RuleSeverity;
  suggestion?: string;
  highlight?: TextHighlight;
}

export interface RuleDefinition {
  id: string;
  name: string;
  category: RuleCategory;
  runOn: RuleRuntime;
  evaluate: (input: TweetInput) => RuleResult;
}
