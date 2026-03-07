import { Skeleton } from '@mantine/core';

export function ProjectCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex min-h-[288px] flex-col rounded-[var(--radius-xl)] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6"
        >
          <Skeleton height={56} width={56} radius="var(--radius-md)" mb="md" />
          <Skeleton height={28} width="70%" mb="sm" />
          <Skeleton height={14} width="90%" mb={6} />
          <Skeleton height={14} width="60%" mb="auto" />
          <div className="mt-auto space-y-2 pt-5">
            <Skeleton height={12} width="50%" />
            <Skeleton height={12} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="space-y-0">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-b-0 dark:border-slate-800"
          >
            <Skeleton circle height={36} />
            <div className="flex-1 space-y-1.5">
              <Skeleton height={14} width="30%" />
              <Skeleton height={12} width="50%" />
            </div>
            <Skeleton height={12} width={60} />
            <Skeleton height={12} width={100} />
          </div>
        ))}
      </div>
    </div>
  );
}
