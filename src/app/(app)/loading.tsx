export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-[var(--color-surface-2)] rounded" />
        <div className="h-4 w-64 bg-[var(--color-surface-2)] rounded" />
      </div>
      <div className="space-y-3">
        <div className="h-32 bg-[var(--color-surface-2)] rounded-lg" />
        <div className="h-32 bg-[var(--color-surface-2)] rounded-lg" />
      </div>
    </div>
  );
}
