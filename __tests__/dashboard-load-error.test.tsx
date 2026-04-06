/**
 * @vitest-environment jsdom
 *
 * Tests that DashboardClient shows an error message when the
 * /api/machines endpoint returns a non-ok response.
 *
 * Bug: the loadMachines useEffect only handles res.ok === true.
 * On a non-ok response (e.g. 500), nothing happens — the component
 * stays in its initial state with no user feedback, and loading
 * state is never cleared.
 *
 * Fix: add an else branch that sets a machineLoadError state
 * and displays it in the UI.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Next.js Link so it renders without Next.js router
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
}));

// Mock child components that require server environment
vi.mock('../components/local-date-time', () => ({
  default: ({ iso }: any) => React.createElement('span', null, iso),
}));
vi.mock('../components/theme-toggle', () => ({
  default: () => React.createElement('button', null, 'Toggle Theme'),
}));

describe('DashboardClient — loadMachines error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an error message when /api/machines returns 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    } as any);

    const { default: DashboardClient } = await import('../components/dashboard-client');
    render(React.createElement(DashboardClient));

    await waitFor(() => {
      expect(screen.getByText(/failed to load machines/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders normally when /api/machines returns ok with empty list', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as any)
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as any);

    const { default: DashboardClient } = await import('../components/dashboard-client');
    render(React.createElement(DashboardClient));

    // Should not show error message
    await waitFor(() => {
      expect(screen.queryByText(/failed to load machines/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
