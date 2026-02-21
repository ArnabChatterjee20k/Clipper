/**
 * Skeleton rows for table loading state.
 */

import { cn } from "@/lib/utils";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 8,
  columns = 6,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("animate-pulse", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border py-3 px-4"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-5 rounded bg-muted flex-1 min-w-0"
              style={{
                maxWidth: j === 0 ? 32 : j === columns - 1 ? 80 : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
