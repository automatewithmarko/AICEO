import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getBillingPlan } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in
  const [credits, setCredits] = useState(0);
  const [features, setFeatures] = useState([]);
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);

  const buildUser = async (session) => {
    if (!session?.user) {
      setUser(null);
      setCredits(0);
      setFeatures([]);
      setPlanData(null);
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

    // Fetch billing plan (includes plan, subscription, and credits)
    let billingInfo = null;
    try {
      billingInfo = await getBillingPlan();
      console.log('[AuthContext] billingInfo:', JSON.stringify({
        plan: billingInfo?.plan?.name,
        subscription: billingInfo?.subscription,
        credits: billingInfo?.credits?.balance,
      }));
    } catch {
      // Fallback to direct DB queries if billing API not ready
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
    setLoading(false);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      buildUser(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        buildUser(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const hasFeature = useCallback((name) => {
    return features.includes(name);
  }, [features]);

  const refreshCredits = useCallback(async () => {
    try {
      const billingInfo = await getBillingPlan();
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

  const signup = async (email, password, _plan, fullName) => {
    // The legacy signup wrote a phantom { plan, status:'active' } row into
    // subscriptions BEFORE any payment. The new 4-step funnel can't tolerate
    // that — it interpreted the phantom row as "user has a plan, skip the
    // setup-fee gate". Signup now only creates the auth user; the
    // subscription row is upserted by the Stripe webhook on the first
    // checkout.session.completed (mode=payment) event.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || 'New User' },
      },
    });
    if (error) throw error;
  };

  const logout = async () => {
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
    <AuthContext.Provider value={{ user, credits, features, planData, loading, login, signup, logout, hasFeature, refreshCredits, refreshUser }}>
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
