import { supabase } from './storage.js';

// The canonical list of tab keys the frontend understands. Changing this
// list requires updating the Sidebar permission map AND the seeded role
// permissions below.
export const TAB_KEYS = [
  'ai-ceo',
  'dashboard',
  'content',
  'marketing',
  'inbox',
  'sales',
  'crm',
  'forms',
  'docs',
];

// System role definitions seeded the first time a workspace's roles are
// read. `is_system` rows can have their permission set edited by the
// admin/owner but cannot be deleted. Custom roles can be added on top.
//
// Owner is NOT in this list — owner is implicit (always-all-permissions,
// always-can-manage-members, exclusive billing) and never has a row in
// workspace_roles or workspace_members.
const SYSTEM_ROLES = [
  {
    role_key: 'admin',
    label: 'Admin',
    permissions: TAB_KEYS,
    can_manage_members: true,
    is_system: true,
  },
  {
    role_key: 'member',
    label: 'Member',
    // Default Member preset: every tab except CRM (often sensitive) — admin
    // can edit this in Settings → Team. Picked deliberately to be useful
    // out of the box rather than empty.
    permissions: TAB_KEYS.filter((k) => k !== 'crm'),
    can_manage_members: false,
    is_system: true,
  },
];

/**
 * Ensure the system roles (`admin`, `member`) exist for a workspace.
 * Idempotent — safe to call on every read of role data. Cheap because
 * we use a single upsert with onConflict do-nothing semantics.
 */
export async function ensureSystemRoles(ownerUserId) {
  const rows = SYSTEM_ROLES.map((r) => ({
    owner_user_id: ownerUserId,
    role_key: r.role_key,
    label: r.label,
    permissions: r.permissions,
    can_manage_members: r.can_manage_members,
    is_system: r.is_system,
  }));
  // ignoreDuplicates so we don't clobber edits the admin made to the
  // permission set; we only seed the row if it's missing.
  await supabase
    .from('workspace_roles')
    .upsert(rows, { onConflict: 'owner_user_id,role_key', ignoreDuplicates: true });
}

/**
 * Build the workspace context for a request.
 *
 * - `actorId`  — the auth.users.id from the JWT
 * - `requestedOwnerId` — optional X-Workspace-Owner header value
 *
 * Returns `{ ownerId, role, permissions, isOwner, canManageMembers }`.
 * Throws if the actor is not allowed to act in the requested workspace.
 */
export async function resolveContext(actorId, requestedOwnerId) {
  const ownerId = requestedOwnerId || actorId;

  // Solo / own-workspace path: no DB hit, full access.
  if (ownerId === actorId) {
    return {
      ownerId,
      role: 'owner',
      permissions: TAB_KEYS,
      isOwner: true,
      canManageMembers: true,
    };
  }

  // Cross-workspace path: actor must be an active member.
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('role_key, status')
    .eq('owner_user_id', ownerId)
    .eq('member_user_id', actorId)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed: ${error.message}`);
  if (!membership || membership.status !== 'active') {
    const e = new Error('not_a_member');
    e.code = 'NOT_A_MEMBER';
    throw e;
  }

  // Seed the role table if this is the first cross-workspace request, then
  // load the role definition.
  await ensureSystemRoles(ownerId);
  const { data: role } = await supabase
    .from('workspace_roles')
    .select('permissions, can_manage_members')
    .eq('owner_user_id', ownerId)
    .eq('role_key', membership.role_key)
    .maybeSingle();

  // If the role row was deleted out from under the membership, fall back
  // to "member with no permissions" rather than 500-ing the whole request.
  const permissions = Array.isArray(role?.permissions) ? role.permissions : [];

  return {
    ownerId,
    role: membership.role_key,
    permissions,
    isOwner: false,
    canManageMembers: !!role?.can_manage_members,
  };
}
