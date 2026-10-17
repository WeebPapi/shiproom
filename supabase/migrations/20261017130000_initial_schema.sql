-- Shiproom initial schema: identity, explicit team membership, connections,
-- meetings, transcripts, tasks, notifications, and processing bookkeeping.
--
-- Access model:
-- * Browser roles reach public tables only through RLS plus explicit column grants.
-- * User-authored rows (teams, invitations, meetings, invitees) are written with the
--   signed-in user's client or a security-definer RPC that checks auth.uid().
-- * Provider-derived rows (connections, repositories, participants, transcripts,
--   tasks, notifications, processing state) are written only by the server with
--   service_role after an explicit authorization check.
-- * Provider credentials live in the unexposed private schema and are reachable only
--   through service_role-only RPCs.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS policies call private helpers, which requires schema usage. No private table is granted.
grant usage on schema private to authenticated, service_role;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  github_user_id text unique,
  github_login text,
  display_name text not null default '' check (char_length(display_name) <= 120),
  avatar_url text,
  email text check (email is null or email = lower(email)),
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Keeps provider identity in sync on sign-up and every sign-in metadata refresh.
-- display_name is only seeded so a later user edit is not overwritten.
create function private.sync_profile_from_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, github_user_id, github_login, display_name, avatar_url, email, email_verified)
  values (
    new.id,
    nullif(v_meta ->> 'provider_id', ''),
    nullif(v_meta ->> 'user_name', ''),
    left(coalesce(nullif(v_meta ->> 'full_name', ''), nullif(v_meta ->> 'name', ''), nullif(v_meta ->> 'user_name', ''), split_part(coalesce(new.email, ''), '@', 1), ''), 120),
    nullif(v_meta ->> 'avatar_url', ''),
    lower(nullif(new.email, '')),
    new.email_confirmed_at is not null and nullif(new.email, '') is not null
  )
  on conflict (id) do update set
    github_user_id = excluded.github_user_id,
    github_login = excluded.github_login,
    avatar_url = excluded.avatar_url,
    email = excluded.email,
    email_verified = excluded.email_verified;
  return new;
end;
$$;

create trigger on_auth_user_synced
  after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function private.sync_profile_from_auth_user();

-- ---------------------------------------------------------------------------
-- Teams, memberships, invitations
-- ---------------------------------------------------------------------------

create type public.team_role as enum ('owner', 'member');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null))
);
create index invitations_team_id_idx on public.invitations (team_id);

create function private.is_team_member(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
  );
$$;

