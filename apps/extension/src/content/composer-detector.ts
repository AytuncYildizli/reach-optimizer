/**
 * ComposerDetector — watches X.com's DOM for the tweet composer and
 * forwards text changes to a callback with a 300 ms debounce.
 *
 * Also watches the composer's parent container for media additions
 * (images, videos, GIFs) which don't trigger text change events.
 */

const COMPOSER_SELECTORS = [
  'div[data-testid="tweetTextarea_0"]',
  'div[data-testid="tweetTextarea_0_label"] div[role="textbox"]',
  'div[role="textbox"][contenteditable="true"]',
] as const;

export class ComposerDetector {
  private onTextChange: (composerEl: HTMLElement, text: string) => void;
  private bodyObserver: MutationObserver | null = null;
  private composerObserver: MutationObserver | null = null;
  private mediaObserver: MutationObserver | null = null;
  private currentComposer: HTMLElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(onTextChange: (composerEl: HTMLElement, text: string) => void) {
    this.onTextChange = onTextChange;
  }

  start(): void {
    // Check immediately in case the composer already exists
    this.detectComposer();

    // Watch for composer appearing / disappearing
    this.bodyObserver = new MutationObserver(() => {
      this.detectComposer();
    });

    this.bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.composerObserver?.disconnect();
    this.composerObserver = null;
    this.mediaObserver?.disconnect();
    this.mediaObserver = null;
    this.currentComposer = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private detectComposer(): void {
    let composer: HTMLElement | null = null;

    for (const selector of COMPOSER_SELECTORS) {
      composer = document.querySelector<HTMLElement>(selector);
      if (composer) break;
    }

    if (!composer || composer === this.currentComposer) return;

    console.log('[ReachOS] Composer detected');

    // Tear down previous listeners
    this.composerObserver?.disconnect();
    this.mediaObserver?.disconnect();
    this.currentComposer = composer;

    // Set up inner MutationObserver on the composer element (text changes)
    this.composerObserver = new MutationObserver(() => {
      this.handleTextChange();
    });

    this.composerObserver.observe(composer, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    // Also watch the composer's parent container for media additions.
    // When a user adds an image/video/GIF, the DOM changes happen OUTSIDE
    // the text area (in the parent form/dialog), so we need a separate observer.
    const composerContainer =
      composer.closest('[data-testid="tweetButtonInline"]')?.parentElement
      || composer.closest('[role="dialog"]')
      || composer.closest('form')
      || (() => {
        // Walk up ~10 levels to find a reasonable container
        let el: HTMLElement | null = composer as HTMLElement;
        for (let i = 0; i < 10 && el; i++) el = el.parentElement;
        return el;
      })();

    if (composerContainer && composerContainer !== composer) {
      this.mediaObserver = new MutationObserver((mutations) => {
        // Only re-trigger if media-related elements were added/removed
        const hasMediaChange = mutations.some((m) => {
          if (m.type !== 'childList') return false;
          // Check added nodes for media indicators
          for (const node of m.addedNodes) {
            if (node instanceof HTMLElement) {
              if (
                node.querySelector?.('img') ||
                node.querySelector?.('video') ||
                node.querySelector?.('[data-testid="attachments"]') ||
                node.querySelector?.('[data-testid="tweetPhoto"]') ||
                node.tagName === 'IMG' ||
                node.tagName === 'VIDEO'
              ) {
                return true;
              }
            }
          }
          // Check removed nodes (media removed)
          for (const node of m.removedNodes) {
            if (node instanceof HTMLElement) {
              if (
                node.querySelector?.('img') ||
                node.querySelector?.('video') ||
                node.tagName === 'IMG' ||
                node.tagName === 'VIDEO'
              ) {
                return true;
              }
            }
          }
          return false;
        });

        if (hasMediaChange) {
          console.log('[ReachOS] Media change detected in composer container');
          this.handleTextChange();
        }
      });

      this.mediaObserver.observe(composerContainer, {
        childList: true,
        subtree: true,
      });
    }

    // Also listen for input events (covers IME, paste, etc.)
    composer.addEventListener('input', () => {
      this.handleTextChange();
    });

    // Fire once immediately so the panel shows current text state
    this.handleTextChange();
  }

  private handleTextChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (!this.currentComposer) return;
      // Use innerText to preserve line breaks (textContent strips them)
      const text = (this.currentComposer.innerText ?? '').trim();
      this.onTextChange(this.currentComposer, text);
    }, 300);
  }
}
