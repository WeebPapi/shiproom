"use client";

import Link from "next/link";
import { useRef } from "react";
import { CreateTeamForm } from "@/app/create-team-form";
import { signOut } from "@/lib/actions/session";
import type { TeamMembership } from "@/lib/server/auth";
import { Icon } from "./icons";

const itemClass = "flex h-8 w-full items-center gap-2 rounded px-2 text-left transition-colors hover:bg-subtle";

export function TeamSwitcher({ teams, currentTeamId, email }: { teams: TeamMembership[]; currentTeamId?: string; email: string | null }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const current = teams.find((t) => t.teamId === currentTeamId);
  const close = () => menuRef.current?.hidePopover();

  return (
    <>
      <button
        type="button"
        popoverTarget="team-menu"
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 font-medium transition-colors hover:bg-foreground/5"
      >
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded bg-accent text-[11px] font-semibold text-accent-foreground">
          {(current?.teamName ?? "Shiproom").charAt(0).toUpperCase()}
        </span>
        <span className="truncate">{current?.teamName ?? "Shiproom"}</span>
        <Icon name="chevron" className="ml-auto size-3.5 shrink-0 text-muted" />
      </button>

      {/* Top-layer menu; fixed under the switcher, which always sits at the sidebar's top-left. */}
      <div
        ref={menuRef}
        id="team-menu"
        popover="auto"
        style={{ inset: "2.75rem auto auto 0.5rem", margin: 0 }}
        className="w-64 rounded-lg border border-border bg-surface p-1 text-foreground shadow-lg"
      >
        {email && <p className="truncate px-2 pt-1.5 pb-1 text-xs text-muted">{email}</p>}
        {teams.length > 0 && (
          <ul aria-label="Teams" className="pb-1">
            {teams.map((t) => (
              <li key={t.teamId}>
                <Link href={`/teams/${t.teamId}`} onClick={close} className={itemClass} aria-current={t.teamId === currentTeamId ? "page" : undefined}>
                  <span className="truncate">{t.teamName}</span>
                  {t.teamId === currentTeamId && <Icon name="check" className="ml-auto size-3.5 text-muted" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border pt-1">
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              close();
              dialogRef.current?.showModal();
            }}
          >
            <Icon name="plus" className="size-3.5 text-muted" />
            Create team
          </button>
          <form action={signOut}>
            <button type="submit" className={`${itemClass} text-muted`}>
              <Icon name="logout" className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="create-team-title"
        className="m-auto w-full max-w-sm rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 id="create-team-title" className="font-medium">
            Create a team
          </h2>
          <button type="button" className="text-muted hover:text-foreground" onClick={() => dialogRef.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="px-5 pt-1 text-muted">You become its owner and can invite teammates and connect Linear and GitHub.</p>
        <div className="p-5 pt-4">
          <CreateTeamForm />
        </div>
      </dialog>
    </>
  );
}
