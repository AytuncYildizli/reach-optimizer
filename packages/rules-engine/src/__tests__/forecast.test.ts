import { describe, expect, it } from 'vitest';
import { forecastDraft } from '../forecast/draft';
import { parsePostsJson, prepareDataset, type HistoryPost } from '../forecast/dataset';
import { zonedHourDow } from '../forecast/features';
import { judgeTarget, runBacktest } from '../forecast/model';
import { fitRidge, predictRidge } from '../forecast/ridge';
import { median } from '../forecast/stats';

function post(partial: Partial<HistoryPost> & { id: string; createdAt: string; text: string; impressions: number }): HistoryPost {
  return {
    kind: 'original',
    lang: 'en',
    mediaType: null,
    likes: 1,
    retweets: 0,
    replies: 0,
    quotes: 0,
    bookmarks: 0,
    followerCount: null,
    ...partial,
  };
}

function series(count: number, impressionFor: (index: number) => number, textFor: (index: number) => string): HistoryPost[] {
  return Array.from({ length: count }, (_, index) =>
    post({
      id: `p${index}`,
      createdAt: new Date(Date.UTC(2024, 0, 1) + index * 86400000).toISOString(),
      text: textFor(index),
      impressions: impressionFor(index),
      likes: textFor(index).includes('12 users') ? 30 : 1,
    }),
  );
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function tag(index: number): string {
  return `${LETTERS[index % 26]} ${LETTERS[Math.floor(index / 26) % 26]}`;
}

function richText(index: number): string {
  return `Shipped 12 users in 3 days. 40% stayed after 8 hours.\n\nStep was the cut for ${tag(index)}.`;
}

function plainText(index: number): string {
  return `okay sure note ${tag(index)}`;
}

describe('spam-marker regression is covered by signal tests', () => {
  it('judgeTarget requires a real improvement on a large enough holdout', () => {
    expect(
      judgeTarget({
        trainN: 40,
        testN: 20,
        modelSpearman: 0.2,
        baselineSpearman: 0.05,
        modelMae: 90,
        baselineMae: 100,
      }).passed,
    ).toBe(true);
    expect(
      judgeTarget({
        trainN: 40,
        testN: 20,
        modelSpearman: 0.2,
        baselineSpearman: 0.05,
        modelMae: 97,
        baselineMae: 100,
      }).passed,
    ).toBe(false);
    expect(
      judgeTarget({
        trainN: 39,
        testN: 20,
        modelSpearman: 0.9,
        baselineSpearman: 0,
        modelMae: 1,
        baselineMae: 100,
      }).passed,
    ).toBe(false);
    expect(
      judgeTarget({
        trainN: 40,
        testN: 20,
        modelSpearman: -0.1,
        baselineSpearman: -0.2,
        modelMae: 50,
        baselineMae: 100,
      }).passed,
    ).toBe(false);
  });
});

describe('ridge', () => {
  it('recovers a line under a tiny penalty', () => {
    const X = Array.from({ length: 10 }, (_, i) => [i]);
    const y = X.map((row) => 3 + 2 * row[0]!);
    const fit = fitRidge(X, y, 1e-8);
    expect(fit).not.toBeNull();
    const pred = predictRidge(fit!, [[10]]);
    expect(pred[0]).toBeCloseTo(23, 1);
  });
});

describe('time features', () => {
  it('reads hour and weekday in the account timezone', () => {
    const parts = zonedHourDow(new Date('2024-01-01T00:00:00.000Z'), 'Europe/Istanbul');
    expect(parts.hour).toBe(3);
    expect(parts.dow).toBe(1);
  });
});

describe('dataset', () => {
  it('strips quote-permalink and media URLs before scoring', () => {
    const parsed = parsePostsJson([
      {
        id: '1',
        created_at: '2025-12-25T22:38:59.000Z',
        kind: 'quote',
        lang: 'en',
        text: 'Be careful out there https://t.co/wHjGpaGcfP',
        full_text: 'Be careful out there https://t.co/wHjGpaGcfP',
        media_types: [],
        referenced_tweets: [{ id: '2004297673067704651', type: 'quoted' }],
        entities: {
          urls: [
            {
              url: 'https://t.co/wHjGpaGcfP',
              expanded_url: 'https://twitter.com/someone/status/2004297673067704651',
              display_url: 'x.com/someone/status',
            },
          ],
        },
        public_metrics: {
          impression_count: 10,
          like_count: 1,
          retweet_count: 0,
          reply_count: 0,
          quote_count: 0,
          bookmark_count: 0,
        },
      },
    ]);
    expect(parsed[0]?.text).toBe('Be careful out there');
    expect(parsed[0]?.kind).toBe('quote');
  });

  it('keeps the earliest copy of a repeated caption and ignores replies', () => {
    const posts = [
      post({ id: 'reply', createdAt: '2024-01-01T00:00:00.000Z', text: 'a reply here', impressions: 10, kind: 'reply' }),
      post({ id: 'early', createdAt: '2024-01-02T00:00:00.000Z', text: 'same caption', impressions: 100 }),
      post({ id: 'late', createdAt: '2024-01-03T00:00:00.000Z', text: 'same caption', impressions: 999 }),
      post({ id: 'young', createdAt: '2024-01-10T00:00:00.000Z', text: 'a newer post', impressions: 50 }),
    ];
    const prepared = prepareDataset(posts, {
      timezone: 'UTC',
      asOf: new Date('2024-01-11T00:00:00.000Z'),
      minAgeDays: 3,
      window: 20,
      minHistory: 8,
    });
    expect(prepared.eligible.map((p) => p.id)).toEqual(['early']);
    expect(prepared.dropped.reply).toBe(1);
    expect(prepared.dropped.duplicate).toBe(1);
    expect(prepared.dropped.too_recent).toBe(1);
  });

  it('rolling baseline uses only earlier posts', () => {
    const posts = series(15, (i) => i + 1, (i) => `a normal post about shipping ${tag(i)}`);
    const prepared = prepareDataset(posts, {
      timezone: 'UTC',
      asOf: new Date('2025-01-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
    });
    const row = prepared.rows[0]!;
    expect(row.id).toBe('p8');
    expect(row.baselineImpressions).toBe(median([1, 2, 3, 4, 5, 6, 7, 8]));
    const mutated = posts.map((p) => ({
      ...p,
      impressions: p.id === 'p14' ? 1_000_000 : p.impressions,
      text: p.id === 'p14' ? 'totally different future text about shipping' : p.text,
    }));
    const again = prepareDataset(mutated, {
      timezone: 'UTC',
      asOf: new Date('2025-01-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
    });
    expect(again.rows[0]?.baselineImpressions).toBe(row.baselineImpressions);
    expect(again.rows[0]?.features).toEqual(row.features);
  });
});

describe('time-split model', () => {
  const asOf = new Date('2025-01-01T00:00:00.000Z');

  it('calibrates when impressions are a stable function of the text', () => {
    const posts = series(110, (i) => (i % 2 === 0 ? 10_000 : 2_500), (i) => (i % 2 === 0 ? richText(i) : plainText(i)));
    const report = runBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 0, trainedAt: asOf });
    expect(report.snapshot.status).toBe('calibrated');
    expect(report.impressions.passed).toBe(true);
    expect(report.impressions.mae!).toBeLessThan(report.impressions.baselineMae! * 0.95);
    expect(report.snapshot.impressions).not.toBeNull();
    const forecast = forecastDraft({
      text: richText(200),
      hasMedia: false,
      model: report.snapshot,
      now: new Date('2025-02-01T12:00:00.000Z'),
    });
    expect(forecast.status).toBe('calibrated');
    expect(forecast.predictedReach).not.toBeNull();
    expect(forecast.reachLow).not.toBeNull();
    expect(forecast.reachHigh).not.toBeNull();
    expect(forecast.reachLow!).toBeLessThanOrEqual(forecast.predictedReach!);
    expect(forecast.predictedReach!).toBeLessThanOrEqual(forecast.reachHigh!);
  });

  it('stays uncalibrated when impressions are independent of the text', () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const posts = series(110, () => Math.round(1500 + rand() * 8000), (i) => `a normal post about shipping ${tag(i)}`);
    const report = runBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 0, trainedAt: asOf });
    expect(report.snapshot.status).toBe('uncalibrated');
    expect(report.snapshot.impressions).toBeNull();
    const forecast = forecastDraft({
      text: 'a normal post about shipping',
      hasMedia: false,
      model: report.snapshot,
    });
    expect(forecast.status).toBe('uncalibrated');
    expect(forecast.predictedReach).toBeNull();
    expect(forecast.scenarios).toEqual([]);
  });

  it('returns uncalibrated when there is no model', () => {
    const forecast = forecastDraft({ text: 'hello there', hasMedia: false, model: null });
    expect(forecast.status).toBe('uncalibrated');
    expect(forecast.predictedReach).toBeNull();
  });
});
