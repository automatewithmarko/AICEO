-- Stripe catalog sync imports products whose type isn't one of the five
-- manual categories; every insert violated products_type_check (the old
-- 'digital' default wasn't in the constraint), so connected users synced
-- payments fine but never got a single product. Add 'Digital' as the
-- imported-product fallback type.
-- Applied to the live DB 2026-07-25 via Supabase MCP.
alter table products drop constraint if exists products_type_check;
alter table products add constraint products_type_check
  check (type = any (array['Coaching'::text, 'Course'::text, 'SAAS'::text, 'LeadMagnet'::text, 'Community'::text, 'Digital'::text]));
