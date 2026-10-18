"use client";

import Link from "next/link";
import { Suspense, use, useActionState, useState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { chooseMeetingContext } from "@/lib/actions/meetings";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import type { LinearOptionsState, RepositoryOption } from "@/lib/server/connections";

const LINEAR_UNAVAILABLE: Record<Exclude<LinearOptionsState["status"], "ready">, string> = {
  not_configured: "Linear isn't set up on this server yet.",
  disconnected: "Linear isn't connected. A team owner can connect it under Connections.",
  reconnect_required: "A team owner needs to reconnect Linear under Connections.",
  unavailable: "Linear couldn't be reached right now. Try again shortly.",
};

export function ChooseContextForm(props: {
  teamId: string;
  meetingId: string;
  repositories: RepositoryOption[];
  linear: Promise<LinearOptionsState | null>;
  githubRepositoryId: string | null;
  linearTeamId: string | null;
  linearProjectId: string | null;
}) {
  const [state, action] = useActionState(chooseMeetingContext, initialActionState);

  return (
    <form action={action} className="space-y-3 rounded-md border border-border p-4">
      <input type="hidden" name="teamId" value={props.teamId} />
      <input type="hidden" name="meetingId" value={props.meetingId} />
      <h3 className="font-medium">Choose meeting context</h3>
      <p className="text-xs text-muted">Pick where agreed work should go. Shiproom will resume from the saved transcript.</p>

      <div>
        <label htmlFor="context-repo" className={labelClass}>
          GitHub repository
        </label>
        <select
          id="context-repo"
          name="githubRepositoryId"
          required
          defaultValue={props.githubRepositoryId ?? ""}
          className={inputClass}
          aria-invalid={Boolean(state.fieldErrors?.["context.githubRepositoryId"])}
        >
          <option value="">Choose a repository</option>
          {props.repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.fullName}
            </option>
          ))}
        </select>
        {props.repositories.length === 0 && (
          <p className="mt-1 text-xs text-muted">
            No repositories approved yet. An owner can add one under{" "}
            <Link href={`/teams/${props.teamId}/settings/connections`} className="text-accent hover:underline">
              Connections
            </Link>
            .
          </p>
        )}
        <FieldError state={state} name="context.githubRepositoryId" />
      </div>

      <Suspense fallback={<p className="text-xs text-muted">Loading Linear teams…</p>}>
        <LinearFields linear={props.linear} state={state} teamId={props.teamId} linearTeamId={props.linearTeamId} linearProjectId={props.linearProjectId} />
      </Suspense>

      <FormStatus state={state} />
      <SubmitButton pendingLabel="Saving…">Save and create issues</SubmitButton>
    </form>
  );
}

function LinearFields(props: {
  linear: Promise<LinearOptionsState | null>;
  state: ActionState;
  teamId: string;
  linearTeamId: string | null;
  linearProjectId: string | null;
}) {
  const linear = use(props.linear);
  const [linearTeamId, setLinearTeamId] = useState(props.linearTeamId ?? "");
  const teams = linear?.status === "ready" ? linear.teams : [];
  const projects = teams.find((team) => team.id === linearTeamId)?.projects ?? [];
  const ready = linear?.status === "ready";

  return (
    <>
      <div>
        <label htmlFor="context-linear-team" className={labelClass}>
          Linear team
        </label>
        <select
          id="context-linear-team"
          name="linearTeamId"
          required
          value={linearTeamId}
          onChange={(event) => setLinearTeamId(event.target.value)}
          disabled={!ready}
          className={inputClass}
          aria-invalid={Boolean(props.state.fieldErrors?.["context.linearTeamId"])}
        >
          <option value="">Choose a Linear team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.key})
            </option>
          ))}
        </select>
        {!ready && (
          <p className="mt-1 text-xs text-muted">
            {linear ? LINEAR_UNAVAILABLE[linear.status] : "Linear couldn't be loaded."}{" "}
            <Link href={`/teams/${props.teamId}/settings/connections`} className="text-accent hover:underline">
              Connections
            </Link>
          </p>
        )}
        <FieldError state={props.state} name="context.linearTeamId" />
      </div>
      <div>
        <label htmlFor="context-linear-project" className={labelClass}>
          Linear project <span className="font-normal text-muted/70">(optional)</span>
        </label>
        <select
          id="context-linear-project"
          name="linearProjectId"
          key={linearTeamId}
          defaultValue={props.linearProjectId ?? ""}
          disabled={!linearTeamId}
          className={inputClass}
          aria-invalid={Boolean(props.state.fieldErrors?.["context.linearProjectId"])}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <FieldError state={props.state} name="context.linearProjectId" />
      </div>
    </>
  );
}
