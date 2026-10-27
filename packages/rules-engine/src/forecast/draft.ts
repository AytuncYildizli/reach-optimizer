import type { ReachForecast, ReachModelSnapshot, WhatIfScenario } from '@reach/shared-types';
import type { FittedTargetModel } from '@reach/shared-types';
import { buildFeatureRecord, guessLang, scorePost } from './features';

export interface DraftInput {
  text: string;
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
  isQuoteTweet?: boolean;
  model: ReachModelSnapshot | null | undefined;
  now?: Date;
}

const MIN_SCENARIO_LIFT = 0.05;

function uncalibrated(reason: string, dataPoints = 0): ReachForecast {
  return {
    status: 'uncalibrated',
    predictedReach: null,
    reachLow: null,
    reachHigh: null,
    vsAverage: null,
    engagementRate: null,
    engagementLow: null,
    engagementHigh: null,
    scenarios: [],
    confidence: 0,
    dataPoints,
    isEstimate: true,
    reason,
  };
}

function mediaFlags(hasMedia: boolean, mediaType: DraftInput['mediaType']): { hasImage: boolean; hasVideo: boolean } {
  if (!hasMedia) return { hasImage: false, hasVideo: false };
  if (mediaType === 'video') return { hasImage: false, hasVideo: true };
  return { hasImage: true, hasVideo: false };
}

function project(model: FittedTargetModel, features: Record<string, number>): number {
  let y = model.intercept;
  for (let j = 0; j < model.featureNames.length; j++) {
    const std = model.std[j] ?? 0;
    if (!(std > 0)) continue;
    const x = features[model.featureNames[j]!] ?? 0;
    y += (model.weights[j] ?? 0) * ((x - (model.mean[j] ?? 0)) / std);
  }
  return y;
}

function impressionBand(baseline: number, logRatio: number, q10: number, q90: number) {
  const point = baseline * Math.exp(logRatio);
  const a = baseline * Math.exp(logRatio + q10);
  const b = baseline * Math.exp(logRatio + q90);
  return { point, low: Math.min(a, b), high: Math.max(a, b) };
}

function roundReach(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.round(n));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function featuresFor(
  input: DraftInput,
  model: ReachModelSnapshot,
  when: Date,
  flags: { hasImage: boolean; hasVideo: boolean },
): Record<string, number> {
  const nowMs = when.getTime();
  const recent = model.recentPostAts
    .map((stamp) => Date.parse(stamp))
    .filter((t) => !Number.isNaN(t));
  const postsLast24h = recent.filter((t) => nowMs - t <= 24 * 60 * 60 * 1000 && nowMs - t >= 0).length;
  const latest = model.latestPostAt ? Date.parse(model.latestPostAt) : NaN;
  const hoursSincePrev = Number.isNaN(latest) ? 24 : Math.max(0, (nowMs - latest) / 36e5);
  const scored = scorePost({
    text: input.text,
    hasImage: flags.hasImage,
    hasVideo: flags.hasVideo,
    isQuote: input.isQuoteTweet ?? false,
    postsToday: postsLast24h,
    recentTopics: model.recentTopics,
  });
  return buildFeatureRecord({
    text: input.text,
    signals: scored.signals,
    createdAt: when,
    timeZone: model.timezone,
    hasImage: flags.hasImage,
    hasVideo: flags.hasVideo,
    isQuote: input.isQuoteTweet ?? false,
    lang: guessLang(input.text),
    hoursSincePrev,
    postsLast24h,
    baselineImpressions: model.baselineImpressions ?? 1,
    baselineEngagement: model.baselineEngagement ?? 0,
    followerCount: null,
  });
}

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Reach interval for a draft. Returns an uncalibrated forecast — checklist
 * only, no number — unless this account's snapshot passed the time-split gate.
 */
