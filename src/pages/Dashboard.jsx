import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, ChevronUp, ExternalLink, X, Copy, Loader, Upload, Plus } from 'lucide-react';
import { connectIntegration, getIntegrations, getEmailAccounts, uploadBrandDnaFiles, getDashboardStats } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Pages.css';
import './Dashboard.css';

const PAYMENT_TRACKERS = [
  { id: 'stripe', name: 'Stripe', logo: '/stripe-logo.png' },
  { id: 'whop', name: 'Whop', logo: '/whop-logo.svg' },
];

const NOTE_TAKERS = [
  { id: 'fireflies', name: "Fireflies AI", logo: '/fireflies-logo.png' },
  { id: 'fathom', name: 'Fathom', logo: '/fathom-logo.png' },
];

const ONBOARDING_STEPS = [
  { id: 1, label: 'Sign up for PuerlyPersonal', completed: true },
  { id: 2, label: 'Upload your photos', type: 'photos' },
  { id: 3, label: 'Upload your logos', type: 'logos' },
  { id: 4, label: 'Build your Brand Brain', type: 'brand-brain' },
  { id: 5, label: 'Connect to track your payments and sales', type: 'payment' },
  { id: 6, label: 'Connect your AI notetaker to record your calls', type: 'notetaker' },
  { id: 7, label: 'Connect GoHighLevel to sync with your CRM', type: 'gohighlevel' },
  { id: 8, label: 'Connect BooSend to automate your DMs', type: 'boosend' },
  { id: 9, label: 'Connect your social media profiles to automate content posting', type: 'action' },
];

