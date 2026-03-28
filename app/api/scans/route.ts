import { NextResponse } from 'next/server';
import { getScans } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scans
 * Optional query param: ?machineId=<id> to filter by machine.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId') || undefined;
    const scans = await getScans(machineId);
    return NextResponse.json(scans);
  } catch (error) {
    console.error('Failed to fetch scans:', error);
    return NextResponse.json({ error: 'Failed to fetch scans' }, { status: 500 });
  }
}
