import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_MAE_IMPROVEMENT, MIN_TEST, MIN_TRAIN } from '../forecast/model';
import { historyToJson, importHistory } from '../forecast/import-archive';
import { parsePostsJson } from '../forecast/dataset';
import { buildAccountFeatures, hashtagCount, score, trainAccountModel } from '../forecast/account-model';
import { externalLinkCount } from '../forecast/features';
import { archiveShapedPosts, driftPosts, signalPosts } from './fixtures/synthetic-reach';
import { runStudy } from '../forecast/study';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);
const packageRoot = join(here, '..', '..');

const TRAIN = {
  timezone: 'UTC',
  asOf: new Date('2026-06-01T00:00:00.000Z'),
  minAgeDays: 0,
  account: 'aytunc',
  trainedAt: new Date('2026-06-01T00:00:00.000Z'),
};

describe('archive import', () => {
  it('joins tweets.js with a metrics CSV and drops retweets, replies, and rows without impressions', () => {
    const result = importHistory({
      archiveText: readFileSync(fixture('tweets.js'), 'utf8'),
      metricsText: readFileSync(fixture('metrics.csv'), 'utf8'),
    });
    expect(result.account).toBe('aytunc');
    expect(result.stats.archiveTweets).toBe(6);
    expect(result.stats.droppedRetweet).toBe(1);
    expect(result.stats.droppedReply).toBe(1);
    expect(result.stats.missingMetrics).toBe(1);
    expect(result.stats.kept).toBe(3);
    const byId = new Map(result.posts.map((post) => [post.id, post]));
    expect(byId.get('1001')).toMatchObject({
      kind: 'original',
      mediaType: 'image',
      impressions: 1200,
      likes: 40,
      retweets: 6,
      replies: 3,
      bookmarks: 5,
      account: 'aytunc',
    });
    expect(byId.get('1001')?.text).toContain('https://t.co/abc');
    expect(byId.get('1001')?.text).not.toContain('https://t.co/pic');
    expect(byId.get('1004')).toMatchObject({ kind: 'reply', selfReply: true, impressions: 450 });
    expect(byId.get('1005')).toMatchObject({ kind: 'quote', impressions: 900, bookmarks: 3 });
    expect(byId.get('1005')?.text).toContain('https://t.co/extlnk');
    expect(byId.get('1005')?.text).not.toContain('https://t.co/qtlink');
    expect(byId.get('1005')?.text).not.toContain('x.com/someone/status/77');
    expect(externalLinkCount(byId.get('1005')?.text ?? '')).toBe(1);
    expect(externalLinkCount(byId.get('1001')?.text ?? '')).toBe(1);
    expect(externalLinkCount('photo only https://x.com/aytunc/status/1001/photo/1')).toBe(0);

    const roundTrip = parsePostsJson(historyToJson(result.posts));
    expect(roundTrip.find((post) => post.id === '1004')?.selfReply).toBe(true);
    expect(roundTrip.find((post) => post.id === '1001')?.bookmarks).toBe(5);
  });

  it('accepts JSON metrics with quoted text and refuses an archive that has no metrics file', () => {
    const metrics = JSON.stringify([
      {
        id: '9',
        full_text: 'Hello, "world"',
        created_at: '2024-02-02T10:00:00.000Z',
        public_metrics: { impression_count: 10, like_count: 1, retweet_count: 0, reply_count: 0, bookmark_count: 2 },
      },
    ]);
    const onlyMetrics = importHistory({ metricsText: metrics, account: 'aytunc' });
    expect(onlyMetrics.posts).toHaveLength(1);
    expect(onlyMetrics.posts[0]).toMatchObject({ text: 'Hello, "world"', impressions: 10, bookmarks: 2 });
    expect(() => importHistory({ archiveText: 'window.YTD.tweets.part0 = []' })).toThrow(/impressions/);
  });
});

describe('account features', () => {
  it('counts hashtags and topic overlap without treating the hash as a topic token', () => {
    expect(hashtagCount('see #Build and #ikinci plus https://example.com/#frag')).toBe(2);
    const features = buildAccountFeatures({
      text: 'A launch note #build',
      createdAt: new Date('2024-01-03T18:00:00.000Z'),
      timeZone: 'UTC',
      hasImage: true,
      hasVideo: false,
      isQuote: false,
      isThread: true,
      recentTopics: ['launch', 'other'],
    });
    expect(features.hashtag_count).toBe(1);
    expect(features.has_image).toBe(1);
    expect(features.is_thread).toBe(1);
    expect(features.topic_overlap).toBeGreaterThan(0);
    expect(features.hour_sin).toBeCloseTo(Math.sin((2 * Math.PI * 18) / 24));
  });
});

