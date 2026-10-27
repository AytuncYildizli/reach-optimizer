import { readFileSync, writeFileSync } from 'node:fs';
import { parsePostsJson } from './dataset';
import { runBacktest, type BacktestReport, type TargetReport } from './model';

function usage(): void {
  console.error(`Usage: pnpm --filter @reach/rules-engine backtest -- <posts.json> [options]

Options:
  --timezone <IANA>     Hour/day zone. Default UTC. Example: Europe/Istanbul
  --as-of <ISO>         Posts newer than as-of minus --min-age-days are excluded.
  --min-age-days <n>    Default 3.
  --out <file>          Write the full JSON report.
  --window <n>          Rolling baseline length. Default 20.
  --min-history <n>     Prior posts required before a row is modeled. Default 8.
`);
}

function parseArgs(argv: string[]): { file: string; flags: Record<string, string> } {
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
  const file = positional[0];
  if (!file) {
    usage();
    process.exit(1);
  }
  return { file, flags };
}

function n(value: number | null, digits: number): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return value.toFixed(digits);
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
    console.log(`  log MAE model/base     ${n(report.maeLog, 3)} / ${n(report.baselineMaeLog, 3)}`);
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
  console.log(`protocol ${JSON.stringify(report.protocol)}`);
  printTarget('Impressions', report.impressions, false);
  printTarget('Engagement rate', report.engagement, true);
  console.log(`\nlive forecast: ${report.snapshot.status}`);
  console.log(report.snapshot.reason);
}

const { file, flags } = parseArgs(process.argv.slice(2));
const asOf = flags['as-of'] ? new Date(flags['as-of']) : new Date();
if (Number.isNaN(asOf.getTime())) {
  console.error(`Invalid --as-of: ${flags['as-of']}`);
  process.exit(1);
}
const minAgeDays = flags['min-age-days'] ? Number(flags['min-age-days']) : undefined;
const window = flags.window ? Number(flags.window) : undefined;
const minHistory = flags['min-history'] ? Number(flags['min-history']) : undefined;

let data: unknown;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not read posts JSON');
  process.exit(1);
}

const posts = parsePostsJson(data);
const report = runBacktest(posts, {
  timezone: flags.timezone,
  asOf,
  minAgeDays,
  window,
  minHistory,
});
printReport(report);
if (flags.out) writeFileSync(flags.out, JSON.stringify(report, null, 2));
