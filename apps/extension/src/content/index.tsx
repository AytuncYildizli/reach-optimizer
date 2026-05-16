import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ScoreEngine } from "@reach/rules-engine";
import type { AnalysisResult, ScoreTier, TweetInput } from "@reach/shared-types";
import { ComposerDetector } from "./composer-detector";
import { setupPostTracker } from "./post-tracker";
import { setupReplyCoach } from "./reply-coach";
import { setupXRayMode, lockPostedScore } from "./xray-mode";
import { ScoreOverlay } from "./ScoreOverlay";
import { OVERLAY_STYLES } from "./styles";

console.log("[ReachOS] Content script loaded");

// ---------------------------------------------------------------------------
// Score engine (all client-side rules)
// ---------------------------------------------------------------------------
const engine = new ScoreEngine();

// ---------------------------------------------------------------------------
// Global state bridge — lets imperative code push state into React
// ---------------------------------------------------------------------------
let setGlobalAnalysis: ((a: AnalysisResult | null) => void) | null = null;
let setGlobalServerPending: ((p: boolean) => void) | null = null;
let setGlobalServerError: ((e: boolean) => void) | null = null;
let setGlobalCurrentText: ((t: string) => void) | null = null;
let setGlobalHasMedia: ((m: boolean) => void) | null = null;
let setGlobalMediaType: ((t: 'image' | 'video' | 'gif' | 'poll' | undefined) => void) | null = null;
let setGlobalIsQuoteTweet: ((q: boolean) => void) | null = null;
let setGlobalQuotedMediaType: ((t: 'image' | 'video' | 'gif' | 'poll' | undefined) => void) | null = null;
let setGlobalHasExternalLink: ((l: boolean) => void) | null = null;

// ---------------------------------------------------------------------------
// Server analysis state
// ---------------------------------------------------------------------------
let serverTimer: ReturnType<typeof setTimeout> | null = null;
let isServerPending = false;
let latestClientAnalysis: AnalysisResult | null = null;

// ---------------------------------------------------------------------------
// Post tracker state — exposed for setupPostTracker callbacks
// ---------------------------------------------------------------------------
let latestText = "";
let latestScore = 0;
let latestPredictedReach = 0;
let latestHasMedia = false;
let latestMediaType: 'image' | 'video' | 'gif' | 'poll' | undefined;
let latestIsQuoteTweet = false;
let latestQuotedText = '';
let latestQuotedMediaType: 'image' | 'video' | 'gif' | 'poll' | undefined;

/**
 * Merge server AI-enhanced results into the current client analysis.
 * IMPORTANT: Client score is the source of truth (it has correct hasMedia etc).
 * Server only provides AI-specific DELTA points, suggestions, and trending.
 */
function mergeServerResult(
  clientAnalysis: AnalysisResult,
  serverData: {
    score?: number;
    aiSlopScore?: number | null;
    suggestions?: AnalysisResult["suggestions"];
    trendingAlignment?: AnalysisResult["trendingAlignment"];
  },
  serverDelta: number,
): AnalysisResult {
  const serverOnlySuggestions = (serverData.suggestions ?? []).filter(
    s => s.ruleId.startsWith('server-'),
  );

  const mergedScore = Math.max(0, Math.min(100, clientAnalysis.score + serverDelta));

  return {
    ...clientAnalysis,
    score: mergedScore,
    // Recompute tier from the merged score — otherwise a delta that crosses
    // a tier boundary (e.g. local 58 + delta +8 → 66) keeps the old tier
    // label ("good") and overlay color while showing the new score number.
    tier: tierForScore(mergedScore),
    aiSlopScore: serverData.aiSlopScore ?? clientAnalysis.aiSlopScore,
    suggestions: [...clientAnalysis.suggestions, ...serverOnlySuggestions],
    trendingAlignment: serverData.trendingAlignment ?? null,
    isServerEnhanced: true,
  };
}

// Tier ranges mirror packages/rules-engine/src/config/weights.json. Inlined
// here so the extension doesn't need to import weights.json into the
// content-script bundle just to recompute a label on every merge.
function tierForScore(score: number): ScoreTier {
  if (score >= 80) return 'perfect';
  if (score >= 61) return 'excellent';
  if (score >= 41) return 'good';
  if (score >= 21) return 'below_average';
  return 'critical';
}

/**
 * Request server analysis via the background service worker.
 */
