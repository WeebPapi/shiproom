"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { buttonClass, inputClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { createMeeting } from "@/lib/actions/meetings";
import { initialActionState } from "@/lib/actions/state";
import type { LinearOptionsState, RepositoryOption } from "@/lib/server/connections";

type Member = { id: string; name: string };
type Kind = "scheduled" | "huddle";

const LINEAR_UNAVAILABLE: Record<Exclude<LinearOptionsState["status"], "ready">, string> = {
  not_configured: "Linear isn't set up on this server yet.",
  disconnected: "Linear isn't connected. A team owner can connect it under Connections.",
  reconnect_required: "Linear access expired. A team owner needs to reconnect it under Connections.",
  unavailable: "Linear couldn't be reached right now. Try again shortly.",
};

const INFER = "Let Shiproom figure it out";

export function MeetingDialog(props: {
  teamId: string;
  currentUserId: string;
  members: Member[];
  repositories: RepositoryOption[];
  linear: LinearOptionsState;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("huddle");
  const [linearTeamId, setLinearTeamId] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [state, action] = useActionState(createMeeting, initialActionState);
  const timezones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"]), []);

  const linearTeams = props.linear.status === "ready" ? props.linear.teams : [];
  const projects = linearTeams.find((t) => t.id === linearTeamId)?.projects ?? [];

  function open(next: Kind) {
    setKind(next);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    dialogRef.current?.showModal();
  }

  const invalid = (name: string) => ({
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  });

  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={buttonClass.primary} onClick={() => open("huddle")}>
          Start huddle
        </button>
        <button type="button" className={buttonClass.secondary} onClick={() => open("scheduled")}>
          Schedule call
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="meeting-dialog-title"
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl"
      >
        <form action={action} className="space-y-4 p-5">
          <div className="flex items-start justify-between">
            <h2 id="meeting-dialog-title" className="text-base font-semibold">
              {kind === "scheduled" ? "Schedule a planning call" : "Start a huddle"}
            </h2>
            <button type="button" className="text-muted hover:text-foreground" onClick={() => dialogRef.current?.close()} aria-label="Close">
              ✕
            </button>
          </div>

          <input type="hidden" name="teamId" value={props.teamId} />
          <input type="hidden" name="kind" value={kind} />

          <div>
            <label htmlFor="meeting-title" className="mb-1 block font-medium">
              Title
            </label>
            <input id="meeting-title" name="title" required maxLength={200} className={inputClass} {...invalid("title")} />
            <FieldError state={state} name="title" />
          </div>

          <div>
            <label htmlFor="meeting-agenda" className="mb-1 block font-medium">
              Agenda <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="meeting-agenda" name="agenda" rows={2} maxLength={4000} className={inputClass} />
          </div>

          {kind === "scheduled" && (
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-1 font-medium">When</legend>
              <div>
                <label htmlFor="meeting-start" className="mb-1 block text-muted">
                  Start
                </label>
                <input id="meeting-start" type="datetime-local" name="startLocal" required className={inputClass} {...invalid("schedule.startLocal")} />
                <FieldError state={state} name="schedule.startLocal" />
              </div>
              <div>
                <label htmlFor="meeting-end" className="mb-1 block text-muted">
                  End
                </label>
                <input id="meeting-end" type="datetime-local" name="endLocal" required className={inputClass} {...invalid("schedule.endLocal")} />
                <FieldError state={state} name="schedule.endLocal" />
              </div>
              <div className="col-span-2">
                <label htmlFor="meeting-timezone" className="mb-1 block text-muted">
                  Timezone
                </label>
                <select id="meeting-timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <FieldError state={state} name="schedule.timezone" />
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1 font-medium">Attendees</legend>
            <ul className="max-h-32 space-y-1 overflow-auto">
              {props.members.map((m) => (
                <li key={m.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="attendeeIds"
                      value={m.id}
                      defaultChecked
                      disabled={m.id === props.currentUserId}
                    />
                    {m.name}
                    {m.id === props.currentUserId && <span className="text-muted">(you, organizer)</span>}
                  </label>
                </li>
              ))}
            </ul>
            <FieldError state={state} name="attendeeIds" />
          </fieldset>

          <div>
            <label htmlFor="meeting-language" className="mb-1 block font-medium">
              Transcription language
            </label>
            <select id="meeting-language" name="language" defaultValue="en" className={inputClass}>
              <option value="en">English</option>
              <option value="ka">Georgian (experimental)</option>
            </select>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-medium">Context</legend>

            <div>
              <label htmlFor="meeting-repo" className="mb-1 block text-muted">
                GitHub repository
              </label>
              <select id="meeting-repo" name="githubRepositoryId" defaultValue="" className={inputClass} {...invalid("context.githubRepositoryId")}>
                <option value="">{INFER}</option>
                {props.repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </select>
              {props.repositories.length === 0 && <p className="mt-1 text-xs text-muted">No repositories approved yet. An owner can add one under Connections.</p>}
              <FieldError state={state} name="context.githubRepositoryId" />
            </div>

            <div>
              <label htmlFor="meeting-linear-team" className="mb-1 block text-muted">
                Linear team
              </label>
              <select
                id="meeting-linear-team"
                name="linearTeamId"
                value={linearTeamId}
                onChange={(e) => setLinearTeamId(e.target.value)}
                disabled={props.linear.status !== "ready"}
                className={inputClass}
                {...invalid("context.linearTeamId")}
              >
                <option value="">{INFER}</option>
                {linearTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.key})
                  </option>
                ))}
              </select>
              {props.linear.status !== "ready" && <p className="mt-1 text-xs text-muted">{LINEAR_UNAVAILABLE[props.linear.status]}</p>}
              <FieldError state={state} name="context.linearTeamId" />
            </div>

            <div>
              <label htmlFor="meeting-linear-project" className="mb-1 block text-muted">
                Linear project
              </label>
              <select
                id="meeting-linear-project"
                name="linearProjectId"
                key={linearTeamId}
                defaultValue=""
                disabled={!linearTeamId}
                className={inputClass}
                {...invalid("context.linearProjectId")}
              >
                <option value="">{INFER}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {linearTeamId && projects.length === 0 && <p className="mt-1 text-xs text-muted">This Linear team has no projects.</p>}
              <FieldError state={state} name="context.linearProjectId" />
            </div>
          </fieldset>

          <p className="rounded-md bg-sidebar p-3 text-muted">
            After the call, agreed tasks become <code>[shiproom]</code> Linear issues automatically, and everyone who joined gets the links in their
            inbox. If Shiproom can&apos;t tell where work belongs, it asks you before creating anything.
          </p>

          <FormStatus state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass.secondary} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <SubmitButton pendingLabel="Creating…">{kind === "scheduled" ? "Schedule call" : "Start huddle"}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
