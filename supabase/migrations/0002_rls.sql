alter table public.profiles enable row level security;
alter table public.uploads enable row level security;
alter table public.transactions enable row level security;
alter table public.analyses enable row level security;
alter table public.subscriptions enable row level security;

-- profiles: own profile only
create policy "profiles_select_own"
  on public.profiles
  for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (id = auth.uid());

-- plan is server-truth: no user UPDATE policy; service-role bypasses RLS.

-- uploads user-scoped: own rows only
create policy "uploads_select_own"
  on public.uploads
  for select
  using (user_id = auth.uid());

create policy "uploads_insert_own"
  on public.uploads
  for insert
  with check (user_id = auth.uid());

create policy "uploads_update_own"
  on public.uploads
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "uploads_delete_own"
  on public.uploads
  for delete
  using (user_id = auth.uid());

-- transactions user-scoped: own rows only
create policy "transactions_select_own"
  on public.transactions
  for select
  using (user_id = auth.uid());

create policy "transactions_insert_own"
  on public.transactions
  for insert
  with check (user_id = auth.uid());

create policy "transactions_update_own"
  on public.transactions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "transactions_delete_own"
  on public.transactions
  for delete
  using (user_id = auth.uid());

-- analyses user-scoped: own rows only
create policy "analyses_select_own"
  on public.analyses
  for select
  using (user_id = auth.uid());

create policy "analyses_insert_own"
  on public.analyses
  for insert
  with check (user_id = auth.uid());

create policy "analyses_update_own"
  on public.analyses
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "analyses_delete_own"
  on public.analyses
  for delete
  using (user_id = auth.uid());

-- subscriptions user-scoped: own rows only
create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  using (user_id = auth.uid());

create policy "subscriptions_insert_own"
  on public.subscriptions
  for insert
  with check (user_id = auth.uid());

create policy "subscriptions_update_own"
  on public.subscriptions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "subscriptions_delete_own"
  on public.subscriptions
  for delete
  using (user_id = auth.uid());
