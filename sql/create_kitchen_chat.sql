-- Chat Cocina <-> Admin
create table if not exists public.kitchen_messages (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), sender_role text not null check (sender_role in ('admin', 'kitchen')), message text not null, read_at timestamptz);
alter table public.kitchen_messages enable row level security;
create policy "Authenticated can read messages" on public.kitchen_messages for select to authenticated using (true);
create policy "Authenticated can insert messages" on public.kitchen_messages for insert to authenticated with check (true);
create policy "Authenticated can update read_at" on public.kitchen_messages for update to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.kitchen_messages;