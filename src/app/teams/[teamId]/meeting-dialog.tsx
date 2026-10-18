"use client";

import { Suspense, use, useActionState, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { buttonClass, inputClass, labelClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { createMeeting } from "@/lib/actions/meetings";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { DEFAULT_LANGUAGE } from "@/lib/contracts";
import type { LinearOptionsState, RepositoryOption } from "@/lib/server/connections";

type Member = { id: string; name: string };
type Kind = "scheduled" | "huddle";

const LINEAR_UNAVAILABLE: Record<Exclude<LinearOptionsState["status"], "ready">, string> = {
  not_configured: "Linear isn't set up on this server yet.",
  disconnected: "Linear isn't connected. A team owner can connect it under Connections.",
  reconnect_required: "A team owner needs to reconnect Linear under Connections to restore issue access and editing permissions.",
  unavailable: "Linear couldn't be reached right now. Try again shortly.",
};

const INFER = "Let Shiproom figure it out";

export function MeetingDialog(props: {
  teamId: string;
  currentUserId: string;
  members: Member[];
  repositories: RepositoryOption[];
  linear: Promise<LinearOptionsState>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("huddle");
  const [timezone, setTimezone] = useState("UTC");
  const [state, action] = useActionState(createMeeting, initialActionState);
  const timezones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"]), []);

  function open(next: Kind) {
    setKind(next);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    dialogRef.current?.showModal();
  }

  const invalid = (name: string) => invalidProps(state, name);

  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={`${buttonClass.secondary} h-7 px-2.5`} onClick={() => open("scheduled")}>
          Schedule call
        </button>
        <button type="button" className={`${buttonClass.primary} h-7 px-2.5`} onClick={() => open("huddle")}>
          <Icon name="plus" className="size-3.5" />
          Start huddle
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="meeting-dialog-title"
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
      >
        <form action={action} className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 id="meeting-dialog-title" className="font-medium">
              {kind === "scheduled" ? "Schedule a planning call" : "Start a huddle"}
            </h2>
            <button type="button" className="text-muted hover:text-foreground" onClick={() => dialogRef.current?.close()} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="space-y-5 overflow-y-auto px-5 py-4">
            <input type="hidden" name="teamId" value={props.teamId} />
            <input type="hidden" name="kind" value={kind} />

            <div>
              <label htmlFor="meeting-title" className={labelClass}>
                Title
              </label>
              <input
                id="meeting-title"
                name="title"
                required
                maxLength={200}
                autoComplete="off"
                placeholder={kind === "scheduled" ? "Sprint planning" : "What are we figuring out?"}
                className={`${inputClass} text-base`}
                {...invalid("title")}
              />
              <FieldError state={state} name="title" />
            </div>

            <div>
              <label htmlFor="meeting-agenda" className={labelClass}>
                Agenda <span className="font-normal text-muted/70">(optional)</span>
              </label>
              <textarea id="meeting-agenda" name="agenda" rows={2} maxLength={4000} className={inputClass} />
            </div>

            {kind === "scheduled" && (
              <fieldset className="grid grid-cols-2 gap-3">
                <legend className={labelClass}>When</legend>
                <div>
                  <label htmlFor="meeting-start" className="mb-1 block text-xs text-muted">
                    Start
                  </label>
                  <input id="meeting-start" type="datetime-local" name="startLocal" required className={inputClass} {...invalid("schedule.startLocal")} />
                  <FieldError state={state} name="schedule.startLocal" />
                </div>
                <div>
                  <label htmlFor="meeting-end" className="mb-1 block text-xs text-muted">
                    End
                  </label>
                  <input id="meeting-end" type="datetime-local" name="endLocal" required className={inputClass} {...invalid("schedule.endLocal")} />
                  <FieldError state={state} name="schedule.endLocal" />
                </div>
                <div className="col-span-2">
                  <label htmlFor="meeting-timezone" className="mb-1 block text-xs text-muted">
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
              <legend className={labelClass}>Attendees</legend>
              <ul className="max-h-32 space-y-1.5 overflow-auto">
                {props.members.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 accent-accent">
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
              <label htmlFor="meeting-language" className={labelClass}>
                Transcription language
              </label>
              <select id="meeting-language" name="language" defaultValue={DEFAULT_LANGUAGE} className={inputClass}>
                <option value="en">English</option>
                <option value="ka">Georgian (experimental)</option>
              </select>
            </div>

            <fieldset className="space-y-3">
              <legend className={labelClass}>Context</legend>

              <div>
                <label htmlFor="meeting-repo" className="mb-1 block text-xs text-muted">
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

              <Suspense fallback={<p className="text-xs text-muted">Loading Linear teams…</p>}>
                <LinearFields linear={props.linear} state={state} />
              </Suspense>
            </fieldset>

            <p className="rounded-md bg-subtle px-3 py-2.5 text-xs leading-relaxed text-muted">
              After the call, agreed work creates <code>[shiproom]</code> Linear issues or adds updates to existing issues automatically. Everyone who joined gets the links in their
              inbox. If Shiproom can&apos;t tell where work belongs, it asks you before creating anything.
            </p>

            <FormStatus state={state} />
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
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

function invalidProps(state: ActionState, name: string) {
  return {
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  };
}

/** Linear options come from a slow external API, so they stream in after the page renders. */
function LinearFields({ linear: linearPromise, state }: { linear: Promise<LinearOptionsState>; state: ActionState }) {
  const linear = use(linearPromise);
  const [linearTeamId, setLinearTeamId] = useState("");
  const linearTeams = linear.status === "ready" ? linear.teams : [];
  const projects = linearTeams.find((t) => t.id === linearTeamId)?.projects ?? [];

  return (
    <>
      <div>
        <label htmlFor="meeting-linear-team" className="mb-1 block text-xs text-muted">
          Linear team
        </label>
        <select
          id="meeting-linear-team"
          name="linearTeamId"
          value={linearTeamId}
          onChange={(e) => setLinearTeamId(e.target.value)}
          disabled={linear.status !== "ready"}
          className={inputClass}
          {...invalidProps(state, "context.linearTeamId")}
        >
          <option value="">{INFER}</option>
          {linearTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.key})
            </option>
          ))}
        </select>
        {linear.status !== "ready" && <p className="mt-1 text-xs text-muted">{LINEAR_UNAVAILABLE[linear.status]}</p>}
        <FieldError state={state} name="context.linearTeamId" />
      </div>

      <div>
        <label htmlFor="meeting-linear-project" className="mb-1 block text-xs text-muted">
          Linear project
        </label>
        <select
          id="meeting-linear-project"
          name="linearProjectId"
          key={linearTeamId}
          defaultValue=""
          disabled={!linearTeamId}
          className={inputClass}
          {...invalidProps(state, "context.linearProjectId")}
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
    </>
  );
}
