import type { AccountHealth, ReachForecast } from '@reach/shared-types';
import { forecastDraft } from '@reach/rules-engine';

interface ForecastInput {
  text: string;
  accountHealth: AccountHealth | null;
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
  isQuoteTweet?: boolean;
  now?: Date;
}

/**
 * Reach for the current draft. A number is returned only when this account
 * has a model that beat its own rolling median on newer held-out posts.
 * Otherwise the caller shows the checklist and an uncalibrated state.
 */
export function computeForecast(input: ForecastInput): ReachForecast {
  return forecastDraft({
    text: input.text,
    hasMedia: input.hasMedia,
    mediaType: input.mediaType,
    isQuoteTweet: input.isQuoteTweet,
    model: input.accountHealth?.reachModel ?? null,
    now: input.now,
  });
}

/**
 * Format a number with a short suffix (e.g. 14200 → "14.2K").
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
