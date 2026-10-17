import type { z } from "zod";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  inviteUrl?: string;
};

export const initialActionState: ActionState = {};

export function fromZodError(error: z.ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { error: "Check the highlighted fields.", fieldErrors };
}
