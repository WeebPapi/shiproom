"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/styles";
import { FieldError, FormStatus, SubmitButton } from "@/components/ui";
import { initialActionState } from "@/lib/actions/state";
import { createInvitation } from "@/lib/actions/team";

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState(createInvitation, initialActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <label htmlFor="invite-email" className="block font-medium">
        Email
      </label>
      <div className="flex gap-2">
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          className={inputClass}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        <SubmitButton pendingLabel="Creating…">Create invite link</SubmitButton>
      </div>
      <FieldError state={state} name="email" />
      <FormStatus state={state} />
      {state.inviteUrl && (
        <div>
          <label htmlFor="invite-url" className="block text-muted">
            Invitation link
          </label>
          <input id="invite-url" readOnly value={state.inviteUrl} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </form>
  );
}
