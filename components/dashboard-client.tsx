'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ScanResult, ScanSummary, Category } from '@/lib/system/types';
import LocalDateTime from './local-date-time';
import ThemeToggle from './theme-toggle';

/**
 * DashboardClient — the main dashboard UI.
 *
 * This is a client component ('use client') because it:
 * - Fetches data on mount and on user action
 * - Manages scan state and loading states
 * - Handles the "Run Scan" button interaction
 *
 * Architecture:
 * - Fetches latest scan from GET /api/scans on mount
 * - "Run Scan" button calls POST /api/scan
 * - Displays: status banner, 3 metric cards with SVG progress rings,
 *   issues section, and recent scan history
 */
export default function DashboardClient() {
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load most recent scan and history on mount
  useEffect(() => {
    async function loadInitial() {
      try {
        const res = await fetch('/api/scans');
        const scans: ScanSummary[] = await res.json();
        setHistory(scans);

        // Load the most recent full scan if available
        if (scans.length > 0) {
          const detailRes = await fetch(`/api/scans/${scans[0].id}`);
          if (detailRes.ok) {
            const scan: ScanResult = await detailRes.json();
            setCurrentScan(scan);
          }
        }
      } catch (e) {
        console.error('Failed to load scans:', e);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  // Run a new scan
  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (res.ok) {
        const scan: ScanResult = await res.json();
        setCurrentScan(scan);

        // Refresh history
        const histRes = await fetch('/api/scans');
        if (histRes.ok) {
          setHistory(await histRes.json());
        }
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      setScanning(false);
    }
  }, []);

  // Get the primary % metric for each category
  const getMetric = (category: Category) => {
    if (!currentScan) return null;
    return currentScan.metrics.find(
      (m) => m.category === category && m.unit === '%'
    );
  };

  // Get detail metrics (non-% like "Used Memory: 8.2 GB")
  const getDetails = (category: Category) => {
    if (!currentScan) return [];
    return currentScan.metrics.filter(
      (m) => m.category === category && m.unit !== '%'
    );
  };

  return (
    <div className="app-layout">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">System Health Scanner</div>
        <div className="sidebar-subtitle">Local Monitor</div>
        <nav className="sidebar-nav">
          <Link href="/" className="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </Link>
        </nav>
        <div className="sidebar-spacer" />
        <ThemeToggle />
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="main-content">
        {/* Page Header */}
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <button
            className="btn-primary"
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <span className="spinner" />
                Scanning...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Run Scan
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="spinner" style={{ margin: '0 auto', width: 24, height: 24 }} />
          </div>
        ) : !currentScan ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div className="empty-state-title">No scans yet</div>
            <div className="empty-state-text">
              Run your first scan to see system health metrics for this machine.
            </div>
          </div>
        ) : (
          <>
            {/* Status Banner */}
            <div className={`status-banner ${currentScan.overallStatus}`}>
              <span className="status-dot" />
              <span>
                System status:{' '}
                <strong>
                  {currentScan.overallStatus === 'normal'
                    ? 'All systems normal'
                    : currentScan.overallStatus === 'warning'
                    ? 'Warnings detected'
                    : 'Critical issues detected'}
                </strong>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
                <LocalDateTime timestamp={currentScan.timestamp} />
              </span>
            </div>

            {/* Metric Cards */}
            <div className="metrics-grid">
              {(['cpu', 'memory', 'disk'] as Category[]).map((cat) => {
                const metric = getMetric(cat);
                const details = getDetails(cat);
                if (!metric) return null;

                return (
                  <MetricCard
                    key={cat}
                    title={cat === 'cpu' ? 'CPU' : cat === 'memory' ? 'Memory' : 'Disk'}
                    value={metric.value}
                    status={metric.status}
                    details={details.map((d) => `${d.label}: ${d.value} ${d.unit}`).join(' / ')}
                  />
                );
              })}
            </div>

            {/* Issues Section */}
            {currentScan.flags.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div className="section-header">
                  <h2 className="section-title">Issues</h2>
                </div>
                <div className="flags-list">
                  {currentScan.flags.map((flag, i) => (
                    <div key={i} className="flag-item">
                      <span className={`flag-badge ${flag.severity}`}>
                        {flag.severity}
                      </span>
                      <span>{flag.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Scan History */}
        {history.length > 0 && (
          <div>
            <div className="section-header">
              <h2 className="section-title">Recent Scans</h2>
            </div>
            <div className="history-list">
              {history.slice(0, 10).map((scan) => (
                <Link
                  key={scan.id}
                  href={`/report/${scan.id}`}
                  className="history-item"
                >
                  <div className="history-item-left">
                    <span className={`history-status-dot ${scan.overallStatus}`} />
                    <span className="history-id">
                      {scan.id.slice(0, 8)}...
                    </span>
                  </div>
                  <LocalDateTime
                    timestamp={scan.timestamp}
                    className="history-time"
                  />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── MetricCard Sub-component ────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: number;
  status: string;
  details: string;
}

/**
 * MetricCard — displays a single category metric with an SVG progress ring.
 *
 * The SVG ring uses stroke-dasharray and stroke-dashoffset to create
 * a circular progress indicator. The ring color matches the metric's status.
 */
function MetricCard({ title, value, status, details }: MetricCardProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100);
  const offset = circumference - (progress / 100) * circumference;

  const statusColors: Record<string, string> = {
    normal: 'var(--status-normal)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  };

  const color = statusColors[status] || statusColors.normal;

  return (
    <div className="metric-card">
      <div className="metric-ring-container">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Track (background circle) */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth="6"
          />
          {/* Progress arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="metric-ring-label">
          <span className="metric-ring-value">{value}</span>
          <span className="metric-ring-unit">%</span>
        </div>
      </div>
      <div className="metric-card-title">{title}</div>
      {details && <div className="metric-card-details">{details}</div>}
    </div>
  );
}
