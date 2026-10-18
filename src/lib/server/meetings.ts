import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CaptureStatus, ProcessingStatus } from "@/lib/contracts";

export type MeetingSummary = {
  id: string;
  kind: "scheduled" | "huddle" | "upload";
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timezone: string | null;
  captureStatus: CaptureStatus;
  processingStatus: ProcessingStatus;
  createdAt: string;
  summary: string | null;
  issueIdentifiers: string[];
};

const COLUMNS = "id, kind, title, scheduled_start, scheduled_end, timezone, capture_status, processing_status, created_at, summary";

type Row = {
  id: string;
  kind: MeetingSummary["kind"];
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  timezone: string | null;
  capture_status: CaptureStatus;
  processing_status: ProcessingStatus;
  created_at: string;
  summary: string | null;
};

const toSummary = (r: Row, issueIdentifiers: string[] = []): MeetingSummary => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  scheduledStart: r.scheduled_start,
  scheduledEnd: r.scheduled_end,
  timezone: r.timezone,
  captureStatus: r.capture_status,
  processingStatus: r.processing_status,
  createdAt: r.created_at,
  summary: r.summary,
  issueIdentifiers,
});

/** Caller must already have verified membership; RLS enforces it again. */
export async function listTeamMeetings(teamId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [live, upcoming, recent] = await Promise.all([
    supabase.from("meetings").select(COLUMNS).eq("team_id", teamId).eq("capture_status", "live").is("ended_at", null).order("started_at", { ascending: false }).limit(20),
    supabase
      .from("meetings")
      .select(COLUMNS)
      .eq("team_id", teamId)
      .eq("kind", "scheduled")
      .gte("scheduled_end", now)
      .order("scheduled_start")
      .limit(20),
    supabase.from("meetings").select(COLUMNS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (live.error) throw live.error;
  if (upcoming.error) throw upcoming.error;
  if (recent.error) throw recent.error;
  const recentRows = recent.data as Row[];
  const tasks = await supabase
    .from("tasks")
    .select("meeting_id, linear_issue_identifier")
    .in("meeting_id", recentRows.map((r) => r.id))
    .not("linear_issue_identifier", "is", null)
    .order("ordinal");
  if (tasks.error) throw tasks.error;
  const issuesFor = (id: string) => tasks.data.filter((t) => t.meeting_id === id).map((t) => t.linear_issue_identifier as string);
  return { live: (live.data as Row[]).map((r) => toSummary(r)), upcoming: (upcoming.data as Row[]).map((r) => toSummary(r)), recent: recentRows.map((r) => toSummary(r, issuesFor(r.id))) };
}

export async function listTeamMembers(teamId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profile:profiles(display_name, github_login, email)")
    .eq("team_id", teamId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => {
    const profile = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as
      | { display_name: string; github_login: string | null; email: string | null }
      | null;
    return {
      id: m.user_id as string,
      role: m.role as "owner" | "member",
      name: profile?.display_name || profile?.github_login || "Unknown member",
      githubLogin: profile?.github_login ?? null,
      email: profile?.email ?? null,
    };
  });
}

export const STATUS_LABEL: Record<CaptureStatus | ProcessingStatus, string> = {
  pending: "Not started",
  live: "Live",
  finalizing: "Finalizing transcript",
  uploading: "Uploading",
  transcribing: "Transcribing",
  ready: "Transcript ready",
  failed: "Failed",
  not_started: "Not started",
  waiting_transcript: "Waiting for transcript",
  resolving_context: "Resolving context",
  needs_context: "Needs context",
  enriching: "Loading project context",
  extracting: "Extracting tasks",
  publishing: "Creating Linear issues",
  complete: "Complete",
  partial_failure: "Partially failed",
};
