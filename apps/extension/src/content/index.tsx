import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ScoreEngine, allClientRules } from "@reach/rules-engine";
import type { AnalysisResult, TweetInput } from "@reach/shared-types";
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
const engine = new ScoreEngine(allClientRules);

// ---------------------------------------------------------------------------
// Global state bridge — lets imperative code push state into React
// ---------------------------------------------------------------------------
let setGlobalAnalysis: ((a: AnalysisResult | null) => void) | null = null;
let setGlobalServerPending: ((p: boolean) => void) | null = null;
let setGlobalServerError: ((e: boolean) => void) | null = null;
let setGlobalCurrentText: ((t: string) => void) | null = null;
let setGlobalHasMedia: ((m: boolean) => void) | null = null;
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

/**
 * Merge server AI-enhanced results into the current client analysis.
 * IMPORTANT: Client score is the source of truth (it has correct hasMedia etc).
 * Server only provides AI-specific DELTA points, suggestions, and trending.
 */
function mergeServerResult(
  clientAnalysis: AnalysisResult,
  serverData: {
    reachScore?: number;
    aiSlopScore?: number | null;
    suggestions?: AnalysisResult["suggestions"];
    trendingAlignment?: AnalysisResult["trendingAlignment"];
  },
  serverDelta: number,
): AnalysisResult {
  // Collect only server-specific suggestions (AI slop, hook quality, trending)
  const serverOnlySuggestions = (serverData.suggestions ?? []).filter(
    s => s.ruleId.startsWith('server-'),
  );

  // Merge: keep client score, ADD server delta (AI checks + trending)
  const mergedScore = Math.max(0, Math.min(100, clientAnalysis.reachScore + serverDelta));

  return {
    ...clientAnalysis,
    reachScore: mergedScore,
    aiSlopScore: serverData.aiSlopScore ?? clientAnalysis.aiSlopScore,
    suggestions: [...clientAnalysis.suggestions, ...serverOnlySuggestions],
    trendingAlignment: serverData.trendingAlignment ?? null,
    isServerEnhanced: true,
  };
}

/**
 * Request server analysis via the background service worker.
 */
function requestServerAnalysis(text: string): void {
  // Check if we have an auth token before making server requests
  // If not logged in, silently skip — server analysis requires auth
  try {
    chrome.storage.local.get('authToken', (result) => {
      if (chrome.runtime.lastError || !result.authToken) {
        // No token — skip server analysis (requires auth)
        return;
      }
      doServerRequest(text);
    });
  } catch {
    // Extension context lost — silently skip
  }
}

function doServerRequest(text: string): void {
  isServerPending = true;
  if (setGlobalServerPending) setGlobalServerPending(true);

  try {
    chrome.runtime.sendMessage(
      {
        type: "API_REQUEST",
        endpoint: "/api/analyze",
        method: "POST",
        body: { content: text, platform: "x" },
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

        if (response?.ok && response.data?.success && latestClientAnalysis) {
          if (setGlobalServerError) setGlobalServerError(false);
          const delta = response.data.serverDelta ?? 0;
          const merged = mergeServerResult(latestClientAnalysis, response.data.data, delta);
          if (setGlobalAnalysis) setGlobalAnalysis(merged);
          try {
            chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: merged.reachScore });
          } catch { /* badge update is non-critical */ }
          console.log("[ReachOS] Server analysis merged", {
            aiSlopScore: merged.aiSlopScore,
            reachScore: merged.reachScore,
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
  const [hasExternalLink, setHasExternalLink] = useState(false);

  useEffect(() => {
    setGlobalAnalysis = setAnalysis;
    setGlobalServerPending = setServerPending;
    setGlobalServerError = setServerError;
    setGlobalCurrentText = setCurrentText;
    setGlobalHasMedia = setHasMedia;
    setGlobalHasExternalLink = setHasExternalLink;
    return () => {
      setGlobalAnalysis = null;
      setGlobalServerPending = null;
      setGlobalServerError = null;
      setGlobalCurrentText = null;
      setGlobalHasMedia = null;
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

  // 1. Detect media — searches multiple scopes for robustness
  const hasMedia = (() => {
    try {
      const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!composer) return false;

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
        // Strategy 1: data-testid media attributes
        if (
          container.querySelector('[data-testid="attachments"]') ||
          container.querySelector('[data-testid="tweetPhoto"]') ||
          container.querySelector('[data-testid="videoComponent"]') ||
          container.querySelector('[data-testid="tweetMediaImage"]') ||
          container.querySelector('[data-testid="gifPreview"]') ||
          container.querySelector('[data-testid="removeMedia"]')
        ) return true;

        // Strategy 2: aria-label patterns
        if (
          container.querySelector('[aria-label*="Remove"]') ||
          container.querySelector('[aria-label*="Edit media"]') ||
          container.querySelector('[aria-label*="Medyay"]')
        ) return true;

        // Strategy 3: "Edit"/"Alt"/"Tag people"/"Add a description" buttons/text
        // "Add a description" ONLY appears when media is attached
        const allText = container.textContent || '';
        if (
          allText.includes('Add a description') ||
          allText.includes('Aciklama ekle') ||
          allText.includes('Tag people') ||
          allText.includes('Kisi etiketle')
        ) return true;

        // Strategy 4: Edit/Alt buttons near media (not in timeline tweets)
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
          const txt = btn.textContent?.trim();
          if (txt === 'Edit' || txt === 'Alt' || txt === 'Düzenle' || txt === 'Kaldır') {
            // Make sure this Edit button is in the compose area, not a tweet
            const isInTweet = btn.closest('article[data-testid="tweet"]');
            if (!isInTweet) return true;
          }
        }

        // Strategy 5: Large images (not avatars/emoji/profile pics)
        const imgs = container.querySelectorAll('img');
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 80) {
            const src = img.getAttribute('src') || '';
            if (!src.includes('emoji') && !src.includes('profile_images') && !src.includes('pbs.twimg.com/profile')) {
              // Exclude images inside timeline tweets
              const isInTweet = img.closest('article[data-testid="tweet"]');
              if (!isInTweet) return true;
            }
          }
        }

        // Strategy 6: Video elements (not in timeline)
        const videos = container.querySelectorAll('video');
        for (const v of videos) {
          if (!v.closest('article[data-testid="tweet"]')) return true;
        }

        // If we found media in any container, we already returned true.
        // Only try wider containers if narrower ones didn't find media.
      }

      return false;
    } catch { return false; }
  })();

  // Log media detection for debugging
  if (hasMedia) {
    console.log("[ReachOS] Media detected in composer");
  }

  // 2. Run client rules immediately
  const input: TweetInput = {
    text,
    platform: "x",
    isThread: false,
    hasMedia,
  };

  const result = engine.evaluate(input);
  latestClientAnalysis = result;

  // Keep module-level state in sync for post tracker
  latestText = text;
  latestScore = result.reachScore;

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
  if (setGlobalHasExternalLink) {
    setGlobalHasExternalLink(hasExternalLink);
  }

  // Update extension icon badge with current score
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: result.reachScore });

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
