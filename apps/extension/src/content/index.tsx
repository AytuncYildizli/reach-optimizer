import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ScoreEngine, allClientRules } from "@reach/rules-engine";
import type { AnalysisResult, TweetInput } from "@reach/shared-types";
import { ComposerDetector } from "./composer-detector";
import { setupPostTracker } from "./post-tracker";
import { setupReplyCoach } from "./reply-coach";
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

/**
 * Merge server AI-enhanced results into the current client analysis.
 */
function mergeServerResult(
  clientAnalysis: AnalysisResult,
  serverData: {
    reachScore?: number;
    aiSlopScore?: number | null;
    suggestions?: AnalysisResult["suggestions"];
    trendingAlignment?: AnalysisResult["trendingAlignment"];
  },
): AnalysisResult {
  return {
    ...clientAnalysis,
    reachScore: serverData.reachScore ?? clientAnalysis.reachScore,
    aiSlopScore: serverData.aiSlopScore ?? clientAnalysis.aiSlopScore,
    suggestions: serverData.suggestions ?? clientAnalysis.suggestions,
    trendingAlignment: serverData.trendingAlignment ?? null,
    isServerEnhanced: true,
  };
}

/**
 * Request server analysis via the background service worker.
 */
function requestServerAnalysis(text: string): void {
  isServerPending = true;
  if (setGlobalServerPending) setGlobalServerPending(true);

  chrome.runtime.sendMessage(
    {
      type: "API_REQUEST",
      endpoint: "/api/analyze",
      method: "POST",
      body: { content: text, platform: "x" },
    },
    (response) => {
      isServerPending = false;
      if (setGlobalServerPending) setGlobalServerPending(false);

      if (response?.ok && response.data?.success && latestClientAnalysis) {
        if (setGlobalServerError) setGlobalServerError(false);
        const merged = mergeServerResult(latestClientAnalysis, response.data.data);
        if (setGlobalAnalysis) setGlobalAnalysis(merged);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score: merged.reachScore });
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
}

// ---------------------------------------------------------------------------
// React component: ScorePanel (thin wrapper that bridges global state)
// ---------------------------------------------------------------------------
function ScorePanel() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [serverPending, setServerPending] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [currentText, setCurrentText] = useState("");

  useEffect(() => {
    setGlobalAnalysis = setAnalysis;
    setGlobalServerPending = setServerPending;
    setGlobalServerError = setServerError;
    setGlobalCurrentText = setCurrentText;
    return () => {
      setGlobalAnalysis = null;
      setGlobalServerPending = null;
      setGlobalServerError = null;
      setGlobalCurrentText = null;
    };
  }, []);

  return (
    <ScoreOverlay
      analysis={analysis}
      isServerPending={serverPending}
      serverError={serverError}
      currentText={currentText}
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

  // 1. Detect media attachments — find the composer's parent container and check for media inside it
  const hasMedia = (() => {
    // Strategy: find the composer element, walk up to find the compose container, check for media inside
    const composer = document.querySelector('[data-testid="tweetTextarea_0"]');
    if (!composer) return false;

    // Walk up to the closest large container (the compose form/dialog)
    const container = composer.closest('[role="dialog"]')
      || composer.closest('[data-testid="primaryColumn"]')
      || composer.parentElement?.parentElement?.parentElement?.parentElement?.parentElement;

    if (!container) return false;

    // Check for any media indicators inside the compose container
    return !!(
      container.querySelector('[data-testid="attachments"]') ||
      container.querySelector('[data-testid="removeMedia"]') ||
      container.querySelector('[aria-label="Remove media"]') ||
      container.querySelector('[aria-label="Remove"]') ||
      container.querySelector('img[src*="pbs.twimg"]') ||
      container.querySelector('img[src*="ton.twimg"]') ||
      container.querySelector('video') ||
      container.querySelector('[data-testid="videoPlayer"]') ||
      container.querySelector('[data-testid="tweetPhoto"]') ||
      // X.com shows media thumbnails as small img elements inside the composer area
      container.querySelectorAll('img[draggable="true"]').length > 0 ||
      // Check for the media upload progress/preview area (usually a div with images below the textarea)
      (() => {
        const imgs = container.querySelectorAll('img');
        // If there are images that are NOT avatars (avatars are typically 40x40 or circular)
        for (const img of imgs) {
          const w = img.width || img.naturalWidth;
          if (w > 60) return true; // Likely a media preview, not an avatar
        }
        return false;
      })()
    );
  })();

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

  if (setGlobalAnalysis) {
    setGlobalAnalysis(result);
  }
  if (setGlobalCurrentText) {
    setGlobalCurrentText(text);
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
  );

  setupReplyCoach();

  console.log("[ReachOS] Overlay mounted, composer detector started, post tracker active, reply coach active");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
