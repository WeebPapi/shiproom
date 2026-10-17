const buttonBase =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

export const buttonClass = {
  primary: `${buttonBase} bg-accent text-accent-foreground shadow-xs hover:bg-accent/90`,
  secondary: `${buttonBase} border border-border bg-surface shadow-xs hover:bg-subtle`,
  ghost: `${buttonBase} text-muted hover:bg-subtle hover:text-foreground`,
  danger: `${buttonBase} h-7 px-2 text-xs text-danger hover:bg-danger/10`,
};

export const inputClass =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-foreground shadow-xs transition-colors placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const labelClass = "mb-1.5 block text-xs font-medium text-muted";

export const cardClass = "rounded-lg border border-border bg-surface";

/** List rows inside a card: compact, single-line, hover highlight. */
export const rowClass = "flex min-h-11 items-center gap-3 px-4 py-2 transition-colors";

export const badgeClass = "inline-flex h-5 items-center gap-1.5 rounded-full border border-border px-2 text-xs text-muted";
