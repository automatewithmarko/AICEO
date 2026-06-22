import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Second tenant: Noyion uses a SEPARATE Supabase project, so its JWTs are signed
// with a different secret and must be validated against its own auth server.
// Only created when configured, so PurelyPersonal-only deployments are unaffected.
// The Noyion client is only used to validate user JWTs (auth.getUser), which works
// with the anon key — so either the anon or the service-role key is accepted.
const noyionKey =
  process.env.NOYION_SUPABASE_SERVICE_ROLE_KEY || process.env.NOYION_SUPABASE_ANON_KEY;
const supabaseNoyion =
  process.env.NOYION_SUPABASE_URL && noyionKey
    ? createClient(process.env.NOYION_SUPABASE_URL, noyionKey)
    : null;

export { supabase };

export async function requireAuth(req, res, next) {
  // EventSource (live transcript SSE) can't set headers, so allow ?token= as a fallback.
  const token =
    req.headers.authorization?.replace('Bearer ', '') || req.query?.token;
  if (!token || token === 'undefined') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Try the PurelyPersonal project first, then Noyion. Whichever validates the
  // token determines the tenant; user_id always comes from the verified token.
  let { data: { user }, error } = await supabase.auth.getUser(token);
  let tenant = 'purelypersonal';

  if ((error || !user) && supabaseNoyion) {
    ({ data: { user }, error } = await supabaseNoyion.auth.getUser(token));
    tenant = 'noyion';
  }

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  req.userTenant = tenant;
  next();
}
