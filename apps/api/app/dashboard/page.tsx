import { prisma } from '@lib/db';
import { CopyButton } from './CopyButton';
import { TweetRow } from './TweetRow';
import { analyzeRulePerformance } from '@lib/weight-learner';
import { generateCalibrationReport, type CalibrationReport } from '@lib/calibration';
import pg from 'pg';

export const metadata = {
  title: 'ReachOS Dashboard',
  description: 'Tweet analytics and optimization dashboard',
};

// Force Node.js runtime for Prisma
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// -- Color tokens --
const colors = {
  bg: '#000000',
  card: '#16181c',
  border: '#2f3336',
  textPrimary: '#e7e9ea',
  textSecondary: '#71767b',
  green: '#00ba7c',
  blue: '#1d9bf0',
  yellow: '#ffd400',
  red: '#f4212e',
};

// -- Helpers --

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function scoreColor(score: number): string {
  if (score >= 80) return colors.green;
  if (score >= 60) return colors.blue;
  if (score >= 40) return colors.yellow;
  return colors.red;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

function formatRuleId(ruleId: string): string {
  return ruleId
    .replace(/^(hook|structure|engagement|penalty|bonus)-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// -- Suggestion templates (static for MVP, no AI call needed) --

const dailySuggestions = [
  {
    text: 'Hot take: Most "productivity hacks" are just procrastination with extra steps. The real hack? Do the hard thing first. Every. Single. Day.',
    predictedScore: 87,
  },
  {
    text: 'I analyzed 500 viral tweets this week. The pattern is dead simple:\n\n1. Bold claim\n2. Social proof\n3. Actionable takeaway\n\nStop overthinking. Start posting.',
    predictedScore: 82,
  },
  {
    text: "Unpopular opinion: Your audience doesn't care about your credentials. They care about your transformation. Share the journey, not the resume.",
    predictedScore: 79,
  },
  {
    text: "The algorithm rewards consistency, not perfection.\n\n7 good tweets > 1 perfect tweet.\n\nShip daily. Iterate weekly. That's the playbook.",
    predictedScore: 84,
  },
  {
    text: 'Thread idea: "5 things I learned losing 80% of my followers"\n\nVulnerability + lessons = engagement gold.',
    predictedScore: 76,
  },
];

// -- Component --

export default async function DashboardPage() {
  let tweets: Awaited<ReturnType<typeof fetchTweets>> = [];
  let dbError = false;

  try {
    tweets = await fetchTweets();
  } catch {
    dbError = true;
  }

  // Fetch optimized tweets from ops DB (yellow-jacket)
  let opsTweets: Array<{
    id: number;
    text: string;
    score: number;
    status: string;
    hook_type: string;
    char_count: number;
    created_at: string;
  }> = [];
  try {
    if (process.env.OPS_DATABASE_URL) {
      const opsClient = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL });
      await opsClient.connect();
      const { rows } = await opsClient.query(`
        SELECT id, tweet_text as text, rating as score, status, hook_type,
               char_count, created_at
        FROM tweets
        WHERE rating IS NOT NULL
        ORDER BY rating DESC
        LIMIT 20
      `);
      opsTweets = rows;
      await opsClient.end();
    }
  } catch (e) {
    console.error('Ops DB error:', e);
  }

  // Stats
  const totalTweets = tweets.length;
  const avgScore =
    totalTweets > 0
      ? Math.round(tweets.reduce((s, t) => s + t.reachScore, 0) / totalTweets)
      : 0;
  const avgViews =
    totalTweets > 0
      ? Math.round(
          tweets.reduce((s, t) => s + (t.metrics[0]?.views ?? 0), 0) /
            totalTweets,
        )
      : 0;

  // Learning Insights data
  let rulePerformance: Awaited<ReturnType<typeof analyzeRulePerformance>> = [];
  try {
    rulePerformance = await analyzeRulePerformance();
  } catch {
    // Non-critical, skip if fails
  }

  // Calibration data
  let calibration: CalibrationReport | null = null;
  try {
    calibration = await generateCalibrationReport();
  } catch {
    // Non-critical, skip if fails
  }
  const topPositive = rulePerformance.filter((r) => r.lift > 0).slice(0, 5);
  const topNegative = rulePerformance.filter((r) => r.lift < 0).slice(0, 5);

  const optimizedTweets = tweets.filter((t) => t.optimized);
  const nonOptimized = tweets.filter((t) => !t.optimized);
  const avgOptimized =
    optimizedTweets.length > 0
      ? optimizedTweets.reduce((s, t) => s + t.reachScore, 0) /
        optimizedTweets.length
      : 0;
  const avgNonOptimized =
    nonOptimized.length > 0
      ? nonOptimized.reduce((s, t) => s + t.reachScore, 0) /
        nonOptimized.length
      : 0;
  const impact =
    avgNonOptimized > 0
      ? Math.round(((avgOptimized - avgNonOptimized) / avgNonOptimized) * 100)
      : 0;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoRow}>
            <span style={styles.logoDot} />
            <h1 style={styles.logoText}>ReachOS Dashboard</h1>
          </div>
          <span style={styles.betaBadge}>BETA</span>
        </div>
      </header>

      <main style={styles.main}>
        {/* Stats Bar */}
        <section style={styles.statsBar}>
          <StatCard label="Tweets Tracked" value={String(totalTweets)} />
          <StatCard
            label="Avg Reach Score"
            value={totalTweets > 0 ? String(avgScore) : '--'}
            color={totalTweets > 0 ? scoreColor(avgScore) : colors.textSecondary}
          />
          <StatCard
            label="Avg Views"
            value={totalTweets > 0 ? formatNumber(avgViews) : '--'}
          />
          <StatCard
            label="Optimization Impact"
            value={impact > 0 ? `+${impact}%` : impact === 0 ? '--' : `${impact}%`}
            color={impact > 0 ? colors.green : impact < 0 ? colors.red : colors.textSecondary}
          />
        </section>

        {/* Tweet List */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Tweets</h2>
          {dbError ? (
            <div style={styles.emptyState}>
              <p style={{ color: colors.yellow, margin: 0 }}>
                Unable to connect to database. Showing empty state.
              </p>
            </div>
          ) : totalTweets === 0 ? (
            <div style={styles.emptyState}>
              <p style={{ color: colors.textSecondary, margin: 0 }}>
                No tracked tweets yet. Use the ReachOS extension to start
                tracking your posts.
              </p>
            </div>
          ) : (
            <div style={styles.tweetList}>
              {tweets.map((tweet) => {
                const m = tweet.metrics[0];
                return (
                  <div key={tweet.id} style={styles.tweetCard}>
                    <div style={styles.tweetHeader}>
                      <span
                        style={{
                          ...styles.scoreBadge,
                          backgroundColor: scoreColor(tweet.reachScore) + '22',
                          color: scoreColor(tweet.reachScore),
                          border: `1px solid ${scoreColor(tweet.reachScore)}44`,
                        }}
                      >
                        {tweet.reachScore}
                      </span>
                      {tweet.optimized && (
                        <span style={styles.optimizedBadge}>Optimized</span>
                      )}
                      <span style={styles.timeAgo}>
                        {relativeTime(tweet.postedAt)}
                      </span>
                    </div>
                    <p style={styles.tweetContent}>
                      {truncate(tweet.content, 180)}
                    </p>
                    {m && (
                      <div style={styles.metricsRow}>
                        <MetricPill icon="👁" label="Views" value={m.views} />
                        <MetricPill icon="♥" label="Likes" value={m.likes} />
                        <MetricPill icon="💬" label="Replies" value={m.replies} />
                        <MetricPill icon="🔖" label="Bookmarks" value={m.bookmarks} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Optimization Leaderboard */}
        {opsTweets.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Optimization Leaderboard</h2>
            <p style={{ color: colors.textSecondary, margin: '0 0 12px 0', fontSize: 14 }}>
              Top optimized tweets from ops pipeline — sorted by score
            </p>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap' as const,
              gap: 16,
              marginBottom: 20,
            }}>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Total Optimized</span>
                <span style={{ color: colors.green, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                  {opsTweets.length}
                </span>
              </div>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Avg Score</span>
                <span style={{
                  color: scoreColor(Math.round(opsTweets.reduce((s, t) => s + (t.score || 0), 0) / opsTweets.length)),
                  fontSize: 28, fontWeight: 700, lineHeight: 1.2,
                }}>
                  {Math.round(opsTweets.reduce((s, t) => s + (t.score || 0), 0) / opsTweets.length)}
                </span>
              </div>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Best Score</span>
                <span style={{
                  color: scoreColor(Math.max(...opsTweets.map(t => t.score || 0))),
                  fontSize: 28, fontWeight: 700, lineHeight: 1.2,
                }}>
                  {Math.max(...opsTweets.map(t => t.score || 0))}
                </span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse' as const,
                fontSize: 14,
              }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ ...styles.tableHeader, width: 60 }}>Score</th>
                    <th style={styles.tableHeader}>Tweet</th>
                    <th style={{ ...styles.tableHeader, width: 100 }}>Hook</th>
                    <th style={{ ...styles.tableHeader, width: 90 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {opsTweets.map((t) => (
                    <TweetRow
                      key={t.id}
                      text={t.text || ''}
                      score={t.score || 0}
                      hookType={t.hook_type}
                      status={t.status}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Learning Insights */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Learning Insights</h2>
          <p style={{ color: colors.textSecondary, margin: '0 0 16px 0', fontSize: 14 }}>
            {rulePerformance.length > 0
              ? 'Your scoring is getting smarter with every tweet you post.'
              : 'Post and track more tweets to unlock personalized scoring insights.'}
          </p>

          {rulePerformance.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 16, marginBottom: 20 }}>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Rules Analyzed</span>
                <span style={{ color: colors.blue, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                  {rulePerformance.length}
                </span>
              </div>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Positive Signals</span>
                <span style={{ color: colors.green, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                  {topPositive.length}
                </span>
              </div>
              <div style={styles.statCard}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>Negative Signals</span>
                <span style={{ color: colors.red, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                  {topNegative.length}
                </span>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <p style={{ color: colors.textSecondary, margin: 0 }}>
                Need at least 5 tracked tweets with engagement metrics to start learning.
              </p>
            </div>
          )}

          {topPositive.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.green, margin: '0 0 10px 0' }}>
                Top Rules That Boost Performance
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {topPositive.map((rule) => (
                  <div
                    key={rule.ruleId}
                    style={{
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      padding: '10px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: colors.textPrimary, fontSize: 14 }}>
                      {formatRuleId(rule.ruleId)}
                    </span>
                    <span style={{ color: colors.green, fontSize: 14, fontWeight: 600 }}>
                      +{rule.lift} lift ({rule.timesTriggered} tweets)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topNegative.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.red, margin: '0 0 10px 0' }}>
                Rules That Hurt Performance
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {topNegative.map((rule) => (
                  <div
                    key={rule.ruleId}
                    style={{
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      padding: '10px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: colors.textPrimary, fontSize: 14 }}>
                      {formatRuleId(rule.ruleId)}
                    </span>
                    <span style={{ color: colors.red, fontSize: 14, fontWeight: 600 }}>
                      {rule.lift} lift ({rule.timesTriggered} tweets)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Score Calibration */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Score Calibration</h2>
          <p style={{ color: colors.textSecondary, margin: '0 0 16px 0', fontSize: 14 }}>
            {calibration?.status === 'ready'
              ? 'How well our predicted scores match real-world tweet performance.'
              : 'Need more tweets with engagement data to calibrate scoring accuracy.'}
          </p>

          {calibration?.status === 'ready' && calibration.correlation ? (
            <>
              {/* Calibration Stats */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 16, marginBottom: 20 }}>
                <div style={styles.statCard}>
                  <span style={{ color: colors.textSecondary, fontSize: 13 }}>Correlation (r)</span>
                  <span style={{
                    color: Math.abs(calibration.correlation.pearson) >= 0.5 ? colors.green
                      : Math.abs(calibration.correlation.pearson) >= 0.3 ? colors.yellow
                      : colors.red,
                    fontSize: 28, fontWeight: 700, lineHeight: 1.2,
                  }}>
                    {calibration.correlation.pearson.toFixed(3)}
                  </span>
                </div>
                <div style={styles.statCard}>
                  <span style={{ color: colors.textSecondary, fontSize: 13 }}>Avg Predicted</span>
                  <span style={{ color: colors.blue, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                    {calibration.correlation.meanPredicted}
                  </span>
                </div>
                <div style={styles.statCard}>
                  <span style={{ color: colors.textSecondary, fontSize: 13 }}>Avg Actual</span>
                  <span style={{ color: colors.green, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                    {calibration.correlation.meanOutcome}
                  </span>
                </div>
                <div style={styles.statCard}>
                  <span style={{ color: colors.textSecondary, fontSize: 13 }}>Bias</span>
                  <span style={{
                    color: Math.abs(calibration.correlation.bias) <= 5 ? colors.green
                      : Math.abs(calibration.correlation.bias) <= 15 ? colors.yellow
                      : colors.red,
                    fontSize: 28, fontWeight: 700, lineHeight: 1.2,
                  }}>
                    {calibration.correlation.bias > 0 ? '+' : ''}{calibration.correlation.bias}
                  </span>
                </div>
              </div>

              {/* Interpretation */}
              <div style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
              }}>
                <span style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {calibration.correlation.interpretation}
                </span>
                <span style={{ color: colors.textSecondary, fontSize: 13, display: 'block', marginTop: 4 }}>
                  Bias: {calibration.correlation.biasLabel} ({calibration.dataPointCount} data points from {calibration.dataSources.trackedTweets} tracked + {calibration.dataSources.opsTweets} ops tweets)
                </span>
              </div>

              {/* Delta distribution heatmap */}
              <div style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: '16px',
                marginBottom: 16,
              }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, margin: '0 0 12px 0' }}>
                  Predicted vs Actual Score Distribution
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                  {calibration.dataPoints.slice(0, 40).map((dp, i) => (
                    <div
                      key={i}
                      title={`Predicted: ${dp.predictedScore} | Actual: ${dp.outcomeScore} | Delta: ${dp.delta > 0 ? '+' : ''}${dp.delta}`}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: Math.abs(dp.delta) <= 10
                          ? colors.green + '44'
                          : Math.abs(dp.delta) <= 20
                          ? colors.yellow + '44'
                          : colors.red + '44',
                        border: `1px solid ${
                          Math.abs(dp.delta) <= 10 ? colors.green
                          : Math.abs(dp.delta) <= 20 ? colors.yellow
                          : colors.red
                        }66`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        color: colors.textSecondary,
                        cursor: 'default',
                      }}
                    >
                      {dp.delta > 0 ? '+' : ''}{dp.delta}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: colors.textSecondary }}>
                  <span>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: colors.green + '44', marginRight: 4, verticalAlign: 'middle' }} />
                    Within 10
                  </span>
                  <span>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: colors.yellow + '44', marginRight: 4, verticalAlign: 'middle' }} />
                    Within 20
                  </span>
                  <span>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: colors.red + '44', marginRight: 4, verticalAlign: 'middle' }} />
                    Off by 20+
                  </span>
                </div>
              </div>

              {/* Top Predictive Rules */}
              {calibration.topPredictiveRules.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.green, margin: '0 0 10px 0' }}>
                    Top Predictive Rules (High Lift)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {calibration.topPredictiveRules.map((rule) => (
                      <div
                        key={rule.ruleId}
                        style={{
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 8,
                          padding: '10px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span style={{ color: colors.textPrimary, fontSize: 14 }}>
                            {rule.ruleName}
                          </span>
                          <span style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                            ({rule.category})
                          </span>
                        </div>
                        <span style={{ color: colors.green, fontSize: 14, fontWeight: 600 }}>
                          +{rule.lift} lift ({rule.timesTriggered}x)
                          {rule.pValue !== null && rule.pValue < 0.05 ? ' *' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Noise Rules */}
              {calibration.topNoiseRules.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textSecondary, margin: '0 0 10px 0' }}>
                    Noise Rules (No Real Impact)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {calibration.topNoiseRules.map((rule) => (
                      <div
                        key={rule.ruleId}
                        style={{
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 8,
                          padding: '10px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          opacity: 0.7,
                        }}
                      >
                        <span style={{ color: colors.textPrimary, fontSize: 14 }}>
                          {rule.ruleName}
                        </span>
                        <span style={{ color: colors.textSecondary, fontSize: 14 }}>
                          {rule.lift > 0 ? '+' : ''}{rule.lift} lift ({rule.timesTriggered}x)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Harmful Rules */}
              {calibration.topHarmfulRules.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.red, margin: '0 0 10px 0' }}>
                    Harmful Rules (Negative Lift)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {calibration.topHarmfulRules.map((rule) => (
                      <div
                        key={rule.ruleId}
                        style={{
                          backgroundColor: colors.card,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 8,
                          padding: '10px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span style={{ color: colors.textPrimary, fontSize: 14 }}>
                            {rule.ruleName}
                          </span>
                          <span style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                            ({rule.category})
                          </span>
                        </div>
                        <span style={{ color: colors.red, fontSize: 14, fontWeight: 600 }}>
                          {rule.lift} lift ({rule.timesTriggered}x)
                          {rule.pValue !== null && rule.pValue < 0.05 ? ' *' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={styles.emptyState}>
              <p style={{ color: colors.textSecondary, margin: 0 }}>
                {calibration?.message || 'Need at least 10 tweets with engagement metrics to generate calibration report.'}
              </p>
            </div>
          )}
        </section>

        {/* Optimal Posting Times — Weekly Heatmap */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Optimal Posting Times</h2>
          <p style={{ color: colors.textSecondary, margin: '0 0 16px 0', fontSize: 14 }}>
            Research-based best windows to maximize reach (UTC). Your extension adjusts for your timezone.
          </p>
          <TimingHeatmap />
        </section>

        {/* Daily Suggestions */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Daily Tweet Ideas</h2>
          <p style={{ color: colors.textSecondary, margin: '0 0 16px 0', fontSize: 14 }}>
            AI-generated suggestions with predicted reach scores
          </p>
          <div style={styles.suggestionsGrid}>
            {dailySuggestions.map((s, i) => (
              <div key={i} style={styles.suggestionCard}>
                <div style={styles.suggestionHeader}>
                  <span
                    style={{
                      ...styles.scoreBadge,
                      backgroundColor: scoreColor(s.predictedScore) + '22',
                      color: scoreColor(s.predictedScore),
                      border: `1px solid ${scoreColor(s.predictedScore)}44`,
                      fontSize: 12,
                    }}
                  >
                    {s.predictedScore}
                  </span>
                  <span style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Predicted Score
                  </span>
                </div>
                <p style={styles.suggestionText}>{s.text}</p>
                <CopyButton text={s.text} />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <span style={{ color: colors.textSecondary, fontSize: 13 }}>
          ReachOS - Tweet Reach Optimization Platform
        </span>
      </footer>
    </div>
  );
}

// -- Data fetching --

async function fetchTweets() {
  return prisma.trackedTweet.findMany({
    include: {
      metrics: {
        orderBy: { measuredAt: 'desc' as const },
        take: 1,
      },
    },
    orderBy: { postedAt: 'desc' as const },
    take: 20,
  });
}

// -- Sub-components --

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={styles.statCard}>
      <span style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</span>
      <span
        style={{
          color: color ?? colors.textPrimary,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <span style={styles.metricPill} title={label}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span>{formatNumber(value)}</span>
    </span>
  );
}

// -- Timing Heatmap (static research data rendered at UTC) --

const TIMING_HEATMAP_UTC: number[][] = (() => {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const windows: Array<{ day: number; hour: number; intensity: number }> = [
    // Tuesday peak
    { day: 2, hour: 9, intensity: 100 },
    { day: 2, hour: 10, intensity: 70 },
    { day: 2, hour: 11, intensity: 70 },
    // Wednesday
    { day: 3, hour: 9, intensity: 100 },
    { day: 3, hour: 10, intensity: 100 },
    { day: 3, hour: 11, intensity: 70 },
    { day: 3, hour: 12, intensity: 70 },
    { day: 3, hour: 13, intensity: 40 },
    // Thursday
    { day: 4, hour: 9, intensity: 100 },
    { day: 4, hour: 10, intensity: 100 },
    { day: 4, hour: 11, intensity: 70 },
    { day: 4, hour: 12, intensity: 70 },
    { day: 4, hour: 13, intensity: 40 },
    // Friday
    { day: 5, hour: 9, intensity: 100 },
    { day: 5, hour: 10, intensity: 70 },
    { day: 5, hour: 11, intensity: 70 },
    { day: 5, hour: 12, intensity: 40 },
    { day: 5, hour: 13, intensity: 40 },
    // Monday (lighter)
    { day: 1, hour: 9, intensity: 40 },
    { day: 1, hour: 10, intensity: 40 },
    { day: 1, hour: 13, intensity: 40 },
  ];
  for (const w of windows) {
    grid[w.day][w.hour] = w.intensity;
  }
  return grid;
})();

const HEATMAP_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEATMAP_DISPLAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function heatColor(intensity: number): string {
  if (intensity >= 80) return colors.green;
  if (intensity >= 50) return colors.green + '88';
  if (intensity >= 20) return colors.green + '44';
  return 'transparent';
}

function TimingHeatmap() {
  return (
    <div style={{ overflowX: 'auto' as const }}>
      <table style={{ borderCollapse: 'collapse' as const, width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', color: colors.textSecondary, textAlign: 'left' as const, fontSize: 11 }}></th>
            {HEATMAP_DISPLAY_HOURS.map((h) => (
              <th key={h} style={{
                padding: '4px 2px',
                color: colors.textSecondary,
                fontSize: 10,
                fontWeight: 500,
                textAlign: 'center' as const,
                minWidth: 32,
              }}>
                {h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HEATMAP_DAY_LABELS.map((dayLabel, dayIdx) => (
            <tr key={dayIdx}>
              <td style={{
                padding: '4px 8px',
                color: colors.textSecondary,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap' as const,
              }}>
                {dayLabel}
              </td>
              {HEATMAP_DISPLAY_HOURS.map((h) => {
                const intensity = TIMING_HEATMAP_UTC[dayIdx][h];
                return (
                  <td key={h} style={{ padding: '2px' }}>
                    <div
                      style={{
                        width: '100%',
                        height: 20,
                        borderRadius: 3,
                        backgroundColor: intensity > 0 ? heatColor(intensity) : `${colors.border}66`,
                        border: intensity >= 80 ? `1px solid ${colors.green}88` : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`${dayLabel} ${h < 12 ? h + 'AM' : h === 12 ? '12PM' : (h - 12) + 'PM'} UTC — ${intensity >= 80 ? 'Peak' : intensity >= 50 ? 'Good' : intensity > 0 ? 'Okay' : 'Off-peak'}`}
                    >
                      {intensity >= 80 && (
                        <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>P</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: colors.textSecondary }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.green, display: 'inline-block' }} />
          Peak
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.green + '88', display: 'inline-block' }} />
          Good
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.green + '44', display: 'inline-block' }} />
          Okay
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: `${colors.border}66`, display: 'inline-block' }} />
          Off-peak
        </span>
      </div>
    </div>
  );
}

// -- Styles --

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },

  // Header
  header: {
    borderBottom: `1px solid ${colors.border}`,
    padding: '16px 24px',
    position: 'sticky' as const,
    top: 0,
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: colors.green,
    display: 'inline-block',
    boxShadow: `0 0 8px ${colors.green}88`,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: colors.textPrimary,
  },
  betaBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.yellow,
    border: `1px solid ${colors.yellow}66`,
    borderRadius: 4,
    padding: '2px 8px',
    letterSpacing: 1,
  },

  // Main
  main: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '24px 24px 48px',
  },

  // Stats
  statsBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: '1 1 200px',
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },

  // Section
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 16px 0',
    color: colors.textPrimary,
  },

  // Tweet list
  tweetList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  tweetCard: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: '16px 20px',
  },
  tweetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  scoreBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 8,
    padding: '3px 10px',
    minWidth: 36,
  },
  optimizedBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.green,
    backgroundColor: colors.green + '18',
    border: `1px solid ${colors.green}44`,
    borderRadius: 4,
    padding: '2px 8px',
  },
  timeAgo: {
    color: colors.textSecondary,
    fontSize: 13,
    marginLeft: 'auto',
  },
  tweetContent: {
    margin: '0 0 12px 0',
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
  },
  metricsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  metricPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Suggestions
  suggestionsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  suggestionCard: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: '16px 20px',
  },
  suggestionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  suggestionText: {
    margin: '0 0 12px 0',
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
  },
  // Table
  tableHeader: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tableCell: {
    padding: '10px 12px',
    color: colors.textSecondary,
    fontSize: 14,
    verticalAlign: 'middle' as const,
  },
  // Empty state
  emptyState: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: '40px 24px',
    textAlign: 'center' as const,
  },

  // Footer
  footer: {
    borderTop: `1px solid ${colors.border}`,
    padding: '16px 24px',
    textAlign: 'center' as const,
  },
};