export default function Dashboard() {
  const [dashLoading, setDashLoading] = useState(true);
  const [onboardingExpanded, setOnboardingExpanded] = useState(true);
  const autoCollapsedRef = useRef(false);
  const [completedSteps, setCompletedSteps] = useState(new Set([1]));
  const [connectedIntegrations, setConnectedIntegrations] = useState({});
  const [selectedNoteTaker, setSelectedNoteTaker] = useState(NOTE_TAKERS[0]);
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_TRACKERS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [firefliesStep, setFirefliesStep] = useState(1);
  const [copiedField, setCopiedField] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [firefliesWebhook, setFirefliesWebhook] = useState({ url: '', secret: '' });

  // Brand DNA modal state
  const [brandDnaModal, setBrandDnaModal] = useState(null); // 'photos' | 'logos' | 'brand-brain'
  const [photos, setPhotos] = useState([]);
  const [logos, setLogos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [brandDnaId, setBrandDnaId] = useState(null);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const brandBrainIframeRef = useRef(null);
  const [brandBrainSaved, setBrandBrainSaved] = useState(false);
  const [brandBrainRawData, setBrandBrainRawData] = useState(null);

  // Dashboard stats (populated from /api/dashboard-stats)
  const [statsTimeframe, setStatsTimeframe] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customApplied, setCustomApplied] = useState({ from: '', to: '' });
  const [overviewStats, setOverviewStats] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    // Don't fetch if user picked Custom but hasn't applied a range yet.
    if (statsTimeframe === 'custom' && !customApplied.from && !customApplied.to) return;
    let cancelled = false;
    setOverviewLoading(true);
    const opts = statsTimeframe === 'custom'
      ? { from: customApplied.from || undefined, to: customApplied.to || undefined }
      : {};
    getDashboardStats(statsTimeframe, opts)
      .then((data) => { if (!cancelled && data) setOverviewStats(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [statsTimeframe, customApplied]);

  const applyCustomRange = () => {
    if (!customFrom && !customTo) return;
    setCustomApplied({ from: customFrom, to: customTo });
  };

  const fmtInt = (n) => (Number(n) || 0).toLocaleString('en-US');
  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;
  };
  const platformCreated = (p) => overviewStats?.content_created?.[p] ?? 0;
  const platformPublished = (p) => overviewStats?.content_published?.[p] ?? 0;

  const [ghlLocationId, setGhlLocationId] = useState('');

  // Load onboarding state + integration status on mount
  useEffect(() => {
    async function load() {
      const steps = new Set([1]); // signup always done

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: onboarding } = await supabase
          .from('onboarding')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (onboarding) {
          setOnboardingExpanded(onboarding.is_visible !== false);
          for (const s of (onboarding.completed_steps || [])) {
            if (s === 'signup') steps.add(1);
            if (s === 'photos') steps.add(2);
            if (s === 'logos') steps.add(3);
            if (s === 'brand-brain') steps.add(4);
            if (s === 'payment') steps.add(5);
            if (s === 'notetaker') steps.add(6);
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

      const [intResult] = await Promise.all([
        getIntegrations(),
        getEmailAccounts(),
      ]);

      const intMap = {};
      for (const int of (intResult.integrations || [])) {
        intMap[int.provider] = int;
      }
      setConnectedIntegrations(intMap);

      if (intMap.stripe?.is_active || intMap.whop?.is_active) steps.add(5);
      if (intMap.fireflies?.is_active || intMap.fathom?.is_active) steps.add(6);
      if (intMap.boosend?.is_active) steps.add(8);

      setCompletedSteps(steps);
      setDashLoading(false);
    }
    load();
  }, []);

  const totalSteps = ONBOARDING_STEPS.length;
  const completedCount = completedSteps.size;
  const progressPercent = (completedCount / totalSteps) * 100;

  const persistOnboardingVisibility = (visible) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      supabase.from('onboarding').upsert({
        user_id: session.user.id,
        is_visible: visible,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    });
  };

  const toggleOnboarding = () => {
    setOnboardingExpanded((prev) => {
      const next = !prev;
      persistOnboardingVisibility(next);
      return next;
    });
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
      persistOnboardingVisibility(false);
    }
    prevCompletedRef.current = completedCount;
  }, [completedCount, totalSteps, onboardingExpanded]);

  const handleComplete = (stepId) => {
    setCompletedSteps((prev) => {
      const next = new Set([...prev, stepId]);
      const stepMap = { 1: 'signup', 2: 'photos', 3: 'logos', 4: 'brand-brain', 5: 'payment', 6: 'notetaker', 7: 'gohighlevel', 8: 'boosend', 9: 'social' };
      const stepsArr = [...next].map(id => stepMap[id]).filter(Boolean);
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('onboarding').upsert({
            user_id: session.user.id,
            completed_steps: stepsArr,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        }
      });
      return next;
    });
  };

  const handleSkip = (stepId) => handleComplete(stepId);

  // --- Integration modals ---
  const openNotetakerModal = () => {
    setApiKey(''); setFirefliesStep(1); setCopiedField(null); setConnectError(null); setConnecting(false);
    setFirefliesWebhook({ url: '', secret: '' }); setModalType('notetaker'); setModalOpen(true);
  };

  const openPaymentModal = () => {
    setApiKey(''); setCopiedField(null); setConnectError(null); setConnecting(false);
    setModalType('payment'); setModalOpen(true);
  };

  const openBoosendModal = () => {
    setApiKey(''); setCopiedField(null); setConnectError(null); setConnecting(false);
    setModalType('boosend'); setModalOpen(true);
  };

  const openGhlModal = () => {
    setApiKey(''); setGhlLocationId(''); setCopiedField(null); setConnectError(null); setConnecting(false);
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

  const handleFirefliesNext = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true); setConnectError(null);
    try {
      const result = await connectIntegration('fireflies', apiKey);
      setFirefliesWebhook({ url: result.integration.webhook_url || '', secret: result.integration.webhook_secret || '' });
      setFirefliesStep(2);
    } catch (err) { setConnectError(err.message); }
    finally { setConnecting(false); }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true); setConnectError(null);
    try {
      const provider = modalType === 'payment' ? selectedPayment.id
        : modalType === 'boosend' ? 'boosend'
        : selectedNoteTaker.id;
      await connectIntegration(provider, apiKey);
      setModalOpen(false);
      if (modalType === 'payment') handleComplete(5);
      else if (modalType === 'boosend') handleComplete(8);
      else handleComplete(6);
      setApiKey(''); setFirefliesStep(1); setModalType(null);
    } catch (err) { setConnectError(err.message); }
    finally { setConnecting(false); }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
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
    const remaining = 6 - photos.length;
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
    setBrandBrainSaved(!!data?.documents?.brandBrain);
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

  if (dashLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Dashboard</h1>
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
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

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
                      ) : step.type === 'notetaker' ? (
                        <>Connect{' '}
                          <span className="notetaker-inline">
                            <div className="notetaker-select" onClick={(e) => e.stopPropagation()}>
                              <button className="notetaker-trigger" onClick={() => setDropdownOpen(!dropdownOpen)}>
                                <img src={selectedNoteTaker.logo} alt={selectedNoteTaker.name} className="notetaker-logo-wide" />
                                <ChevronDown size={14} className={`notetaker-chevron ${dropdownOpen ? 'notetaker-chevron--open' : ''}`} />
                              </button>
                              {dropdownOpen && (
                                <div className="notetaker-dropdown">
                                  {NOTE_TAKERS.map((nt) => (
                                    <button key={nt.id} className={`notetaker-option ${selectedNoteTaker.id === nt.id ? 'notetaker-option--selected' : ''}`}
                                      onClick={() => { setSelectedNoteTaker(nt); setDropdownOpen(false); }}>
                                      <img src={nt.logo} alt={nt.name} className="notetaker-logo-wide" />
                                      {selectedNoteTaker.id === nt.id && <Check size={14} />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </span>
                          {' '}to record your calls
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
                            else if (step.type === 'notetaker') openNotetakerModal();
                            else if (step.type === 'gohighlevel') openGhlModal();
                            else if (step.type === 'boosend') openBoosendModal();
                            else handleComplete(step.id);
                          }}
                        >
                          {['payment', 'notetaker', 'gohighlevel', 'boosend'].includes(step.type) ? 'Connect'
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

      <div className="dashboard-stats-header">
        <h2 className="dashboard-stats-title">Overview</h2>
        <div className="dashboard-timeframe-wrap">
          <div className="dashboard-timeframe" role="tablist" aria-label="Timeframe">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom' },
            ].map((tf) => (
              <button
                key={tf.id}
                role="tab"
                aria-selected={statsTimeframe === tf.id}
                className={`dashboard-timeframe-btn${statsTimeframe === tf.id ? ' dashboard-timeframe-btn--active' : ''}`}
                onClick={() => setStatsTimeframe(tf.id)}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {statsTimeframe === 'custom' && (
            <form
              className="dashboard-timeframe-custom"
              onSubmit={(e) => { e.preventDefault(); applyCustomRange(); }}
            >
              <label>
                <span>From</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} max={customTo || undefined} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom || undefined} />
              </label>
              <button type="submit" className="dashboard-timeframe-apply" disabled={!customFrom && !customTo}>Apply</button>
            </form>
          )}
        </div>
      </div>

      <div className={`dashboard-stats dashboard-stats--grid${overviewLoading ? ' dashboard-stats--loading' : ''}`}>
        <div className="stat-card">
          <div className="stat-icon">
            <img src="/icon-crm.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtInt(overviewStats?.new_contacts)}</span>
            <span className="stat-label">New Contacts</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--success">
            <img src="/icon-sales.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtMoney(overviewStats?.revenue_generated)}</span>
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
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon--info">
            <img src="/icon-marketing.png" alt="" className="stat-icon-img" />
          </div>
          <div className="stat-info">
            <span className="stat-value">{fmtInt(overviewStats?.newsletters_sent)}</span>
            <span className="stat-label">Newsletters Sent</span>
          </div>
        </div>
        <div className="stat-card stat-card--wide">
          <div className="stat-info stat-info--full">
            <span className="stat-label stat-label--section">Content Created</span>
            <div className="stat-platforms">
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--ig">
                  <img src="/instagram-icon.svg" alt="Instagram" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformCreated('instagram'))}</span>
                  <span className="stat-platform-name">Instagram</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--tt">
                  <img src="/tiktok-icon.svg" alt="TikTok" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformCreated('tiktok'))}</span>
                  <span className="stat-platform-name">TikTok</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--yt">
                  <img src="/youtube-icon.svg" alt="YouTube" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformCreated('youtube'))}</span>
                  <span className="stat-platform-name">YouTube</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--li">
                  <img src="/linkedin-icon.svg" alt="LinkedIn" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformCreated('linkedin'))}</span>
                  <span className="stat-platform-name">LinkedIn</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--x">
                  <img src="/x-icon.svg" alt="X" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformCreated('x'))}</span>
                  <span className="stat-platform-name">X</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="stat-card stat-card--wide">
          <div className="stat-info stat-info--full">
            <span className="stat-label stat-label--section">Content Published</span>
            <div className="stat-platforms">
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--ig">
                  <img src="/instagram-icon.svg" alt="Instagram" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformPublished('instagram'))}</span>
                  <span className="stat-platform-name">Instagram</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--tt">
                  <img src="/tiktok-icon.svg" alt="TikTok" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformPublished('tiktok'))}</span>
                  <span className="stat-platform-name">TikTok</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--yt">
                  <img src="/youtube-icon.svg" alt="YouTube" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformPublished('youtube'))}</span>
                  <span className="stat-platform-name">YouTube</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--li">
                  <img src="/linkedin-icon.svg" alt="LinkedIn" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformPublished('linkedin'))}</span>
                  <span className="stat-platform-name">LinkedIn</span>
                </div>
              </div>
              <div className="stat-platform">
                <div className="stat-platform-logo stat-platform-logo--tile stat-platform-logo--x">
                  <img src="/x-icon.svg" alt="X" />
                </div>
                <div className="stat-platform-meta">
                  <span className="stat-platform-value">{fmtInt(platformPublished('x'))}</span>
                  <span className="stat-platform-name">X</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                  : selectedNoteTaker.logo}
                alt={modalType === 'payment' ? selectedPayment.name
                  : modalType === 'boosend' ? 'BooSend'
                  : modalType === 'gohighlevel' ? 'GoHighLevel'
                  : selectedNoteTaker.name}
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

            {modalType === 'notetaker' && selectedNoteTaker.id === 'fathom' && (
              <>
                <p className="modal-description">Connect your Fathom AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fathom API key</label>
                  <input type="text" className="modal-input" placeholder="Paste your API key here" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button className="modal-btn modal-btn--primary" disabled={!apiKey.trim() || connecting} onClick={handleConnect}>
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {modalType === 'notetaker' && selectedNoteTaker.id === 'fireflies' && firefliesStep === 1 && (
              <>
                <p className="modal-description">Connect your Fireflies AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.</p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fireflies API key</label>
                  <input type="text" className="modal-input" placeholder="Paste your API key here" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button className="modal-btn modal-btn--primary" disabled={!apiKey.trim() || connecting} onClick={handleFirefliesNext}>
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Next'}
                </button>
              </>
            )}

            {modalType === 'notetaker' && selectedNoteTaker.id === 'fireflies' && firefliesStep === 2 && (
              <>
                <p className="modal-instruction">Copy this into your Fireflies AI settings</p>
                <div className="modal-field">
                  <label className="modal-label">Webhook URL</label>
                  <div className="modal-copy-row">
                    <input type="text" className="modal-input modal-input--readonly" value={firefliesWebhook.url} readOnly />
                    <button className="modal-copy-btn" onClick={() => copyToClipboard(firefliesWebhook.url, 'url')}>
                      {copiedField === 'url' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Webhook Secret</label>
                  <div className="modal-copy-row">
                    <input type="text" className="modal-input modal-input--readonly" value={firefliesWebhook.secret} readOnly />
                    <button className="modal-copy-btn" onClick={() => copyToClipboard(firefliesWebhook.secret, 'secret')}>
                      {copiedField === 'secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button className="modal-btn modal-btn--primary" onClick={() => { handleComplete(6); setModalOpen(false); }}>Done</button>
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
            <p className="modal-description">Upload up to 6 photos of yourself for your brand identity.</p>

            <div
              className={`dash-upload-box ${photos.length > 0 ? 'dash-upload-box--has-items' : ''}`}
              onClick={() => photos.length < 6 && fileInputRef.current?.click()}
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
                  {photos.length < 6 && (
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
