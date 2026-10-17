"use client";

import { useActionState, useId } from "react";
import { inputClass, labelClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { createTeam } from "@/lib/actions/session";
import { initialActionState } from "@/lib/actions/state";

export function CreateTeamForm() {
  const [state, action] = useActionState(createTeam, initialActionState);
  const id = useId(); // The form renders on the home page and in the sidebar dialog at once.
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor={id} className={labelClass}>
          Team name
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            name="name"
            required
            maxLength={80}
            placeholder="Acme Platform"
            autoComplete="off"
            className={inputClass}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          />
          <SubmitButton pendingLabel="Creating…">Create team</SubmitButton>
        </div>
        <FieldError state={state} name="name" />
      </div>
      <FormStatus state={state} />
    </form>
  );
}
