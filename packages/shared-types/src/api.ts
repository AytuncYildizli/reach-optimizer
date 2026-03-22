import type { AnalysisResult, TrendingTopic } from './analysis';

export interface AnalyzeRequest {
  content: string;
  platform: 'x' | 'linkedin' | 'threads';
}

export interface AnalyzeResponse {
  success: true;
  data: AnalysisResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'USAGE_EXCEEDED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
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
    subscriptionTier: string;
    monthlyUsageCount: number;
    monthlyUsageLimit: number;
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

