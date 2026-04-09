-- Registration control schema extension
-- PostgreSQL 14+

begin;

create type if not exists registration_override_scope as enum ('email','domain','ip','fingerprint','tenant');
create type if not exists registration_override_action as enum ('ALLOW','BYPASS_INVITE','BYPASS_DOMAIN','BYPASS_THROTTLE','DENY');

create table if not exists registration_policy (
  id bigserial primary key,
  tenant_id text null,
  invite_only boolean not null default true,
  domain_allowlist_enabled boolean not null default true,
  default_rate_policy text not null default 'strict',
  abuse_policy text not null default 'progressive_challenge',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists registration_domain_allowlist (
  id bigserial primary key,
  tenant_id text null,
  domain text not null,
  is_active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, domain)
);

create index if not exists idx_reg_domain_allowlist_active
  on registration_domain_allowlist (tenant_id, domain)
  where is_active = true;

create table if not exists registration_invite (
  id bigserial primary key,
  invite_code_hash text not null unique,
  tenant_id text null,
  created_by text not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz null,
  is_revoked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses > 0),
  check (used_count >= 0 and used_count <= max_uses)
);

create table if not exists registration_invite_domain (
  id bigserial primary key,
  invite_id bigint not null references registration_invite(id) on delete cascade,
  domain text not null,
  unique (invite_id, domain)
);

create table if not exists registration_invite_use (
  id bigserial primary key,
  invite_id bigint not null references registration_invite(id) on delete cascade,
  user_id text null,
  email text not null,
  ip inet null,
  fingerprint_id text null,
  consumed_at timestamptz not null default now()
);

create table if not exists registration_override (
  id bigserial primary key,
  tenant_id text null,
  scope registration_override_scope not null,
  scope_value text not null,
  action registration_override_action not null,
  reason_code text not null,
  created_by text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index if not exists idx_registration_override_lookup
  on registration_override (tenant_id, scope, scope_value, expires_at)
  where revoked_at is null;

create table if not exists registration_decision_audit (
  id bigserial primary key,
  decision_id text not null unique,
  tenant_id text null,
  email_hash text null,
  ip inet null,
  fingerprint_id text null,
  invite_id bigint null references registration_invite(id),
  result text not null,
  reason_codes text[] not null,
  risk_score integer not null,
  rate_bucket_snapshot jsonb not null,
  override_id bigint null references registration_override(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_registration_decision_audit_created_at
  on registration_decision_audit (created_at desc);

insert into registration_policy (
  tenant_id,
  invite_only,
  domain_allowlist_enabled,
  default_rate_policy,
  abuse_policy
)
values (null, true, true, 'strict', 'progressive_challenge')
on conflict (tenant_id) do nothing;

commit;
