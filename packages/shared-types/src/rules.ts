export type RuleSeverity = 'critical' | 'warning' | 'info' | 'positive';

export type RuleRuntime = 'client' | 'server' | 'both';

export const SIGNAL_NAMES = [
  'favorite',
  'reply',
  'retweet',
  'quote',
  'share',
  'share_via_dm',
  'share_via_copy_link',
  'click',
  'profile_click',
  'follow_author',
  'photo_expand',
  'vqv',
  'dwell',
  'cont_dwell_time',
  'cont_click_dwell_time',
  'quoted_click',
  'quoted_vqv',
  'topic_consistency',
  'not_dwelled',
  'not_interested',
  'block_author',
  'mute_author',
  'report',
  'ad_disclosure',
  'post_frequency',
] as const;

export type SignalName = (typeof SIGNAL_NAMES)[number];

export type SignalType = 'positive' | 'negative';

export type SignalBucket = 'engagement' | 'curiosity' | 'dwell' | 'risk';

export interface TweetInput {
  text: string;
  platform: 'x' | 'linkedin' | 'threads';
  isThread: boolean;
  threadLength?: number;
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
  isQuoteTweet?: boolean;
  quotedText?: string;
  /** Media type of the quoted post, when isQuoteTweet is true. Used by
   * `quoted_vqv` to gate on whether the quoted tweet has a video. */
  quotedMediaType?: 'image' | 'video' | 'gif' | 'poll';
  /** Number of posts the author has already made today (UTC). Used by
   * `post_frequency` to penalise timeline-spamming behaviour. */
  postsToday?: number;
  /** Recent post topics / keyword bags so the engine can reward microniche
   * consistency. Each entry is a normalised keyword from a recent post. */
  recentTopics?: string[];
}

export interface PostContext {
  text: string;
  firstLine: string;
  platform: 'x' | 'linkedin' | 'threads';
  isThread: boolean;
  threadLength: number;
  hasImage: boolean;
  hasVideo: boolean;
  hasClickable: boolean;
  isQuoteTweet: boolean;
  quotedText: string;
  /** True when the quoted post (not the composing post) has a video. */
  quotedHasVideo: boolean;
  charCount: number;
  lineCount: number;
  /** Author's post count for today (0 means this is the first). */
  postsToday: number;
  /** Normalised keywords from the author's recent posts, used by
   * `topic_consistency` for microniche detection. Empty if unknown. */
  recentTopics: string[];
}

export interface SubRule {
  name: string;
  weight: number;
  fired: boolean;
  evidence?: string;
}

export interface SignalScore {
  signal: SignalName;
  type: SignalType;
  bucket: SignalBucket;
  score: number;
  max: number;
  applicable: boolean;
  firedRules: string[];
  subRules: SubRule[];
  suggestion?: string;
}

export interface TextHighlight {
  start: number;
  end: number;
  severity: RuleSeverity;
}

/**
 * Legacy rule-result shape used by server-side AI checks (`@reach/ai-checks`).
 * The v4 rules engine itself uses {@link SignalScore} instead. Kept here so
 * existing AI server rules can keep their lightweight contract until they get
 * migrated into per-signal AI predictors.
 */
export interface RuleResult {
  ruleId: string;
  triggered: boolean;
  points: number;
  severity: RuleSeverity;
  suggestion?: string;
  highlight?: TextHighlight;
}
