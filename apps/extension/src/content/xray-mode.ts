/**
 * X-Ray Mode — scores every tweet on the timeline as you scroll.
 * Injects a small score pill on each tweet showing its Reach Score.
 */

import { ScoreEngine } from "@reach/rules-engine";
import type { TweetInput } from "@reach/shared-types";

const engine = new ScoreEngine();

// Mirrors weights.json bands. Inlined here (and in index.tsx + analyze route)
// so the timeline pill doesn't need to import the full rules-engine just to
// pick a tier color for a locked score. v4.1 candidate: move to a shared util.
function tierForScore(score: number): string {
  if (score >= 80) return 'perfect';
  if (score >= 61) return 'excellent';
  if (score >= 41) return 'good';
  if (score >= 21) return 'below_average';
  return 'critical';
}

// Track which tweet elements we've already injected pills into
const scoredTweets = new WeakSet<HTMLElement>();

// Text-based score cache — same text always gets the same score (deterministic)
const scoreCache = new Map<string, { score: number; tier: string }>();

// Posted tweet scores — frozen at post time from the overlay (source of truth)
const postedScores = new Map<string, number>();

/** Normalize text for fuzzy matching between composer and DOM */
function normalizeForMatch(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')          // collapse whitespace
    .replace(/https?:\/\/\S+/g, '') // strip URLs (X shortens to t.co)
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width chars
    .trim();
}

/**
 * Called by post-tracker when user posts a tweet.
 * Locks the score so X-Ray shows the exact same number as the overlay.
 */
export function lockPostedScore(text: string, score: number): void {
  // Store both exact and normalized keys for robust matching
  const exact = text.trim().replace(/\s+/g, ' ');
  const normalized = normalizeForMatch(text);
  postedScores.set(exact, score);
  if (normalized !== exact) {
    postedScores.set(normalized, score);
  }
  console.log("[ReachOS] Score locked for post:", { score, textLen: text.length });
}

// X-Ray tiers aligned with v3.0 weights (baseScore 30, wider distribution)
const XRAY_TIERS = [
  { max: 20, label: "weak", color: "#f4212e" },    // red — don't post
  { max: 35, label: "meh", color: "#ff6f00" },      // orange — below average
  { max: 50, label: "avg", color: "#ffd400" },       // yellow — average
  { max: 65, label: "solid", color: "#00ba7c" },     // green — solid
  { max: 79, label: "strong", color: "#1d9bf0" },    // blue — strong
  { max: 100, label: "fire", color: "#b45bff" },     // purple — exceptional
];

function getXrayTier(score: number) {
  for (const t of XRAY_TIERS) {
    if (score <= t.max) return t;
  }
  return XRAY_TIERS[XRAY_TIERS.length - 1];
}

/**
 * Extract tweet text from a tweet article element.
 */
function extractTweetText(tweetEl: HTMLElement): string | null {
  const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
  if (!textEl) return null;
  const text = (textEl as HTMLElement).innerText?.trim();
  if (!text || text.length < 5) return null;
  return text;
}

/**
 * Detect media kind on a timeline tweet. Video is checked first because
 * videoComponent / <video> are the most discriminating signals; default to
 * image otherwise. Returns { hasMedia, mediaType } so v4's photo_expand vs
 * vqv distinction applies on the timeline (was previously collapsed to image
 * for every media tweet, hiding vqv on videos).
 */
function tweetMedia(tweetEl: HTMLElement): {
  hasMedia: boolean;
  mediaType: TweetInput['mediaType'];
} {
  if (tweetEl.querySelector('[data-testid="videoComponent"]') || tweetEl.querySelector('video')) {
    return { hasMedia: true, mediaType: 'video' };
  }
  if (
    tweetEl.querySelector('[data-testid="tweetPhoto"]') ||
    tweetEl.querySelector('[data-testid="tweetMediaImage"]')
  ) {
    return { hasMedia: true, mediaType: 'image' };
  }
  return { hasMedia: false, mediaType: undefined };
}

/**
 * Create the score pill element using safe DOM methods (no innerHTML).
 */
