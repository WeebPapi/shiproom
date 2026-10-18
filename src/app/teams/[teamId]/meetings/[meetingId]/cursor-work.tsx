"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { badgeClass } from "@/components/styles";
import type { CursorWork } from "@/lib/call-result";

export function CursorWorkPoll({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}

export function CursorWorkBadge({ work }: { work: CursorWork | undefined }) {
  if (!work) return null;
  const busy = work.phase === "assigned" || work.phase === "building";
  const body = work.href ? (
    <a href={work.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
      {work.phase === "ready" && <Icon name="pr" className="size-3 text-success" />}
      {work.label}
    </a>
  ) : (
    work.label
  );
  return (
    <span className={`${badgeClass} shrink-0`} aria-live="polite">
      {busy && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-border border-t-accent" />}
      {body}
    </span>
  );
}
