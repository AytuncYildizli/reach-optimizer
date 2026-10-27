import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parsePostsJson, type HistoryPost } from './dataset';
import { runBacktest, type BacktestReport, type TargetReport } from './model';
import { runPooledBacktest, type PooledBacktestReport } from './pooled';
import { runSnapshotBacktest, type SnapshotBacktestReport } from './snapshots';

function usage(): void {
  console.error(`Usage: pnpm --filter @reach/rules-engine backtest -- <posts.json> [more.json ...] [options]
       pnpm --filter @reach/rules-engine backtest -- --snapshots <snapshots.json> [options]

Options:
  --timezone <IANA>       Hour/day zone. Default UTC. Example: Europe/Istanbul
  --as-of <ISO>           Posts newer than as-of minus --min-age-days are excluded.
  --min-age-days <n>      Default 3.
  --out <file>            Write the full JSON report.
  --window <n>            Rolling baseline length. Default 20.
  --min-history <n>       Prior posts required before a row is modeled. Default 8.
  --account <name>        Account name when a single file has no account field.
  --pooled                Fit one model across accounts. Implied by more than one account.
  --quoted-impressions    Include fetch-time quoted impressions (partly leaky). Off by default.
  --snapshots <file>      Early-engagement rows {id, age_h or target, metrics}. Predicts 7d from 1h and 6h.
`);
}

function parseArgs(argv: string[]): { files: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  if (positional.length === 0 && !flags.snapshots) {
    usage();
    process.exit(1);
  }
  return { files: positional, flags };
}

function accountFromFilename(file: string): string {
  const base = basename(file).replace(/\.json$/i, '');
  const stripped = base
    .replace(/_posts(?:_enriched)?_[0-9a-f]{4,}$/i, '')
    .replace(/_posts_enriched$/i, '')
    .replace(/_posts$/i, '')
    .replace(/_enriched$/i, '');
  return stripped || base;
}

function n(value: number | null, digits: number): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return value.toFixed(digits);
}

function gain(model: number | null, baseline: number | null): string {
  if (model == null || baseline == null || !(baseline > 0)) return 'n/a';
  return `${(((baseline - model) / baseline) * 100).toFixed(1)}%`;
}

function printTarget(title: string, report: TargetReport, engagement: boolean): void {
  console.log(`\n${title}`);
  console.log(`  holdout n=${report.testN}  train n=${report.trainN}  gate=${report.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  ${report.reason}`);
  const maeDigits = engagement ? 4 : 0;
  console.log('  method                 Spearman    MAE');
  console.log(
    `  checklist score        ${n(report.checklistSpearman, 3).padStart(8)}    ${engagement ? 'n/a' : 'n/a (not on the impressions scale)'}`,
  );
  if (!engagement) {
    console.log(
      `  old multiplier chain   ${n(report.heuristicSpearman, 3).padStart(8)}    ${n(report.heuristicMae, maeDigits)}`,
    );
  }
  console.log(`  ridge model            ${n(report.spearman, 3).padStart(8)}    ${n(report.mae, maeDigits)}`);
  console.log(`  rolling median         ${n(report.baselineSpearman, 3).padStart(8)}    ${n(report.baselineMae, maeDigits)}`);
  console.log(`  median AE model/base   ${n(report.medianAe, maeDigits)} / ${n(report.baselineMedianAe, maeDigits)}`);
  if (!engagement) {
    console.log(
      `  log MAE model/base     ${n(report.maeLog, 3)} / ${n(report.baselineMaeLog, 3)}  (reported, not the gate; gain ${gain(report.maeLog, report.baselineMaeLog)})`,
    );
  }
  console.log(`  80% interval coverage  ${n(report.coverage80, 3)}`);
  if (report.topWeights.length > 0) {
    console.log(
      `  largest |weights|     ${report.topWeights.map((w) => `${w.name} ${w.weight.toFixed(3)}`).join(', ')}`,
    );
  }
}

function printReport(report: BacktestReport): void {
  console.log('ReachOS backtest (time-ordered; newer posts held out)');
  console.log(`eligible ${report.eligiblePosts}  modeled ${report.modeledPosts}  span ${report.span ? report.span.join(' → ') : 'n/a'}`);
  console.log(`dropped ${JSON.stringify(report.dropped)}`);
  console.log(
    `checklist on all eligible (n=${report.checklistAllEligible.n}): ` +
      `Spearman impressions ${n(report.checklistAllEligible.impressionsSpearman, 3)}, ` +
      `engagement ${n(report.checklistAllEligible.engagementSpearman, 3)}, ` +
      `automated-spam fires ${report.checklistAllEligible.automatedSpamPosts}`,
  );
  console.log(`features ${report.featuresUsed.length}`);
  console.log(`protocol ${JSON.stringify(report.protocol)}`);
  printTarget('Impressions', report.impressions, false);
  printTarget('Engagement rate', report.engagement, true);
  console.log(`\nlive forecast: ${report.snapshot.status}`);
  console.log(report.snapshot.reason);
}

function compact(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  if (Math.abs(value) > 0 && Math.abs(value) < 10) return value.toFixed(4);
  return value.toFixed(0);
}