create function private.is_team_owner(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.team_id = p_team_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function private.shares_team(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.team_id = mine.team_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

create function public.create_team(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_team uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.teams (name, created_by) values (btrim(p_name), v_user) returning id into v_team;
  insert into public.memberships (team_id, user_id, role) values (v_team, v_user, 'owner');
  return v_team;
end;
$$;

-- Tokens are hashed with SHA-256 hex both here and in the server (src/lib/server/tokens.ts).
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) not between 32 and 128 then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null and nullif(u.email, '') is not null;
  if v_email is null then
    raise exception 'verified_email_required' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_inv.revoked_at is not null then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_user then
      return v_inv.team_id;
    end if;
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;

  insert into public.memberships (team_id, user_id, role)
  values (v_inv.team_id, v_user, 'member')
  on conflict (team_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.team_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Connections and approved repositories
-- ---------------------------------------------------------------------------

create type public.connection_provider as enum ('linear', 'github');

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  provider public.connection_provider not null,
  external_account_id text not null,
  external_account_name text,
  external_account_url text,
  status text not null default 'active' check (status in ('active', 'reconnect_required')),
  connected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, provider)
);
create trigger connections_set_updated_at before update on public.connections
  for each row execute function private.set_updated_at();

create table private.connection_secrets (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  scope text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on table private.connection_secrets from public, anon, authenticated;

create function public.put_connection_secret(
  p_connection_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_scope text,
  p_expires_at timestamptz
) returns void
language sql security definer set search_path = '' as $$
  insert into private.connection_secrets (connection_id, access_token_ciphertext, refresh_token_ciphertext, scope, expires_at)
  values (p_connection_id, p_access_token_ciphertext, p_refresh_token_ciphertext, p_scope, p_expires_at)
  on conflict (connection_id) do update set
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    scope = excluded.scope,
    expires_at = excluded.expires_at,
    updated_at = now();
$$;

create function public.get_connection_secret(p_connection_id uuid)
returns table (access_token_ciphertext text, refresh_token_ciphertext text, scope text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.access_token_ciphertext, s.refresh_token_ciphertext, s.scope, s.expires_at
  from private.connection_secrets s where s.connection_id = p_connection_id;
$$;

create table public.team_repositories (
  team_id uuid not null references public.teams (id) on delete cascade,
  github_repository_id text not null check (github_repository_id ~ '^[0-9]+$'),
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  html_url text not null check (html_url like 'https://github.com/%'),
  default_branch text,
  is_private boolean not null default false,
  access text not null default 'public' check (access in ('public', 'github_app')),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, github_repository_id)
);

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------

create type public.meeting_kind as enum ('scheduled', 'huddle', 'upload');
create type public.capture_status as enum ('pending', 'live', 'finalizing', 'uploading', 'transcribing', 'ready', 'failed');
create type public.processing_status as enum (
  'not_started', 'waiting_transcript', 'resolving_context', 'needs_context',
  'enriching', 'extracting', 'publishing', 'complete', 'partial_failure', 'failed'
);
create type public.context_provenance as enum ('user', 'inferred');

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id),
  kind public.meeting_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  agenda text not null default '' check (char_length(agenda) <= 4000),
  language text not null default 'en' check (language in ('en', 'ka')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  timezone text check (timezone is null or char_length(timezone) <= 64),
  context_mode text not null check (context_mode in ('selected', 'infer', 'mixed')),
  context_revision integer not null default 1 check (context_revision >= 1),
  github_repository_id text,
  github_repository_provenance public.context_provenance,
  linear_team_id text,
  linear_team_provenance public.context_provenance,
  linear_project_id text,
  linear_project_provenance public.context_provenance,
  inferred_evidence jsonb not null default '{}'::jsonb,
  daily_room_name text unique,
  daily_session_id text,
  capture_status public.capture_status not null default 'pending',
  processing_status public.processing_status not null default 'not_started',
  summary text,
  decisions jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  error_stage text,
  error_message text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id),
  foreign key (team_id, github_repository_id) references public.team_repositories (team_id, github_repository_id),
  constraint meetings_schedule_check check (
    (kind = 'scheduled' and scheduled_start is not null and scheduled_end > scheduled_start and timezone is not null)
    or (kind <> 'scheduled' and scheduled_start is null and scheduled_end is null and timezone is null)
  ),
  constraint meetings_repo_provenance_check check ((github_repository_id is null) = (github_repository_provenance is null)),
  constraint meetings_linear_team_provenance_check check ((linear_team_id is null) = (linear_team_provenance is null)),
  constraint meetings_linear_project_provenance_check check ((linear_project_id is null) = (linear_project_provenance is null)),
  constraint meetings_project_requires_team_check check (linear_project_id is null or linear_team_id is not null),
  constraint meetings_selected_context_check check (
    context_mode <> 'selected'
    or (github_repository_id is not null and linear_team_id is not null and linear_project_id is not null)
  )
);
create index meetings_team_start_idx on public.meetings (team_id, scheduled_start);
create index meetings_team_created_idx on public.meetings (team_id, created_at desc);
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function private.set_updated_at();

create table public.meeting_invitees (
  team_id uuid not null,
  meeting_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  foreign key (team_id, meeting_id) references public.meetings (team_id, id) on delete cascade,
  foreign key (team_id, user_id) references public.memberships (team_id, user_id) on delete cascade
);

