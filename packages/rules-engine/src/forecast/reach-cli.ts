import { readFileSync, writeFileSync } from 'node:fs';
import { importHistory, historyToJson } from './import-archive';
import { parseAccountModel, score, trainAccountModel } from './account-model';
import { parsePostsJson } from './dataset';
import type { DraftScoreMeta } from '@reach/shared-types';

/**
 * Local import / train / score for one account.
 * Reads files the owner passes. Does not call X, does not post, and does not open a database.
 */

function usage(): void {
  console.error(`Usage:
  pnpm --filter @reach/rules-engine reach -- import --archive tweets.js --metrics metrics.csv --account aytunc --out posts.json
  pnpm --filter @reach/rules-engine reach -- train --posts posts.json --timezone Europe/Istanbul --account aytunc --out model.json
  pnpm --filter @reach/rules-engine reach -- score --model model.json --text "draft" --media image --json

import reads an X archive (tweets.js) plus a CSV or JSON metrics file.
train fits log impressions and withholds the model unless it beats the rolling median.
score prints a range, or status withheld. It does not rewrite the draft.
`);
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string | string[]> } {
  // pnpm 10 forwards the `--` that separates the script name from its args.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const command = args[0] && !args[0].startsWith('--') ? args[0] : '';
  const rest = command ? args.slice(1) : args;
  const flags: Record<string, string | string[]> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      console.error(`Unexpected argument: ${arg}`);
      usage();
      process.exit(1);
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = 'true';
    } else if (key === 'archive') {
      const list = Array.isArray(flags.archive) ? flags.archive : [];
      list.push(next);
      flags.archive = list;
      i++;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags };
}