function printLine(label: string, report: TargetReport): void {
  console.log(
    `    ${label.padEnd(22)} ρ ${n(report.spearman, 3).padStart(7)}  base ρ ${n(report.baselineSpearman, 3).padStart(7)}  MAE ${compact(report.mae).padStart(8)}  base ${compact(report.baselineMae).padStart(8)}  MAE gain ${gain(report.mae, report.baselineMae).padStart(7)}  log-MAE gain ${gain(report.maeLog, report.baselineMaeLog).padStart(7)}  ${report.passed ? 'PASS' : 'FAIL'}`,
  );
}

function printPooled(report: PooledBacktestReport): void {
  console.log('ReachOS pooled backtest (per-account baseline and 70/30 split, one ridge)');
  console.log(`accounts ${report.accounts.length}  reference ${report.referenceAccount ?? 'n/a'}  quoted impressions ${report.quotedImpressions ? 'on' : 'off'}  followers ${report.followersIncluded ? 'kept' : 'dropped'}`);
  console.log(`features ${report.featuresUsed.length}: ${report.featuresUsed.filter((name) => name.startsWith('acct_') || name.startsWith('q_') || name === 'has_link' || name === 'log1p_followers').join(', ') || '(no account, quote, link, or follower columns)'}`);
  for (const account of report.accounts) {
    console.log(
      `\n${account.account}  eligible ${account.eligiblePosts}  modeled ${account.modeledPosts}  train ${account.trainN}  test ${account.testN}  span ${account.span ? account.span.join(' → ') : 'n/a'}`,
    );
    console.log(`  dropped ${JSON.stringify(account.dropped)}`);
    printLine('own impressions', account.own.impressions);
    printLine('pooled impressions', account.pooled.impressions);
    printLine('own engagement', account.own.engagement);
    printLine('pooled engagement', account.pooled.engagement);
  }
  console.log('\nAll held-out posts, pooled model');
  printTarget('Impressions', report.pooled.impressions, false);
  printTarget('Engagement rate', report.pooled.engagement, true);
  console.log(`\nprotocol ${JSON.stringify(report.protocol)}`);
}

function printSnapshots(report: SnapshotBacktestReport): void {
  console.log('ReachOS early-engagement backtest (7d from 1h and 6h; gate is log-MAE vs 1h × median multiplier)');
  console.log(`modeled ${report.modeledPosts}  features ${report.featuresUsed.join(', ') || 'none'}`);
  console.log(`dropped ${JSON.stringify(report.dropped)}`);
  for (const account of report.accounts) {
    console.log(`\n${account.account}  modeled ${account.modeledPosts}  train ${account.trainN}  test ${account.testN}  1h multiplier ${n(account.multiplier, 3)}`);
    console.log(
      `  own     ρ ${n(account.own.spearman, 3)}  log-MAE ${n(account.own.maeLog, 3)} / ${n(account.own.baselineMaeLog, 3)}  gain ${gain(account.own.maeLog, account.own.baselineMaeLog)}  raw MAE gain ${gain(account.own.mae, account.own.baselineMae)}  ${account.own.passed ? 'PASS' : 'FAIL'}`,
    );
    console.log(`  ${account.own.reason}`);
  }
  console.log('\nGated result');
  console.log(`  holdout n=${report.impressions.testN}  train n=${report.impressions.trainN}  gate=${report.impressions.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  ${report.impressions.reason}`);
  console.log(
    `  log-MAE ${n(report.impressions.maeLog, 3)} vs baseline ${n(report.impressions.baselineMaeLog, 3)} (this is the gate)`,
  );
  console.log(
    `  raw MAE ${n(report.impressions.mae, 0)} vs baseline ${n(report.impressions.baselineMae, 0)} (reported only)`,
  );
  console.log(`protocol ${JSON.stringify(report.protocol)}`);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : `Could not read ${file}`);
    process.exit(1);
  }
}

const { files, flags } = parseArgs(process.argv.slice(2));
const asOf = flags['as-of'] ? new Date(flags['as-of']) : new Date();
if (Number.isNaN(asOf.getTime())) {
  console.error(`Invalid --as-of: ${flags['as-of']}`);
  process.exit(1);
}
const minAgeDays = flags['min-age-days'] ? Number(flags['min-age-days']) : undefined;
const window = flags.window ? Number(flags.window) : undefined;
const minHistory = flags['min-history'] ? Number(flags['min-history']) : undefined;
const quotedImpressions = flags['quoted-impressions'] === 'true';

let report: BacktestReport | PooledBacktestReport | SnapshotBacktestReport;
if (flags.snapshots) {
  report = runSnapshotBacktest(readJson(flags.snapshots), {
    window,
    minHistory,
    account: flags.account,
  });
  printSnapshots(report);
} else {
  const posts: HistoryPost[] = [];
  for (const file of files) {
    const fallback = files.length === 1 ? (flags.account ?? accountFromFilename(file)) : accountFromFilename(file);
    posts.push(...parsePostsJson(readJson(file), fallback));
  }
  const accounts = new Set(posts.map((post) => post.account).filter((account): account is string => !!account));
  const pooled = flags.pooled === 'true' || accounts.size > 1;
  if (pooled) {
    report = runPooledBacktest(posts, {
      timezone: flags.timezone,
      asOf,
      minAgeDays,
      window,
      minHistory,
      quotedImpressions,
    });
    printPooled(report);
  } else {
    report = runBacktest(posts, {
      timezone: flags.timezone,
      asOf,
      minAgeDays,
      window,
      minHistory,
      quotedImpressions,
    });
    printReport(report);
  }
}

if (flags.out) writeFileSync(flags.out, JSON.stringify(report, null, 2));
