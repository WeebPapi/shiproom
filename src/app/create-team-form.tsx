"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { createTeam } from "@/lib/actions/session";
import { initialActionState } from "@/lib/actions/state";

export function CreateTeamForm() {
  const [state, action] = useActionState(createTeam, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="team-name" className="block font-medium">
        Team name
      </label>
      <input
        id="team-name"
        name="name"
        required
        maxLength={80}
        className={inputClass}
        aria-invalid={Boolean(state.fieldErrors?.name)}
        aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
      />
      <FieldError state={state} name="name" />
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Creating…">Create team</SubmitButton>
    </form>
  );
}
