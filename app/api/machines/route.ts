import { NextResponse } from 'next/server';
import { getMachines } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/machines
 * Returns all machines that have ever pushed a scan, sorted by lastSeen.
 */
export async function GET() {
  try {
    const machines = await getMachines();
    return NextResponse.json(machines);
  } catch (error) {
    console.error('Failed to fetch machines:', error);
    return NextResponse.json({ error: 'Failed to fetch machines' }, { status: 500 });
  }
}
