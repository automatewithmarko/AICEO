import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, ExternalLink, X, Loader, Upload, Plus, AlertTriangle, CalendarClock, Facebook } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { connectIntegration, getIntegrations, uploadBrandDnaFiles, getDashboardStats } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Pages.css';
import './Dashboard.css';

const PAYMENT_TRACKERS = [
  { id: 'stripe', name: 'Stripe', logo: '/stripe-logo.png' },
  { id: 'whop', name: 'Whop', logo: '/whop-logo.svg' },
];

const ONBOARDING_STEPS = [
  { id: 1, label: 'Sign up for PuerlyPersonal', completed: true },
  { id: 2, label: 'Upload your photos', type: 'photos' },
  { id: 3, label: 'Upload your logos', type: 'logos' },
  { id: 4, label: 'Build your Brand Brain', type: 'brand-brain' },
  { id: 5, label: 'Connect to track your payments and sales', type: 'payment' },
  { id: 7, label: 'Connect GoHighLevel to sync with your CRM', type: 'gohighlevel' },
  { id: 8, label: 'Connect BooSend to automate your DMs', type: 'boosend' },
  { id: 9, label: 'Connect your social media profiles to automate content posting', type: 'action' },
];

const STEP_KEYS = { 1: 'signup', 2: 'photos', 3: 'logos', 4: 'brand-brain', 5: 'payment', 7: 'gohighlevel', 8: 'boosend', 9: 'social' };

// Platform metadata for the Overview (array order = display order).
const PLATFORM_META = [
  { id: 'instagram', name: 'Instagram', logoClass: 'stat-platform-logo--ig', icon: '/instagram-icon.svg', color: '#E4405F' },
  { id: 'linkedin', name: 'LinkedIn', logoClass: 'stat-platform-logo--li', icon: '/linkedin-icon.svg', color: '#0A66C2' },
  { id: 'facebook', name: 'Facebook', logoClass: 'stat-platform-logo--fb', icon: null, color: '#1877F2' },
  { id: 'x', name: 'X', logoClass: 'stat-platform-logo--x', icon: '/x-icon.svg', color: '#555555' },
  { id: 'tiktok', name: 'TikTok', logoClass: 'stat-platform-logo--tt', icon: '/tiktok-icon.svg', color: '#111111' },
  { id: 'youtube', name: 'YouTube', logoClass: 'stat-platform-logo--yt', icon: '/youtube-icon.svg', color: '#FF0000' },
];

const TYPE_LABELS = {
  text_post: 'Text posts', image_post: 'Image posts', carousel: 'Carousels',
  story: 'Stories', reel: 'Reels', script: 'Scripts',
  landing_page: 'Landing pages', newsletter: 'Newsletters', other: 'Other',
};
const TYPE_LABELS_ONE = {
  text_post: 'Text post', image_post: 'Image post', carousel: 'Carousel',
  story: 'Story', reel: 'Reel', script: 'Script',
  landing_page: 'Landing page', newsletter: 'Newsletter', other: 'Post',
};
const TYPE_ORDER = Object.keys(TYPE_LABELS);

const platformName = (id) =>
  PLATFORM_META.find((p) => p.id === String(id || '').toLowerCase())?.name || (id ? String(id) : 'Unknown');
