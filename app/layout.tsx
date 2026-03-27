import type { Metadata } from 'next';
import { themeScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'System Health Scanner',
  description: 'Local system health monitoring dashboard',
};

/**
 * Root Layout
 *
 * The blocking <script> in <head> prevents flash-of-wrong-theme (FOWT).
 * It reads localStorage and prefers-color-scheme BEFORE the first paint,
 * setting data-theme on <html> so CSS variables resolve correctly immediately.
 *
 * suppressHydrationWarning is needed because the server doesn't know the
 * client's theme preference — the script sets attributes client-side before
 * React hydrates, so the server/client HTML won't match for <html>.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
