'use client';

import { useState, useEffect, useCallback } from 'react';
import { THEME_KEY, ThemeMode } from '@/lib/theme';

/**
 * ThemeToggle — cycles between system → light → dark.
 *
 * Reads the current mode from data-mode attribute (set by blocking script).
 * On click, cycles to the next mode, updates:
 * 1. localStorage (for persistence across sessions)
 * 2. data-theme on <html> (for CSS variables)
 * 3. data-mode on <html> (for tracking current mode)
 * 4. Local state (for UI label update)
 */
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-mode') as ThemeMode;
    if (stored) setMode(stored);
  }, []);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const nextIndex = (order.indexOf(mode) + 1) % order.length;
    const next = order[nextIndex];

    // Resolve the actual theme for CSS
    let resolved = next;
    if (next === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-mode', next);
    setMode(next);
  }, [mode]);

  const icons: Record<ThemeMode, JSX.Element> = {
    system: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    light: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    dark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  };

  const labels: Record<ThemeMode, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  };

  return (
    <button className="theme-toggle" onClick={cycleTheme} aria-label={`Current theme: ${mode}. Click to switch.`}>
      {icons[mode]}
      <span>{labels[mode]}</span>
    </button>
  );
}