const typeLabelOne = (t) => TYPE_LABELS_ONE[t] || TYPE_LABELS_ONE.other;
const snippet = (s, n = 70) => {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const fmtWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashLoading, setDashLoading] = useState(true);
  const [onboardingExpanded, setOnboardingExpanded] = useState(true);
  const autoCollapsedRef = useRef(false);
  const [completedSteps, setCompletedSteps] = useState(new Set([1]));
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_TRACKERS[0]);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);

  // Brand DNA modal state
  const [brandDnaModal, setBrandDnaModal] = useState(null); // 'photos' | 'logos' | 'brand-brain'
  const [photos, setPhotos] = useState([]);
  const [logos, setLogos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [brandDnaId, setBrandDnaId] = useState(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const brandBrainIframeRef = useRef(null);
  const [brandBrainRawData, setBrandBrainRawData] = useState(null);

  // Dashboard stats (populated from /api/dashboard-stats)
  const [statsTimeframe, setStatsTimeframe] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customApplied, setCustomApplied] = useState({ from: '', to: '' });
  const [overviewStats, setOverviewStats] = useState(null);
  // Needs-attention card UX: collapse + dismiss-until-new-failures.
  const [attnCollapsed, setAttnCollapsed] = useState(false);
  const [attnDismissedKey, setAttnDismissedKey] = useState(() => {
    try { return localStorage.getItem('dash-attn-dismissed') || null; } catch { return null; }
  });
  const dismissAttn = () => {
    const key = String((overviewStats?.failed_posts || [])[0]?.id ?? (overviewStats?.failed_posts || []).length);
    try { localStorage.setItem('dash-attn-dismissed', key); } catch { /* private mode */ }
    setAttnDismissedKey(key);
  };
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(null); // HTTP status or 'network'
  const [openPlatform, setOpenPlatform] = useState(null);   // accordion: one platform open at a time

  useEffect(() => {
    // Don't fetch if user picked Custom but hasn't applied a range yet.
    if (statsTimeframe === 'custom' && !customApplied.from && !customApplied.to) return;
    let cancelled = false;
    setOverviewLoading(true);
    const opts = statsTimeframe === 'custom'
      ? { from: customApplied.from || undefined, to: customApplied.to || undefined }
      : {};
    getDashboardStats(statsTimeframe, opts)
      .then((data) => {
        if (cancelled) return;
        if (!data || data.error) {
          setOverviewError(data?.error || 'network');
        } else {
          setOverviewError(null);
          setOverviewStats(data);
        }
      })
      .catch(() => { if (!cancelled) setOverviewError('network'); })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [statsTimeframe, customApplied]);


  const fmtInt = (n) => (Number(n) || 0).toLocaleString('en-US');
  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;
  };
  // Always two decimals — the Revenue tile shows real dollars ($X,XXX.XX).
  const fmtMoneyExact = (n) => {
    const v = Number(n) || 0;
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const platformGenerated = (p) => overviewStats?.content_generated?.[p]?.total ?? 0;
  const platformPublished = (p) => overviewStats?.content_published_detail?.[p]?.total ?? 0;

  // Union of generated + published byType keys for one platform; all-zero rows skipped.
  const platformTypeRows = (p) => {
    const gen = overviewStats?.content_generated?.[p]?.byType || {};
    const pub = overviewStats?.content_published_detail?.[p]?.byType || {};
    const keys = [...new Set([...Object.keys(gen), ...Object.keys(pub)])];
    keys.sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a); const ib = TYPE_ORDER.indexOf(b);
      return (ia === -1 ? TYPE_ORDER.length : ia) - (ib === -1 ? TYPE_ORDER.length : ib);
    });
    return keys
      .map((k) => ({ key: k, label: TYPE_LABELS[k] || TYPE_LABELS.other, generated: Number(gen[k]) || 0, published: Number(pub[k]) || 0 }))
      .filter((r) => r.generated > 0 || r.published > 0);
  };

  const upcomingPosts = overviewStats?.upcoming_posts || [];
  const failedPosts = overviewStats?.failed_posts || [];

  const goTo = (path) => () => navigate(path);
  const cardKeyNav = (path) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(path); }
  };

  // ── Chart data ──
  const revenueChartData = useMemo(() => {
    const series = overviewStats?.revenue_series || [];
    const isHourly = overviewStats?.granularity === 'hour';
    return series.map((pt) => {
      const d = new Date(pt.date);
      const label = isHourly
        ? d.toLocaleTimeString('en-US', { hour: 'numeric' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { label, value: Number(pt.value) || 0, rawDate: pt.date };
    });
  }, [overviewStats]);

  // Content Mix = PUBLISHED pieces only (created+published double-counted before).
  const contentMixData = useMemo(() => {
    return PLATFORM_META.map((p) => ({
      id: p.id, name: p.name, color: p.color,
      value: overviewStats?.content_published_detail?.[p.id]?.total ?? 0,
    })).filter((r) => r.value > 0);
  }, [overviewStats]);

  const revenueTotal = overviewStats?.revenue_generated || 0;
  const contentTotal = contentMixData.reduce((s, r) => s + r.value, 0);

  const [ghlLocationId, setGhlLocationId] = useState('');

  // Load onboarding state + integration status on mount
  useEffect(() => {
    async function load() {
      const steps = new Set([1]); // signup always done
      let visible = true;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: onboarding } = await supabase
          .from('onboarding')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (onboarding) {
          visible = onboarding.is_visible !== false;
          setOnboardingExpanded(visible);
          for (const s of (onboarding.completed_steps || [])) {
            if (s === 'signup') steps.add(1);
            if (s === 'photos') steps.add(2);
            if (s === 'logos') steps.add(3);
            if (s === 'brand-brain') steps.add(4);
            if (s === 'payment') steps.add(5);
            if (s === 'gohighlevel') steps.add(7);
            if (s === 'boosend') steps.add(8);
            if (s === 'social') steps.add(9);
          }
        }

        // Check Brand DNA for existing photos/logos/brand brain
        const { data: brandDnaRows } = await supabase
          .from('brand_dna')
          .select('id, photo_urls, logos, documents')
          .eq('user_id', session.user.id)
          .limit(1);
        if (brandDnaRows?.length) {
          const bd = brandDnaRows[0];
          setBrandDnaId(bd.id);
          if (bd.photo_urls?.length) steps.add(2);
          if (bd.logos?.length) steps.add(3);
          if (bd.documents?.brandBrain) steps.add(4);
        }
      }

      const intResult = await getIntegrations();

      const intMap = {};
      for (const int of (intResult.integrations || [])) {
        intMap[int.provider] = int;
      }

      if (intMap.stripe?.is_active || intMap.whop?.is_active) steps.add(5);
      if (intMap.gohighlevel?.is_active) steps.add(7);
      if (intMap.boosend?.is_active) steps.add(8);

      onboardingRef.current = { visible, steps };
      setCompletedSteps(steps);
      setDashLoading(false);
    }
    load();
  }, []);

  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = completedSteps.size;
  const progressPercent = (completedCount / totalSteps) * 100;

  // Onboarding persistence. The upsert (onConflict: 'user_id') REPLACES the
  // row, so is_visible and completed_steps must always be written together —
  // two single-column upserts were clobbering each other (audit finding 2).
  // The ref always mirrors the latest onboarding state so every save carries
  // both fields regardless of which one just changed.
  const onboardingRef = useRef({ visible: true, steps: new Set([1]) });
  const persistOnboarding = (patch = {}) => {
    const next = { ...onboardingRef.current, ...patch };
    onboardingRef.current = next;
    const stepsArr = [...next.steps].map((id) => STEP_KEYS[id]).filter(Boolean);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      supabase.from('onboarding').upsert({
        user_id: session.user.id,
        is_visible: next.visible,
        completed_steps: stepsArr,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).then(() => {}, () => {});
    });
  };

  const toggleOnboarding = () => {
    const next = !onboardingExpanded;
    setOnboardingExpanded(next);
    persistOnboarding({ visible: next });
  };

  // Auto-collapse on the incomplete -> complete transition within this session.
  // Avoids fighting users who already finished onboarding and deliberately
  // re-expanded the panel on a prior visit.
  const prevCompletedRef = useRef(completedCount);
  useEffect(() => {
    const wasIncomplete = prevCompletedRef.current < totalSteps;
    const nowComplete = completedCount === totalSteps;
    if (wasIncomplete && nowComplete && !autoCollapsedRef.current && onboardingExpanded) {
      autoCollapsedRef.current = true;
      setOnboardingExpanded(false);
      persistOnboarding({ visible: false });
    }
    prevCompletedRef.current = completedCount;
  }, [completedCount, totalSteps, onboardingExpanded]);

  const handleComplete = (stepId) => {
    // Read from the ref (not the render closure) so back-to-back completions
    // never drop a step, then persist BOTH onboarding fields together.
    const next = new Set([...onboardingRef.current.steps, stepId]);
    persistOnboarding({ steps: next });
    setCompletedSteps(next);
  };

  const handleSkip = (stepId) => handleComplete(stepId);

  // --- Integration modals ---
  const openPaymentModal = () => {
    setApiKey(''); setConnectError(null); setConnecting(false);
    setModalType('payment'); setModalOpen(true);
  };

  const openBoosendModal = () => {
    setApiKey(''); setConnectError(null); setConnecting(false);
    setModalType('boosend'); setModalOpen(true);
  };

  const openGhlModal = () => {
    setApiKey(''); setGhlLocationId(''); setConnectError(null); setConnecting(false);
    setModalType('gohighlevel'); setModalOpen(true);
  };

  const handleGHLConnect = async () => {
    if (!apiKey.trim() || !ghlLocationId.trim()) return;
    setConnecting(true); setConnectError(null);
    try {
      await connectIntegration('gohighlevel', apiKey, { location_id: ghlLocationId.trim() });
      setModalOpen(false);
      handleComplete(7);
      setApiKey(''); setGhlLocationId(''); setModalType(null);
    } catch (err) { setConnectError(err.message); }
    finally { setConnecting(false); }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true); setConnectError(null);
    try {
      const provider = modalType === 'payment' ? selectedPayment.id
        : modalType === 'boosend' ? 'boosend'
        : null;
      if (!provider) { setConnecting(false); return; }
      await connectIntegration(provider, apiKey);
      setModalOpen(false);
      if (modalType === 'payment') handleComplete(5);
      else if (modalType === 'boosend') handleComplete(8);
      setApiKey(''); setModalType(null);
    } catch (err) { setConnectError(err.message); }
    finally { setConnecting(false); }
  };

  // --- Brand DNA helpers ---
  const ensureBrandDna = async () => {
    if (brandDnaId) return brandDnaId;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    // Check if one exists
    const { data: existing } = await supabase.from('brand_dna').select('id').eq('user_id', session.user.id).limit(1);
    if (existing?.length) {
      setBrandDnaId(existing[0].id);
      return existing[0].id;
    }
    // Create new
    const { data } = await supabase.from('brand_dna').insert({
      user_id: session.user.id, name: 'My Brand', photo_urls: [], video_urls: [], documents: {}, colors: {},
    }).select().single();
    if (data) { setBrandDnaId(data.id); return data.id; }
    return null;
  };

  // --- Photos ---
  const openPhotosModal = async () => {
    const id = await ensureBrandDna();
    if (!id) return;
    const { data } = await supabase.from('brand_dna').select('photo_urls').eq('id', id).single();
    const urls = data?.photo_urls || [];
    setPhotos(urls.map((url, i) => ({ id: `existing-${i}`, url, uploading: false })));
    setBrandDnaModal('photos');
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const remaining = 20 - photos.length;
    const toAdd = files.slice(0, remaining);
    if (!toAdd.length) return;
    e.target.value = '';
    const placeholders = toAdd.map((file, i) => ({
      id: `photo-${Date.now()}-${i}`, localUrl: URL.createObjectURL(file), uploading: true,
    }));
    setPhotos(prev => [...prev, ...placeholders]);
    try {
      const result = await uploadBrandDnaFiles(toAdd);
      const uploadedUrls = result.files.filter(f => f.type !== 'error').map(f => f.url);
      setPhotos(prev => prev.map(p => {
        if (!p.uploading) return p;
        const idx = placeholders.findIndex(ph => ph.id === p.id);
        if (idx === -1 || !uploadedUrls[idx]) return p;
        return { ...p, url: uploadedUrls[idx], uploading: false };
      }));
    } catch { setPhotos(prev => prev.filter(p => !p.uploading)); }
  };

  const removePhoto = (id) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo?.localUrl) URL.revokeObjectURL(photo.localUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const savePhotos = async () => {
    setSaving(true);
    const id = await ensureBrandDna();
    const urls = photos.map(p => p.url).filter(Boolean);
    await supabase.from('brand_dna').update({ photo_urls: urls, updated_at: new Date().toISOString() }).eq('id', id);
    if (urls.length > 0) handleComplete(2);
    setSaving(false);
    setBrandDnaModal(null);
  };

  // --- Logos ---
  const openLogosModal = async () => {
    const id = await ensureBrandDna();
    if (!id) return;
    const { data } = await supabase.from('brand_dna').select('logos').eq('id', id).single();
    setLogos((data?.logos || []).map(l => ({ ...l, uploading: false })));
    setBrandDnaModal('logos');
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || logos.length >= 3) return;
    e.target.value = '';
    const tempId = Date.now();
    const localUrl = URL.createObjectURL(file);
    const isFirst = logos.length === 0;
    setLogos(prev => [...prev, { localUrl, uploading: true, name: 'Logo', isDefault: isFirst, _tempId: tempId }]);
    try {
      const result = await uploadBrandDnaFiles([file]);
      const uploaded = result.files.find(f => f.type !== 'error');
      if (!uploaded) throw new Error('Upload failed');
      setLogos(prev => prev.map(l => l._tempId === tempId ? { url: uploaded.url, name: l.name, isDefault: l.isDefault } : l));
      URL.revokeObjectURL(localUrl);
    } catch {
      setLogos(prev => prev.filter(l => l._tempId !== tempId));
      URL.revokeObjectURL(localUrl);
    }
  };

  const removeLogo = (index) => {
    setLogos(prev => {
      const logo = prev[index];
      if (logo?.localUrl) URL.revokeObjectURL(logo.localUrl);
      const updated = prev.filter((_, i) => i !== index);
      if (logo?.isDefault && updated.length > 0) updated[0] = { ...updated[0], isDefault: true };
      return updated;
    });
  };

  const setDefaultLogo = (index) => {
    setLogos(prev => prev.map((l, i) => ({ ...l, isDefault: i === index })));
  };

  const renameLogo = (index, name) => {
    setLogos(prev => prev.map((l, i) => i === index ? { ...l, name } : l));
  };

  const saveLogos = async () => {
    setSaving(true);
    const id = await ensureBrandDna();
    const cleanLogos = logos.filter(l => l.url).map(l => ({ url: l.url, name: l.name, isDefault: !!l.isDefault }));
    await supabase.from('brand_dna').update({
      logos: cleanLogos,
      logo_url: cleanLogos.find(l => l.isDefault)?.url || cleanLogos[0]?.url || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (cleanLogos.length > 0) handleComplete(3);
    setSaving(false);
    setBrandDnaModal(null);
  };

  // --- Brand Brain ---
  const openBrandBrainModal = async () => {
    const id = await ensureBrandDna();
    if (!id) return;
    const { data } = await supabase.from('brand_dna').select('documents').eq('id', id).single();
    setBrandBrainRawData(data?.documents?.brandBrain?.rawData || null);
    setBrandDnaModal('brand-brain');
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'brand-brain-ready') {
        if (brandBrainRawData && brandBrainIframeRef.current?.contentWindow) {
          brandBrainIframeRef.current.contentWindow.postMessage({ type: 'brand-brain-load', rawData: brandBrainRawData }, '*');
        }
      }
      if (e.data?.type === 'brand-brain-save') {
        (async () => {
          const id = await ensureBrandDna();
          const { data: current } = await supabase.from('brand_dna').select('documents').eq('id', id).single();
          const docs = current?.documents || {};
          docs.brandBrain = { name: 'Brand Brain', extractedText: e.data.extractedText, rawData: e.data.rawData };
          await supabase.from('brand_dna').update({ documents: docs, updated_at: new Date().toISOString() }).eq('id', id);
          handleComplete(4);
          setBrandDnaModal(null);
        })();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [brandBrainRawData, brandDnaId]);

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      {/* Only the onboarding card waits for getIntegrations — the Overview
          below renders as soon as stats arrive (audit finding 5). */}
      {dashLoading ? (
        <div className="skeleton-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 12 }} />
            <div className="skeleton" style={{ width: 80, height: 16 }} />
          </div>
          <div className="skeleton" style={{ height: 8, borderRadius: 6, marginBottom: 24 }} />
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="skeleton-row">
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
              <div className="skeleton skeleton-text" style={{ marginBottom: 0 }} />
            </div>
          ))}
        </div>
      ) : (
      <div className={`onboarding ${onboardingExpanded ? '' : 'onboarding--collapsed'}`}>
        <div className="onboarding-header" onClick={toggleOnboarding} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOnboarding(); } }}>
          <div className="onboarding-header-left">
            <span className="onboarding-badge">Onboarding</span>
            <span className="onboarding-progress-label">
              {completedCount}/{totalSteps} completed
            </span>
          </div>
          <button
            className="onboarding-toggle"
            onClick={(e) => { e.stopPropagation(); toggleOnboarding(); }}
            aria-label={onboardingExpanded ? 'Collapse onboarding' : 'Expand onboarding'}
          >
            {onboardingExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        {onboardingExpanded && (<>
        <div className="onboarding-progress-bar">
          <div className="onboarding-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

          <div className="onboarding-steps">
            {ONBOARDING_STEPS.map((step) => {
              const done = completedSteps.has(step.id);
              return (
                <div key={step.id} className={`onboarding-step ${done ? 'onboarding-step--done' : ''}`}>
                  <div className={`step-check ${done ? 'step-check--done' : ''}`}>
                    {done && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div className="step-content">
                    <span className={`step-label ${done ? 'step-label--done' : ''}`}>
                      {step.type === 'payment' ? (
                        <>Connect{' '}
                          <span className="notetaker-inline">
                            <div className="notetaker-select" onClick={(e) => e.stopPropagation()}>
                              <button className="notetaker-trigger" onClick={() => setPaymentDropdownOpen(!paymentDropdownOpen)}>
                                <img src={selectedPayment.logo} alt={selectedPayment.name} className="notetaker-logo-wide" />
                                <ChevronDown size={14} className={`notetaker-chevron ${paymentDropdownOpen ? 'notetaker-chevron--open' : ''}`} />
                              </button>
                              {paymentDropdownOpen && (
                                <div className="notetaker-dropdown">
                                  {PAYMENT_TRACKERS.map((pt) => (
                                    <button key={pt.id} className={`notetaker-option ${selectedPayment.id === pt.id ? 'notetaker-option--selected' : ''}`}
                                      onClick={() => { setSelectedPayment(pt); setPaymentDropdownOpen(false); }}>
                                      <img src={pt.logo} alt={pt.name} className="notetaker-logo-wide" />
                                      {selectedPayment.id === pt.id && <Check size={14} />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </span>
                          {' '}to track your payments and sales
                        </>
                      ) : step.type === 'gohighlevel' ? (
                        <>Connect{' '}
                          <img src="/gohighlevel-logo.png" alt="GoHighLevel" className="step-inline-logo step-inline-logo--ghl" />
                          {' '}to sync with your CRM
                        </>
                      ) : step.type === 'boosend' ? (
                        <>Connect{' '}
                          <img src="/boosend-logo.png" alt="BooSend" className="step-inline-logo step-inline-logo--boosend" />
                          {' '}to automate your DMs
                        </>
                      ) : (
                        step.label
                      )}
                    </span>
                    {!done && (
                      <div className="step-actions">
                        <button
                          className="step-btn step-btn--primary"
                          onClick={() => {
                            if (step.type === 'photos') openPhotosModal();
                            else if (step.type === 'logos') openLogosModal();
                            else if (step.type === 'brand-brain') openBrandBrainModal();
                            else if (step.type === 'payment') openPaymentModal();
                            else if (step.type === 'gohighlevel') openGhlModal();
                            else if (step.type === 'boosend') openBoosendModal();
                            else handleComplete(step.id);
                          }}
                        >
                          {['payment', 'gohighlevel', 'boosend'].includes(step.type) ? 'Connect'
                            : step.type === 'photos' ? 'Upload Photos'
                            : step.type === 'logos' ? 'Upload Logos'
                            : step.type === 'brand-brain' ? 'Build'
                            : <><span>Start</span><ExternalLink size={13} /></>}
                        </button>
                        <button className="step-btn step-btn--skip" onClick={() => handleSkip(step.id)}>Skip</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>)}
      </div>
      )}

      <div className="dashboard-stats-header">
        <h2 className="dashboard-stats-title">Overview</h2>
        <div className="dashboard-timeframe-wrap">
          <div className="dashboard-timeframe" role="tablist" aria-label="Timeframe">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'all', label: 'All' },
            ].map((tf) => (
              <button
                key={tf.id}
                role="tab"
                aria-selected={statsTimeframe === tf.id}
                className={`dashboard-timeframe-btn${statsTimeframe === tf.id ? ' dashboard-timeframe-btn--active' : ''}`}
                onClick={() => {
                  setStatsTimeframe(tf.id);
                  setCustomFrom(''); setCustomTo(''); setCustomApplied({ from: '', to: '' });
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <div className="dashboard-timeframe-custom">
            <label>
              <span>From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
            <button
              className="dashboard-timeframe-apply"
              disabled={!customFrom || !customTo}
              onClick={() => {
                setStatsTimeframe('custom');
                setCustomApplied({ from: customFrom, to: customTo });
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {overviewError ? (
        <div className="dash-error-banner" role="alert">
          <AlertTriangle size={18} />
          <div className="dash-error-text">
            <strong>Couldn&apos;t load stats.</strong>{' '}
            {overviewError === 403
              ? "You don't have dashboard access in this workspace."
              : 'Please try again in a moment.'}
          </div>
        </div>
      ) : (
      <>
      {/* A — Stat row */}
      <div className={`dashboard-stats dashboard-stats--grid${overviewLoading ? ' dashboard-stats--loading' : ''}`}>
        <div className="stat-card stat-card--clickable" role="button" tabIndex={0}
             onClick={goTo('/crm')} onKeyDown={cardKeyNav('/crm')}>
          <div className="stat-icon">
            <img src="/icon-crm.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtInt(overviewStats?.new_contacts)}</span>
            <span className="stat-label">New Contacts</span>
          </div>
        </div>
        <div className="stat-card stat-card--clickable" role="button" tabIndex={0}
             onClick={goTo('/sales')} onKeyDown={cardKeyNav('/sales')}>
          <div className="stat-icon stat-icon--success">
            <img src="/icon-sales.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtMoneyExact(overviewStats?.revenue_generated)}</span>
            <span className="stat-label">Revenue Generated</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--info">
            <img src="/icon-inbox.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtInt(overviewStats?.emails_sent)}</span>
            <span className="stat-label">Emails Sent</span>
            <span className="stat-sub">{fmtInt(overviewStats?.newsletters_sent)} newsletters</span>
          </div>
        </div>
        <div className="stat-card stat-card--clickable" role="button" tabIndex={0}
             onClick={goTo('/settings')} onKeyDown={cardKeyNav('/settings')}>
          <div className="stat-icon stat-icon--info">
            <img src="/icon-credits.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtInt(overviewStats?.credits_spent)}</span>
            <span className="stat-label">Credits Spent</span>
            <span className="stat-sub">This timeframe</span>
          </div>
        </div>
      </div>

      {/* B — Needs attention: silently-failed scheduled posts, surfaced at
          last. Dismissible (stays hidden until NEW failures appear — keyed
          by newest failed id in localStorage) and collapsible; founder
          2026-07-28: an un-removable red alert is hostile, not helpful. */}
      {failedPosts.length > 0 && attnDismissedKey !== String(failedPosts[0]?.id ?? failedPosts.length) && (
        <div className="dash-attn-card">
          <div className="dash-attn-head">
            <AlertTriangle size={16} />
            <span className="dash-attn-title">Needs attention</span>
            <span className="dash-attn-count">
              {failedPosts.length} failed {failedPosts.length === 1 ? 'post' : 'posts'}
            </span>
            <span className="dash-attn-actions">
              <button type="button" className="dash-attn-btn" onClick={() => setAttnCollapsed((v) => !v)} title={attnCollapsed ? 'Expand' : 'Collapse'}>
                {attnCollapsed ? '▸' : '▾'}
              </button>
              <button type="button" className="dash-attn-btn" onClick={dismissAttn} title="Dismiss until new failures appear">✕</button>
            </span>
          </div>
          {!attnCollapsed && (
          <ul className="dash-attn-list">
            {failedPosts.map((p, i) => (
              <li key={p.id ?? i} className="dash-attn-row">
                <span className="dash-attn-platform">{platformName(p.platform)}</span>
                <span className="dash-attn-type">{typeLabelOne(p.content_type)}</span>
                <span className="dash-attn-caption">{snippet(p.caption) || 'Untitled post'}</span>
                {p.error ? <span className="dash-attn-error">{snippet(p.error, 90)}</span> : null}
              </li>
            ))}
          </ul>
          )}
          {!attnCollapsed && (
          <button className="dash-card-link" onClick={goTo('/content-calendar')}>
            Open Content Calendar <ExternalLink size={13} />
          </button>
          )}
        </div>
      )}

      {/* C — Scheduled, next 7 days */}
      <div className="dash-upcoming-card">
        <div className="dash-upcoming-head">
          <CalendarClock size={16} />
          <span className="dash-upcoming-title">Scheduled — next 7 days</span>
        </div>
        {upcomingPosts.length === 0 ? (
          <div className="dash-upcoming-empty">Nothing scheduled — plan content in the calendar</div>
        ) : (
          <ul className="dash-upcoming-list">
            {upcomingPosts.map((p, i) => (
              <li key={p.id ?? i} className="dash-upcoming-row">
                {p.thumbnail_url ? (
                  <img className="dash-upcoming-thumb" src={p.thumbnail_url} alt="" />
                ) : (
                  <span className="dash-upcoming-thumb dash-upcoming-thumb--empty" aria-hidden="true" />
                )}
                <span className="dash-upcoming-platform">{platformName(p.platform)}</span>
                <span className="dash-upcoming-type">{typeLabelOne(p.content_type)}</span>
                <span className="dash-upcoming-caption">{snippet(p.caption) || 'Untitled post'}</span>
                <span className="dash-upcoming-when">{fmtWhen(p.scheduled_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="dash-card-link" onClick={goTo('/content-calendar')}>
          Open Content Calendar <ExternalLink size={13} />
        </button>
      </div>

      {/* D — Content by platform (generated vs published, per-type accordion) */}
      <div className="dash-plat-section">
        <div className="dash-plat-header">
          <h3 className="dash-plat-heading">Content by platform</h3>
          <span className="dash-plat-note">Tracking since Jul 28, 2026</span>
        </div>
        <div className="dash-plat-grid">
          {PLATFORM_META.map((p) => {
            const open = openPlatform === p.id;
            const rows = open ? platformTypeRows(p.id) : [];
            return (
              <div key={p.id} className={`dash-plat-card${open ? ' dash-plat-card--open' : ''}`}>
                <button
                  className="dash-plat-summary"
                  onClick={() => setOpenPlatform(open ? null : p.id)}
                  aria-expanded={open}
                >
                  <span className={`stat-platform-logo stat-platform-logo--tile ${p.logoClass}`}>
                    {p.icon ? <img src={p.icon} alt="" /> : <Facebook size={18} />}
                  </span>
                  <span className="dash-plat-name">{p.name}</span>
                  <span className="dash-plat-nums">
                    <span className="dash-plat-num">
                      <span className="dash-plat-num-value">{fmtInt(platformGenerated(p.id))}</span>
                      <span className="dash-plat-num-label">Generated</span>
                    </span>
                    <span className="dash-plat-num">
                      <span className="dash-plat-num-value">{fmtInt(platformPublished(p.id))}</span>
                      <span className="dash-plat-num-label">Published</span>
                    </span>
                  </span>
                  <span className="dash-plat-chevron">
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {open && (
                  <div className="dash-plat-detail">
                    {rows.length === 0 ? (
                      <div className="dash-plat-detail-empty">No content yet for {p.name}.</div>
                    ) : (
                      <div className="dash-plat-detail-table">
                        <div className="dash-plat-detail-row dash-plat-detail-row--head">
                          <span>Type</span><span>Generated</span><span>Published</span>
                        </div>
                        {rows.map((r) => (
                          <div key={r.key} className="dash-plat-detail-row">
                            <span>{r.label}</span>
                            <span>{fmtInt(r.generated)}</span>
                            <span>{fmtInt(r.published)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="dash-card-link dash-plat-create" onClick={goTo('/content')}>
                      Create for {p.name} <ExternalLink size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Charts (E revenue, F content mix) ── */}
      <div className="dashboard-charts">
        <div className="dashboard-chart-card dashboard-chart-card--primary">
          <div className="dashboard-chart-head">
            <div>
              <span className="dashboard-chart-label">Revenue</span>
              <span className="dashboard-chart-value">{fmtMoney(revenueTotal)}</span>
            </div>
            <span className="dashboard-chart-subtitle">
              {overviewStats?.granularity === 'hour' ? 'Hourly' : 'Daily'}
            </span>
          </div>
          <div className="dashboard-chart-body">
            {revenueChartData.length === 0 ? (
              <div className="dashboard-chart-empty">No revenue in this range yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e91a44" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#e91a44" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef0f3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#8a8f98', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: '#8a8f98', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v}`)}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ stroke: '#e91a44', strokeOpacity: 0.25, strokeWidth: 1 }}
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e6e8ec',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#8a8f98', fontWeight: 500 }}
                    formatter={(v) => [fmtMoney(v), 'Revenue']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#e91a44"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    activeDot={{ r: 4, fill: '#e91a44', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dashboard-chart-card">
          <div className="dashboard-chart-head">
            <div>
              <span className="dashboard-chart-label">Content Mix</span>
              <span className="dashboard-chart-value">{fmtInt(contentTotal)}</span>
            </div>
            <span className="dashboard-chart-subtitle">Published by platform</span>
          </div>
          <div className="dashboard-chart-body">
            {contentMixData.length === 0 ? (
              <div className="dashboard-chart-empty">Nothing published in this range yet.</div>
            ) : (
              <div className="dashboard-donut-wrap">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={contentMixData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {contentMixData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e6e8ec',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                        fontSize: 12,
                      }}
                      formatter={(v, name) => [fmtInt(v), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="dashboard-donut-legend">
                  {contentMixData.map((row) => (
                    <li key={row.id} className="dashboard-donut-legend-item">
                      <span className="dashboard-donut-swatch" style={{ background: row.color }} />
                      <span className="dashboard-donut-name">{row.name}</span>
                      <span className="dashboard-donut-count">{fmtInt(row.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Connection Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalOpen(false)}><X size={18} /></button>
            <div className="modal-logo">
              <img
                src={modalType === 'payment' ? selectedPayment.logo
                  : modalType === 'boosend' ? '/boosend-logo.png'
                  : modalType === 'gohighlevel' ? '/gohighlevel-logo.png'
                  : ''}
                alt={modalType === 'payment' ? selectedPayment.name
                  : modalType === 'boosend' ? 'BooSend'
                  : modalType === 'gohighlevel' ? 'GoHighLevel'
                  : ''}
              />
            </div>

            {modalType === 'payment' && selectedPayment.id === 'stripe' && (
              <>
                <p className="modal-description">Connect your Stripe account to automatically track your payments and sales in the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Stripe API key</label>
                  <input type="text" className="modal-input" placeholder="sk_live_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button className="modal-btn modal-btn--primary" disabled={!apiKey.trim() || connecting} onClick={handleConnect}>
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {modalType === 'payment' && selectedPayment.id === 'whop' && (
              <>
                <p className="modal-description">Connect your Whop account to automatically track your payments and sales in the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Whop API key</label>
                  <input type="text" className="modal-input" placeholder="Paste your API key here" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button className="modal-btn modal-btn--primary" disabled={!apiKey.trim() || connecting} onClick={handleConnect}>
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {modalType === 'gohighlevel' && (
              <>
                <p className="modal-description">
                  Connect GoHighLevel for automatic bi-directional CRM syncing. New contacts sync both ways between GoHighLevel and your CRM.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your GoHighLevel credentials</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to your GoHighLevel <strong>Settings &rarr; Business Profile</strong> and copy your <strong>Location ID</strong></li>
                      <li>Go to <strong>Settings &rarr; Integrations &rarr; Private Integrations</strong> and create an <strong>API token</strong></li>
                      <li>Paste both below</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Location ID</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. ve9EPM428h8vShlRW1KT"
                    value={ghlLocationId}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">API Token</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API token here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || !ghlLocationId.trim() || connecting}
                  onClick={handleGHLConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {modalType === 'boosend' && (
              <>
                <p className="modal-description">
                  Connect your BooSend account to automate DM outreach and follow-ups directly from the AI CEO.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your BooSend API key</summary>
                    <ol className="modal-connect-steps">
                      <li>Log in to your <strong>BooSend</strong> dashboard</li>
                      <li>Go to <strong>Settings</strong> &gt; <strong>API</strong></li>
                      <li>Copy your <strong>API key</strong> and paste it below</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">BooSend API Key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your BooSend API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
                <a
                  className="modal-signup-link"
                  href="https://boosend.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Don't have a BooSend account? Create one here
                  <ExternalLink size={13} />
                </a>
              </>
            )}

          </div>
        </div>
      )}

      {/* Photos Modal */}
      {brandDnaModal === 'photos' && (
        <div className="modal-overlay" onClick={() => setBrandDnaModal(null)}>
          <div className="modal modal--brand-dna" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBrandDnaModal(null)}><X size={18} /></button>
            <h3 className="modal-title">Upload Your Photos</h3>
            <p className="modal-description">Upload up to 20 photos of yourself for your brand identity.</p>

            <div
              className={`dash-upload-box ${photos.length > 0 ? 'dash-upload-box--has-items' : ''}`}
              onClick={() => photos.length < 20 && fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
              {photos.length > 0 ? (
                <div className="dash-photo-grid">
                  {photos.map((photo) => (
                    <div key={photo.id} className="dash-photo-item">
                      <img src={photo.url || photo.localUrl} alt="" />
                      {photo.uploading && (
                        <div className="dash-photo-uploading"><Loader size={18} className="settings-spinner" /></div>
                      )}
                      <button className="dash-photo-remove" onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}>
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  {photos.length < 20 && (
                    <div className="dash-photo-add"><Upload size={20} /></div>
                  )}
                </div>
              ) : (
                <>
                  <Upload size={32} />
                  <span>Click to upload photos</span>
                  <span className="dash-upload-hint">Up to 6 images</span>
                </>
              )}
            </div>

            <button
              className="modal-btn modal-btn--primary"
              disabled={photos.some(p => p.uploading) || saving}
              onClick={savePhotos}
            >
              {saving ? <><Loader size={14} className="settings-spinner" /> Saving...</> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Logos Modal */}
      {brandDnaModal === 'logos' && (
        <div className="modal-overlay" onClick={() => setBrandDnaModal(null)}>
          <div className="modal modal--brand-dna" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBrandDnaModal(null)}><X size={18} /></button>
            <h3 className="modal-title">Upload Your Logos</h3>
            <p className="modal-description">Add up to 3 logos and set your default.</p>

            <div className="dash-logos-list">
              {logos.map((lg, idx) => (
                <div key={idx} className="dash-logo-row">
                  <div className="dash-logo-thumb">
                    <img src={lg.url || lg.localUrl} alt={lg.name} />
                    {lg.uploading && <Loader size={12} className="settings-spinner" />}
                  </div>
                  {!lg.uploading ? (
                    <input className="dash-logo-name" value={lg.name} onChange={(e) => renameLogo(idx, e.target.value)} placeholder="Logo name" maxLength={24} />
                  ) : (
                    <span className="dash-logo-uploading">Uploading...</span>
                  )}
                  <div className="dash-logo-actions">
                    <button
                      className={`dash-logo-default${lg.isDefault ? ' dash-logo-default--active' : ''}`}
                      onClick={() => setDefaultLogo(idx)}
                    >Default</button>
                    {!lg.uploading && (
                      <button className="dash-logo-remove" onClick={() => removeLogo(idx)}><X size={12} /></button>
                    )}
                  </div>
                </div>
              ))}
              {logos.length < 3 && (
                <button className="dash-logo-add" onClick={() => logoInputRef.current?.click()}>
                  <Plus size={14} />
                  <span>{logos.length === 0 ? 'Upload logo' : 'Add logo'}</span>
                  <input ref={logoInputRef} type="file" accept="image/*,.svg" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </button>
              )}
            </div>

            <button
              className="modal-btn modal-btn--primary"
              disabled={logos.some(l => l.uploading) || saving}
              onClick={saveLogos}
            >
              {saving ? <><Loader size={14} className="settings-spinner" /> Saving...</> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Brand Brain Modal */}
      {brandDnaModal === 'brand-brain' && (
        <div className="settings-brand-brain-overlay" onClick={() => setBrandDnaModal(null)}>
          <div className="settings-brand-brain-modal" onClick={(e) => e.stopPropagation()}>
            <button className="settings-brand-brain-close" onClick={() => setBrandDnaModal(null)}>
              <X size={18} />
            </button>
            <iframe
              ref={brandBrainIframeRef}
              src="/brand-brain-workbook.html"
              className="settings-brand-brain-iframe"
              title="Brand Brain Workbook"
            />
          </div>
        </div>
      )}
    </div>
  );
}
