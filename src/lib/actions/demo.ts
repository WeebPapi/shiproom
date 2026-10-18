"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_NOTE } from "@/lib/demo";
import { findMembership } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";
import { createAdminClient } from "@/lib/supabase/server";
import type { ActionState } from "./state";

export async function createDemoMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  const teamId = z.uuid().safeParse(form.get("teamId"));
  if (!teamId.success) return { error: "Choose your team." };
  const access = await findMembership(teamId.data);
  if (!access) return { error: "You are not a member of this team." };
  if (!serverConfig.dailyApiKey() || !serverConfig.linearApiKey()) return { error: "Calling and Linear must be connected before filming." };
  const admin = createAdminClient();
  if (!admin) return { error: "Demo meetings require server database access." };
  const { data, error } = await admin.from("meetings").insert({
    team_id: teamId.data,
    organizer_id: access.user.id,
    kind: "huddle",
    title: "Shiproom demo · repository picker",
    agenda: DEMO_NOTE,
    language: "ka",
    context_mode: "infer",
    is_demo: true,
  }).select("id").single();
  if (error) return { error: "The demo could not be prepared. Check server database access and apply the scripted-demo migration." };
  redirect(`/demo?teamId=${teamId.data}&meetingId=${data.id}`);
}
