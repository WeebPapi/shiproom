// Seeds synthetic Georgian demo meetings into the LINEAR_DEMO_TEAM_ID app team and creates
// their real issues in the Linear "Shiproom Demo" project. Safe to rerun: IDs are fixed.
// Usage: node --env-file=.env.local scripts/seed-demo.mjs
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import data from "./demo-meetings.json" with { type: "json" };

const env = (name) => process.env[name] || (() => { throw new Error(`${name} is not set.`); })();
const appUrl = env("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
const teamId = env("LINEAR_DEMO_TEAM_ID");
const linearKey = env("LINEAR_API_KEY");
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const SOURCE_NOTE = "Transcript source: synthetic Georgian demo seed (scripts/seed-demo.mjs), not a recorded call.";

async function linear(query, variables = {}) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: linearKey },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`Linear: ${body.errors?.[0]?.message ?? response.status}`);
  return body.data;
}

const must = ({ data: rows, error }) => { if (error) throw new Error(error.message); return rows; };
const seconds = (ms) => (ms / 1000).toFixed(1);

const owner = must(await db.from("memberships").select("user_id").eq("team_id", teamId).eq("role", "owner").limit(1).single());
const repo = must(await db.from("team_repositories").select("github_repository_id, html_url").eq("team_id", teamId).limit(1).single());
const projects = (await linear(`{ projects(filter: { name: { eq: "Shiproom Demo" } }) { nodes { id teams { nodes { id name } } } } }`)).projects.nodes;
const project = projects[0];
const linearTeam = project?.teams.nodes.find((team) => team.name.includes("Shiproom"));
if (projects.length !== 1 || !linearTeam) throw new Error("Expected exactly one Linear project named Shiproom Demo in a Shiproom team.");

for (const meeting of data.meetings) {
  const meetingUrl = `${appUrl}/teams/${teamId}/meetings/${meeting.id}`;
  must(await db.from("meetings").upsert({
    id: meeting.id, team_id: teamId, organizer_id: owner.user_id, kind: meeting.kind, title: meeting.title, agenda: meeting.agenda, language: "ka",
    scheduled_start: meeting.scheduledStart ?? null, scheduled_end: meeting.scheduledEnd ?? null, timezone: meeting.timezone ?? null,
    context_mode: "selected", github_repository_id: repo.github_repository_id, github_repository_provenance: "user",
    linear_team_id: linearTeam.id, linear_team_provenance: "user", linear_project_id: project.id, linear_project_provenance: "user",
    capture_status: "ready", processing_status: "complete", summary: meeting.summary, decisions: meeting.decisions, open_questions: meeting.openQuestions,
    started_at: meeting.startedAt, ended_at: meeting.endedAt, created_at: meeting.createdAt,
  }));
  must(await db.from("meeting_invitees").upsert({ team_id: teamId, meeting_id: meeting.id, user_id: owner.user_id }));
  must(await db.from("meeting_participants").upsert({
    team_id: teamId, meeting_id: meeting.id, user_id: owner.user_id, provenance: "organizer",
    consented_at: meeting.startedAt, first_joined_at: meeting.startedAt, last_left_at: meeting.endedAt,
  }));
  must(await db.from("transcripts").upsert({
    team_id: teamId, meeting_id: meeting.id, revision: 1, source: "daily", language: "ka", segments: meeting.segments, complete: true,
    content_hash: createHash("sha256").update(JSON.stringify(meeting.segments)).digest("hex"), created_at: meeting.endedAt,
  }, { onConflict: "team_id,meeting_id,revision" }));

  for (const [index, { linearIssueUuid, ...task }] of meeting.tasks.entries()) {
    const ordinal = index + 1;
    const payload = { ...task, sourceReferences: [{ kind: "github", url: repo.html_url }] };
    // Same layout as issueDescription() in src/lib/call-result.ts.
    const description = [
      task.description,
      `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
      `Evidence:\n${task.evidenceSegmentIds.map((id) => {
        const s = meeting.segments.find((segment) => segment.id === id);
        return `- ${id} (${seconds(s.startMs)}s–${seconds(s.endMs)}s, ${s.speakerLabel}): ${s.text}`;
      }).join("\n")}`,
      `Source: ${repo.html_url}`,
      `Meeting: ${meetingUrl}`,
      SOURCE_NOTE,
      `shiproom-task:${meeting.id}:${ordinal}`,
    ].join("\n\n");
    const fields = "id identifier url";
    const issue = (await linear(`query($id: ID!) { issues(filter: { id: { eq: $id } }) { nodes { ${fields} } } }`, { id: linearIssueUuid })).issues.nodes[0]
      ?? (await linear(`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${fields} } } }`, {
        input: { id: linearIssueUuid, teamId: linearTeam.id, projectId: project.id, title: `[shiproom] ${task.title}`, description },
      })).issueCreate.issue;

    const [row] = must(await db.from("tasks").upsert({
      team_id: teamId, meeting_id: meeting.id, transcript_revision: 1, ordinal, payload, linear_issue_uuid: linearIssueUuid,
      publication_status: "published", linear_issue_identifier: issue.identifier, linear_issue_url: issue.url, created_at: meeting.endedAt,
    }, { onConflict: "meeting_id,transcript_revision,ordinal" }).select("id"));
    must(await db.from("notifications").upsert({
      team_id: teamId, recipient_id: owner.user_id, meeting_id: meeting.id, kind: "task_ready", task_id: row.id,
      linear_issue_url: issue.url, title: `[shiproom] ${task.title}`, created_at: meeting.endedAt,
    }, { onConflict: "recipient_id,task_id", ignoreDuplicates: true }));
    console.log(`${meeting.title} → ${issue.identifier} ${issue.url}`);
  }
}
