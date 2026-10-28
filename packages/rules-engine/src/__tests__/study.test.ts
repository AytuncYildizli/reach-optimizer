import { describe, expect, it } from 'vitest';
import { fitBoost, predictBoost } from '../forecast/boost';
import { parsePostsJson, prepareDataset, type HistoryPost } from '../forecast/dataset';
import { fitHuberRidge, fitRidge, predictRidge } from '../forecast/ridge';
import { pickStudyWinner, runStudy, type StudyRow } from '../forecast/study';
import { MIN_MAE_IMPROVEMENT } from '../forecast/model';

function post(partial: Partial<HistoryPost> & { id: string; createdAt: string; impressions: number }): HistoryPost {
  return {
    text: `okay sure note ${partial.id}`,
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

describe('study selection', () => {
  it('picks the largest train-internal MAE gain and keeps the raw-MAE bar', () => {
    const table: StudyRow[] = [
      { config: 'relative_ridge', trainN: 10, selectN: 4, spearman: 0.2, mae: 90, baselineMae: 100, maeGain: 0.1, ewmaMae: 95, detail: '' },
      { config: 'gbt', trainN: 10, selectN: 4, spearman: 0.4, mae: 70, baselineMae: 100, maeGain: 0.3, ewmaMae: 95, detail: '' },
      { config: 'ewma_type', trainN: 10, selectN: 4, spearman: 0.99, mae: 80, baselineMae: 100, maeGain: 0.2, ewmaMae: 80, detail: '' },
    ];
    expect(pickStudyWinner(table)).toBe('gbt');
    const tied: StudyRow[] = [
      { ...table[1]!, maeGain: 0.2, spearman: 0.4 },
      { ...table[2]!, maeGain: 0.2, spearman: 0.4 },
    ];
    expect(pickStudyWinner(tied)).toBe('gbt');
    expect(MIN_MAE_IMPROVEMENT).toBe(0.05);
  });

  it('locks the winner before the holdout is attached', () => {
    const posts = ['alpha', 'beta'].flatMap((account, accountIndex) =>
      Array.from({ length: 36 }, (_, index) =>
        post({
          id: `${account}-${index}`,
          account,
          createdAt: new Date(Date.UTC(2024, 0, 1) + (accountIndex * 40 + index) * 86400000).toISOString(),
          impressions: 500 + (index % 2) * 200 + accountIndex * 50,
          kind: index % 5 === 0 ? 'quote' : 'original',
        }),
      ),
    );
    const report = runStudy(posts, { timezone: 'UTC', asOf: new Date('2025-06-01T00:00:00.000Z'), minAgeDays: 0 });
    const best = pickStudyWinner(report.table);
    expect(report.chosen).toBe(best);
    expect(report.holdout.config).toBe(best);
    expect(report.table.map((row) => row.config)).toEqual([
      'relative_ridge',
      'absolute_log',
      'relative_shrink',
      'huber',
      'gbt',
      'extended_shrink',
      'self_reply_extended_shrink',
      'ewma_type',
    ]);
    expect(String(report.protocol.gate)).toContain('5%');
  });
});

describe('type EWMA and self-replies', () => {
  it('does not let a quote move the original-post EWMA', () => {
    const posts: HistoryPost[] = [];
    for (let index = 0; index < 8; index++) {
      posts.push(post({ id: `o${index}`, createdAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString(), impressions: 100 }));
    }
    posts.push(post({ id: 'q', createdAt: '2024-01-10T00:00:00.000Z', impressions: 10_000, kind: 'quote' }));
    posts.push(post({ id: 'later', createdAt: '2024-01-11T00:00:00.000Z', impressions: 100 }));
    const prepared = prepareDataset(posts, {
      timezone: 'UTC',
      asOf: new Date('2024-02-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
    });
    expect(prepared.rows.find((row) => row.id === 'later')?.ewmaImpressions).toBeCloseTo(100, 5);
  });

  it('keeps a self-reply only when asked', () => {
    const parsed = parsePostsJson([
      {
        id: 'self',
        created_at: '2024-01-02T00:00:00.000Z',
        kind: 'reply',
        author_id: '1',
        in_reply_to_user_id: '1',
        text: 'okay sure note self reply',
        public_metrics: { impression_count: 10, like_count: 1, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0 },
      },
      {
        id: 'other',
        created_at: '2024-01-03T00:00:00.000Z',
        kind: 'reply',
        author_id: '1',
        in_reply_to_user_id: '2',
        text: 'okay sure note other reply',
        public_metrics: { impression_count: 10, like_count: 1, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0 },
      },
    ]);
    const opts = {
      timezone: 'UTC',
      asOf: new Date('2024-02-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
    };
    expect(parsed.find((row) => row.id === 'self')?.selfReply).toBe(true);
    expect(prepareDataset(parsed, opts).dropped.reply).toBe(2);
    const kept = prepareDataset(parsed, { ...opts, includeSelfReplies: true });
    expect(kept.eligible.map((row) => row.id)).toEqual(['self']);
    expect(kept.dropped.reply).toBe(1);
  });
});

describe('robust fits', () => {
  it('lets Huber ignore a single wild residual more than least squares', () => {
    const X = Array.from({ length: 12 }, (_, index) => [index]);
    const y = X.map((row) => row[0]!);
    y[11] = 500;
    const huber = fitHuberRidge(X, y, 1e-6, 1);
    const least = fitRidge(X, y, 1e-6);
    expect(huber).not.toBeNull();
    expect(least).not.toBeNull();
    const huberAt = predictRidge(huber!, [[5]])[0]!;
    const leastAt = predictRidge(least!, [[5]])[0]!;
    expect(Math.abs(huberAt - 5)).toBeLessThan(Math.abs(leastAt - 5));
  });

  it('fits a step with a shallow boosted tree', () => {
    const X = Array.from({ length: 40 }, (_, index) => [index < 20 ? 0 : 1]);
    const y = X.map((row) => (row[0] === 0 ? -1 : 1));
    const model = fitBoost(X, y, 15, 0.4, 1, 4);
    const pred = predictBoost(model, [[0], [1]]);
    expect(pred[0]!).toBeLessThan(0);
    expect(pred[1]!).toBeGreaterThan(0);
  });
});
