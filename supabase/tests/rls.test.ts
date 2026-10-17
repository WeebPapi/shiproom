import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hashToken as sha256 } from "../../src/lib/server/tokens";

// Minimal stand-ins for the Supabase-managed roles, auth and storage schemas, so the
// checked-in migrations run unchanged against an in-process Postgres.
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
`;

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CAROL = "00000000-0000-4000-8000-00000000000c";
const MALLORY = "00000000-0000-4000-8000-0000000000ff";
const NO_EMAIL = "00000000-0000-4000-8000-0000000000ee";

let db: PGlite;

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function signUp(id: string, email: string | null, login: string) {
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, case when $2::text is null then null else now() end, $3)`,
    [id, email, { provider_id: String(parseInt(id.slice(-4), 16)), user_name: login, full_name: login }],
  );
}

async function createTeam(owner: string, name: string) {
  return asUser(owner, async () => (await rows<{ id: string }>(`select public.create_team($1) as id`, [name]))[0].id);
}

async function invite(owner: string, teamId: string, email: string, token: string) {
  await asUser(owner, () =>
    db.query(
      `insert into public.invitations (team_id, email, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, now() + interval '7 days')`,
      [teamId, email, sha256(token), owner],
    ),
  );
}

let teamA: string;
let uploadMeeting: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await signUp(ALICE, "alice@example.com", "alice");
  await signUp(BOB, "bob@example.com", "bob");
  await signUp(CAROL, "carol@example.com", "carol");
  await signUp(MALLORY, "mallory@example.com", "mallory");
  await signUp(NO_EMAIL, null, "hidden");
  teamA = await createTeam(ALICE, "Team A");
  await createTeam(MALLORY, "Team M");
}, 60_000);

describe("identity and team boundary", () => {
  it("creates a profile from GitHub metadata on sign-up", async () => {
    const [profile] = await rows<{ github_login: string; email_verified: boolean }>(
      `select github_login, email_verified from public.profiles where id = $1`,
      [ALICE],
    );
    expect(profile).toEqual({ github_login: "alice", email_verified: true });
  });

  it("does not grant membership for merely signing in", async () => {
    const teams = await asUser(BOB, () => rows(`select id from public.teams`));
    expect(teams).toEqual([]);
  });

  it("blocks direct membership inserts", async () => {
    await expect(
      asUser(BOB, () => db.query(`insert into public.memberships (team_id, user_id, role) values ($1, $2, 'owner')`, [teamA, BOB])),
    ).rejects.toThrow(/permission denied/);
  });

  it("accepts an invitation only for the invited verified email", async () => {
    await invite(ALICE, teamA, "bob@example.com", "token-for-bob-0123456789abcdef0123");
    await expect(
      asUser(CAROL, () => db.query(`select public.accept_invitation($1)`, ["token-for-bob-0123456789abcdef0123"])),
    ).rejects.toThrow(/invitation_email_mismatch/);
    await expect(
      asUser(NO_EMAIL, () => db.query(`select public.accept_invitation($1)`, ["token-for-bob-0123456789abcdef0123"])),
    ).rejects.toThrow(/verified_email_required/);

    const [accepted] = await asUser(BOB, () =>
      rows<{ team: string }>(`select public.accept_invitation($1) as team`, ["token-for-bob-0123456789abcdef0123"]),
    );
    expect(accepted.team).toBe(teamA);
    const teams = await asUser(BOB, () => rows(`select id from public.teams`));
    expect(teams).toEqual([{ id: teamA }]);
  });

  it("rejects expired, revoked, and unknown invitations", async () => {
    await invite(ALICE, teamA, "carol@example.com", "expired-token-0123456789abcdef01234");
    await db.exec(
      `update public.invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where email = 'carol@example.com'`,
    );
    await expect(
      asUser(CAROL, () => db.query(`select public.accept_invitation($1)`, ["expired-token-0123456789abcdef01234"])),
    ).rejects.toThrow(/invalid_invitation/);

    await invite(ALICE, teamA, "carol@example.com", "revoked-token-0123456789abcdef01234");
    await asUser(ALICE, () =>
      db.query(`update public.invitations set revoked_at = now() where email = 'carol@example.com' and revoked_at is null`),
    );
    await expect(
      asUser(CAROL, () => db.query(`select public.accept_invitation($1)`, ["revoked-token-0123456789abcdef01234"])),
    ).rejects.toThrow(/invalid_invitation/);

    await expect(
      asUser(CAROL, () => db.query(`select public.accept_invitation($1)`, ["unknown-token-0123456789abcdef012345"])),
    ).rejects.toThrow(/invalid_invitation/);
  });

  it("lets only owners invite and hides token hashes", async () => {
    await expect(invite(BOB, teamA, "x@example.com", "member-invite-0123456789abcdef01234")).rejects.toThrow(/row-level security/);
    await expect(asUser(ALICE, () => db.query(`select token_hash from public.invitations`))).rejects.toThrow(/permission denied/);
  });
});

