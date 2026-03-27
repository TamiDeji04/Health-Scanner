'use client';

import Link from 'next/link';
import type { ScanResult, Category } from '@/lib/system/types';
import LocalDateTime from './local-date-time';
import ThemeToggle from './theme-toggle';

/**
 * ReportView — printable, detailed view of a single scan result.
 *
 * Rendered as a client component because it uses:
 * - ThemeToggle (client-only)
 * - LocalDateTime (client-only hydration-safe timestamps)
 * - window.print() for the print button
 *
 * The parent page.tsx is a Server Component that fetches the scan data
 * directly from the scan service (no API call needed on the server).
 */
interface ReportViewProps {
  scan: ScanResult;
}

export default function ReportView({ scan }: ReportViewProps) {
  const getMetric = (category: Category) =>
    scan.metrics.find((m) => m.category === category && m.unit === '%');

  const getDetails = (category: Category) =>
    scan.metrics.filter((m) => m.category === category && m.unit !== '%');

  const statusLabels = {
    normal: 'Normal',
    warning: 'Warning',
    critical: 'Critical',
  };

  return (
    <div className="app-layout">
      {/* ─── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">System Health Scanner</div>
        <div className="sidebar-subtitle">Local Monitor</div>
        <nav className="sidebar-nav">
          <Link href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </Link>
          <Link href={`/report/${scan.id}`} className="active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Report</span>
          </Link>
        </nav>
        <div className="sidebar-spacer" />
        <ThemeToggle />
      </aside>

      {/* ─── Main Content ───────────────────────────────────────────────── */}
      <main className="main-content">
        {/* Report Header */}
        <div className="report-header">
          <h1 className="report-title">Scan Report</h1>
          <div className="report-actions">
            <Link href="/" className="btn-secondary">
              ← Back to Dashboard
            </Link>
            <button
              className="btn-secondary"
              onClick={() => window.print()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* System Info Grid */}
        <div className="report-info-grid">
          <div className="report-info-card">
            <div className="report-info-label">Scan ID</div>
            <div className="report-info-value" style={{ fontSize: 11 }}>
              {scan.id}
            </div>
          </div>
          <div className="report-info-card">
            <div className="report-info-label">Timestamp</div>
            <div className="report-info-value">
              <LocalDateTime timestamp={scan.timestamp} />
            </div>
          </div>
          <div className="report-info-card">
            <div className="report-info-label">Hostname</div>
            <div className="report-info-value">{scan.hostname}</div>
          </div>
          <div className="report-info-card">
            <div className="report-info-label">Platform</div>
            <div className="report-info-value">{scan.platform}</div>
          </div>
        </div>

        {/* Overall Status */}
        <div className={`status-banner ${scan.overallStatus}`}>
          <span className="status-dot" />
          <span>
            Overall Status: <strong>{statusLabels[scan.overallStatus]}</strong>
          </span>
        </div>

        {/* Metrics */}
        <div className="section-header">
          <h2 className="section-title">Metrics</h2>
        </div>
        <div className="metrics-grid" style={{ marginBottom: 32 }}>
          {(['cpu', 'memory', 'disk'] as Category[]).map((cat) => {
            const metric = getMetric(cat);
            const details = getDetails(cat);
            if (!metric) return null;

            return (
              <ReportMetricCard
                key={cat}
                title={cat === 'cpu' ? 'CPU' : cat === 'memory' ? 'Memory' : 'Disk'}
                value={metric.value}
                status={metric.status}
                details={details}
              />
            );
          })}
        </div>

        {/* Flags */}
        {scan.flags.length > 0 && (
          <>
            <div className="section-header">
              <h2 className="section-title">Issues</h2>
            </div>
            <div className="flags-list">
              {scan.flags.map((flag, i) => (
                <div key={i} className="flag-item">
                  <span className={`flag-badge ${flag.severity}`}>
                    {flag.severity}
                  </span>
                  <span>{flag.message}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {scan.flags.length === 0 && (
          <div style={{ marginBottom: 32, padding: '16px 20px', background: 'var(--status-normal-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(106,180,148,0.2)', color: 'var(--status-normal)', fontSize: 14 }}>
            No issues detected — all metrics within normal thresholds.
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Report Metric Card ──────────────────────────────────────────────────────

interface ReportMetricCardProps {
  title: string;
  value: number;
  status: string;
  details: { label: string; value: number; unit: string }[];
}

function ReportMetricCard({ title, value, status, details }: ReportMetricCardProps) {
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
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--ring-track)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="metric-ring-label">
          <span className="metric-ring-value">{value}</span>
          <span className="metric-ring-unit">%</span>
        </div>
      </div>
      <div className="metric-card-title">{title}</div>
      {details.length > 0 && (
        <div className="metric-card-details">
          {details.map((d) => `${d.value} ${d.unit}`).join(' / ')}
        </div>
      )}
    </div>
  );
}
