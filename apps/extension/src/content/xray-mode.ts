/**
 * X-Ray Mode — scores every tweet on the timeline as you scroll.
 * Injects a small score pill on each tweet showing its Reach Score.
 */

import { ScoreEngine, allClientRules } from "@reach/rules-engine";
import type { TweetInput } from "@reach/shared-types";

const engine = new ScoreEngine(allClientRules);

// Track which tweet elements we've already injected pills into
const scoredTweets = new WeakSet<HTMLElement>();

// Text-based score cache — same text always gets the same score (deterministic)
const scoreCache = new Map<string, { score: number; tier: string }>();

// Posted tweet scores — frozen at post time from the overlay (source of truth)
const postedScores = new Map<string, number>();

/**
 * Called by post-tracker when user posts a tweet.
 * Locks the score so X-Ray shows the exact same number as the overlay.
 */
export function lockPostedScore(text: string, score: number): void {
  // Normalize: trim + collapse whitespace for matching against DOM extraction
  const key = text.trim().replace(/\s+/g, ' ');
  postedScores.set(key, score);
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
 * Check if a tweet has media (image/video/gif).
 */
function tweetHasMedia(tweetEl: HTMLElement): boolean {
  return !!(
    tweetEl.querySelector('[data-testid="tweetPhoto"]') ||
    tweetEl.querySelector('[data-testid="videoComponent"]') ||
    tweetEl.querySelector('[data-testid="tweetMediaImage"]') ||
    tweetEl.querySelector('video')
  );
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
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  const locked = postedScores.get(normalizedText);

  let result;
  if (locked !== undefined) {
    const tier = engine.evaluate({ text, platform: 'x', isThread: false, hasMedia: false }).tier;
    result = { reachScore: locked, tier, breakdown: {} as never, suggestions: [] as never[] };
  } else {
    const hasMedia = tweetHasMedia(tweetEl);
    const cacheKey = text + (hasMedia ? '|M' : '|T');

    // Use cached score if available — guarantees deterministic scoring
    const cached = scoreCache.get(cacheKey);
    if (cached) {
      result = { reachScore: cached.score, tier: cached.tier, breakdown: {} as never, suggestions: [] as never[] };
    } else {
      const input: TweetInput = {
        text,
        platform: "x",
        isThread: false,
        hasMedia,
      };
      result = engine.evaluate(input);
      scoreCache.set(cacheKey, { score: result.reachScore, tier: result.tier });
    }
  }

  // Find the action bar (like/retweet/reply buttons row)
  const actionBar =
    tweetEl.querySelector('[role="group"]') ||
    tweetEl.querySelector('[data-testid="reply"]')?.parentElement?.parentElement;

  if (!actionBar) return;

  // Don't add duplicate pills
  if (actionBar.querySelector("[data-reachos-xray]")) return;

  const pill = createScorePill(result.reachScore, result.tier);
  pill.style.display = "inline-flex";
  pill.style.alignItems = "center";
  pill.style.marginLeft = "auto";

  // Click to log breakdown
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log(
      `[ReachOS X-Ray] Score: ${result.reachScore}/100 (${result.tier})`,
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
