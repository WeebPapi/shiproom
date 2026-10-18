"use client";

import { createContext, use, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { badgeClass, buttonClass } from "@/components/styles";

// Demo mock for the recording: no code is generated and no GitHub PR exists. State is lost on refresh.
const Started = createContext(false);

export function MockPrBuild({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  return (
    <Started value={started}>
      {enabled && (
        <div className="flex justify-end">
          <button type="button" className={buttonClass.secondary} disabled={started} onClick={() => setStarted(true)} title="Demo mock: no code or pull requests are created">
            <Icon name="pr" className="size-3.5" />
            Build into PRs
          </button>
        </div>
      )}
      {children}
    </Started>
  );
}

export function MockPrStatus({ ordinal }: { ordinal: number }) {
  const started = use(Started);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!started) return;
    const timer = setTimeout(() => setDone(true), 2500 + ordinal * 900);
    return () => clearTimeout(timer);
  }, [started, ordinal]);

  if (!started) return null;
  return (
    <span className={`${badgeClass} shrink-0`} aria-live="polite">
      {done ? (
        <>
          <Icon name="pr" className="size-3 text-success" />
          <span className="font-mono">#{40 + ordinal}</span>
        </>
      ) : (
        <>
          <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-border border-t-accent" />
          Building PR…
        </>
      )}
    </span>
  );
}
