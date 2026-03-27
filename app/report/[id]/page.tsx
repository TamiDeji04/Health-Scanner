import { getScanById } from '@/lib/system/scan-service';
import ReportView from '@/components/report-view';
import { notFound } from 'next/navigation';

/**
 * Report page — Server Component that fetches scan data directly
 * from the scan service (no API call needed on the server).
 *
 * Passes the full ScanResult to the ReportView client component.
 */
export default async function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const scan = await getScanById(params.id);

  if (!scan) {
    notFound();
  }

  return <ReportView scan={scan} />;
}