function requestServerAnalysis(text: string): void {
  try {
    chrome.storage.local.get(['authToken', 'anthropicKey'], (result) => {
      if (chrome.runtime.lastError) return;

      // BYOK takes precedence: the popup's BYOK promise is "AI features use
      // your key directly, no server upload." If the user has explicitly set
      // an Anthropic key, honor that even when they're also signed in. To
      // re-enable server-side trending/DB tracking, the user clears the key.
      if (result.anthropicKey) {
        doBYOKSlopDetection(text);
      } else if (result.authToken) {
        // No BYOK key but signed in → server path for trending + slop + DB.
        doServerRequest(text);
      }
      // Neither → local scoring only (already done)
    });
  } catch {
    // Extension context lost — silently skip
  }
}

/**
 * Run AI slop detection directly using the user's own Anthropic key.
 * No server needed - pure client-side BYOK.
 */
function doBYOKSlopDetection(text: string): void {
  isServerPending = true;
  if (setGlobalServerPending) setGlobalServerPending(true);

  // Capture the draft text + analysis snapshot at request time so a late
  // response can't merge into a different draft. If the user keeps typing
  // before Anthropic answers, we discard the stale response.
  const requestText = text;

  try {
    chrome.runtime.sendMessage(
      {
        type: 'DIRECT_ANTHROPIC',
        systemPrompt: `You are an AI slop detector for X/Twitter. Score how AI-generated a tweet sounds.
Return JSON: {"slopScore": 0-100, "reason": "brief reason"}
0 = clearly human, 100 = obviously AI-generated.
Look for: generic phrases, buzzwords, forced structure, lack of personality, "delve/leverage/landscape/paradigm/unleash".`,
        userPrompt: `Rate this tweet's AI slop level:\n"${text.replace(/"/g, '\\"')}"`,
        maxTokens: 128,
        temperature: 0.1,
      },
      (response) => {
        isServerPending = false;
        if (setGlobalServerPending) setGlobalServerPending(false);

        // Stale-response guard: if the composer has moved on, discard.
        if (requestText !== latestText) return;

        if (response?.ok && response.data?.text && latestClientAnalysis) {
          try {
            const cleaned = response.data.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            const slopScore = typeof parsed.slopScore === 'number' ? parsed.slopScore : null;

            if (slopScore !== null) {
              // Apply slop penalty: high slop = point deduction
              const slopDelta = slopScore > 60 ? -Math.round((slopScore - 60) * 0.15) : 0;
              const merged = mergeServerResult(
                latestClientAnalysis,
                { aiSlopScore: slopScore, suggestions: slopScore > 60 ? [{
                  ruleId: 'server-ai-slop',
                  severity: 'warning' as const,
                  title: 'AI Slop Detection',
                  description: parsed.reason || 'Content sounds AI-generated. Add personal voice and specific details.',
                }] : [] },
                slopDelta,
              );
              // CRITICAL: Update latestScore so post-tracker captures the merged score
              latestScore = merged.score;
              if (setGlobalAnalysis) setGlobalAnalysis(merged);
              if (setGlobalServerError) setGlobalServerError(false);
              try {
                chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: merged.score });
              } catch { /* non-critical */ }
            }
          } catch { /* JSON parse failed — skip */ }
        }
      },
    );
  } catch {
    isServerPending = false;
    if (setGlobalServerPending) setGlobalServerPending(false);
  }
}

