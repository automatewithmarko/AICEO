import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/storage.js';
import { TAB_KEYS, ensureSystemRoles } from '../services/workspace.js';
import { requireWorkspaceAdmin } from '../middleware/workspace.js';

const router = Router();

const INVITE_TTL_DAYS = 14;

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function isValidRoleKey(key) {
  return typeof key === 'string' && /^[a-z][a-z0-9_-]{0,40}$/.test(key);
}

// ─── GET /api/workspace/me ────────────────────────────────────────────
// Returns the active workspace context + the list of workspaces the
// user can switch to (their own + any they're a member of). The
// frontend uses this on every session-build to know role/permissions
// and to render the workspace switcher.
router.get('/api/workspace/me', async (req, res) => {
  const { actorId, ownerId, role, permissions, isOwner, canManageMembers } = req.user;
  if (!actorId || actorId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

  // List workspaces the actor can access. Always includes their own,
  // plus any active memberships in others'.
  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('owner_user_id, role_key')
    .eq('member_user_id', actorId)
    .eq('status', 'active');

  if (error) return res.status(500).json({ error: error.message });

  const otherOwnerIds = (memberships || []).map((m) => m.owner_user_id);
  const allOwnerIds = [actorId, ...otherOwnerIds];

  // Pull display info for each workspace owner from profiles + auth.
  let profiles = [];
  if (allOwnerIds.length) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', allOwnerIds);
    profiles = data || [];
  }
  const profileById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const workspaces = [
    {
      ownerId: actorId,
      role: 'owner',
      label: profileById[actorId]?.full_name || 'My workspace',
      avatarUrl: profileById[actorId]?.avatar_url || null,
    },
    ...((memberships || []).map((m) => ({
      ownerId: m.owner_user_id,
      role: m.role_key,
      label: profileById[m.owner_user_id]?.full_name || 'Workspace',
      avatarUrl: profileById[m.owner_user_id]?.avatar_url || null,
    }))),
  ];

  res.json({
    actorId,
    activeOwnerId: ownerId,
    role,
    permissions,
    isOwner,
    canManageMembers,
    tabKeys: TAB_KEYS,
    workspaces,
  });
});

// ─── GET /api/workspace/members ───────────────────────────────────────
// List members of the current workspace.
router.get('/api/workspace/members', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;

  const { data: rows, error } = await supabase
    .from('workspace_members')
    .select('id, member_user_id, role_key, status, created_at')
    .eq('owner_user_id', ownerId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  if (!rows?.length) return res.json({ members: [] });

  const ids = rows.map((r) => r.member_user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', ids);
  const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  // Fetch emails via auth admin API — not in profiles.
  const emails = {};
  await Promise.all(ids.map(async (uid) => {
    try {
      const { data } = await supabase.auth.admin.getUserById(uid);
      if (data?.user?.email) emails[uid] = data.user.email;
    } catch { /* swallow — best effort */ }
  }));

  const members = rows.map((r) => ({
    id: r.id,
    userId: r.member_user_id,
    email: emails[r.member_user_id] || null,
    name: profileById[r.member_user_id]?.full_name || '',
    avatarUrl: profileById[r.member_user_id]?.avatar_url || null,
    role: r.role_key,
    status: r.status,
    createdAt: r.created_at,
  }));

  res.json({ members });
});

// ─── PATCH /api/workspace/members/:id — change role/status ────────────
router.patch('/api/workspace/members/:id', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const actorId = req.user.actorId;
  const { role, status } = req.body || {};

  // Block self role/status changes — the trap from "as admin marked
  // myself as member": the actor demoted themselves to a role without
  // canManageMembers and lost access to the very page they were using.
  // Force the change to come from the owner or another admin instead.
  // (Removal is already blocked at the DELETE endpoint with the same
  // reasoning.)
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('member_user_id')
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'member_not_found' });
  if (existing.member_user_id === actorId) {
    return res.status(400).json({
      error: 'cannot_change_own_role',
      hint: 'Ask the workspace owner (or another admin) to change your role.',
    });
  }

  // Validate the target role exists in this workspace.
  if (role !== undefined) {
    if (!isValidRoleKey(role)) return res.status(400).json({ error: 'invalid_role_key' });
    await ensureSystemRoles(ownerId);
    const { data: r } = await supabase
      .from('workspace_roles')
      .select('role_key')
      .eq('owner_user_id', ownerId)
      .eq('role_key', role)
      .maybeSingle();
    if (!r) return res.status(400).json({ error: 'unknown_role' });
  }

  const update = { updated_at: new Date().toISOString() };
  if (role !== undefined) update.role_key = role;
  if (status !== undefined) {
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    update.status = status;
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .update(update)
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'member_not_found' });
  res.json({ member: data });
});

