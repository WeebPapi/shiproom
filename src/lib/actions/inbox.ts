"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("notificationId"));
  const teamId = z.uuid().safeParse(formData.get("teamId"));
  const user = await getCurrentUser();
  if (!id.success || !teamId.success || !user) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  revalidatePath(`/teams/${teamId.data}`, "layout");
}
