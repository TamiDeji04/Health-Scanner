import DashboardClient from '@/components/dashboard-client';

/**
 * Home page — renders the DashboardClient component.
 *
 * This is a Server Component that simply mounts the client-side dashboard.
 * The dashboard handles its own data fetching via API routes.
 */
export default function Home() {
  return <DashboardClient />;
}
