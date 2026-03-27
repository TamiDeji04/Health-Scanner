/**
 * Theme system constants and blocking script.
 *
 * The blocking script is injected into <head> via layout.tsx as a raw <script>.
 * It runs BEFORE React hydration to prevent flash-of-wrong-theme (FOWT):
 *
 * 1. Check localStorage for saved preference ('system', 'light', 'dark')
 * 2. If 'system' or no preference, check prefers-color-scheme media query
 * 3. Set data-theme attribute on <html> element
 *
 * This must be a blocking script (not async/defer) to ensure the correct
 * theme is applied before the first paint.
 */

export const THEME_KEY = 'system-health-theme';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Blocking script injected into <head>.
 * Minified to reduce blocking time. Runs before first paint.
 */
export const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('${THEME_KEY}');
    var mode = stored || 'system';
    var resolved = mode;
    if (mode === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-mode', mode);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-mode', 'system');
  }
})();
`;
