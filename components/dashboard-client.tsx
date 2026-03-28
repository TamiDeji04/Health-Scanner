'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ScanResult, ScanSummary, Category, MachineInfo } from '@/lib/system/types';
import LocalDateTime from './local-date-time';
import ThemeToggle from './theme-toggle';

export default function DashboardClient() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load machines on mount
  useEffect(() => {
    async function loadMachines() {
      try {
        const res = await fetch('/api/machines');
        if (res.ok) {
          const data: MachineInfo[] = await res.json();
          setMachines(data);
          if (data.length > 0 && !selectedMachineId) {
            setSelectedMachineId(data[0].machineId);
          }
        }
      } catch (e) {
        console.error('Failed to load machines:', e);
      }
    }
    loadMachines();
  }, []);

  // Load scans whenever selectedMachineId changes
  useEffect(() => {
    async function loadScans() {
      setLoading(true);
      setCurrentScan(null);
      setHistory([]);
      try {
        const url = selectedMachineId
          ? `/api/scans?machineId=${encodeURIComponent(selectedMachineId)}`
          : '/api/scans';
        const res = await fetch(url);
        const scans: ScanSummary[] = await res.json();
        setHistory(scans);
        if (scans.length > 0) {
          const detailRes = await fetch(`/api/scans/${scans[0].id}`);
          if (detailRes.ok) {
            setCurrentScan(await detailRes.json());
          }
        }
      } catch (e) {
        console.error('Failed to load scans:', e);
      } finally {
        setLoading(false);
      }
    }
    loadScans();
  }, [selectedMachineId]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (res.ok) {
        const scan: ScanResult = await res.json();
        setCurrentScan(scan);
        // Refresh machines + history
        const [machinesRes, histRes] = await Promise.all([
          fetch('/api/machines'),
          fetch(selectedMachineId ? `/api/scans?machineId=${encodeURIComponent(selectedMachineId)}` : '/api/scans'),
        ]);
        if (machinesRes.ok) setMachines(await machinesRes.json());
        if (histRes.ok) setHistory(await histRes.json());
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      setScanning(false);
    }
  }, [selectedMachineId]);

  const getMetric = (category: Category) => {
    if (!currentScan) return null;
    return currentScan.metrics.find(m => m.category === category && m.unit === '%');
  };

  const getDetails = (category: Category) => {
    if (!currentScan) return [];
    return currentScan.metrics.filter(m => m.category === category && m.unit !== '%');
  };

  const platformIcon = (platform: string) => {
    if (platform === 'darwin') return '🍎';
    if (platform === 'win32') return '🪟';
    return '🐧';
  };

  return (
    <div className="app-layout">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">System Health Scanner</div>
        <div className="sidebar-subtitle">Local Monitor</div>

        {/* Machine List */}
        {machines.length > 0 && (
          <div className="machine-list">
            <div className="machine-list-label">MACHINES</div>
            {machines.map(m => (
              <button
                key={m.machineId}
                className={`machine-item${selectedMachineId === m.machineId ? ' active' : ''}`}
                onClick={() => setSelectedMachineId(m.machineId)}
              >
                <span className="machine-icon">{platformIcon(m.platform)}</span>
                <span className="machine-name">{m.hostname}</span>
              </button>
            ))}
          </div>
        )}

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
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            {currentScan && (
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
                {currentScan.hostname} · {currentScan.platform}
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={runScan} disabled={scanning}>
            {scanning ? (
              <><span className="spinner" />Scanning...</>
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

        {/* Agent Setup Banner — shown when no machines registered */}
        {machines.length === 0 && !loading && (
          <div className="agent-banner">
            <div className="agent-banner-title">Connect your device</div>
            <div className="agent-banner-text">
              Run the agent on any machine to see its real metrics here.
              Download <code>agent.mjs</code> from the repo and run:
            </div>
            <code className="agent-banner-code">
              node agent.mjs --url https://health-scanner-cyan.vercel.app
            </code>
          </div>
        )}

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
              {selectedMachineId
                ? 'No scans from this machine yet.'
                : 'Run your first scan or connect a device agent.'}
            </div>
          </div>
        ) : (
          <>
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

            <div className="metrics-grid">
              {(['cpu', 'memory', 'disk'] as Category[]).map(cat => {
                const metric = getMetric(cat);
                const details = getDetails(cat);
                if (!metric) return null;
                return (
                  <MetricCard
                    key={cat}
                    title={cat === 'cpu' ? 'CPU' : cat === 'memory' ? 'Memory' : 'Disk'}
                    value={metric.value}
                    status={metric.status}
                    details={details.map(d => `${d.label}: ${d.value} ${d.unit}`).join(' / ')}
                  />
                );
              })}
            </div>

            {currentScan.flags.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div className="section-header">
                  <h2 className="section-title">Issues</h2>
                </div>
                <div className="flags-list">
                  {currentScan.flags.map((flag, i) => (
                    <div key={i} className="flag-item">
                      <span className={`flag-badge ${flag.severity}`}>{flag.severity}</span>
                      <span>{flag.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {history.length > 0 && (
          <div>
            <div className="section-header">
              <h2 className="section-title">Recent Scans</h2>
            </div>
            <div className="history-list">
              {history.slice(0, 10).map(scan => (
                <Link key={scan.id} href={`/report/${scan.id}`} className="history-item">
                  <div className="history-item-left">
                    <span className={`history-status-dot ${scan.overallStatus}`} />
                    <span className="history-id">{scan.id.slice(0, 8)}...</span>
                  </div>
                  <LocalDateTime timestamp={scan.timestamp} className="history-time" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── MetricCard ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: number;
  status: string;
  details: string;
}

function MetricCard({ title, value, status, details }: MetricCardProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const colors: Record<string, string> = {
    normal: 'var(--status-normal)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  };
  const color = colors[status] || colors.normal;

  return (
    <div className="metric-card">
      <div className="metric-ring-container">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--ring-track)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 0.6s ease' }}
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
