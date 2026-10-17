"use server";

import { redirect } from "next/navigation";
import { contextModeFor, meetingInputSchema } from "@/lib/contracts";
import { findMembership } from "@/lib/server/auth";
import { getLinearOptions } from "@/lib/server/connections";
import { isValidTimeZone, zonedLocalToUtc } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { fromZodError, type ActionState } from "./state";

const MAX_SCHEDULE_AHEAD_MS = 366 * 86_400_000;
const orNull = (value: FormDataEntryValue | null) => (typeof value === "string" && value.trim() ? value.trim() : null);

export async function createMeeting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const kind = formData.get("kind");
  const input = meetingInputSchema.safeParse({
    teamId: formData.get("teamId"),
    kind,
    title: formData.get("title"),
    agenda: formData.get("agenda") ?? "",
    language: formData.get("language") ?? undefined,
    attendeeIds: formData.getAll("attendeeIds"),
    context: {
      githubRepositoryId: orNull(formData.get("githubRepositoryId")),
      linearTeamId: orNull(formData.get("linearTeamId")),
      linearProjectId: orNull(formData.get("linearProjectId")),
    },
    schedule:
      kind === "scheduled"
        ? { startLocal: formData.get("startLocal"), endLocal: formData.get("endLocal"), timezone: formData.get("timezone") }
        : null,
  });
  if (!input.success) return fromZodError(input.error);
  const meeting = input.data;

  const access = await findMembership(meeting.teamId);
  if (!access) return { error: "You are not a member of this team." };
  const supabase = await createClient();

  const { data: members, error: membersError } = await supabase.from("memberships").select("user_id").eq("team_id", meeting.teamId);
  if (membersError) return { error: "Team members could not be loaded. Try again." };
  const memberIds = new Set((members ?? []).map((m) => m.user_id as string));
  const attendeeIds = [...new Set([access.user.id, ...meeting.attendeeIds])];
  if (attendeeIds.some((id) => !memberIds.has(id))) return { fieldErrors: { attendeeIds: ["Attendees must be members of this team."] } };

  const { context } = meeting;
  if (context.githubRepositoryId) {
    const { data: repo } = await supabase
      .from("team_repositories")
      .select("github_repository_id")
      .eq("team_id", meeting.teamId)
      .eq("github_repository_id", context.githubRepositoryId)
      .maybeSingle();
    if (!repo) return { fieldErrors: { "context.githubRepositoryId": ["Choose a repository approved for this team."] } };
  }
  if (context.linearTeamId) {
    const linear = await getLinearOptions(meeting.teamId);
    if (linear.status !== "ready") return { fieldErrors: { "context.linearTeamId": ["Linear isn't connected, so choose “Let Shiproom figure it out”."] } };
    const team = linear.teams.find((t) => t.id === context.linearTeamId);
    if (!team) return { fieldErrors: { "context.linearTeamId": ["Choose a Linear team from the connected workspace."] } };
    if (context.linearProjectId && !team.projects.some((p) => p.id === context.linearProjectId)) {
      return { fieldErrors: { "context.linearProjectId": ["That project doesn't belong to the chosen Linear team."] } };
    }
  }

  let schedule: { scheduled_start: string; scheduled_end: string; timezone: string } | null = null;
  if (meeting.schedule) {
    if (!isValidTimeZone(meeting.schedule.timezone)) return { fieldErrors: { "schedule.timezone": ["Choose a valid timezone."] } };
    const start = zonedLocalToUtc(meeting.schedule.startLocal, meeting.schedule.timezone);
    const end = zonedLocalToUtc(meeting.schedule.endLocal, meeting.schedule.timezone);
    if (end <= start) return { fieldErrors: { "schedule.endLocal": ["The call must end after it starts."] } };
    if (start.getTime() > Date.now() + MAX_SCHEDULE_AHEAD_MS) return { fieldErrors: { "schedule.startLocal": ["Schedule within the next year."] } };
    schedule = { scheduled_start: start.toISOString(), scheduled_end: end.toISOString(), timezone: meeting.schedule.timezone };
  }

  const provenance = (value: string | null) => (value ? "user" : null);
  const { data: created, error } = await supabase
    .from("meetings")
    .insert({
      team_id: meeting.teamId,
      organizer_id: access.user.id,
      kind: meeting.kind,
      title: meeting.title,
      agenda: meeting.agenda,
      language: meeting.language,
      ...schedule,
      context_mode: contextModeFor(context),
      github_repository_id: context.githubRepositoryId,
      github_repository_provenance: provenance(context.githubRepositoryId),
      linear_team_id: context.linearTeamId,
      linear_team_provenance: provenance(context.linearTeamId),
      linear_project_id: context.linearProjectId,
      linear_project_provenance: provenance(context.linearProjectId),
    })
    .select("id")
    .single();
  if (error) {
    console.error("meeting insert failed", error);
    return { error: "The meeting could not be created. Try again." };
  }

  const { error: inviteError } = await supabase
    .from("meeting_invitees")
    .insert(attendeeIds.map((user_id) => ({ team_id: meeting.teamId, meeting_id: created.id, user_id })));
  if (inviteError) console.error("meeting invitee insert failed", inviteError);

  redirect(`/teams/${meeting.teamId}/meetings/${created.id}`);
}