function createScorePill(score: number, _tier: string): HTMLElement {
  const xrayTier = getXrayTier(score);
  const color = xrayTier.color;

  const pill = document.createElement("div");
  pill.className = "reachos-xray-pill";
  pill.setAttribute("data-reachos-xray", "true");

  const span = document.createElement("span");
  span.title = `ReachOS X-Ray: ${score}/100 (${xrayTier.label})`;
  Object.assign(span.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(8px)",
    border: `1px solid ${color}40`,
    borderRadius: "12px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: "700",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: color,
    cursor: "pointer",
    transition: "all 0.2s",
    lineHeight: "1",
    userSelect: "none",
    pointerEvents: "auto",
  });

  // Dot indicator
  const dot = document.createElement("span");
  Object.assign(dot.style, {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: color,
    flexShrink: "0",
    display: "inline-block",
  });

  // Score number
  const scoreText = document.createTextNode(String(score));

  span.appendChild(dot);
  span.appendChild(scoreText);
  pill.appendChild(span);

  // Hover effects
  span.addEventListener("mouseenter", () => {
    span.style.background = "rgba(0,0,0,0.9)";
    span.style.borderColor = color;
    span.style.transform = "scale(1.1)";
  });
  span.addEventListener("mouseleave", () => {
    span.style.background = "rgba(0,0,0,0.75)";
    span.style.borderColor = `${color}40`;
    span.style.transform = "scale(1)";
  });

  return pill;
}

/**
 * Score a single tweet element and inject the pill.
 */
function scoreTweet(tweetEl: HTMLElement): void {
  if (scoredTweets.has(tweetEl)) return;
  scoredTweets.add(tweetEl);

  const text = extractTweetText(tweetEl);
  if (!text) return;

  // Check if this tweet was posted by the user — use the frozen overlay score
  const exactKey = text.trim().replace(/\s+/g, ' ');
  const normalizedKey = normalizeForMatch(text);
  const locked = postedScores.get(exactKey) ?? postedScores.get(normalizedKey);

  let score: number;
  let tier: string;
  if (locked !== undefined) {
    score = locked;
    // Derive tier from the locked score, NOT from a fresh text-only evaluate.
    // The locked score includes the overlay's server/BYOK deltas; a text-only
    // engine.evaluate() would lose that and could land in a different tier
    // band (e.g. show "good" color for a server-boosted 66).
    tier = tierForScore(locked);
  } else {
    const { hasMedia, mediaType } = tweetMedia(tweetEl);
    const cacheKey = text + '|' + (mediaType ?? 'T');

    const cached = scoreCache.get(cacheKey);
    if (cached) {
      score = cached.score;
      tier = cached.tier;
    } else {
      const input: TweetInput = {
        text,
        platform: "x",
        isThread: false,
        hasMedia,
        mediaType,
      };
      const evaluated = engine.evaluate(input);
      score = evaluated.score;
      tier = evaluated.tier;
      scoreCache.set(cacheKey, { score, tier });
    }
  }

  // Find the action bar (like/retweet/reply buttons row)
  const actionBar =
    tweetEl.querySelector('[role="group"]') ||
    tweetEl.querySelector('[data-testid="reply"]')?.parentElement?.parentElement;

  if (!actionBar) return;

  // Don't add duplicate pills
  if (actionBar.querySelector("[data-reachos-xray]")) return;

  const pill = createScorePill(score, tier);
  pill.style.display = "inline-flex";
  pill.style.alignItems = "center";
  pill.style.marginLeft = "auto";

  // Click to log breakdown
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log(
      `[ReachOS X-Ray] Score: ${score}/100 (${tier})`,
      {
        text: text.substring(0, 80) + "...",
        locked: locked !== undefined,
      }
    );
  });

  actionBar.appendChild(pill);
}

/**
 * Scan visible tweets and score them.
 */
function scanTimeline(): void {
  const tweets = document.querySelectorAll<HTMLElement>(
    'article[data-testid="tweet"]'
  );
  for (const tweet of tweets) {
    scoreTweet(tweet);
  }
}

/**
 * Set up X-Ray Mode with MutationObserver + scroll listener.
 */
export function setupXRayMode(): void {
  // Initial scan
  scanTimeline();

  // Watch for new tweets (infinite scroll, navigation)
  let scanTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanTimeline();
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Scan on scroll (catches tweets entering viewport)
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        scanTimeline();
      }, 300);
    },
    { passive: true }
  );

  console.log("[ReachOS] X-Ray Mode active — scoring timeline tweets");
}