function doServerRequest(text: string): void {
  isServerPending = true;
  if (setGlobalServerPending) setGlobalServerPending(true);

  // Same stale-response guard as the BYOK path: discard if the composer
  // has moved on between request and response.
  const requestText = text;

  try {
    // Send the same composer context the client used for scoring so the
    // server's DB-persisted score matches what the user sees on screen.
    chrome.runtime.sendMessage(
      {
        type: "API_REQUEST",
        endpoint: "/api/analyze",
        method: "POST",
        body: {
          content: text,
          platform: "x",
          hasMedia: latestHasMedia,
          mediaType: latestMediaType,
          isThread: false,
          // Quote context — server engine needs these for quoted_click / quoted_vqv
          // to apply consistently with what the client displayed.
          isQuoteTweet: latestIsQuoteTweet,
          quotedText: latestQuotedText,
          quotedMediaType: latestQuotedMediaType,
        },
      },
      (response) => {
        // Guard against extension context invalidated (SPA navigation, extension reload)
        if (chrome.runtime.lastError) {
          console.warn("[ReachOS] Extension context lost:", chrome.runtime.lastError.message);
          isServerPending = false;
          if (setGlobalServerPending) setGlobalServerPending(false);
          return;
        }

        isServerPending = false;
        if (setGlobalServerPending) setGlobalServerPending(false);

        // Stale-response guard.
        if (requestText !== latestText) return;

        if (response?.ok && response.data?.success && latestClientAnalysis) {
          if (setGlobalServerError) setGlobalServerError(false);
          const delta = response.data.serverDelta ?? 0;
          const merged = mergeServerResult(latestClientAnalysis, response.data.data, delta);
          // CRITICAL: Update latestScore so post-tracker captures the merged score
          // This ensures lockPostedScore uses the same score the overlay displays
          latestScore = merged.score;
          if (setGlobalAnalysis) setGlobalAnalysis(merged);
          try {
            chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: merged.score });
          } catch { /* badge update is non-critical */ }
          console.log("[ReachOS] Server analysis merged", {
            aiSlopScore: merged.aiSlopScore,
            score: merged.score,
          });
        } else {
          if (setGlobalServerError) setGlobalServerError(true);
          console.warn("[ReachOS] Server analysis failed or stale", response);
        }
      },
    );
  } catch {
    // Extension context invalidated — silently ignore
    isServerPending = false;
    if (setGlobalServerPending) setGlobalServerPending(false);
  }
}

// ---------------------------------------------------------------------------
// React component: ScorePanel (thin wrapper that bridges global state)
// ---------------------------------------------------------------------------
function ScorePanel() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [serverPending, setServerPending] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [hasMedia, setHasMedia] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'gif' | 'poll' | undefined>(undefined);
  const [isQuoteTweet, setIsQuoteTweet] = useState(false);
  const [quotedMediaType, setQuotedMediaType] = useState<'image' | 'video' | 'gif' | 'poll' | undefined>(undefined);
  const [hasExternalLink, setHasExternalLink] = useState(false);

  useEffect(() => {
    setGlobalAnalysis = setAnalysis;
    setGlobalServerPending = setServerPending;
    setGlobalServerError = setServerError;
    setGlobalCurrentText = setCurrentText;
    setGlobalHasMedia = setHasMedia;
    setGlobalMediaType = setMediaType;
    setGlobalIsQuoteTweet = setIsQuoteTweet;
    setGlobalQuotedMediaType = setQuotedMediaType;
    setGlobalHasExternalLink = setHasExternalLink;
    return () => {
      setGlobalAnalysis = null;
      setGlobalServerPending = null;
      setGlobalServerError = null;
      setGlobalCurrentText = null;
      setGlobalHasMedia = null;
      setGlobalMediaType = null;
      setGlobalIsQuoteTweet = null;
      setGlobalQuotedMediaType = null;
      setGlobalHasExternalLink = null;
    };
  }, []);

  return (
    <ScoreOverlay
      analysis={analysis}
      isServerPending={serverPending}
      serverError={serverError}
      currentText={currentText}
      hasMedia={hasMedia}
      mediaType={mediaType}
      isQuoteTweet={isQuoteTweet}
      quotedMediaType={quotedMediaType}
      hasExternalLink={hasExternalLink}
    />
  );
}

// ---------------------------------------------------------------------------
// Mount overlay into Shadow DOM
// ---------------------------------------------------------------------------
function mountOverlay(): void {
  const host = document.createElement("div");
  host.id = "reachos-root";
  host.style.cssText = "position:fixed;bottom:0;right:0;z-index:999999;pointer-events:none !important;width:0;height:0;overflow:visible;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_STYLES;
  shadow.appendChild(style);

  const container = document.createElement("div");
  shadow.appendChild(container);

  createRoot(container).render(<ScorePanel />);
}

