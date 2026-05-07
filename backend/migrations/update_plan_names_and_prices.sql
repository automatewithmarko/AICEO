-- Rebrand: Complete → Core ($2,997), Diamond → Diamond ($3,997).
-- Internal plan IDs stay the same for backward compat with Stripe env
-- vars and existing subscription rows.

UPDATE plans
SET display_name = 'Core',
    name         = 'core',
    setup_fee    = 2997
WHERE id = 'complete';

UPDATE plans
SET setup_fee = 3997
WHERE id = 'diamond';
