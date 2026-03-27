import { NextResponse } from 'next/server';
import { getScanById } from '@/lib/system/scan-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scans/[id]
 * Returns the full ScanResult for a specific scan by ID.
 * Used by the report view when fetching scan details.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scan = await getScanById(params.id);

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(scan);
  } catch (error) {
    console.error('Failed to fetch scan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scan' },
      { status: 500 }
    );
  }
}