-- One logical participant per user survives rejoin. Written from verified provider
-- join events (or organizer-supplied attendance for uploads), never from the client.
create table public.meeting_participants (
  team_id uuid not null,
  meeting_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provenance text not null check (provenance in ('provider', 'organizer')),
  consented_at timestamptz,
  first_joined_at timestamptz,
  last_left_at timestamptz,
  provider_participant_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id),
  foreign key (team_id, meeting_id) references public.meetings (team_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Transcripts, tasks, notifications
-- ---------------------------------------------------------------------------

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  meeting_id uuid not null,
  revision integer not null check (revision >= 1),
  source text not null check (source in ('daily', 'upload')),
  language text not null check (language in ('en', 'ka')),
  storage_path text,
  provider_transcript_id text,
  segments jsonb not null check (jsonb_typeof(segments) = 'array'),
  complete boolean not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (team_id, meeting_id, revision),
  foreign key (team_id, meeting_id) references public.meetings (team_id, id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  meeting_id uuid not null,
  transcript_revision integer not null,
  ordinal integer not null check (ordinal between 1 and 10),
  payload jsonb not null,
  linear_issue_uuid uuid not null unique,
  publication_status text not null default 'pending'
    check (publication_status in ('pending', 'publishing', 'published', 'failed', 'unresolved')),
  publication_error text,
  linear_issue_identifier text,
  linear_issue_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, transcript_revision, ordinal),
  foreign key (team_id, meeting_id, transcript_revision)
    references public.transcripts (team_id, meeting_id, revision) on delete cascade
);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  meeting_id uuid not null,
  kind text not null check (kind in ('task_ready', 'context_required')),
  task_id uuid references public.tasks (id) on delete cascade,
  linear_issue_url text,
  title text not null check (char_length(title) between 1 and 300),
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (team_id, meeting_id) references public.meetings (team_id, id) on delete cascade,
  check ((kind = 'task_ready') = (task_id is not null)),
  unique (recipient_id, task_id)
);
create unique index notifications_context_prompt_key
  on public.notifications (recipient_id, meeting_id) where kind = 'context_required';
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Processing bookkeeping (server-only)
-- ---------------------------------------------------------------------------

create table public.processing_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  meeting_id uuid not null,
  transcript_revision integer,
  context_revision integer not null,
  state text not null default 'pending' check (state in ('pending', 'dispatched', 'running', 'succeeded', 'failed')),
  stage text,
  error text,
  attempt integer not null default 0,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, meeting_id) references public.meetings (team_id, id) on delete cascade
);
create unique index processing_requests_one_active_key
  on public.processing_requests (meeting_id) where state in ('pending', 'dispatched', 'running');
create trigger processing_requests_set_updated_at before update on public.processing_requests
  for each row execute function private.set_updated_at();

create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('daily', 'deepgram', 'linear', 'inngest')),
  dedupe_key text not null,
  event_type text not null,
  team_id uuid references public.teams (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);

-- ---------------------------------------------------------------------------
-- Privileges. Revoke Supabase's broad defaults, then grant only what RLS expects.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.teams to authenticated;
grant update (name) on public.teams to authenticated;

grant select on public.memberships to authenticated;
grant delete on public.memberships to authenticated;

