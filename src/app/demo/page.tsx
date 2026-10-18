import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader } from "@/components/page-parts";
import { SetupRequired } from "@/components/setup-required";
import { DEMO_NOTE } from "@/lib/demo";
import { getPublicEnv } from "@/lib/env";
import { listMemberships, requireMembership, requireUser } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import MeetingPage from "../teams/[teamId]/meetings/[meetingId]/page";
import { PrepareDemo } from "./prepare-demo";

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ teamId?: string; meetingId?: string }> }) {
  await connection();
  if (!getPublicEnv()) return <SetupRequired />;
  const user = await requireUser("/demo");
  const memberships = await listMemberships();
  const query = await searchParams;
  const active = query.teamId !== undefined || query.meetingId !== undefined;
  if (active) {
    if (!z.uuid().safeParse(query.teamId).success || !z.uuid().safeParse(query.meetingId).success) notFound();
    await requireMembership(query.teamId!);
    const supabase = await createClient();
    const { data } = await supabase.from("meetings").select("is_demo").eq("id", query.meetingId!).eq("team_id", query.teamId!).maybeSingle();
    if (!data?.is_demo) notFound();
  }
  return (
    <AppShell user={user} memberships={memberships} teamId={active ? query.teamId : undefined}>
      <div className="border-b border-border bg-accent/5 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <strong>Scripted demo · 30 seconds</strong>
          {active && <Link href="/demo" className="text-accent hover:underline">New take</Link>}
        </div>
        <p className="mt-1 text-xs text-muted">{DEMO_NOTE}</p>
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Filming cues</summary>
          <p className="mt-1">0–5s: Start huddle. 5–20s: talk about the picker, or say anything. 20–25s: End and create tasks. 25–30s: show the Georgian transcript and open an issue in Linear. The fixed transcript is also your optional spoken script.</p>
        </details>
      </div>
      {active ? <MeetingPage params={Promise.resolve({ teamId: query.teamId!, meetingId: query.meetingId! })} /> : (
        <>
          <PageHeader title="Demo studio" />
          <PageBody className="max-w-2xl">
            <h1 className="text-xl font-semibold">Conversation → Georgian transcript → Linear</h1>
            <p className="text-muted">Prepare a take, then start the huddle. Any speech produces the same two repository-picker tasks. No transcription or AI service is needed for this demo.</p>
            {memberships.length ? <PrepareDemo memberships={memberships} /> : <Link href="/" className="text-accent">Create or join a team first</Link>}
          </PageBody>
        </>
      )}
    </AppShell>
  );
}