export function forecastDraft(input: DraftInput): ReachForecast {
  const model = input.model;
  if (!model || model.version !== 1 || model.status !== 'calibrated' || !model.impressions) {
    return uncalibrated(
      model?.reason ||
        'Uncalibrated. A reach number is shown only after your own posts beat your usual reach on held-out history.',
      model?.modeledPosts ?? 0,
    );
  }
  if (input.text.trim().length < 3) {
    return uncalibrated('Not enough text to score.', model.modeledPosts);
  }
  const baseline = model.baselineImpressions;
  if (baseline == null || !(baseline > 0)) {
    return uncalibrated('No rolling reach baseline for this account yet.', model.modeledPosts);
  }

  const now = input.now ?? new Date();
  const flags = mediaFlags(input.hasMedia, input.mediaType);
  const features = featuresFor(input, model, now, flags);
  const fitted = model.impressions;
  const band = impressionBand(baseline, project(fitted, features), fitted.residualQ10, fitted.residualQ90);
  let reachLow = roundReach(band.low);
  let reachHigh = roundReach(band.high);
  let predictedReach = roundReach(band.point);
  if (predictedReach < reachLow) predictedReach = reachLow;
  if (predictedReach > reachHigh) predictedReach = reachHigh;
  if (reachHigh < reachLow) reachHigh = reachLow;

  let engagementRate: number | null = null;
  let engagementLow: number | null = null;
  let engagementHigh: number | null = null;
  if (model.engagement && model.baselineEngagement != null) {
    const residual = project(model.engagement, features);
    const point = model.baselineEngagement + residual;
    const low = model.baselineEngagement + residual + model.engagement.residualQ10;
    const high = model.baselineEngagement + residual + model.engagement.residualQ90;
    engagementRate = clamp01(point);
    engagementLow = clamp01(Math.min(low, high));
    engagementHigh = clamp01(Math.max(low, high));
  }

  const scenarios = buildScenarios(input, model, now, flags, band.point);
  const coverage = model.validation.impressions.coverage80 ?? 0;
  return {
    status: 'calibrated',
    predictedReach,
    reachLow,
    reachHigh,
    vsAverage: Math.round((band.point / baseline) * 10) / 10,
    engagementRate,
    engagementLow,
    engagementHigh,
    scenarios,
    confidence: coverage,
    dataPoints: model.modeledPosts,
    isEstimate: false,
    reason: model.reason,
  };
}

function buildScenarios(
  input: DraftInput,
  model: ReachModelSnapshot,
  now: Date,
  flags: { hasImage: boolean; hasVideo: boolean },
  current: number,
): WhatIfScenario[] {
  if (!(current > 0) || !model.impressions || model.baselineImpressions == null) return [];
  const fitted = model.impressions;
  const baseline = model.baselineImpressions;
  const scenarios: WhatIfScenario[] = [];

  const pushIfMoved = (scenario: Omit<WhatIfScenario, 'delta' | 'deltaPercent' | 'predictedReach'> & { point: number }) => {
    const lift = (scenario.point - current) / current;
    if (Math.abs(lift) < MIN_SCENARIO_LIFT) return;
    const predictedReach = roundReach(scenario.point);
    scenarios.push({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      icon: scenario.icon,
      predictedReach,
      delta: predictedReach - roundReach(current),
      deltaPercent: Math.round(lift * 100),
      actionable: scenario.actionable,
      alreadyApplied: scenario.alreadyApplied,
    });
  };

  if (!flags.hasImage && !flags.hasVideo) {
    const imagePoint = impressionBand(
      baseline,
      project(fitted, featuresFor(input, model, now, { hasImage: true, hasVideo: false })),
      0,
      0,
    ).point;
    pushIfMoved({
      id: 'add-image',
      label: 'Add an image',
      description: 'Change estimated from your own posts',
      icon: '🖼️',
      actionable: false,
      alreadyApplied: false,
      point: imagePoint,
    });
    const videoPoint = impressionBand(
      baseline,
      project(fitted, featuresFor(input, model, now, { hasImage: false, hasVideo: true })),
      0,
      0,
    ).point;
    pushIfMoved({
      id: 'add-video',
      label: 'Add a video',
      description: 'Change estimated from your own posts',
      icon: '🎥',
      actionable: false,
      alreadyApplied: false,
      point: videoPoint,
    });
  }

  let best: { when: Date; point: number } | null = null;
  for (let step = 3; step <= 48; step += 3) {
    const when = new Date(now.getTime() + step * 60 * 60 * 1000);
    const point = impressionBand(baseline, project(fitted, featuresFor(input, model, when, flags)), 0, 0).point;
    if (!best || point > best.point) best = { when, point };
  }
  if (best) {
    pushIfMoved({
      id: 'later-hour',
      label: `Post ${formatWhen(best.when, model.timezone)}`,
      description: 'Hour and weekday effect from your history',
      icon: '🕒',
      actionable: false,
      alreadyApplied: false,
      point: best.point,
    });
  }
  return scenarios;
}
