-- Brief 02c: avatar creator.
-- Munzir applies this. Code expects it before the avatar maker works; the app still loads without it.

-- 1. Storage bucket `ssx`, private. Every file lives under {user_id}/...
--    Players only read their own folder. Nothing writes from the client directly:
--    uploads use signed upload urls made by /api with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ssx', 'ssx', false, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "ssx own files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'ssx' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2. Long AI jobs. The client polls /api, which advances the job one step per call.
create table public.ssx_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'working' check (status in ('working', 'done', 'failed')),
  step text not null,
  input jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ssx_jobs_user_created on public.ssx_jobs (user_id, created_at desc);
-- at most one working job per player and kind
create unique index ssx_jobs_one_working on public.ssx_jobs (user_id, kind) where status = 'working';

alter table public.ssx_jobs enable row level security;
create policy "own jobs read" on public.ssx_jobs
  for select using (user_id = (select auth.uid()));

-- 3. Avatars: real height, and the paid intermediate files so we can re-normalize for free.
alter table public.ssx_avatars
  add column height_m numeric,
  add column raw_path text,
  add column cutout_path text,
  add column job_id uuid references public.ssx_jobs (id) on delete set null;

-- 4. The avatar standing in the room. Null = the placeholder (avatar_00).
alter table public.ssx_profiles
  add column active_avatar_id uuid references public.ssx_avatars (id) on delete set null;
