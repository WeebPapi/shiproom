"use client";

import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/ui";
import { acceptInvitation } from "@/lib/actions/session";
import { initialActionState } from "@/lib/actions/state";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitation, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
    </form>
  );
}
