import { NextResponse } from 'next/server';
import { runScan, ingestAgentScan } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/scan
 *
 * Two modes:
 * 1. Empty body → server runs scan itself (scans Vercel container)
 * 2. JSON body with { machineId, hostname, platform, metrics } →
 *    agent-pushed scan from a real user device
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let result;

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => null);
      if (body && body.machineId && Array.isArray(body.metrics)) {
        result = await ingestAgentScan(body);
      } else {
        result = await runScan();
      }
    } else {
      result = await runScan();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan failed:', error);
    return NextResponse.json({ error: 'Failed to run scan' }, { status: 500 });
  }
}