// ─── DELETE /api/workspace/members/:id ────────────────────────────────
router.delete('/api/workspace/members/:id', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const actorId = req.user.actorId;

  // Refuse self-removal — an admin clicking their own "Remove" button
  // would lock themselves out with no undo. They have to ask the
  // owner (or another admin) to remove them, or use the "leave" flow
  // explicitly via DELETE /api/workspace/leave/:owner_user_id.
  const { data: row } = await supabase
    .from('workspace_members')
    .select('member_user_id')
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId)
    .maybeSingle();
  if (!row) return res.status(404).json({ error: 'member_not_found' });
  if (row.member_user_id === actorId) {
    return res.status(400).json({
      error: 'cannot_remove_self',
      hint: 'Use the leave-workspace flow if you want to remove your own access.',
    });
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── GET /api/workspace/roles ─────────────────────────────────────────
// Lists roles for the workspace (auto-seeds system roles on first read).
// Available to any member so the frontend can label "Member"/"Admin"
// in the workspace switcher.
router.get('/api/workspace/roles', async (req, res) => {
  const ownerId = req.user.ownerId;
  await ensureSystemRoles(ownerId);
  const { data, error } = await supabase
    .from('workspace_roles')
    .select('role_key, label, permissions, can_manage_members, is_system')
    .eq('owner_user_id', ownerId)
    .order('is_system', { ascending: false })
    .order('label', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ roles: data || [], tabKeys: TAB_KEYS });
});

// ─── PUT /api/workspace/roles/:role_key ───────────────────────────────
// Update permissions / label / can_manage_members for an existing role.
router.put('/api/workspace/roles/:role_key', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const actorId = req.user.actorId;
  const roleKey = req.params.role_key;
  const { label, permissions, can_manage_members } = req.body || {};

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions_must_be_array' });
    const invalid = permissions.filter((p) => !TAB_KEYS.includes(p));
    if (invalid.length) return res.status(400).json({ error: 'unknown_tab_keys', keys: invalid });
  }

  // Lockout guard: if the actor IS NOT the owner AND they're editing
  // the role they currently hold AND the change drops can_manage_members
  // to false, refuse — they'd lose the ability to undo the change. The
  // owner is exempt because they can't be removed from their own role
  // (owner is implicit, never has a workspace_roles row).
  if (!req.user.isOwner && can_manage_members === false) {
    const { data: actorMembership } = await supabase
      .from('workspace_members')
      .select('role_key')
      .eq('owner_user_id', ownerId)
      .eq('member_user_id', actorId)
      .maybeSingle();
    if (actorMembership?.role_key === roleKey) {
      return res.status(400).json({
        error: 'would_lock_self_out',
        hint: 'You can\'t remove "can manage members" from the role you currently hold. Ask the owner to do it.',
      });
    }
  }

  await ensureSystemRoles(ownerId);

  const update = { updated_at: new Date().toISOString() };
  if (label !== undefined) update.label = String(label).slice(0, 60);
  if (permissions !== undefined) update.permissions = permissions;
  if (can_manage_members !== undefined) update.can_manage_members = !!can_manage_members;

  const { data, error } = await supabase
    .from('workspace_roles')
    .update(update)
    .eq('owner_user_id', ownerId)
    .eq('role_key', roleKey)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'role_not_found' });
  res.json({ role: data });
});

// ─── POST /api/workspace/roles — create custom role ──────────────────
router.post('/api/workspace/roles', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { role_key, label, permissions = [], can_manage_members = false } = req.body || {};

  if (!isValidRoleKey(role_key)) return res.status(400).json({ error: 'invalid_role_key' });
  if (['owner', 'admin', 'member'].includes(role_key)) {
    return res.status(400).json({ error: 'reserved_role_key' });
  }
  if (!Array.isArray(permissions) || permissions.some((p) => !TAB_KEYS.includes(p))) {
    return res.status(400).json({ error: 'invalid_permissions' });
  }

  const { data, error } = await supabase
    .from('workspace_roles')
    .insert({
      owner_user_id: ownerId,
      role_key,
      label: String(label || role_key).slice(0, 60),
      permissions,
      can_manage_members: !!can_manage_members,
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'role_already_exists' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ role: data });
});