describe("meetings, notifications, storage", () => {
  it("isolates meetings by team and forbids writing server-owned columns", async () => {
    const [meeting] = await asUser(ALICE, () =>
      rows<{ id: string }>(
        `insert into public.meetings (team_id, organizer_id, kind, title, context_mode)
         values ($1, $2, 'upload', 'Synthetic planning', 'infer') returning id`,
        [teamA, ALICE],
      ),
    );
    uploadMeeting = meeting.id;

    expect(await asUser(MALLORY, () => rows(`select id from public.meetings`))).toEqual([]);
    await expect(
      asUser(MALLORY, () =>
        db.query(
          `insert into public.meetings (team_id, organizer_id, kind, title, context_mode) values ($1, $2, 'huddle', 'x', 'infer')`,
          [teamA, MALLORY],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(ALICE, () =>
        db.query(
          `insert into public.meetings (team_id, organizer_id, kind, title, context_mode, processing_status)
           values ($1, $2, 'huddle', 'x', 'infer', 'complete')`,
          [teamA, ALICE],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(ALICE, () => db.query(`update public.meetings set processing_status = 'complete' where id = $1`, [uploadMeeting])),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects repository context outside the team allowlist", async () => {
    await expect(
      asUser(ALICE, () =>
        db.query(
          `insert into public.meetings (team_id, organizer_id, kind, title, context_mode, github_repository_id, github_repository_provenance)
           values ($1, $2, 'huddle', 'x', 'mixed', '123', 'user')`,
          [teamA, ALICE],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("shows notifications only to their recipient", async () => {
    await db.query(
      `insert into public.notifications (team_id, recipient_id, meeting_id, kind, title)
       values ($1, $2, $3, 'context_required', 'Choose meeting context')`,
      [teamA, ALICE, uploadMeeting],
    );
    expect(await asUser(ALICE, () => rows(`select title from public.notifications`))).toHaveLength(1);
    expect(await asUser(BOB, () => rows(`select title from public.notifications`))).toEqual([]);
  });

  it("allows audio upload only by the upload organizer at a well-formed path", async () => {
    const path = `${teamA}/${uploadMeeting}/clip.webm`;
    await asUser(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('shiproom-audio', $1)`, [path]));
    await expect(
      asUser(BOB, () => db.query(`insert into storage.objects (bucket_id, name) values ('shiproom-audio', $1)`, [`${teamA}/${uploadMeeting}/b.webm`])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(ALICE, () => db.query(`insert into storage.objects (bucket_id, name) values ('shiproom-audio', $1)`, [`${teamA}/not-a-uuid/c.webm`])),
    ).rejects.toThrow(/row-level security/);
    expect(await asUser(BOB, () => rows(`select name from storage.objects`))).toEqual([{ name: path }]);
    expect(await asUser(MALLORY, () => rows(`select name from storage.objects`))).toEqual([]);
  });

  it("keeps provider credentials away from browser roles", async () => {
    await expect(
      asUser(ALICE, () => db.query(`select * from public.get_connection_secret(gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(ALICE, () => db.query(`select * from private.connection_secrets`))).rejects.toThrow(/permission denied/);
    await expect(asUser(ALICE, () => db.query(`select * from public.processing_requests`))).rejects.toThrow(/permission denied/);
  });

  it("revoking a member removes their team access", async () => {
    await asUser(ALICE, () => db.query(`delete from public.memberships where team_id = $1 and user_id = $2`, [teamA, BOB]));
    expect(await asUser(BOB, () => rows(`select id from public.meetings`))).toEqual([]);
    expect(await asUser(BOB, () => rows(`select name from storage.objects`))).toEqual([]);
  });
});
