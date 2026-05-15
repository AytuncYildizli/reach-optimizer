import type { AnalysisResult, TrendingTopic } from './analysis';

export interface AnalyzeRequest {
  content: string;
  platform: 'x' | 'linkedin' | 'threads';
  /** Optional composer context — when present, the server engine evaluates
   * with the same media/quote context the client sees, so persisted scores
   * match the displayed score. Omitted by older extension builds. */
  isThread?: boolean;
  hasMedia?: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
  isQuoteTweet?: boolean;
  quotedText?: string;
  quotedMediaType?: 'image' | 'video' | 'gif' | 'poll';
}

export interface AnalyzeResponse {
  success: true;
  data: AnalysisResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
}

export interface AuthCallbackRequest {
  code: string;
  state: string;
}

export interface AuthCallbackResponse {
  success: true;
  token: string;
  user: {
    id: string;
    xUsername: string;
    xDisplayName: string;
    xProfileImage: string;
  };
}

export interface SuggestRequest {
  content: string;
  type: 'hook' | 'cta' | 'self-reply';
}

export interface SuggestResponse {
  success: true;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Account Health
// ---------------------------------------------------------------------------

export interface AccountHealthFactor {
  name: string;
  score: number;       // points contributed
  maxScore: number;    // max possible for this factor
  status: 'great' | 'good' | 'warning' | 'critical';
  tip?: string;        // actionable tip for improvement
}

export interface AccountHealth {
  healthScore: number;           // 0-100
  reachMultiplier: number;       // 0.6-1.3
  factors: AccountHealthFactor[];
  isPremium: boolean;
  followerCount: number;
  followingCount: number;
  tweetCount: number;
  accountAgeDays: number;
  avgEngagementRate: number | null;  // from tracked tweets, null if no data
  fetchedAt: string;                  // ISO timestamp
  forecastCorrectionFactor?: number | null; // from calibration cron, null if no data
}

export interface AccountHealthResponse {
  success: true;
  data: AccountHealth;
}

// ---------------------------------------------------------------------------
// Timing Optimizer
// ---------------------------------------------------------------------------

export interface TimingRequest {
  /** IANA timezone string, e.g. "America/New_York" */
  timezone: string;
}

/** A single optimal posting window */
export interface TimingWindow {
  /** 0=Sun, 1=Mon ... 6=Sat */
  dayOfWeek: number;
  /** Short day name */
  dayLabel: string;
  /** Hour in user's local timezone (0-23) */
  hourLocal: number;
  /** Formatted local time string, e.g. "9:00 AM" */
  timeLabel: string;
  /** Quality tier for this window */
  quality: 'peak' | 'good' | 'okay';
}

export interface TimingResponse {
  success: true;
  data: {
    /** Current recommendation for the user right now */
    currentStatus: 'good_now' | 'better_later' | 'off_peak';
    /** Human-readable message for the extension */
    message: string;
    /** If better_later, when the next good window is (ISO string in user tz) */
    nextWindowLocal: string | null;
    /** Full weekly schedule of optimal windows */
    weeklyWindows: TimingWindow[];
    /** 7x24 heatmap — heat[dayOfWeek][hour] = 0..100 intensity */
    heatmap: number[][];
    /** User's timezone that was used */
    timezone: string;
  };
}

// ---------------------------------------------------------------------------
// Trending Topics
// ---------------------------------------------------------------------------

export interface TrendingResponse {
  success: true;
  data: {
    /** List of current trending topics */
    trends: TrendingTopic[];
    /** ISO timestamp of when trends were last fetched */
    fetchedAt: string;
    /** WOEID used for the trends query */
    woeid: number;
    /** Seconds until cache expires */
    cacheExpiresIn: number;
  };
}

