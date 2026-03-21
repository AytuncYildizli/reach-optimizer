/**
 * ComposerDetector — watches X.com's DOM for the tweet composer and
 * forwards text changes to a callback with a 300 ms debounce.
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

    // Tear down previous composer listener
    this.composerObserver?.disconnect();
    this.currentComposer = composer;

    // Set up inner MutationObserver on the composer element
    this.composerObserver = new MutationObserver(() => {
      this.handleTextChange();
    });

    this.composerObserver.observe(composer, {
      characterData: true,
      childList: true,
      subtree: true,
    });

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
      const text = (this.currentComposer.textContent ?? '').trim();
      this.onTextChange(this.currentComposer, text);
    }, 300);
  }
}
