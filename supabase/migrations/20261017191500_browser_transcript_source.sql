-- Allows an honestly labeled local-microphone transcript when Daily transcription
-- produces no artifact. `browser` is not an upload and is not a Daily transcript.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'transcripts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%source%daily%';
  if v_name is not null then
    execute format('alter table public.transcripts drop constraint %I', v_name);
  end if;
end $$;

alter table public.transcripts
  add constraint transcripts_source_check check (source in ('daily', 'upload', 'browser'));
