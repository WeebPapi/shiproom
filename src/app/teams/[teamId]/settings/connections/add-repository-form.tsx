"use client";

import { useActionState } from "react";
import { Combobox } from "@/components/combobox";
import { labelClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { initialActionState } from "@/lib/actions/state";
import { addPublicRepository } from "@/lib/actions/team";

export function AddRepositoryForm({ teamId, suggestions }: { teamId: string; suggestions: string[] }) {
  const [state, action] = useActionState(addPublicRepository, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <label htmlFor="repository" className={labelClass}>
        Add a public repository
      </label>
      <div className="flex gap-2">
        <Combobox
          id="repository"
          name="repository"
          options={suggestions}
          required
          placeholder="owner/name"
          aria-invalid={Boolean(state.fieldErrors?.repository)}
          aria-describedby={state.fieldErrors?.repository ? "repository-error" : undefined}
        />
        <SubmitButton pendingLabel="Checking…">Add</SubmitButton>
      </div>
      <FieldError state={state} name="repository" />
      <FormStatus state={state} />
    </form>
  );
}
