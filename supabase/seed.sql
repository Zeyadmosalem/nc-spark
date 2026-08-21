-- Applied by `supabase db reset`. Safe to re-run.
insert into public.allowed_domains (domain) values
  ('ncspark.ca'),
  ('speedpro-logis.com')
on conflict do nothing;