grant select (id, team_id, email, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;
grant insert (team_id, email, token_hash, invited_by, expires_at) on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;

grant select on public.connections to authenticated;
grant select on public.team_repositories to authenticated;

grant select on public.meetings to authenticated;
grant insert (
  team_id, organizer_id, kind, title, agenda, language, scheduled_start, scheduled_end, timezone,
  context_mode, github_repository_id, github_repository_provenance, linear_team_id,
  linear_team_provenance, linear_project_id, linear_project_provenance
) on public.meetings to authenticated;
grant update (title, agenda, language, scheduled_start, scheduled_end, timezone) on public.meetings to authenticated;

grant select, delete on public.meeting_invitees to authenticated;
grant insert (team_id, meeting_id, user_id) on public.meeting_invitees to authenticated;

grant select on public.meeting_participants to authenticated;
grant select on public.transcripts to authenticated;
grant select on public.tasks to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Functions are executable by PUBLIC by default; narrow every one explicitly.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_team_member(uuid) to authenticated;
grant execute on function private.is_team_owner(uuid) to authenticated;
grant execute on function private.shares_team(uuid) to authenticated;

revoke execute on function public.create_team(text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

revoke execute on function public.put_connection_secret(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.get_connection_secret(uuid) from public, anon, authenticated;
grant execute on function public.put_connection_secret(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.get_connection_secret(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.connections enable row level security;
alter table public.team_repositories enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_invitees enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.transcripts enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.processing_requests enable row level security;
alter table public.provider_events enable row level security;
alter table private.connection_secrets enable row level security;

create policy "Read own and teammate profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_team(id));
create policy "Update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members read their teams" on public.teams
  for select to authenticated using (private.is_team_member(id));
create policy "Owners rename their teams" on public.teams
  for update to authenticated
  using (private.is_team_owner(id)) with check (private.is_team_owner(id));

create policy "Members read team memberships" on public.memberships
  for select to authenticated using (private.is_team_member(team_id));
create policy "Owners revoke members and members leave" on public.memberships
  for delete to authenticated
  using (role = 'member' and (private.is_team_owner(team_id) or user_id = (select auth.uid())));

create policy "Owners read invitations" on public.invitations
  for select to authenticated using (private.is_team_owner(team_id));
create policy "Owners create invitations" on public.invitations
  for insert to authenticated
  with check (
    private.is_team_owner(team_id)
    and invited_by = (select auth.uid())
    and expires_at <= now() + interval '14 days'
  );
create policy "Owners revoke pending invitations" on public.invitations
  for update to authenticated
  using (private.is_team_owner(team_id) and accepted_at is null)
  with check (private.is_team_owner(team_id));

create policy "Members read connections" on public.connections
  for select to authenticated using (private.is_team_member(team_id));
create policy "Members read approved repositories" on public.team_repositories
  for select to authenticated using (private.is_team_member(team_id));

create policy "Members read meetings" on public.meetings
  for select to authenticated using (private.is_team_member(team_id));
create policy "Members organize meetings" on public.meetings
  for insert to authenticated
  with check (
    private.is_team_member(team_id)
    and organizer_id = (select auth.uid())
    and coalesce(github_repository_provenance, 'user') = 'user'
    and coalesce(linear_team_provenance, 'user') = 'user'
    and coalesce(linear_project_provenance, 'user') = 'user'
  );
create policy "Organizers edit their meetings" on public.meetings
  for update to authenticated
  using (organizer_id = (select auth.uid()) and private.is_team_member(team_id))
  with check (organizer_id = (select auth.uid()) and private.is_team_member(team_id));

create policy "Members read invitees" on public.meeting_invitees
  for select to authenticated using (private.is_team_member(team_id));
create policy "Organizers add invitees" on public.meeting_invitees
  for insert to authenticated
  with check (exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.team_id = meeting_invitees.team_id and m.organizer_id = (select auth.uid())
  ));
create policy "Organizers remove invitees" on public.meeting_invitees
  for delete to authenticated
  using (exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.team_id = meeting_invitees.team_id and m.organizer_id = (select auth.uid())
  ));

create policy "Members read participants" on public.meeting_participants
  for select to authenticated using (private.is_team_member(team_id));
create policy "Members read transcripts" on public.transcripts
  for select to authenticated using (private.is_team_member(team_id));
create policy "Members read tasks" on public.tasks
  for select to authenticated using (private.is_team_member(team_id));

create policy "Recipients read their notifications" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) and private.is_team_member(team_id));
create policy "Recipients mark notifications read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()) and private.is_team_member(team_id))
  with check (recipient_id = (select auth.uid()));

-- processing_requests, provider_events and private.connection_secrets have RLS
-- enabled and no policies: only service_role (which bypasses RLS) can use them.

-- ---------------------------------------------------------------------------
-- Storage: private bucket shiproom-audio, objects at <team_id>/<meeting_id>/<file>
-- ---------------------------------------------------------------------------

create function private.meeting_audio_path(p_name text, out team_id uuid, out meeting_id uuid)
language plpgsql immutable set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if array_length(v_parts, 1) <> 3 or v_parts[3] = '' then
    return;
  end if;
  begin
    team_id := v_parts[1]::uuid;
    meeting_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    team_id := null;
    meeting_id := null;
  end;
end;
$$;

create function private.can_upload_meeting_audio(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from private.meeting_audio_path(p_name) p
    join public.meetings m on m.id = p.meeting_id and m.team_id = p.team_id
    where m.organizer_id = (select auth.uid())
      and m.kind = 'upload'
      and m.capture_status in ('pending', 'uploading')
      and private.is_team_member(m.team_id)
  );
$$;

create function private.can_read_meeting_audio(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from private.meeting_audio_path(p_name) p
    join public.meetings m on m.id = p.meeting_id and m.team_id = p.team_id
    where private.is_team_member(m.team_id)
  );
$$;

revoke execute on function private.meeting_audio_path(text) from public, anon, authenticated;
revoke execute on function private.can_upload_meeting_audio(text) from public, anon, authenticated;
revoke execute on function private.can_read_meeting_audio(text) from public, anon, authenticated;
grant execute on function private.meeting_audio_path(text) to authenticated;
grant execute on function private.can_upload_meeting_audio(text) to authenticated;
grant execute on function private.can_read_meeting_audio(text) to authenticated;

-- No update/delete policy: browsers cannot overwrite or remove media. Cleanup is server-side.
create policy "Organizers upload meeting audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'shiproom-audio' and private.can_upload_meeting_audio(name));
create policy "Team members read meeting audio" on storage.objects
  for select to authenticated
  using (bucket_id = 'shiproom-audio' and private.can_read_meeting_audio(name));
