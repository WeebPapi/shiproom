"use client";

import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/ui";
import { inputClass, labelClass } from "@/components/styles";
import { createDemoMeeting } from "@/lib/actions/demo";
import type { TeamMembership } from "@/lib/server/auth";

export function PrepareDemo({ memberships }: { memberships: TeamMembership[] }) {
  const [state, action] = useActionState(createDemoMeeting, {});
  return (
    <form action={action} className="max-w-sm space-y-4">
      <label className={labelClass}>Team
        <select name="teamId" className={`${inputClass} mt-2`} required>
          {memberships.map((team) => <option key={team.teamId} value={team.teamId}>{team.teamName}</option>)}
        </select>
      </label>
      <p className="text-muted">Each new take creates a separate meeting and two real Linear issues when you end it. Reuse the meeting URL to retry the same take.</p>
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Preparing…">Prepare demo huddle</SubmitButton>
    </form>
  );
}
