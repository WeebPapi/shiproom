/** Top bar of the content panel: title (or breadcrumb) on the left, actions on the right. */
export function PageHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-6 backdrop-blur">
      <h1 className="flex min-w-0 items-center gap-1.5 truncate font-medium">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function PageBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-4xl space-y-8 px-6 py-6 ${className}`}>{children}</div>;
}

export function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2 text-xs font-medium text-muted">
      {children}
    </h2>
  );
}

export function Avatar({ name, className = "size-5 text-[10px]" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-subtle font-medium text-muted ring-1 ring-border ${className}`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
