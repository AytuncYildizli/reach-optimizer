/**
 * Shadow DOM styles for the ReachOS score overlay panel.
 * Dark theme matching X.com's design language.
 */
export const OVERLAY_STYLES = `
:host {
  all: initial;
  pointer-events: none !important;
}
* {
  box-sizing: border-box;
}

/* Container — must not block page interactions */
#reachos-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  pointer-events: none;
}

/* Panel — re-enable pointer events so panel itself is interactive */
.reachos-panel {
  background: #16181c;
  color: #e7e9ea;
  border: 1px solid #2f3336;
  border-radius: 16px;
  width: 300px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 90vh;
  pointer-events: auto;
}

/* Header */
.reachos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2f3336;
}
.reachos-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #e7e9ea;
}
.reachos-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00ba7c;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.reachos-badge {
  background: rgba(29,155,240,0.15);
  color: #1d9bf0;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Score Circle */
.reachos-score-section {
  padding: 20px;
  text-align: center;
}
.reachos-score-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  margin: 0 auto 10px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.reachos-score-circle-bg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: #2f3336;
}
.reachos-score-circle-fill {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.reachos-score-circle-inner {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #16181c;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  z-index: 1;
}
.reachos-score-number {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
  transition: color 0.3s ease;
}
.reachos-score-label {
  font-size: 9px;
  color: #71767b;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 2px;
}
.reachos-tier-label {
  font-size: 12px;
  font-weight: 600;
  transition: color 0.3s ease;
}
.reachos-estimated-reach {
  font-size: 11px;
  color: #8b949e;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: help;
}
.reachos-multiplier-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 600;
  background: rgba(29, 155, 240, 0.15);
  color: #1d9bf0;
}

/* Color classes */
.color-critical { color: #f4212e; }
.color-below_average { color: #ffd400; }
.color-good { color: #00ba7c; }
.color-excellent { color: #00ba7c; }
.color-perfect { color: #1d9bf0; }

/* Breakdown Section */
.reachos-section-label {
  padding: 0 16px;
  margin-bottom: 8px;
  font-size: 10px;
  color: #71767b;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}
.reachos-breakdown {
  padding: 0 16px 12px;
}
.reachos-breakdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.reachos-breakdown-label {
  font-size: 11px;
  color: #71767b;
  width: 80px;
  flex-shrink: 0;
}
.reachos-breakdown-bar-bg {
  flex: 1;
  height: 5px;
  background: #2f3336;
  border-radius: 3px;
  overflow: hidden;
}
.reachos-breakdown-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.reachos-breakdown-value {
  font-size: 11px;
  font-weight: 600;
  width: 35px;
  text-align: right;
  flex-shrink: 0;
}

/* Suggestions */
.reachos-suggestions {
  padding: 0 16px 12px;
  max-height: 200px;
  overflow-y: auto;
}
.reachos-suggestion {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 6px;
}
.reachos-suggestion.critical {
  background: rgba(244,33,46,0.08);
  border: 1px solid rgba(244,33,46,0.2);
  color: #e7e9ea;
}
.reachos-suggestion.warning {
  background: rgba(255,212,0,0.08);
  border: 1px solid rgba(255,212,0,0.2);
  color: #e7e9ea;
}
.reachos-suggestion.positive {
  background: rgba(0,186,124,0.08);
  border: 1px solid rgba(0,186,124,0.2);
  color: #e7e9ea;
}
.reachos-suggestion.info {
  background: rgba(29,155,240,0.08);
  border: 1px solid rgba(29,155,240,0.2);
  color: #e7e9ea;
}
.reachos-suggestion-title {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 2px;
}

/* Rewrite Section */
.reachos-rewrite-section {
  padding: 8px 16px 12px;
}
.reachos-rewrite-btn {
  width: 100%;
  padding: 8px 12px;
  background: linear-gradient(135deg, #1d9bf0, #0066cc);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  pointer-events: auto;
}
.reachos-rewrite-btn:hover {
  opacity: 0.9;
}
.reachos-rewrite-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.reachos-rewrite-item {
  padding: 8px 10px;
  background: rgba(29,155,240,0.06);
  border: 1px solid rgba(29,155,240,0.15);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.2s;
  pointer-events: auto;
}
.reachos-rewrite-item:hover {
  background: rgba(29,155,240,0.12);
}
.reachos-rewrite-text {
  font-size: 12px;
  line-height: 1.4;
  color: #e7e9ea;
  margin-bottom: 4px;
}
.reachos-rewrite-copy {
  font-size: 10px;
  color: #1d9bf0;
  font-weight: 600;
}
.reachos-rewrite-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.reachos-rewrite-score {
  font-size: 13px;
  font-weight: 800;
  color: #e7e9ea;
}
.reachos-rewrite-delta {
  font-size: 11px;
  font-weight: 700;
}
.reachos-rewrite-delta.positive {
  color: #00ba7c;
}
.reachos-rewrite-delta.negative {
  color: #f4212e;
}

/* AI Slop Badge */
.reachos-ai-section {
  padding: 0 16px 16px;
}
.reachos-ai-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(113,118,123,0.08);
  border: 1px solid rgba(113,118,123,0.2);
  border-radius: 8px;
}
.reachos-ai-badge.natural {
  background: rgba(0,186,124,0.1);
  border-color: rgba(0,186,124,0.3);
}
.reachos-ai-badge.mild {
  background: rgba(255,212,0,0.1);
  border-color: rgba(255,212,0,0.3);
}
.reachos-ai-badge.moderate {
  background: rgba(255,140,0,0.1);
  border-color: rgba(255,140,0,0.3);
}
.reachos-ai-badge.high {
  background: rgba(244,33,46,0.1);
  border-color: rgba(244,33,46,0.3);
}
.reachos-ai-badge.obvious {
  background: rgba(153,0,0,0.15);
  border-color: rgba(153,0,0,0.4);
}
.reachos-ai-badge-text {
  font-size: 11px;
  color: #71767b;
  line-height: 1.3;
}
.reachos-ai-badge.natural .reachos-ai-badge-text { color: #00ba7c; }
.reachos-ai-badge.mild .reachos-ai-badge-text { color: #ffd400; }
.reachos-ai-badge.moderate .reachos-ai-badge-text { color: #ff8c00; }
.reachos-ai-badge.high .reachos-ai-badge-text { color: #f4212e; }
.reachos-ai-badge.obvious .reachos-ai-badge-text { color: #cc0000; }

/* Pending animation */
.reachos-pending {
  animation: reachos-pulse-opacity 1.5s ease-in-out infinite;
}
@keyframes reachos-pulse-opacity {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Server enhanced badge */
.reachos-server-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 9px;
  color: #1d9bf0;
  letter-spacing: 0.3px;
}
.reachos-server-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #1d9bf0;
}

/* Idle state */
.reachos-idle {
  text-align: center;
  color: #71767b;
  font-size: 13px;
  padding: 30px 20px;
}

/* Error banner */
.reachos-error {
  padding: 6px 12px;
  background: rgba(244,33,46,0.08);
  border-bottom: 1px solid rgba(244,33,46,0.15);
  font-size: 10px;
  color: #f4212e;
  text-align: center;
}

/* No suggestions */
.reachos-no-suggestions {
  padding: 12px 16px;
  text-align: center;
  font-size: 11px;
  color: #00ba7c;
}

/* Minimized badge */
.reachos-mini-badge {
  background: #16181c;
  border: 1px solid #2f3336;
  border-radius: 24px;
  padding: 8px 14px;
  cursor: pointer;
  pointer-events: auto;
  font-size: 18px;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: transform 0.2s ease;
}
.reachos-mini-badge:hover {
  transform: scale(1.05);
}
.reachos-mini-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00ba7c;
}

/* Minimize button */
.reachos-minimize-btn {
  background: none;
  border: none;
  color: #71767b;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.reachos-minimize-btn:hover {
  background: rgba(255,255,255,0.1);
  color: #e7e9ea;
}

/* Suggestion count badge */
.reachos-suggestion-count {
  font-size: 10px;
  color: #71767b;
  padding: 0 16px 8px;
}

/* Reply Coach */
.reachos-reply-coach {
  padding: 8px 16px 12px;
  border-top: 1px solid #2f3336;
}
.reachos-reply-coach-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.reachos-reply-coach-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
.reachos-reply-coach-text {
  font-size: 12px;
  line-height: 1.4;
  color: #e7e9ea;
}
.reachos-reply-coach-text strong {
  color: #ffd400;
}
.reachos-reply-coach-btn {
  width: 100%;
  padding: 7px 12px;
  background: linear-gradient(135deg, #ffd400, #f59e0b);
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
}
.reachos-reply-coach-btn:disabled {
  opacity: 0.5;
}
.reachos-reply-suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reachos-reply-suggestion {
  padding: 6px 10px;
  background: rgba(255,212,0,0.06);
  border: 1px solid rgba(255,212,0,0.15);
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #e7e9ea;
  cursor: pointer;
  pointer-events: auto;
}
.reachos-reply-suggestion:hover {
  background: rgba(255,212,0,0.12);
}

/* Self-Reply Generator */
.reachos-self-reply {
  padding: 8px 16px 12px;
}

/* Timing Indicator */
.reachos-timing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px 10px;
  font-size: 11px;
  line-height: 1.3;
}
.reachos-timing-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.reachos-timing-text {
  color: #71767b;
}
.reachos-timing-good .reachos-timing-text {
  color: #00ba7c;
  font-weight: 600;
}
.reachos-timing-later .reachos-timing-text {
  color: #ffd400;
}
.reachos-timing-off .reachos-timing-text {
  color: #71767b;
}

/* Auto-Optimize */
.reachos-autoopt-progress {
  padding: 4px 0;
}
.reachos-autoopt-bar-bg {
  width: 100%;
  height: 4px;
  background: #2f3336;
  border-radius: 2px;
  overflow: hidden;
  margin: 8px 0;
}
.reachos-autoopt-bar {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #6d28d9);
  border-radius: 2px;
  transition: width 0.5s ease;
}
.reachos-autoopt-round {
  font-size: 11px;
  color: #71767b;
  text-align: center;
}
.reachos-autoopt-summary {
  margin-bottom: 8px;
}
.reachos-autoopt-badge {
  font-size: 11px;
  color: #8b5cf6;
  font-weight: 600;
}

/* Trending Badge */
.reachos-trending-section {
  padding: 0 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.reachos-trending-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: linear-gradient(135deg, rgba(255,122,0,0.12), rgba(255,60,0,0.08));
  border: 1px solid rgba(255,122,0,0.3);
  border-radius: 8px;
  animation: reachos-trending-glow 2s ease-in-out infinite;
}
@keyframes reachos-trending-glow {
  0%, 100% { border-color: rgba(255,122,0,0.3); }
  50% { border-color: rgba(255,122,0,0.6); }
}
.reachos-trending-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.reachos-trending-text {
  font-size: 11px;
  font-weight: 600;
  color: #ff7a00;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reachos-trending-bonus {
  font-size: 10px;
  font-weight: 700;
  color: #00ba7c;
  background: rgba(0,186,124,0.12);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
`;
