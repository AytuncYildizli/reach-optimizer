import { describe, expect, it } from 'vitest';
import { parsePostsJson, prepareDataset, type HistoryPost } from '../forecast/dataset';
import { runBacktest } from '../forecast/model';
import { runPooledBacktest } from '../forecast/pooled';
import { parseSnapshotJson, runSnapshotBacktest } from '../forecast/snapshots';

function metrics(impressions: number) {
  return {
    impression_count: impressions,
    like_count: 1,
    retweet_count: 0,
    reply_count: 0,
    quote_count: 0,
    bookmark_count: 0,
  };
}

function history(count: number, account: string, followerFor: (index: number) => number | null): HistoryPost[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${account}-${index}`,
    createdAt: new Date(Date.UTC(2024, 0, 1) + index * 86400000).toISOString(),
    text: `okay sure note ${account} ${index} alpha`,
    kind: 'original' as const,
    lang: 'en',
    mediaType: null,
    impressions: 1000 + (index % 3) * 10,
    likes: 1,
    retweets: 0,
    replies: 0,
    quotes: 0,
    bookmarks: 0,
    followerCount: followerFor(index),
    account,
  }));
}

describe('quote and follower features', () => {
  it('parses quoted fields, a content link, and the follower count dated to the post', () => {
    const parsed = parsePostsJson(
      [
        {
          id: 'q1',
          created_at: '2026-10-20T12:00:00.000Z',
          kind: 'quote',
          lang: 'en',
          author_id: '111',
          account: '@aytunc',
          text: 'Worth reading https://t.co/content https://t.co/permalink',
          referenced_tweets: [{ id: 'quoted-1', type: 'quoted' }],
          entities: {
            urls: [
              {
                url: 'https://t.co/permalink',
                expanded_url: 'https://twitter.com/someone/status/quoted-1',
                display_url: 'x.com/someone/status',
              },
              {
                url: 'https://t.co/content',
                expanded_url: 'https://example.com/essay',
                display_url: 'example.com/essay',
              },
            ],
          },
          public_metrics: metrics(800),
          quoted: {
            id: 'quoted-1',
            author_id: '222',
            created_at: '2026-10-20T06:00:00.000Z',
            public_metrics: metrics(400),
            author_followers: 932,
            is_self_quote: false,
          },
          quoted_impressions: 400,
          quoted_author_followers: 932,
          quoted_post_age_at_quote_h: 6,
          follower_snapshots: [
            { at: '2026-01-01T00:00:00.000Z', followers: 100 },
            { at: '2026-10-01T00:00:00.000Z', followers: 250 },
            { at: '2026-12-01T00:00:00.000Z', followers: 900 },
          ],
        },
      ],
      'fallback',
    );
    const post = parsed[0]!;
    expect(post.account).toBe('aytunc');
    expect(post.text).toBe('Worth reading https://t.co/content');
    expect(post.followerCount).toBe(250);
    expect(post.quoted).toMatchObject({
      impressions: 400,
      authorFollowers: 932,
      ageHours: 6,
      selfQuote: false,
      metricsPresent: true,
    });

    const priors = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`,
      createdAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
      text: `okay sure note prior ${index}`,
      kind: 'original',
      lang: 'en',
      mediaType: null,
      impressions: 100,
      likes: 1,
      retweets: 0,
      replies: 0,
      quotes: 0,
      bookmarks: 0,
      followerCount: null,
    })) satisfies HistoryPost[];
    const prepared = prepareDataset([...priors, { ...post, createdAt: '2026-10-21T12:00:00.000Z' }], {
      timezone: 'UTC',
      asOf: new Date('2026-11-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
      quotedImpressions: true,
    });
    const row = prepared.rows.find((item) => item.id === 'q1')!;
    expect(row.features.q_present).toBe(1);
    expect(row.features.q_self).toBe(0);
    expect(row.features.q_log_followers).toBeCloseTo(Math.log1p(932), 6);
    expect(row.features.q_log_age_h).toBeCloseTo(Math.log1p(6), 6);
    expect(row.features.has_link).toBe(1);
    expect(row.features.q_rel_imp).toBeCloseTo(Math.log(401) - Math.log(100), 6);

    const hidden = prepareDataset([...priors, { ...post, createdAt: '2026-10-21T12:00:00.000Z' }], {
      timezone: 'UTC',
      asOf: new Date('2026-11-01T00:00:00.000Z'),
      minAgeDays: 0,
      window: 20,
      minHistory: 8,
    });
    expect(hidden.rows.find((item) => item.id === 'q1')!.features.q_rel_imp).toBe(0);
  });

  it('drops a follower count that does not vary inside the account and keeps one that does', () => {
    const asOf = new Date('2025-06-01T00:00:00.000Z');
    const constant = runBacktest(history(24, 'solo', () => 1000), { timezone: 'UTC', asOf, minAgeDays: 0 });
    const varying = runBacktest(history(24, 'solo', (index) => 1000 + index * 50), {
      timezone: 'UTC',
      asOf,
      minAgeDays: 0,
    });
    expect(constant.featuresUsed).not.toContain('log1p_followers');
    expect(varying.featuresUsed).toContain('log1p_followers');
    expect(constant.protocol.gate).toContain('raw MAE');
    expect(constant.protocol.gate).toContain('do not decide');
    expect(constant.featuresUsed).not.toContain('q_rel_imp');
  });

  it('uses quoted impressions only when the toggle is on', () => {
    const posts = history(24, 'solo', () => null).map((post, index) => ({
      ...post,
      kind: index % 2 === 0 ? 'quote' : 'original',
      quoted:
        index % 2 === 0
          ? {
              impressions: index % 4 === 0 ? 20 : 4000,
              authorFollowers: 50 + index,
              ageHours: index,
              selfQuote: index % 8 === 0,
              metricsPresent: true,
            }
          : null,
    }));
    const asOf = new Date('2025-06-01T00:00:00.000Z');
    const off = runBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 0 });
    const on = runBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 0, quotedImpressions: true });
    expect(off.featuresUsed).not.toContain('q_rel_imp');
    expect(on.featuresUsed).toContain('q_rel_imp');
    expect(on.protocol.quotedImpressions).toContain('leaky');
  });
});