function flagString(flags: Record<string, string | string[]>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

function readFlagFile(flags: Record<string, string | string[]>, key: string): string | undefined {
  const path = flagString(flags, key);
  if (!path) return undefined;
  return readFileSync(path, 'utf8');
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function importCommand(flags: Record<string, string | string[]>): void {
  const archives = Array.isArray(flags.archive) ? flags.archive : [];
  const metricsPath = flagString(flags, 'metrics');
  if (archives.length === 0 && !metricsPath) {
    console.error('import needs --metrics, and --archive tweets.js when you have the X archive.');
    process.exit(1);
  }
  const archiveText = archives.map((file) => readFileSync(file, 'utf8')).join('\n');
  const metricsText = metricsPath ? readFileSync(metricsPath, 'utf8') : undefined;
  const result = importHistory({
    archiveText: archiveText || undefined,
    metricsText,
    account: flagString(flags, 'account'),
  });
  const out = flagString(flags, 'out');
  if (out) writeFileSync(out, `${JSON.stringify(historyToJson(result.posts), null, 2)}\n`);
  const summary = { account: result.account, ...result.stats, wrote: out ?? null };
  if (flagString(flags, 'json') === 'true' || flags.json === 'true') printJson(summary);
  else {
    console.log(
      `account ${result.account}  kept ${result.stats.kept}  archive ${result.stats.archiveTweets}  metrics ${result.stats.metricRows}`,
    );
    console.log(
      `dropped retweets ${result.stats.droppedRetweet}  replies ${result.stats.droppedReply}  missing metrics ${result.stats.missingMetrics}  empty ${result.stats.empty}`,
    );
    if (out) console.log(`wrote ${out}`);
  }
}

function trainCommand(flags: Record<string, string | string[]>): void {
  const postsPath = flagString(flags, 'posts');
  if (!postsPath) {
    console.error('train needs --posts <file.json>.');
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(postsPath, 'utf8'));
  } catch {
    console.error('Posts file is not JSON.');
    process.exit(1);
  }
  const posts = parsePostsJson(parsed, flagString(flags, 'account'));
  const fraction = flagString(flags, 'train-fraction');
  const minAge = flagString(flags, 'min-age-days');
  const window = flagString(flags, 'window');
  const minHistory = flagString(flags, 'min-history');
  const asOf = flagString(flags, 'as-of');
  const result = trainAccountModel(posts, {
    timezone: flagString(flags, 'timezone') ?? 'UTC',
    account: flagString(flags, 'account'),
    asOf: asOf ? new Date(asOf) : undefined,
    minAgeDays: minAge ? Number(minAge) : undefined,
    window: window ? Number(window) : undefined,
    minHistory: minHistory ? Number(minHistory) : undefined,
    trainFraction: fraction ? Number(fraction) : undefined,
  });
  const out = flagString(flags, 'out');
  if (out) writeFileSync(out, `${JSON.stringify(result.model, null, 2)}\n`);
  const validation = result.model.validation;
  const summary = {
    status: result.model.status,
    account: result.model.account,
    eligiblePosts: result.eligiblePosts,
    modeledPosts: result.modeledPosts,
    trainN: validation.trainN,
    testN: validation.testN,
    spearman: validation.spearman,
    baselineSpearman: validation.baselineSpearman,
    mae: validation.mae,
    baselineMae: validation.baselineMae,
    maeLog: validation.maeLog,
    baselineMaeLog: validation.baselineMaeLog,
    coverage80: validation.coverage80,
    featuresUsed: result.featuresUsed,
    config: result.model.config,
    topWeights: result.model.topWeights,
    reason: result.model.reason,
    wrote: out ?? null,
  };
  if (flags.json === 'true') printJson(summary);
  else {
    console.log(`status ${result.model.status}  account ${result.model.account}  config ${result.model.config}`);
    console.log(`eligible ${result.eligiblePosts}  modeled ${result.modeledPosts}  train ${validation.trainN}  test ${validation.testN}`);
    console.log(`Spearman ${fmt(validation.spearman)} vs baseline ${fmt(validation.baselineSpearman)}`);
    console.log(`MAE ${fmt(validation.mae)} vs baseline ${fmt(validation.baselineMae)}`);
    console.log(`log-MAE ${fmt(validation.maeLog)} vs baseline ${fmt(validation.baselineMaeLog)}`);
    console.log(`80% coverage ${fmt(validation.coverage80)}`);
    if (result.model.topWeights.length > 0) {
      console.log(
        `top weights ${result.model.topWeights
          .slice(0, 8)
          .map((item) => `${item.name} ${item.weight.toFixed(3)}`)
          .join(', ')}`,
      );
    }
    console.log(result.model.reason);
    if (out) console.log(`wrote ${out}`);
  }
}

function scoreCommand(flags: Record<string, string | string[]>): void {
  const modelPath = flagString(flags, 'model');
  const text = flagString(flags, 'text') ?? (flagString(flags, 'text-file') ? readFlagFile(flags, 'text-file') : undefined);
  if (!modelPath || text == null) {
    console.error('score needs --model <model.json> and --text or --text-file.');
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(modelPath, 'utf8'));
  } catch {
    console.error('Model file is not JSON.');
    process.exit(1);
  }
  const model = parseAccountModel(raw);
  if (!model) {
    const result = score(text, { model: null });
    if (flags.json === 'true') printJson({ ...result, reason: 'This file is not an account reach model.' });
    else console.log('status withheld');
    console.error('This file is not an account reach model.');
    process.exit(1);
  }
  const media = flagString(flags, 'media');
  const meta: DraftScoreMeta = {
    model,
    now: flagString(flags, 'now'),
    isQuote: flags.quote === 'true',
    isThread: flags.thread === 'true',
  };
  if (media === 'image' || media === 'video' || media === 'gif' || media === 'poll') {
    meta.mediaType = media;
    meta.hasMedia = media !== 'poll';
  } else if (media === 'none') {
    meta.hasMedia = false;
  }
  const result = score(text, meta);
  if (flags.json === 'true') printJson(result);
  else if (result.status === 'withheld') {
    console.log('status withheld');
    console.log(result.reason);
  } else {
    console.log(`status scored  range ${result.range?.low}–${result.range?.high}  confidence ${result.confidence}`);
    if (result.topFactors.length > 0) {
      console.log(result.topFactors.map((factor) => `${factor.name} ${factor.direction}`).join(', '));
    }
    for (const suggestion of result.suggestions) {
      const range = suggestion.range ? `  range ${suggestion.range.low}–${suggestion.range.high}` : '';
      console.log(`- ${suggestion.text}${range}`);
    }
  }
}

function fmt(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function main(): void {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'import') importCommand(flags);
  else if (command === 'train') trainCommand(flags);
  else if (command === 'score') scoreCommand(flags);
  else {
    usage();
    process.exit(1);
  }
}

main();
