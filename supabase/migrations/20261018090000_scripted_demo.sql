-- Demo mode is server-owned and cannot be set or changed by browser roles.
alter table public.meetings add column is_demo boolean not null default false;
alter table public.meetings add constraint meetings_demo_check
  check (not is_demo or (kind = 'huddle' and language = 'ka'));

alter table public.transcripts drop constraint transcripts_source_check;
alter table public.transcripts add constraint transcripts_source_check
  check (source in ('daily', 'upload', 'browser', 'demo'));
