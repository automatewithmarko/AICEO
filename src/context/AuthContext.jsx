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
    } catch {
      // Fallback to direct DB queries if billing API not ready
    }

    let plan = null;
    let creditBalance = 0;
    let planFeatures = [];
    let billingData = null;

    if (billingInfo?.plan) {
      plan = billingInfo.plan.display_name || billingInfo.plan.name || billingInfo.plan.id;
      creditBalance = billingInfo.credits?.balance ?? 0;
      // features is a jsonb object like { crm: true, marketing_ai: true, ... }
      // Convert to array of enabled feature names for hasFeature() checks
      const featObj = billingInfo.plan.features || {};
      planFeatures = Object.entries(featObj).filter(([, v]) => !!v).map(([k]) => k);
      billingData = {
        plan: billingInfo.plan,
        subscription: billingInfo.subscription,
        credits: billingInfo.credits,
      };
    } else {
      // Fallback: fetch credits and subscription directly from DB
      const { data: creditRow } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', authUser.id)
        .single();

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

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
      onboardingType: authUser.user_metadata?.onboarding_type || null,
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

  const signup = async (email, password, plan, fullName, onboardingType) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || 'New User',
          ...(onboardingType ? { onboarding_type: onboardingType } : {}),
        },
      },
    });
    if (error) throw error;

    // Create subscription record if plan selected and user confirmed
    if (data.user && plan) {
      await supabase.from('subscriptions').insert({
        user_id: data.user.id,
        plan: plan.toLowerCase(),
        status: 'active',
      });
    }
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
