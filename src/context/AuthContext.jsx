import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  getBillingPlan,
  getWorkspaceMe,
  getActiveWorkspaceOwner,
  setActiveWorkspaceOwner,
} from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in
  const [credits, setCredits] = useState(0);
  const [features, setFeatures] = useState([]);
  const [planData, setPlanData] = useState(null);
  // 'unknown' until /api/billing/plan returns a 2xx successfully. Gates the
  // OnboardingFunnel so a transient 401/5xx never speculatively shows the
  // Plans page to a paying user.
  const [planResolved, setPlanResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  // Workspace / RBAC state — populated from /api/workspace/me on session
  // build. `permissions` is the array of tab keys the actor can see in
  // the active workspace; Sidebar/Layout/Settings consume this directly.
  const [workspace, setWorkspace] = useState(null);

  const buildUser = async (session) => {
    if (!session?.user) {
      setUser(null);
      setCredits(0);
      setFeatures([]);
      setPlanData(null);
      setPlanResolved(false);
      setWorkspace(null);
      setLoading(false);
      return;
    }

    const authUser = session.user;

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', authUser.id)
      .single();

    // Resolve workspace context (role + permissions + workspaces list).
    //
    // Recovery path matters here: if the persisted active workspace is
    // no longer one the actor is a member of (membership revoked,
    // suspended), the request will 403 with X-Workspace-Owner. So on
    // ANY failure we clear the persisted workspace and retry once —
    // the retry omits the header and falls through to the actor's own
    // workspace, which is always valid.
    let wsCtx = null;
    try {
      wsCtx = await getWorkspaceMe();
    } catch {
      await setActiveWorkspaceOwner(null);
      try { wsCtx = await getWorkspaceMe(); } catch { wsCtx = null; }
    }
    // Belt-and-suspenders: even on success, if the persisted owner
    // isn't in the workspace list, drop it and re-fetch.
    if (wsCtx) {
      const persisted = await getActiveWorkspaceOwner();
      const validOwners = new Set((wsCtx.workspaces || []).map((w) => w.ownerId));
      if (persisted && !validOwners.has(persisted)) {
        await setActiveWorkspaceOwner(null);
        try { wsCtx = await getWorkspaceMe(); } catch { /* keep prev */ }
      }
    }

    // Fetch billing plan (includes plan, subscription, and credits).
    // This reflects the EFFECTIVE workspace's billing — for a member
    // acting in someone else's workspace, that's the owner's plan. So
    // a member never sees "no plan" pricing as long as the workspace
    // they're acting in is paid up.
    let billingInfo = null;
    let billingOk = false;
    try {
      billingInfo = await getBillingPlan();
      billingOk = true;
    } catch {
      // Backend returned 401/5xx or network failed. Fall back to direct DB
      // for credits/plan display, but DON'T flip planResolved — the
      // OnboardingFunnel needs an authoritative signal before it can know
      // whether to render the Plans overlay.
    }

    // Smart default — if the actor has NEVER explicitly chosen a
    // workspace AND has no active billing in their own workspace AND
    // is a member of someone else's workspace, default to that
    // membership instead of dropping them on the OnboardingFunnel
    // pricing page in their empty own workspace. Invitee-style users
    // who joined someone's paid plan don't expect to be sold their
    // own subscription on every login.
    //
    // Runs only when wsCtx.isOwner — meaning the prior fetches went
    // against the actor's own workspace, so billingInfo describes
    // their own subscription. After the switch, we re-fetch both so
    // the rest of buildUser sees the NEW workspace's plan + credits.
    if (wsCtx && wsCtx.isOwner) {
      const persisted = await getActiveWorkspaceOwner();
      const hasOwnPlan = !!billingInfo?.subscription?.has_active_monthly;
      const otherMemberships = (wsCtx.workspaces || []).filter((w) => w.ownerId !== authUser.id);
      if (!persisted && !hasOwnPlan && otherMemberships.length > 0) {
        await setActiveWorkspaceOwner(otherMemberships[0].ownerId);
        try { wsCtx = await getWorkspaceMe(); } catch { /* keep prev */ }
        try {
          billingInfo = await getBillingPlan();
          billingOk = true;
        } catch { /* keep prev billingInfo */ }
      }
    }

    let plan = null;
    let creditBalance = 0;
    let planFeatures = [];
    let billingData = null;

    if (billingInfo?.plan || billingInfo?.subscription) {
      if (billingInfo.plan) {
        plan = billingInfo.plan.display_name || billingInfo.plan.name || billingInfo.plan.id;
        const featObj = billingInfo.plan.features || {};
        planFeatures = Object.entries(featObj).filter(([, v]) => !!v).map(([k]) => k);
      } else if (billingInfo.subscription?.plan) {
        plan = billingInfo.subscription.plan.charAt(0).toUpperCase() + billingInfo.subscription.plan.slice(1);
      }
      creditBalance = billingInfo.credits?.balance ?? 0;
      billingData = {
        plan: billingInfo.plan,
        subscription: billingInfo.subscription,
        credits: billingInfo.credits,
      };
    } else {
      // Fallback: fetch credits and subscription directly from DB.
      // maybeSingle() (not single()) so an empty result set returns null
      // instead of 406; fresh signups have no rows in either table.
      const { data: creditRow } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', authUser.id)
        .maybeSingle();

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      plan = subscription?.plan
        ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
        : null;
      creditBalance = creditRow?.balance ?? 0;
    }

    setUser({
      id: authUser.id,
      name: profile?.full_name || 'New User',
      email: authUser.email,
      avatar: profile?.avatar_url || null,
      plan,
    });
    setCredits(creditBalance);
    setFeatures(planFeatures);
    setPlanData(billingData);
    setPlanResolved(billingOk);
    setWorkspace(wsCtx ? {
      activeOwnerId: wsCtx.activeOwnerId,
      role: wsCtx.role,
      permissions: wsCtx.permissions || [],
      isOwner: !!wsCtx.isOwner,
      canManageMembers: !!wsCtx.canManageMembers,
      tabKeys: wsCtx.tabKeys || [],
      workspaces: wsCtx.workspaces || [],
    } : {
      // Fallback when /api/workspace/me failed: treat as solo owner.
      activeOwnerId: authUser.id,
      role: 'owner',
      permissions: [],
      isOwner: true,
      canManageMembers: true,
      tabKeys: [],
      workspaces: [{ ownerId: authUser.id, role: 'owner', label: profile?.full_name || 'My workspace', avatarUrl: profile?.avatar_url || null }],
    });
    setLoading(false);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      buildUser(session);
    });

    // Listen for auth changes. Only run the full buildUser pipeline
    // (profile + billing fetch) on real session transitions —
    // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, USER_UPDATED. The
    // background TOKEN_REFRESHED event fires every ~55 minutes and
    // produces a session object whose `user` is identical to what
    // we already have; running buildUser on it caused spurious
    // re-renders, races with in-flight billing fetches, and the
    // "logic problems on token refresh" the user reported.
    //
    // PASSWORD_RECOVERY: the user clicked a recovery link; we don't
    // build a user yet — let the recovery flow finish first.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        switch (event) {
          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
          case 'SIGNED_OUT':
          case 'USER_UPDATED':
            buildUser(session);
            return;
          case 'TOKEN_REFRESHED':
            // Tokens rotated under the hood. The user object is
            // unchanged; nothing to recompute. supabase-js has
            // already updated its internal session, so subsequent
            // requests pick up the new access token automatically.
            return;
          case 'PASSWORD_RECOVERY':
          default:
            return;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const hasFeature = useCallback((name) => {
    return features.includes(name);
  }, [features]);

  // Tab-permission check used by Sidebar/Layout/route guards. Owner
  // always passes. Returns false when workspace context isn't loaded
  // yet so consumers can render a safe "denied" fallback during the
  // brief boot window.
  const can = useCallback((tabKey) => {
    if (!workspace) return false;
    if (workspace.isOwner) return true;
    return Array.isArray(workspace.permissions) && workspace.permissions.includes(tabKey);
  }, [workspace]);

  // Switch the active workspace. Persists to localStorage and re-runs
  // the full session pipeline so role/permissions/credits reflect the
  // new workspace. The page itself stays on whatever route it was on;
  // Layout's permission guard will redirect if the new workspace
  // doesn't allow it.
  //
  // We persist the actual ownerId (even when it's the actor's own
  // user_id) instead of clearing localStorage — that way an explicit
  // choice of "stay in own workspace" is remembered across sign-outs
  // and overrides the smart-default heuristic on next sign-in.
  const switchWorkspace = useCallback(async (ownerId) => {
    await setActiveWorkspaceOwner(ownerId);
    const { data: { session } } = await supabase.auth.getSession();
    await buildUser(session);
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const billingInfo = await getBillingPlan();
      setPlanResolved(true);
      if (billingInfo?.credits) {
        setCredits(billingInfo.credits.balance ?? 0);
      }
      if (billingInfo?.plan?.features) {
        const featObj = billingInfo.plan.features || {};
        setFeatures(Object.entries(featObj).filter(([, v]) => !!v).map(([k]) => k));
      }
      if (billingInfo?.plan) {
        setPlanData({
          plan: billingInfo.plan,
          subscription: billingInfo.subscription,
          credits: billingInfo.credits,
        });
      }
    } catch {
      // Fallback: fetch credits directly
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: creditRow } = await supabase
          .from('credits')
          .select('balance')
          .eq('user_id', session.user.id)
          .single();
        setCredits(creditRow?.balance ?? 0);
      }
    }
  }, []);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  // `redirectTo` lets callers (currently InviteAccept) override Supabase's
  // default post-confirmation URL so the user lands back on /invite/:token
  // after clicking the email link, rather than the project's catch-all.
  //
  // localStorage is now scoped per actor_id (see lib/api.js), so a brand
  // new signup gets its own key namespace automatically — no clearing
  // needed.
  const signup = async (email, password, fullName, { redirectTo } = {}) => {
    // The legacy signup wrote a phantom { plan, status:'active' } row into
    // subscriptions BEFORE any payment. The new 4-step funnel can't tolerate
    // that — it interpreted the phantom row as "user has a plan, skip the
    // setup-fee gate". Signup now only creates the auth user; the
    // subscription row is upserted by the Stripe webhook on the first
    // checkout.session.completed (mode=payment) event.
    const options = {
      data: { full_name: fullName || 'New User' },
    };
    if (redirectTo) options.emailRedirectTo = redirectTo;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });
    if (error) throw error;
    // Returns the session so callers can decide whether to show "check
    // your email" vs. the user is already signed in.
    return data;
  };

  const logout = async () => {
    // localStorage is now scoped per actor_id, so cross-account leakage
    // can't happen even without a clear here. The actor's preference
    // is preserved for next sign-in.
    await supabase.auth.signOut();
  };

  // Re-runs the full buildUser pipeline against the current Supabase
  // session. Use after a checkout completes or the user's plan has
  // otherwise changed underneath us — refreshCredits only updates
  // credits/features/planData, NOT user.plan, so the App-level
  // PlanSelector overlay would otherwise stay open even after a
  // successful subscription activation.
  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await buildUser(session);
  }, []);

  return (
    <AuthContext.Provider value={{ user, credits, features, planData, planResolved, workspace, loading, login, signup, logout, hasFeature, can, switchWorkspace, refreshCredits, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