// ─── DELETE /api/workspace/roles/:role_key — custom only ─────────────
router.delete('/api/workspace/roles/:role_key', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const roleKey = req.params.role_key;

  const { data: role } = await supabase
    .from('workspace_roles')
    .select('is_system')
    .eq('owner_user_id', ownerId)
    .eq('role_key', roleKey)
    .maybeSingle();

  if (!role) return res.status(404).json({ error: 'role_not_found' });
  if (role.is_system) return res.status(400).json({ error: 'cannot_delete_system_role' });

  // Refuse if any member is currently using it.
  const { count } = await supabase
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerId)
    .eq('role_key', roleKey);
  if ((count || 0) > 0) return res.status(409).json({ error: 'role_in_use', members: count });

  await supabase
    .from('workspace_roles')
    .delete()
    .eq('owner_user_id', ownerId)
    .eq('role_key', roleKey);
  res.json({ ok: true });
});

// ─── GET /api/workspace/invites — pending invites ────────────────────
// Includes the invite URL so admins can re-grab it from the list (the
// "I copied the link, then closed the page" recovery case). Token is
// returned because it's already shareable by the admin who created
// the invite — they can always create a fresh one anyway, so reading
// existing tokens adds no privilege.
router.get('/api/workspace/invites', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, email, role_key, status, expires_at, created_at, token')
    .eq('owner_user_id', ownerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const frontendUrl = process.env.FRONTEND_URL || 'https://aiceo-dev.netlify.app';
  const invites = (data || []).map((inv) => ({
    ...inv,
    inviteUrl: `${frontendUrl}/invite/${inv.token}`,
  }));
  res.json({ invites });
});

// ─── POST /api/workspace/invites — create invite ─────────────────────
router.post('/api/workspace/invites', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const actorId = req.user.actorId;
  const { email, role_key = 'member' } = req.body || {};

  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email_required' });
  if (!isValidRoleKey(role_key)) return res.status(400).json({ error: 'invalid_role_key' });
  if (role_key === 'owner') return res.status(400).json({ error: 'cannot_invite_owner' });

  const cleanEmail = email.trim().toLowerCase();

  // Refuse if a pending invite already exists for this email.
  const { data: existing } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('owner_user_id', ownerId)
    .ilike('email', cleanEmail)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return res.status(409).json({ error: 'invite_already_pending' });

  await ensureSystemRoles(ownerId);
  const { data: roleRow } = await supabase
    .from('workspace_roles')
    .select('role_key')
    .eq('owner_user_id', ownerId)
    .eq('role_key', role_key)
    .maybeSingle();
  if (!roleRow) return res.status(400).json({ error: 'unknown_role' });

  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: invite, error } = await supabase
    .from('workspace_invites')
    .insert({
      owner_user_id: ownerId,
      email: cleanEmail,
      role_key,
      token,
      invited_by: actorId,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const frontendUrl = process.env.FRONTEND_URL || 'https://aiceo-dev.netlify.app';
  const inviteUrl = `${frontendUrl}/invite/${token}`;

  // TODO: send email via existing email-sender service. For v1 we return
  // the URL so the admin can copy + paste it manually; UI exposes a
  // copy button. Wiring transactional email is a follow-up.
  res.json({ invite, inviteUrl });
});

