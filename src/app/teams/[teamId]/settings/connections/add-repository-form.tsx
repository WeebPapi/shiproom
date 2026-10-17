"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { initialActionState } from "@/lib/actions/state";
import { addPublicRepository } from "@/lib/actions/team";

export function AddRepositoryForm({ teamId, suggestions }: { teamId: string; suggestions: string[] }) {
  const [state, action] = useActionState(addPublicRepository, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <label htmlFor="repository" className="block font-medium">
        Add a public repository
      </label>
      <div className="flex gap-2">
        <input
          id="repository"
          name="repository"
          list="github-repositories"
          required
          placeholder="owner/name"
          className={inputClass}
          aria-invalid={Boolean(state.fieldErrors?.repository)}
          aria-describedby={state.fieldErrors?.repository ? "repository-error" : undefined}
        />
        <SubmitButton pendingLabel="Checking…">Add</SubmitButton>
      </div>
      <datalist id="github-repositories">
        {suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
      <FieldError state={state} name="repository" />
      <FormStatus state={state} />
    </form>
  );
}
