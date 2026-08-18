/**
 * Skeleton for every dashboard page — the data layer is force-dynamic, so
 * without this a slow query means a blank screen instead of a loading state.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-bone-2" />
        <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-bone-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-28 animate-pulse bg-bone-2" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-bone-2" />
        ))}
      </div>
    </div>
  );
}
