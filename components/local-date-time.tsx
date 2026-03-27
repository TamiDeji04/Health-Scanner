'use client';

import { useState, useEffect } from 'react';

/**
 * LocalDateTime — hydration-safe timestamp rendering.
 *
 * The problem: Server renders with one timezone, client has another.
 * If we format dates during SSR, hydration will mismatch.
 *
 * The solution:
 * 1. Server: renders the raw ISO string (deterministic, same everywhere)
 * 2. Client (useEffect): formats with Intl.DateTimeFormat in user's timezone
 * 3. suppressHydrationWarning on <time> prevents React warnings
 *
 * This pattern ensures no hydration errors while still showing localized times.
 */
interface LocalDateTimeProps {
  timestamp: string;
  className?: string;
}

export default function LocalDateTime({ timestamp, className }: LocalDateTimeProps) {
  const [formatted, setFormatted] = useState(timestamp);

  useEffect(() => {
    try {
      const date = new Date(timestamp);
      const fmt = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setFormatted(fmt.format(date));
    } catch (_e) {
      // Keep ISO string if formatting fails
    }
  }, [timestamp]);

  return (
    <time dateTime={timestamp} className={className} suppressHydrationWarning>
      {formatted}
    </time>
  );
}
