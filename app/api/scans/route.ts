import { NextResponse } from 'next/server';
import { getScans } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scans
 * Returns ScanSummary[] — all past scans, sorted newest-first.
 * Used by the dashboard to populate the scan history list.
 */
export async function GET() {
  try {
    const scans = await getScans();
    return NextResponse.json(scans);
  } catch (error) {
    console.error('Failed to fetch scans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scans' },
      { status: 500 }
    );
  }
}
