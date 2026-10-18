create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('author', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('critical', 'high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_category as enum (
    'royalty_payments',
    'isbn_metadata',
    'printing_quality',
    'distribution_availability',
    'book_status_production',
    'general_inquiry'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type classification_source as enum ('pending', 'ai', 'fallback', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists authors (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text,
  city text,
  country text,
  joined_at date,
  bank_linked boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists books (
  id text primary key,
  author_id text not null references authors(id) on delete cascade,
  title text not null,
  isbn text,
  genre text,
  publication_date date,
  status text not null default 'Unknown',
  package text,
  mrp numeric(10,2) not null default 0,
  total_copies_sold integer not null default 0,
  total_royalty_earned numeric(12,2) not null default 0,
  royalty_paid numeric(12,2) not null default 0,
  royalty_pending numeric(12,2) not null default 0,
  last_payout_date date,
  platforms text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists books_author_idx on books(author_id);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text not null unique,
  author_id text unique references authors(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint author_role_requires_author check (role <> 'author' or author_id is not null)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity (start with 1001) unique,
  author_id text not null references authors(id) on delete cascade,
  book_id text references books(id) on delete set null,
  subject text not null,
  description text not null,
  status ticket_status not null default 'open',
  category ticket_category,
  category_source classification_source not null default 'pending',
  priority ticket_priority not null default 'medium',
  priority_source classification_source not null default 'pending',
  ai_confidence numeric(3,2),
  ai_reasoning text,
  assigned_to uuid references profiles(id) on delete set null,
  attachment jsonb,
  last_reply_by user_role,
  last_activity_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_author_idx on tickets(author_id, created_at desc);
create index if not exists tickets_queue_idx on tickets(status, priority, created_at);
create index if not exists tickets_category_idx on tickets(category);
create index if not exists tickets_assignee_idx on tickets(assigned_to);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_role user_role not null,
  body text not null,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx on ticket_messages(ticket_id, created_at);

create table if not exists internal_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  admin_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists internal_notes_ticket_idx on internal_notes(ticket_id, created_at);

create table if not exists ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_idx on ticket_events(ticket_id, created_at);

create table if not exists ai_drafts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  context_hash text not null,
  content text not null,
  source text not null,
  model text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_drafts_ticket_idx on ai_drafts(ticket_id, created_at desc);

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete set null,
  operation text not null,
  model text,
  success boolean not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on ai_usage(created_at desc);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tickets_touch on tickets;
create trigger tickets_touch before update on tickets
for each row execute function touch_updated_at();

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function current_author_id() returns text
language sql stable security definer set search_path = public as $$
  select author_id from profiles where id = auth.uid();
$$;

alter table authors enable row level security;
alter table books enable row level security;
alter table profiles enable row level security;
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
alter table internal_notes enable row level security;
alter table ticket_events enable row level security;
alter table ai_drafts enable row level security;
alter table ai_usage enable row level security;

drop policy if exists authors_read on authors;
create policy authors_read on authors for select to authenticated
  using (is_admin() or id = current_author_id());

drop policy if exists books_read on books;
create policy books_read on books for select to authenticated
  using (is_admin() or author_id = current_author_id());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (is_admin() or id = auth.uid());

drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets for select to authenticated
  using (is_admin() or author_id = current_author_id());

drop policy if exists messages_read on ticket_messages;
create policy messages_read on ticket_messages for select to authenticated
  using (
    is_admin() or exists (
      select 1 from tickets t where t.id = ticket_id and t.author_id = current_author_id()
    )
  );

drop policy if exists notes_read on internal_notes;
create policy notes_read on internal_notes for select to authenticated using (is_admin());

drop policy if exists events_read on ticket_events;
create policy events_read on ticket_events for select to authenticated using (is_admin());

drop policy if exists drafts_read on ai_drafts;
create policy drafts_read on ai_drafts for select to authenticated using (is_admin());

drop policy if exists usage_read on ai_usage;
create policy usage_read on ai_usage for select to authenticated using (is_admin());

do $$ begin
  alter publication supabase_realtime add table tickets;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table ticket_messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table internal_notes;
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-attachments', 'ticket-attachments', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