describe('synthetic reach fixture', () => {
  it('keeps the published gate', () => {
    expect(MIN_TRAIN).toBe(40);
    expect(MIN_TEST).toBe(20);
    expect(MIN_MAE_IMPROVEMENT).toBe(0.05);
  });

  it('scores a range when content features beat the rolling median, and withholds them when they do not', () => {
    const signal = trainAccountModel(signalPosts(), TRAIN);
    const validation = signal.model.validation;
    expect(signal.model.config).toBeTruthy();
    expect(signal.model.selection.map((row) => row.config)).toContain(signal.model.config);
    expect(signal.model.status).toBe('calibrated');
    expect(validation.passed).toBe(true);
    expect(validation.trainN).toBeGreaterThanOrEqual(MIN_TRAIN);
    expect(validation.testN).toBeGreaterThanOrEqual(MIN_TEST);
    expect(validation.spearman).toBeGreaterThan(0);
    expect(validation.baselineMae).toBeGreaterThan(0);
    expect(validation.mae).toBeLessThan(validation.baselineMae! * (1 - MIN_MAE_IMPROVEMENT));
    expect(validation.spearman!).toBeGreaterThan(validation.baselineSpearman ?? -1);
    expect(validation.coverage80).toBeGreaterThan(0);
    expect(validation.coverage80).toBeLessThanOrEqual(1);

    const now = new Date('2026-06-02T09:00:00.000Z');
    const text = 'signal note 999 plain for the log';
    const withImage = score(text, { model: signal.model, hasMedia: true, mediaType: 'image', now });
    const noImage = score(text, { model: signal.model, hasMedia: false, now });
    expect(withImage.status).toBe('scored');
    expect(noImage.status).toBe('scored');
    expect(withImage.range).not.toBeNull();
    expect(withImage.range!.low).toBeLessThanOrEqual(withImage.range!.high);
    expect(withImage.range!.low).toBeGreaterThan(noImage.range!.low);
    expect(withImage.confidence).toBeGreaterThan(0);
    expect(withImage.confidence).toBeLessThanOrEqual(1);
    expect(withImage.topFactors.some((factor) => factor.name === 'image')).toBe(true);
    expect(noImage.suggestions.some((suggestion) => suggestion.id === 'add-image')).toBe(true);
    for (const suggestion of withImage.suggestions) {
      expect(suggestion.text.length).toBeGreaterThan(0);
      expect(suggestion.text).not.toContain(text);
      expect(suggestion.range).not.toBeNull();
    }

    const forced = { ...signal.model, status: 'uncalibrated' as const, reason: 'forced' };
    const hidden = score(text, { model: forced, hasMedia: true, mediaType: 'image', now });
    expect(hidden.status).toBe('withheld');
    expect(hidden.range).toBeNull();
    expect(hidden.confidence).toBe(0);
    expect(hidden.suggestions).toEqual([]);
    expect(JSON.stringify(hidden)).not.toMatch(/"low"/);

    const drift = trainAccountModel(driftPosts(), TRAIN);
    expect(drift.model.status).toBe('uncalibrated');
    expect(drift.model.weights.length + (drift.model.boost?.trees.length ?? 0)).toBeGreaterThan(0);
    expect(drift.model.config).toBeTruthy();
    const driftScore = score(text, { model: drift.model, hasMedia: true, now });
    expect(driftScore.status).toBe('withheld');
    expect(driftScore.range).toBeNull();
    expect(driftScore.suggestions).toEqual([]);

    const missing = score(text, {});
    expect(missing.status).toBe('withheld');
    expect(missing.range).toBeNull();
  });

  it('selects on a training slice for an archive-shaped series and keeps weights if the gate fails', () => {
    const posts = archiveShapedPosts();
    const quote = posts.find((post) => post.kind === 'quote');
    expect(externalLinkCount(quote?.text ?? '')).toBe(0);
    expect(externalLinkCount(posts.find((post) => post.text.includes('example.com'))?.text ?? '')).toBe(1);
    const trained = trainAccountModel(posts, TRAIN);
    const study = runStudy(
      posts.map((post) => ({ ...post, account: 'aytunc' })),
      { timezone: 'UTC', asOf: TRAIN.asOf, minAgeDays: 0, trainFraction: 0.7 },
    );
    expect(trained.model.config).toBe(study.chosen);
    expect(trained.model.validation.passed).toBe(study.holdout.passed);
    expect(trained.model.weights.length + (trained.model.boost?.trees.length ?? 0)).toBeGreaterThan(0);
    const scored = score('archive note 999', { model: trained.model, now: TRAIN.asOf });
    if (trained.model.status === 'calibrated') {
      expect(scored.range).not.toBeNull();
    } else {
      expect(scored.status).toBe('withheld');
      expect(scored.range).toBeNull();
    }
  });
});

describe('reach CLI', () => {
  it('imports, trains, and scores without printing the draft as a rewrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'reachos-'));
    const postsPath = join(dir, 'posts.json');
    const modelPath = join(dir, 'model.json');
    const tsx = join(packageRoot, 'node_modules', '.bin', 'tsx');
    const cli = join(packageRoot, 'src', 'forecast', 'reach-cli.ts');
    const run = (args: string[]) =>
      execFileSync(tsx, [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });

    const imported = run([
      '--',
      'import',
      '--archive',
      fixture('tweets.js'),
      '--metrics',
      fixture('metrics.csv'),
      '--out',
      postsPath,
      '--json',
    ]);
    const importSummary = JSON.parse(imported);
    expect(importSummary.kept).toBe(3);

    writeFileSync(postsPath, `${JSON.stringify(historyToJson(signalPosts()), null, 2)}\n`);

    const trained = run([
      'train',
      '--posts',
      postsPath,
      '--timezone',
      'UTC',
      '--account',
      'aytunc',
      '--as-of',
      '2026-06-01T00:00:00.000Z',
      '--min-age-days',
      '0',
      '--out',
      modelPath,
      '--json',
    ]);
    const summary = JSON.parse(trained);
    expect(summary.status).toBe('calibrated');
    expect(summary.mae).toBeLessThan(summary.baselineMae * (1 - MIN_MAE_IMPROVEMENT));

    const scored = run([
      'score',
      '--model',
      modelPath,
      '--text',
      'signal note 999 plain for the log',
      '--media',
      'image',
      '--now',
      '2026-06-02T09:00:00.000Z',
      '--json',
    ]);
    const scoreBody = JSON.parse(scored);
    expect(scoreBody.status).toBe('scored');
    expect(scoreBody.range.low).toBeLessThanOrEqual(scoreBody.range.high);
    expect(scored).not.toContain('rewritten');
  });
});