// ─── DELETE /api/workspace/invites/:id — revoke ──────────────────────
router.delete('/api/workspace/invites/:id', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { error } = await supabase
    .from('workspace_invites')
    .update({ status: 'revoked' })
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── GET /api/workspace/invites/lookup/:token ────────────────────────
// Preview an invite before accepting. Returns workspace owner display
// info, role, and expiration so the InviteAccept page can render
// "Join Acme Corp as Admin · expires May 21" before requesting auth.
//
// Mounted with requireAuthOnly so a stale X-Workspace-Owner header
// can't 403 the preview. Anonymous callers can also hit this — useful
// when an invite link is shared and the recipient previews before
// signing up. We never leak the token itself; the only sensitive
// field is the inviting workspace owner's name, which the recipient
// would see post-accept anyway.
router.get('/api/workspace/invites/lookup/:token', async (req, res) => {
  const { data: invite } = await supabase
    .from('workspace_invites')
    .select('owner_user_id, email, role_key, status, expires_at')
    .eq('token', req.params.token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'invite_not_found' });

  let ownerName = null;
  let ownerAvatar = null;
  if (invite.status === 'pending') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', invite.owner_user_id)
      .maybeSingle();
    ownerName = profile?.full_name || null;
    ownerAvatar = profile?.avatar_url || null;
  }

  // Look up the role label so the preview shows "Admin" not "admin"
  let roleLabel = invite.role_key;
  const { data: role } = await supabase
    .from('workspace_roles')
    .select('label')
    .eq('owner_user_id', invite.owner_user_id)
    .eq('role_key', invite.role_key)
    .maybeSingle();
  if (role?.label) roleLabel = role.label;

  // Compute effective status. Surfacing 'expired' upfront lets the UI
  // show a tailored message rather than throwing on accept.
  const expired = new Date(invite.expires_at).getTime() < Date.now();
  const effectiveStatus = invite.status === 'pending' && expired ? 'expired' : invite.status;

  res.json({
    status: effectiveStatus,
    email: invite.email,
    roleKey: invite.role_key,
    roleLabel,
    expiresAt: invite.expires_at,
    ownerName,
    ownerAvatar,
  });
});

// ─── POST /api/workspace/invites/:id/resend — extend expiry ──────────
// Refreshes the invite's expires_at to now + INVITE_TTL_DAYS without
// changing the token. Useful when an invitee didn't act in time but
// the admin still wants the same person on the same role.
router.post('/api/workspace/invites/:id/resend', requireWorkspaceAdmin, async (req, res) => {
  const ownerId = req.user.ownerId;
  const newExpires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('workspace_invites')
    .update({ status: 'pending', expires_at: newExpires })
    .eq('id', req.params.id)
    .eq('owner_user_id', ownerId)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'invite_not_found' });

  const frontendUrl = process.env.FRONTEND_URL || 'https://aiceo-dev.netlify.app';
  res.json({ invite: data, inviteUrl: `${frontendUrl}/invite/${data.token}` });
});

// ─── POST /api/workspace/invites/accept — { token } ──────────────────
// Any authenticated user can call. Verifies the token, attaches the
// caller as a workspace_members row, marks the invite accepted.
router.post('/api/workspace/invites/accept', async (req, res) => {
  const actorId = req.user.actorId;
  if (!actorId || actorId === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token_required' });

  const { data: invite, error } = await supabase
    .from('workspace_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!invite) return res.status(404).json({ error: 'invite_not_found' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'invite_not_pending', status: invite.status });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase.from('workspace_invites').update({ status: 'expired' }).eq('id', invite.id);
    return res.status(410).json({ error: 'invite_expired' });
  }
  if (invite.owner_user_id === actorId) {
    return res.status(400).json({ error: 'cannot_join_own_workspace' });
  }

  // Enforce email match. If the invite went to alice@x.com but the
  // caller is signed in as bob@x.com, refuse — otherwise anyone with
  // the link could join under any account, defeating the point of an
  // emailed invite. Admin can revoke + re-invite the actual address
  // if they meant a different person.
  if (req.user.email && invite.email && req.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return res.status(403).json({
      error: 'email_mismatch',
      invitedEmail: invite.email,
      actorEmail: req.user.email,
    });
  }

  // Create / re-activate the membership.
  const { error: upsertErr } = await supabase
    .from('workspace_members')
    .upsert({
      owner_user_id: invite.owner_user_id,
      member_user_id: actorId,
      role_key: invite.role_key,
      status: 'active',
      invited_by: invite.invited_by,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,member_user_id' });

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  await supabase
    .from('workspace_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: actorId })
    .eq('id', invite.id);

  res.json({
    ok: true,
    workspace: { ownerId: invite.owner_user_id, role: invite.role_key },
  });
});

// ─── DELETE /api/workspace/leave/:owner_user_id ──────────────────────
// Leave a workspace you're a member of (you can't leave your own).
router.delete('/api/workspace/leave/:owner_user_id', async (req, res) => {
  const actorId = req.user.actorId;
  if (!actorId || actorId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });
  const ownerToLeave = req.params.owner_user_id;
  if (ownerToLeave === actorId) return res.status(400).json({ error: 'cannot_leave_own_workspace' });

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('owner_user_id', ownerToLeave)
    .eq('member_user_id', actorId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
