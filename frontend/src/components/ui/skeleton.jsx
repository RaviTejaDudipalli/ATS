export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function JobCardSkeleton() {
  return (
    <div className="card p-6">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-14" />
      </div>
      <Skeleton className="mt-6 h-4 w-1/4" />
    </div>
  );
}
