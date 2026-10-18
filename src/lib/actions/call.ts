"use server";

import { z } from "zod";
import { liveCaptureSchema } from "@/lib/contracts";
import { findMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { finishMeetingCall, openMeetingCall, type CallFinish, type CallOpen } from "@/lib/server/publish-call";
import { createClient } from "@/lib/supabase/server";
import { getLinearOptions, listTeamRepositories } from "@/lib/server/connections";

export type { CallFinish, CallOpen };

const startSchema = z.object({ teamId: z.uuid(), meetingId: z.uuid(), consented: z.literal(true) });

export async function startMeetingCall(input: { teamId: string; meetingId: string; consented: boolean }): Promise<CallOpen> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: "Agree to transcription before joining." };
  if (!serverConfig.dailyApiKey()) return { error: "Daily isn't set up on this server yet." };
  const access = await findMembership(parsed.data.teamId);
  if (!access) return { error: "You are not a member of this team." };

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, organizer_id, kind, language, github_repository_id, linear_team_id, linear_project_id, ended_at")
    .eq("id", parsed.data.meetingId)
    .eq("team_id", parsed.data.teamId)
    .maybeSingle();
  if (!meeting) return { error: "That meeting is not on this team." };
  if (meeting.kind === "upload") return { error: "This meeting is an upload, not a call." };
  if (meeting.ended_at) return { error: "This call has ended. Open its meeting result instead." };
  const [repositories, linear] = await Promise.all([listTeamRepositories(parsed.data.teamId), getLinearOptions(parsed.data.teamId)]);
  const repository = repositories.find((repo) => repo.id === meeting.github_repository_id);
  const team = linear.status === "ready" ? linear.teams.find((team) => team.id === meeting.linear_team_id) : undefined;
  const project = team?.projects.find((project) => project.id === meeting.linear_project_id);

  return openMeetingCall({
    teamId: parsed.data.teamId,
    meetingId: parsed.data.meetingId,
    userId: access.user.id,
    displayName: access.user.displayName,
    isOrganizer: meeting.organizer_id === access.user.id,
    language: meeting.language,
    contextNames: [repository?.fullName, team?.name, project?.name].filter((name): name is string => Boolean(name)),
  });
}

export async function endMeetingCall(input: unknown): Promise<CallFinish> {
  const parsed = liveCaptureSchema.safeParse(input);
  if (!parsed.success) return blank("The captured transcript was not valid, so nothing was created.");
  const access = await findMembership(parsed.data.teamId);
  if (!access) return blank("You are not a member of this team.");

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, organizer_id, daily_room_name")
    .eq("id", parsed.data.meetingId)
    .eq("team_id", parsed.data.teamId)
    .maybeSingle();
  if (!meeting) return blank("That meeting is not on this team.");
  if (meeting.organizer_id !== access.user.id) return blank("Only the organizer can end the call and create tasks.");

  const roomName = meeting.daily_room_name || `sr${parsed.data.meetingId.replaceAll("-", "")}`;
  return finishMeetingCall({
    teamId: parsed.data.teamId,
    meetingId: parsed.data.meetingId,
    organizerId: access.user.id,
    roomName,
    capture: parsed.data,
  });
}

function blank(error: string): CallFinish {
  return {
    error,
    transcriptSource: null,
    transcriptNote: null,
    summary: null,
    decisions: [],
    openQuestions: [],
    tasks: [],
    linearNames: null,
    persistenceWarning: null,
  };
}
