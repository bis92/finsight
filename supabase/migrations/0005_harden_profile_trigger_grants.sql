-- Trigger-only function: close the REST RPC surface (Supabase advisor 0028/0029).
-- Triggers fire regardless of EXECUTE grants, so revoking blocks /rest/v1/rpc calls
-- without affecting on_auth_user_created.
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
