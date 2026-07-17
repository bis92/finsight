do $$
begin
  create type public.plan_enum as enum ('free', 'pro');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.direction_enum as enum ('expense', 'income');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.upload_status_enum as enum ('parsing', 'done', 'error');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.category_enum as enum (
    '식비',
    '카페/간식',
    '교통',
    '쇼핑',
    '구독',
    '주거',
    '공과금',
    '문화/여가',
    '의료',
    '금융',
    '교육',
    '수입',
    '기타'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.cadence_enum as enum ('monthly', 'weekly', 'unknown');
exception
  when duplicate_object then null;
end
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_enum not null default 'free',
  polar_subscription_id text,
  polar_customer_id text,
  created_at timestamptz not null default now()
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  original_name text not null,
  status public.upload_status_enum not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  upload_id uuid not null references public.uploads (id) on delete cascade,
  occurred_on date not null,
  merchant text not null,
  amount integer not null check (amount >= 0),
  direction public.direction_enum not null,
  category public.category_enum not null,
  raw jsonb not null default '{}'::jsonb
);

create index transactions_user_id_occurred_on_idx
  on public.transactions (user_id, occurred_on);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  summary text,
  insights jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant text not null,
  amount integer not null check (amount >= 0),
  cadence public.cadence_enum not null,
  confidence real not null,
  last_seen_on date not null
);
