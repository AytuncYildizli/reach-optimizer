import { cookies } from 'next/headers';
import { prisma } from '@lib/db';
import { verifyToken } from '@lib/auth';
import { CopyButton } from './CopyButton';

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

// -- Auth helper --

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('reachos_token');
  if (!tokenCookie?.value) return null;
  const result = await verifyToken(tokenCookie.value);
  return result?.userId ?? null;
}

// -- Component --

export default async function DashboardPage() {
  const userId = await getAuthenticatedUserId();

  // Auth gate: no valid token => show login prompt
  if (!userId) {
    return (
      <div style={styles.page}>
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
          <div style={{
            ...styles.emptyState,
            maxWidth: 480,
            margin: '80px auto',
            padding: '48px 32px',
          }}>
            <h2 style={{
              color: colors.textPrimary,
              fontSize: 22,
              fontWeight: 700,
              margin: '0 0 12px 0',
            }}>
              ReachOS Dashboard
            </h2>
            <p style={{
              color: colors.textSecondary,
              fontSize: 15,
              lineHeight: 1.6,
              margin: '0 0 24px 0',
            }}>
              Connect your X account to track tweet performance, view reach analytics,
              and see how your predictions compare to real outcomes.
            </p>
            <a
              href="/api/auth/login"
              style={{
                display: 'inline-block',
                backgroundColor: colors.blue,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                padding: '12px 32px',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Connect X Account
            </a>
          </div>
        </main>
        <footer style={styles.footer}>
          <span style={{ color: colors.textSecondary, fontSize: 13 }}>
            ReachOS - Open-source Reach Optimizer
          </span>
        </footer>
      </div>
    );
  }

  // Fetch user's data
  let tweets: Awaited<ReturnType<typeof fetchUserTweets>> = [];
  let analyses: Awaited<ReturnType<typeof fetchUserAnalyses>> = [];
  let dbError = false;

  try {
    [tweets, analyses] = await Promise.all([
      fetchUserTweets(userId),
      fetchUserAnalyses(userId),
    ]);
  } catch {
    dbError = true;
  }

  // My Stats
  const totalTweets = tweets.length;
  const avgScore =
    totalTweets > 0
      ? Math.round(tweets.reduce((s, t) => s + t.reachScore, 0) / totalTweets)
      : 0;
  const bestTweetScore =
    totalTweets > 0
      ? Math.max(...tweets.map((t) => t.reachScore))
      : 0;
  const avgViews =
    totalTweets > 0
      ? Math.round(
          tweets.reduce((s, t) => s + (t.metrics[0]?.views ?? 0), 0) /
            totalTweets,
        )
      : 0;

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
        {/* My Stats */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={styles.sectionTitle}>My Stats</h2>
          <section style={styles.statsBar}>
            <StatCard label="Tweets Tracked" value={String(totalTweets)} />
            <StatCard
              label="Avg Reach Score"
              value={totalTweets > 0 ? String(avgScore) : '--'}
              color={totalTweets > 0 ? scoreColor(avgScore) : colors.textSecondary}
            />
            <StatCard
              label="Best Tweet Score"
              value={totalTweets > 0 ? String(bestTweetScore) : '--'}
              color={totalTweets > 0 ? scoreColor(bestTweetScore) : colors.textSecondary}
            />
            <StatCard
              label="Avg Views"
              value={totalTweets > 0 ? formatNumber(avgViews) : '--'}
            />
            <StatCard
              label="Optimization Impact"
              value={impact !== 0 ? (impact > 0 ? `+${impact}%` : `${impact}%`) : '--'}
              color={impact > 0 ? colors.green : impact < 0 ? colors.red : colors.textSecondary}
            />
          </section>
        </section>

        {/* Tweet List */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Tweets</h2>
          {dbError ? (
            <div style={styles.emptyState}>
              <p style={{ color: colors.yellow, margin: 0 }}>
                Unable to connect to database. Please try again later.
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
                        <MetricPill icon="Views" label="Views" value={m.views} />
                        <MetricPill icon="Likes" label="Likes" value={m.likes} />
                        <MetricPill icon="Replies" label="Replies" value={m.replies} />
                        <MetricPill icon="Bookmarks" label="Bookmarks" value={m.bookmarks} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Optimal Posting Times - Weekly Heatmap */}
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

// -- Data fetching (filtered by userId) --

async function fetchUserTweets(userId: string) {
  return prisma.trackedTweet.findMany({
    where: { userId },
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

async function fetchUserAnalyses(userId: string) {
  return prisma.analysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' as const },
    take: 50,
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
      <span style={{ fontSize: 12, color: colors.textSecondary }}>{icon}</span>
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