describe('live posting context', () => {
  it('counts posts from the last three days for recency and leaves them out of the baseline', () => {
    const posts: HistoryPost[] = [
      {
        id: 'old',
        createdAt: '2024-01-01T00:00:00.000Z',
        text: 'okay sure note older post',
        kind: 'original',
        lang: 'en',
        mediaType: null,
        impressions: 100,
        likes: 1,
        retweets: 0,
        replies: 0,
        quotes: 0,
        bookmarks: 0,
        followerCount: null,
      },
      {
        id: 'today',
        createdAt: '2024-01-10T12:00:00.000Z',
        text: 'okay sure note posted today',
        kind: 'original',
        lang: 'en',
        mediaType: null,
        impressions: 99_999,
        likes: 1,
        retweets: 0,
        replies: 0,
        quotes: 0,
        bookmarks: 0,
        followerCount: null,
      },
    ];
    const prepared = prepareDataset(posts, {
      timezone: 'UTC',
      asOf: new Date('2024-01-10T18:00:00.000Z'),
      minAgeDays: 3,
      window: 20,
      minHistory: 8,
    });
    expect(prepared.eligible.map((post) => post.id)).toEqual(['old']);
    expect(prepared.dropped.too_recent).toBe(1);
    expect(prepared.nextContext.baselineImpressions).toBe(100);
    expect(prepared.nextContext.latestPostAt).toBe('2024-01-10T12:00:00.000Z');
    expect(prepared.nextContext.recentPostAts).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-10T12:00:00.000Z']);
  });
});

