/**
 * Permission middleware for workspace tab access.
 *
 * Assumes `req.user` has already been populated by the auth middleware
 * with `permissions` (array of tab keys) and `isOwner` (boolean).
 *
 * Owner always passes. Anonymous never passes.
 *
 * Usage:
 *   router.get('/api/sales/...', requirePermission('sales'), handler)
 */
export function requirePermission(tabKey) {
  return (req, res, next) => {
    const u = req.user;
    if (!u || u.id === 'anonymous') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (u.isOwner) return next();
    if (Array.isArray(u.permissions) && u.permissions.includes(tabKey)) {
      return next();
    }
    return res.status(403).json({
      error: 'permission_denied',
      tab: tabKey,
      role: u.role || null,
    });
  };
}

/**
 * Workspace-admin gate: owner or any role with can_manage_members = true.
 * Used for member/role management routes.
 */
export function requireWorkspaceAdmin(req, res, next) {
  const u = req.user;
  if (!u || u.id === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (u.isOwner || u.canManageMembers) return next();
  return res.status(403).json({ error: 'workspace_admin_required' });
}

/**
 * Owner-only gate (Billing, account ownership transfer, etc.).
 */
export function requireOwner(req, res, next) {
  const u = req.user;
  if (!u || u.id === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (u.isOwner) return next();
  return res.status(403).json({ error: 'owner_required' });
}
