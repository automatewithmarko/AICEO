-- Workspace-level role-based access control.
--
-- Design (v1):
--   * Each user implicitly owns a workspace identified by their own user_id.
--     There is NO `workspaces` table — owner_user_id IS the workspace ID.
--     A future v2 can add a real workspaces table without breaking this.
--   * Owner is implicit (always full access, sole billing access). No row
--     in workspace_members for the owner of the workspace.
--   * Admins/Members are explicit rows in workspace_members.
--   * Roles + permissions are stored per-workspace in workspace_roles so
--     each owner can edit their own role definitions.
--   * Pending invitations (before the invitee has linked an auth user) live
--     in workspace_invites and are accepted via a one-shot token.

-- ─── workspace_members ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL DEFAULT 'member',
  status   TEXT NOT NULL DEFAULT 'active',  -- active | suspended
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_no_self_owner CHECK (owner_user_id <> member_user_id),
  UNIQUE (owner_user_id, member_user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_owner  ON workspace_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_member ON workspace_members(member_user_id);

-- ─── workspace_roles ──────────────────────────────────────────────────
-- One row per (workspace, role). System roles (`admin`, `member`) are
-- seeded lazily by the backend on first read; admins can edit their
-- permission sets but not delete them. Custom role slugs allowed later.
CREATE TABLE IF NOT EXISTS workspace_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,                          -- 'admin' | 'member' | custom slug
  label TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of tab keys
  can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_workspace_roles_owner ON workspace_roles(owner_user_id);

-- ─── workspace_invites ────────────────────────────────────────────────
-- Pending invites. Token is the URL-safe random string the invitee
-- receives via email; on accept, a workspace_members row is created and
-- the invite is marked accepted.
CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | accepted | revoked | expired
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email_owner
  ON workspace_invites(owner_user_id, lower(email)) WHERE status = 'pending';

-- ─── RLS ──────────────────────────────────────────────────────────────
-- All workspace tables are accessed exclusively through the backend
-- (which uses the service role key), so RLS just needs a permissive
-- service-role posture and a deny-by-default for anon. The backend
-- enforces auth and owner/membership checks per request.
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

-- Members can read their own membership rows (handy for client-side debug);
-- everything else is backend-only via service role.
DROP POLICY IF EXISTS "members_read_own" ON workspace_members;
CREATE POLICY "members_read_own" ON workspace_members
  FOR SELECT USING (auth.uid() = member_user_id OR auth.uid() = owner_user_id);