// ---------------------------------------------------------------------------
// Composer detection callback
// ---------------------------------------------------------------------------
function onComposerTextChange(_composerEl: HTMLElement, text: string): void {
  // If text is empty, reset to idle state
  if (!text || text.length === 0) {
    if (setGlobalAnalysis) setGlobalAnalysis(null);
    if (setGlobalCurrentText) setGlobalCurrentText("");
    latestText = "";
    latestScore = 0;
    latestClientAnalysis = null;
    if (serverTimer) { clearTimeout(serverTimer); serverTimer = null; }
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: 0 });
    return;
  }

  // 1. Detect media kind — searches multiple scopes for robustness. Returns
  //    { hasMedia, mediaType } so v4's vqv signal can fire when a video is
  //    attached (was previously hard-coded as image, masking the vqv signal).
  const media: { hasMedia: boolean; mediaType: TweetInput['mediaType'] } = (() => {
    try {
      const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!composer) return { hasMedia: false, mediaType: undefined };

      // Build a list of containers to check, from narrow to wide
      const containers: Element[] = [];
      // Narrow: direct parent chain
      const inlineParent = composer.closest('[data-testid="tweetButtonInline"]')?.parentElement;
      if (inlineParent) containers.push(inlineParent);
      // Dialog (popup compose)
      const dialog = composer.closest('[role="dialog"]');
      if (dialog) containers.push(dialog);
      // Form
      const form = composer.closest('form');
      if (form) containers.push(form);
      // Primary column (standalone /compose/post page)
      const primary = composer.closest('[data-testid="primaryColumn"]');
      if (primary) containers.push(primary);
      // Fallback: walk up 20 levels from composer
      let walkUp: HTMLElement | null = composer as HTMLElement;
      for (let i = 0; i < 20 && walkUp; i++) walkUp = walkUp.parentElement;
      if (walkUp) containers.push(walkUp);
      // Last resort: document body
      if (containers.length === 0) containers.push(document.body);

      for (const container of containers) {
        // Video gets checked first — videoComponent and <video> are the most
        // discriminating signals, and falling back to image only on miss.
        if (container.querySelector('[data-testid="videoComponent"]')) {
          return { hasMedia: true, mediaType: 'video' };
        }
        for (const v of container.querySelectorAll('video')) {
          if (!v.closest('article[data-testid="tweet"]')) {
            return { hasMedia: true, mediaType: 'video' };
          }
        }

        if (container.querySelector('[data-testid="gifPreview"]')) {
          return { hasMedia: true, mediaType: 'gif' };
        }

        // Image-shaped detections.
        if (
          container.querySelector('[data-testid="tweetPhoto"]') ||
          container.querySelector('[data-testid="tweetMediaImage"]') ||
          container.querySelector('[data-testid="attachments"]') ||
          container.querySelector('[data-testid="removeMedia"]')
        ) {
          return { hasMedia: true, mediaType: 'image' };
        }

        // aria-label patterns — kind unknown, default to image.
        if (
          container.querySelector('[aria-label*="Remove"]') ||
          container.querySelector('[aria-label*="Edit media"]') ||
          container.querySelector('[aria-label*="Medyay"]')
        ) return { hasMedia: true, mediaType: 'image' };

        // Compose-affordance text — kind unknown.
        const allText = container.textContent || '';
        if (
          allText.includes('Add a description') ||
          allText.includes('Aciklama ekle') ||
          allText.includes('Tag people') ||
          allText.includes('Kisi etiketle')
        ) return { hasMedia: true, mediaType: 'image' };

        // Edit / Alt buttons near media.
        for (const btn of container.querySelectorAll('button')) {
          const txt = btn.textContent?.trim();
          if (txt === 'Edit' || txt === 'Alt' || txt === 'Düzenle' || txt === 'Kaldır') {
            if (!btn.closest('article[data-testid="tweet"]')) {
              return { hasMedia: true, mediaType: 'image' };
            }
          }
        }

        // Large images (not avatars/emoji/profile pics).
        for (const img of container.querySelectorAll('img')) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 80) {
            const src = img.getAttribute('src') || '';
            if (!src.includes('emoji') && !src.includes('profile_images') && !src.includes('pbs.twimg.com/profile')) {
              if (!img.closest('article[data-testid="tweet"]')) {
                return { hasMedia: true, mediaType: 'image' };
              }
            }
          }
        }
      }

      return { hasMedia: false, mediaType: undefined };
    } catch { return { hasMedia: false, mediaType: undefined }; }
  })();
  const hasMedia = media.hasMedia;

  // Log media detection for debugging
  if (hasMedia) {
    console.log("[ReachOS] Media detected in composer", media.mediaType);
  }

  // 1b. Detect quote-tweet attachment so v4's quoted_click and quoted_vqv
  //     signals can apply. The composer wraps quoted posts in a card with
  //     data-testid="card.wrapper" — pull the text and probe for a video
  //     inside the card to set quotedMediaType.
  const quote: {
    isQuoteTweet: boolean;
    quotedText: string;
    quotedMediaType: TweetInput['quotedMediaType'];
  } = (() => {
    try {
      const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!composer) return { isQuoteTweet: false, quotedText: '', quotedMediaType: undefined };
      const scope = composer.closest('[role="dialog"]') ?? composer.closest('form') ?? document.body;
      const card =
        scope.querySelector('[data-testid="card.wrapper"]') ??
        scope.querySelector('[aria-label="Embedded Tweet"]') ??
        scope.querySelector('[data-testid="quoteTweet"]');
      if (!card) return { isQuoteTweet: false, quotedText: '', quotedMediaType: undefined };
      const quotedText = (card.textContent ?? '').slice(0, 280).trim();
      const hasVideo = !!card.querySelector('video, [data-testid="videoComponent"]');
      const hasImage = !!card.querySelector('img[src*="pbs.twimg.com/media"], [data-testid="tweetPhoto"]');
      const quotedMediaType: TweetInput['quotedMediaType'] = hasVideo
        ? 'video'
        : hasImage
          ? 'image'
          : undefined;
      return { isQuoteTweet: true, quotedText, quotedMediaType };
    } catch {
      return { isQuoteTweet: false, quotedText: '', quotedMediaType: undefined };
    }
  })();
  if (quote.isQuoteTweet) {
    console.log("[ReachOS] Quote-tweet detected, quotedMediaType=", quote.quotedMediaType);
  }

  // 2. Run client rules immediately
  const input: TweetInput = {
    text,
    platform: "x",
    isThread: false,
    hasMedia,
    mediaType: media.mediaType,
    isQuoteTweet: quote.isQuoteTweet,
    quotedText: quote.quotedText,
    quotedMediaType: quote.quotedMediaType,
  };

  const result = engine.evaluate(input);
  latestClientAnalysis = result;

  // Keep module-level state in sync for post tracker and server requests
  latestText = text;
  latestScore = result.score;
  latestHasMedia = hasMedia;
  latestMediaType = media.mediaType;
  latestIsQuoteTweet = quote.isQuoteTweet;
  latestQuotedText = quote.quotedText;
  latestQuotedMediaType = quote.quotedMediaType;

  // Detect external links for forecast
  const hasExternalLink = /https?:\/\/(?!(?:x\.com|twitter\.com|t\.co|pic\.twitter\.com))/i.test(text);

  if (setGlobalAnalysis) {
    setGlobalAnalysis(result);
  }
  if (setGlobalCurrentText) {
    setGlobalCurrentText(text);
  }
  if (setGlobalHasMedia) {
    setGlobalHasMedia(hasMedia);
  }
  if (setGlobalMediaType) {
    setGlobalMediaType(media.mediaType);
  }
  if (setGlobalIsQuoteTweet) {
    setGlobalIsQuoteTweet(quote.isQuoteTweet);
  }
  if (setGlobalQuotedMediaType) {
    setGlobalQuotedMediaType(quote.quotedMediaType);
  }
  if (setGlobalHasExternalLink) {
    setGlobalHasExternalLink(hasExternalLink);
  }

  // Update extension icon badge with current score
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: result.score });

  // 2. Cancel any pending server request (user is still typing)
  if (serverTimer) {
    clearTimeout(serverTimer);
    serverTimer = null;
  }

  // Reset server pending if user starts typing again
  if (isServerPending) {
    // Server request is in-flight; we can't cancel fetch but we'll
    // ignore stale responses via latestClientAnalysis reference
  }

  // 3. Start 2000ms idle timer for server analysis
  serverTimer = setTimeout(() => {
    serverTimer = null;
    if (text.length >= 10) {
      requestServerAnalysis(text);
    }
  }, 2000);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
function init(): void {
  mountOverlay();

  const detector = new ComposerDetector(onComposerTextChange);
  detector.start();

  setupPostTracker(
    () => latestText,
    () => latestScore,
    () => latestPredictedReach,
    (text, score) => lockPostedScore(text, score),
  );

  // Listen for forecast updates from the React component
  window.addEventListener('reachos-forecast-update', ((e: CustomEvent) => {
    latestPredictedReach = e.detail?.predictedReach ?? 0;
  }) as EventListener);

  setupReplyCoach();
  setupXRayMode();

  console.log("[ReachOS] Overlay mounted, composer detector started, post tracker active, reply coach active, X-Ray mode active");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
