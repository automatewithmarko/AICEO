import { useEffect, useState, useCallback } from 'react';
import { Trash2, Copy, Check, Plus, X, UserPlus, Shield, RefreshCw } from 'lucide-react';
import {
  getWorkspaceMembers,
  updateWorkspaceMember,
  removeWorkspaceMember,
  getWorkspaceRoles,
  updateWorkspaceRole,
  createWorkspaceRole,
  deleteWorkspaceRole,
  getWorkspaceInvites,
  createWorkspaceInvite,
  revokeWorkspaceInvite,
  resendWorkspaceInvite,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './TeamSettings.css';

// Friendly labels for the canonical tab keys.
//
// SYNC: keys here MUST match backend/services/workspace.js TAB_KEYS,
// src/components/Sidebar.jsx navItems[].tab, and
// src/components/Layout.jsx ROUTE_TAB_MAP. Missing a key here means
// the matrix column shows the raw key (ugly but not broken).
const TAB_LABELS = {
  'ai-ceo': 'AI CEO',
  'dashboard': 'Dashboard',
  'content': 'Content',
  'marketing': 'Marketing',
  'inbox': 'Inbox',
  'sales': 'Sales',
  'crm': 'CRM',
  'forms': 'Forms',
  'docs': 'Docs',
};

export default function TeamSettings() {
  const { workspace } = useAuth();
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tabKeys, setTabKeys] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  const [editingPerms, setEditingPerms] = useState({});  // { role_key: Set<tab> }
  const [savingRole, setSavingRole] = useState(null);

  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState({ role_key: '', label: '', permissions: [] });

  const isAdmin = workspace?.isOwner || workspace?.canManageMembers;

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r, i] = await Promise.all([
        getWorkspaceMembers().catch(() => ({ members: [] })),
        getWorkspaceRoles().catch(() => ({ roles: [], tabKeys: [] })),
        getWorkspaceInvites().catch(() => ({ invites: [] })),
      ]);
      setMembers(m.members || []);
      setRoles(r.roles || []);
      setTabKeys(r.tabKeys || []);
      setInvites(i.invites || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) reloadAll(); }, [isAdmin, reloadAll]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteError(null);
    setLastInviteUrl(null);
    try {
      const result = await createWorkspaceInvite(inviteEmail.trim(), inviteRole);
      setLastInviteUrl(result.inviteUrl || null);
      setInviteEmail('');
      const i = await getWorkspaceInvites();
      setInvites(i.invites || []);
    } catch (err) {
      setInviteError(err.body?.error || err.message || 'Invite failed');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRoleChange = async (memberId, newRoleKey) => {
    await updateWorkspaceMember(memberId, { role: newRoleKey });
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRoleKey } : m));
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Remove this member from the workspace? They lose access immediately.')) return;
    await removeWorkspaceMember(memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleRevokeInvite = async (inviteId) => {
    await revokeWorkspaceInvite(inviteId);
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const handleResendInvite = async (inviteId) => {
    try {
      const result = await resendWorkspaceInvite(inviteId);
      // Refresh the pending list so the new expires_at shows.
      const i = await getWorkspaceInvites();
      setInvites(i.invites || []);
      // Surface the URL so the admin can copy + share again.
      if (result.inviteUrl) {
        setLastInviteUrl(result.inviteUrl);
      }
    } catch (err) {
      alert(err.body?.error || err.message || 'Resend failed');
    }
  };

  const togglePerm = (roleKey, tab) => {
    setEditingPerms((prev) => {
      const current = prev[roleKey] ?? new Set(roles.find((r) => r.role_key === roleKey)?.permissions || []);
      const next = new Set(current);
      if (next.has(tab)) next.delete(tab); else next.add(tab);
      return { ...prev, [roleKey]: next };
    });
  };

  const isPermChecked = (role, tab) => {
    const edited = editingPerms[role.role_key];
    if (edited) return edited.has(tab);
    return (role.permissions || []).includes(tab);
  };

  const isDirty = (roleKey) => !!editingPerms[roleKey];

  const saveRole = async (roleKey) => {
    setSavingRole(roleKey);
    try {
      const perms = Array.from(editingPerms[roleKey] || []);
      await updateWorkspaceRole(roleKey, { permissions: perms });
      setRoles((prev) => prev.map((r) => r.role_key === roleKey ? { ...r, permissions: perms } : r));
      setEditingPerms((prev) => {
        const { [roleKey]: _, ...rest } = prev;
        return rest;
      });
    } finally {
      setSavingRole(null);
    }
  };

  const handleCreateRole = async () => {
    if (!newRole.role_key.trim() || !newRole.label.trim()) return;
    try {
      const result = await createWorkspaceRole({
        role_key: newRole.role_key.trim().toLowerCase(),
        label: newRole.label.trim(),
        permissions: newRole.permissions,
      });
      setRoles((prev) => [...prev, result.role]);
      setNewRole({ role_key: '', label: '', permissions: [] });
      setNewRoleOpen(false);
    } catch (err) {
      alert(err.body?.error || err.message || 'Create role failed');
    }
  };

  const handleDeleteRole = async (roleKey) => {
    if (!confirm(`Delete role "${roleKey}"? This cannot be undone.`)) return;
    try {
      await deleteWorkspaceRole(roleKey);
      setRoles((prev) => prev.filter((r) => r.role_key !== roleKey));
    } catch (err) {
      alert(err.body?.error || err.message || 'Delete failed');
    }
  };

  const copyInviteUrl = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(url);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  if (!isAdmin) {
    return (
      <div className="team-settings">
        <p className="team-settings-empty">You need workspace admin access to manage the team.</p>
      </div>
    );
  }

  return (
    <div className="team-settings">
      {/* ─── Invite ────────────────────────────────────────────── */}
      <div className="team-card">
        <div className="team-card-header">
          <UserPlus size={16} />
          <h3>Invite a team member</h3>
        </div>
        <form className="team-invite-form" onSubmit={handleInvite}>
          <input
            type="email"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            disabled={inviteBusy}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} disabled={inviteBusy}>
            {roles.map((r) => (
              <option key={r.role_key} value={r.role_key}>{r.label}</option>
            ))}
          </select>
          <button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
            {inviteBusy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteError && <div className="team-error">{inviteError}</div>}
        {lastInviteUrl && (
          <div className="team-invite-link">
            <span>Share this link with your invitee:</span>
            <div className="team-invite-link-row">
              <code>{lastInviteUrl}</code>
              <button onClick={() => copyInviteUrl(lastInviteUrl)}>
                {copiedToken === lastInviteUrl ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Pending invites ──────────────────────────────────── */}
      {invites.length > 0 && (
        <div className="team-card">
          <h3 className="team-card-title">Pending invites</h3>
          <div className="team-list">
            {invites.map((inv) => (
              <div key={inv.id} className="team-row">
                <div className="team-row-main">
                  <span className="team-row-name">{inv.email}</span>
                  <span className="team-row-meta">{inv.role_key} · expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                </div>
                <button className="team-row-action" onClick={() => handleResendInvite(inv.id)} title="Resend (extend expiry)">
                  <RefreshCw size={14} />
                </button>
                <button className="team-row-action" onClick={() => handleRevokeInvite(inv.id)} title="Revoke invite">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Members ──────────────────────────────────────────── */}
      <div className="team-card">
        <h3 className="team-card-title">Members</h3>
        {loading ? (
          <p className="team-settings-empty">Loading…</p>
        ) : members.length === 0 ? (
          <p className="team-settings-empty">No team members yet — invite someone above.</p>
        ) : (
          <div className="team-list">
            {members.map((m) => (
              <div key={m.id} className="team-row">
                <div className="team-row-main">
                  <span className="team-row-name">{m.name || m.email || m.userId.slice(0, 8)}</span>
                  <span className="team-row-meta">{m.email}</span>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="team-row-select"
                >
                  {roles.map((r) => (
                    <option key={r.role_key} value={r.role_key}>{r.label}</option>
                  ))}
                </select>
                <button className="team-row-action" onClick={() => handleRemoveMember(m.id)} title="Remove member">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Roles & permissions ─────────────────────────────── */}
      <div className="team-card">
        <div className="team-card-header">
          <Shield size={16} />
          <h3>Roles & permissions</h3>
          <button
            className="team-card-action"
            onClick={() => setNewRoleOpen((v) => !v)}
          >
            <Plus size={14} /> {newRoleOpen ? 'Cancel' : 'New role'}
          </button>
        </div>

        {newRoleOpen && (
          <div className="team-new-role">
            <div className="team-new-role-fields">
              <input
                placeholder="role-key (e.g. assistant)"
                value={newRole.role_key}
                onChange={(e) => setNewRole((r) => ({ ...r, role_key: e.target.value }))}
              />
              <input
                placeholder="Display label"
                value={newRole.label}
                onChange={(e) => setNewRole((r) => ({ ...r, label: e.target.value }))}
              />
              <button onClick={handleCreateRole}>Create</button>
            </div>
            <div className="team-new-role-tabs">
              {tabKeys.map((tab) => (
                <label key={tab} className="team-tab-checkbox">
                  <input
                    type="checkbox"
                    checked={newRole.permissions.includes(tab)}
                    onChange={(e) => {
                      setNewRole((r) => ({
                        ...r,
                        permissions: e.target.checked
                          ? [...r.permissions, tab]
                          : r.permissions.filter((p) => p !== tab),
                      }));
                    }}
                  />
                  <span>{TAB_LABELS[tab] || tab}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="team-perm-matrix">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                {tabKeys.map((tab) => (
                  <th key={tab} title={tab}>{TAB_LABELS[tab] || tab}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {/* Owner row is informational — always all tabs, never editable */}
              <tr className="team-perm-row team-perm-row--owner">
                <td>Owner <span className="team-perm-tag">always all</span></td>
                {tabKeys.map((tab) => (
                  <td key={tab}><Check size={14} className="team-perm-on" /></td>
                ))}
                <td />
              </tr>
              {roles.map((role) => (
                <tr key={role.role_key} className="team-perm-row">
                  <td>
                    {role.label}
                    {role.is_system && <span className="team-perm-tag">system</span>}
                  </td>
                  {tabKeys.map((tab) => (
                    <td key={tab}>
                      <input
                        type="checkbox"
                        checked={isPermChecked(role, tab)}
                        onChange={() => togglePerm(role.role_key, tab)}
                      />
                    </td>
                  ))}
                  <td className="team-perm-actions">
                    {isDirty(role.role_key) && (
                      <button
                        onClick={() => saveRole(role.role_key)}
                        disabled={savingRole === role.role_key}
                      >
                        {savingRole === role.role_key ? '…' : 'Save'}
                      </button>
                    )}
                    {!role.is_system && (
                      <button
                        className="team-row-action"
                        onClick={() => handleDeleteRole(role.role_key)}
                        title="Delete role"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
