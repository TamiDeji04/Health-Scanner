import { NextResponse } from 'next/server';
import { runScan } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/scan
 * Triggers a new system health scan and returns the full ScanResult.
 * Called by the dashboard's "Run Scan" button.
 */
export async function POST() {
  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan failed:', error);
    return NextResponse.json(
      { error: 'Failed to run scan' },
      { status: 500 }
    );
  }
}
