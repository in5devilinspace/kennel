-- Kennel schema draft v0 (phase 1). Postgres 16.
-- Invariant 3: tenant isolation is enforced here with row-level security, not only in app code.
-- The app connects as role kennel_app and sets `SET LOCAL app.tenant_id = '<uuid>'` per request.

create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null,
  display_name text,
  idp_subject text,              -- SAML NameID / OIDC sub, set in phase 4
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create type ticket_status as enum ('new','triaged','in_progress','waiting','resolved','closed');
create type ticket_priority as enum ('p1','p2','p3','p4');
create type ticket_source as enum ('email','discord','http');
create type actor_kind as enum ('human','agent');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  body text not null,
  source ticket_source not null,
  priority ticket_priority not null default 'p3',
  status ticket_status not null default 'new',
  requester text,                -- email address, discord user id, or api key id
  first_human_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tickets (tenant_id, status, priority);

create table ticket_transitions (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  ticket_id uuid not null references tickets(id),
  from_status ticket_status,
  to_status ticket_status not null,
  actor_kind actor_kind not null,
  actor_id text not null,
  at timestamptz not null default now(),
  -- Invariant 1 at the database too: agents never resolve or close.
  constraint agent_never_disposes check (not (actor_kind = 'agent' and to_status in ('resolved','closed')))
);

create table triage_proposals (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  ticket_id uuid not null references tickets(id),
  category text not null,
  priority ticket_priority not null,
  runbook_id uuid,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  -- Invariant 2: provenance is not optional.
  model text not null check (model <> ''),
  prompt_hash text not null check (prompt_hash <> ''),
  inputs_hash text not null check (inputs_hash <> ''),
  eval_score numeric(5,4),
  actor_id text not null,
  at timestamptz not null default now()
);

create table runbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  slug text not null,
  title text not null,
  body_md text not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  severity ticket_priority not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  postmortem_md text
);

create table incident_tickets (
  incident_id uuid references incidents(id),
  ticket_id uuid references tickets(id),
  primary key (incident_id, ticket_id)
);

create table sla_policies (
  tenant_id uuid not null references tenants(id),
  priority ticket_priority not null,
  first_response_minutes int not null,
  primary key (tenant_id, priority)
);

-- Row-level security -------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kennel_app') then
    create role kennel_app login;
  end if;
end $$;

grant usage on schema public to kennel_app;
grant select, insert, update on all tables in schema public to kennel_app;
grant usage, select on all sequences in schema public to kennel_app;

do $$
declare t text;
begin
  foreach t in array array['users','tickets','ticket_transitions','triage_proposals','runbooks','incidents','sla_policies']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = current_setting('app.tenant_id', true)::uuid) with check (tenant_id = current_setting('app.tenant_id', true)::uuid)$p$, t);
  end loop;
end $$;

-- tenants table: an app session may only see its own row.
alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenant_self on tenants using (id = current_setting('app.tenant_id', true)::uuid);
