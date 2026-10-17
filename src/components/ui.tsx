"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/state";
import { buttonClass } from "./styles";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof buttonClass;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass[variant]} disabled={pending} aria-disabled={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormStatus({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-success">
        {state.message}
      </p>
    );
  }
  return null;
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const errors = state.fieldErrors?.[name];
  if (!errors?.length) return null;
  return (
    <p id={`${name}-error`} className="mt-1 text-xs text-danger">
      {errors.join(" ")}
    </p>
  );
}
