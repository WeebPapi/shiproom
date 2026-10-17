// Lets dynamic team routes prefetch the shell and switch instantly while data streams in.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col">
      <div className="h-12 shrink-0 border-b border-border" />
      <div className="mx-auto w-full max-w-4xl space-y-3 px-6 py-6">
        <div className="h-4 w-40 animate-pulse rounded bg-subtle" />
        <div className="h-24 animate-pulse rounded-lg bg-subtle" />
        <div className="h-24 animate-pulse rounded-lg bg-subtle" />
      </div>
    </div>
  );
}