describe('pooled training', () => {
  const asOf = new Date('2025-06-01T00:00:00.000Z');

  it('splits each account on its own clock and adds an intercept for the other account', () => {
    const alpha = history(30, 'alpha', () => 1000);
    const beta = history(30, 'beta', () => 5000).map((post) => ({
      ...post,
      createdAt: new Date(Date.parse(post.createdAt) + 100 * 86400000).toISOString(),
    }));
    const report = runPooledBacktest([...alpha, ...beta], { timezone: 'UTC', asOf, minAgeDays: 0 });
    expect(report.referenceAccount).toBe('alpha');
    expect(report.followersIncluded).toBe(false);
    expect(report.featuresUsed).toContain('acct_beta');
    expect(report.featuresUsed.some((name) => name.includes('alpha'))).toBe(false);
    expect(report.featuresUsed).not.toContain('log1p_followers');
    for (const account of report.accounts) {
      expect(account.trainN).toBe(15);
      expect(account.testN).toBe(7);
    }
    expect(report.pooled.impressions.trainN).toBe(30);
    expect(report.pooled.impressions.testN).toBe(14);
    expect(String(report.protocol.shipping)).toContain('not stored');
  });

  it('matches the per-account fit when there is only one account', () => {
    const posts = history(40, 'aytunc', () => null);
    const report = runPooledBacktest(posts, { timezone: 'UTC', asOf, minAgeDays: 0 });
    expect(report.accounts).toHaveLength(1);
    expect(report.featuresUsed.some((name) => name.startsWith('acct_'))).toBe(false);
    expect(report.accounts[0]!.own.impressions.mae).toBe(report.accounts[0]!.pooled.impressions.mae);
    expect(report.accounts[0]!.own.impressions.spearman).toBe(report.pooled.impressions.spearman);
    expect(String(report.protocol.accountFeatures)).toContain('single account');
  });
});

describe('early engagement snapshots', () => {
  function series(count: number, at: (index: number) => { imp1: number; imp6: number; imp7: number }, account = 'lab') {
    const rows: unknown[] = [];
    for (let index = 0; index < count; index++) {
      const created_at = new Date(Date.UTC(2024, 0, 1) + index * 86400000).toISOString();
      const point = at(index);
      rows.push({ id: `s${index}`, account, created_at, age_h: 1, metrics: metrics(point.imp1) });
      rows.push({ post_id: `s${index}`, account, created_at, target: '6h', metrics: metrics(point.imp6) });
      rows.push({ tweet_id: `s${index}`, account, created_at, target: '7d', metrics: metrics(point.imp7) });
      rows.push({ id: `s${index}`, account, created_at, age_h: 24, metrics: metrics(point.imp7) });
    }
    rows.push({ id: 'odd', age_h: 3, metrics: metrics(10) });
    return rows;
  }

  it('accepts Supabase target names and ignores ages other than 1h, 6h, 24h, 48h, and 7d', () => {
    const parsed = parseSnapshotJson([
      { post_id: 'a', target: '1h', metrics: metrics(10) },
      { id: 'a', target: '7d', impression_count: 40 },
      { id: 'b', age_h: 3, metrics: metrics(1) },
    ]);
    expect(parsed.rows.map((row) => row.ageH).sort()).toEqual([1, 168]);
    expect(parsed.dropped.bad_age).toBe(1);
  });

  it('passes the log-MAE gate when the 6h snapshot carries the 7d outcome', () => {
    const report = runSnapshotBacktest(
      series(100, (index) => {
        const imp6 = index % 2 === 0 ? 100 : 10_000;
        return { imp1: 100, imp6, imp7: imp6 };
      }),
    );
    expect(report.modeledPosts).toBe(92);
    expect(report.impressions.passed).toBe(true);
    expect(report.impressions.maeLog!).toBeLessThan(report.impressions.baselineMaeLog! * 0.95);
    expect(report.featuresUsed).toContain('log_imp_6h_vs_1h');
    expect(report.featuresUsed).not.toContain('log_imp_24h_vs_base');
    expect(String(report.protocol.gate)).toContain('log-MAE');
    expect(String(report.protocol.shipping)).toContain('raw-MAE');
  });

  it('fails closed when 7d reach is exactly the 1h count times a constant', () => {
    const report = runSnapshotBacktest(
      series(100, (index) => {
        const imp1 = 200 + (index % 5) * 20;
        return { imp1, imp6: 40 + (index % 9) * 15, imp7: imp1 * 4 };
      }),
    );
    expect(report.impressions.passed).toBe(false);
    expect(report.impressions.reason.toLowerCase()).toContain('log-mae');
  });
});
