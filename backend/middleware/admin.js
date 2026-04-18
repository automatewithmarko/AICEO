const ADMIN_EMAILS = ['bazilsb7@gmail.com', 'markofilipovic2003@gmail.com'];

export async function requireAdmin(req, res, next) {
  // req.user is set by requireAuth
  if (!req.user || req.user.id === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }
  if (!ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
