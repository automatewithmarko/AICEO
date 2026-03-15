import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { Mail, Lock, CreditCard, Zap, Check, X, Copy, Upload, Trash2, ChevronRight, FileText, Loader } from 'lucide-react';
import ColorWheelPicker from '../components/ColorWheelPicker';
import FontSelector from '../components/FontSelector';
import { uploadBrandDnaFiles, uploadContextFiles, getIntegrations, connectIntegration, disconnectIntegration, getEmailAccounts, addEmailAccount, deleteEmailAccount } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Pages.css';
import './Settings.css';

const NOTE_TAKERS = [
  { id: 'fireflies', name: 'Fireflies AI', logo: '/fireflies-logo.png' },
  { id: 'fathom', name: 'Fathom', logo: '/fathom-logo.png' },
  { id: 'stripe', name: 'Stripe', logo: '/stripe-logo.png' },
  { id: 'whop', name: 'Whop', logo: '/whop-logo.svg' },
  { id: 'shopify', name: 'Shopify', logo: '/shopify-logo.png' },
  { id: 'kajabi', name: 'Kajabi', logo: '/icon-kajabi-text.png', small: true },
  { id: 'gohighlevel', name: 'GoHighLevel', logo: '/gohighlevel-logo.png' },
  { id: 'netlify', name: 'Netlify', logo: '/icon-netlify.png' },
  { id: 'email', name: 'Email (SMTP/IMAP)', logo: '/smtp-logo.png', large: true },
];

const DOC_TYPES = [
  { id: 'icp', label: 'ICP Document', desc: 'Your Ideal Customer Profile' },
  { id: 'businessInABox', label: 'Business in a Box', desc: 'Your business overview document' },
  { id: 'messagingHouse', label: 'Messaging House', desc: 'Your messaging framework' },
  { id: 'ruleOfOne', label: 'Rule of One', desc: 'Your Rule of One document' },
  { id: 'personalAuthority', label: 'Personal Authority', desc: 'Your personal authority document' },
  { id: 'businessAuthority', label: 'Business Authority', desc: 'Your business authority document' },
];

export default function Settings() {
  const { user, credits } = useAuth();
  const [passwordReset, setPasswordReset] = useState(false);
  const [integrations, setIntegrations] = useState({});
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [firefliesStep, setFirefliesStep] = useState(1);
  const [ghlStep, setGhlStep] = useState(1);
  const [copiedField, setCopiedField] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [firefliesWebhook, setFirefliesWebhook] = useState({ url: '', secret: '' });
  const [ghlWebhook, setGhlWebhook] = useState({ url: '', secret: '' });
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');
  const [shopifyStep, setShopifyStep] = useState(1);
  const [shopifyWebhook, setShopifyWebhook] = useState({ url: '', secret: '' });
  const [kajabiStep, setKajabiStep] = useState(1);
  const [kajabiWebhook, setKajabiWebhook] = useState({ url: '', secret: '' });
  const [emailForm, setEmailForm] = useState({ email: '', senderName: '', username: '', password: '', imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587' });

  // Auto-detect email provider settings from email address
  const EMAIL_PRESETS = {
    'gmail.com': { imapHost: 'imap.gmail.com', imapPort: '993', smtpHost: 'smtp.gmail.com', smtpPort: '587', label: 'Gmail' },
    'googlemail.com': { imapHost: 'imap.gmail.com', imapPort: '993', smtpHost: 'smtp.gmail.com', smtpPort: '587', label: 'Gmail' },
    'outlook.com': { imapHost: 'outlook.office365.com', imapPort: '993', smtpHost: 'smtp-mail.outlook.com', smtpPort: '587', label: 'Outlook' },
    'hotmail.com': { imapHost: 'outlook.office365.com', imapPort: '993', smtpHost: 'smtp-mail.outlook.com', smtpPort: '587', label: 'Outlook' },
    'live.com': { imapHost: 'outlook.office365.com', imapPort: '993', smtpHost: 'smtp-mail.outlook.com', smtpPort: '587', label: 'Outlook' },
    'yahoo.com': { imapHost: 'imap.mail.yahoo.com', imapPort: '993', smtpHost: 'smtp.mail.yahoo.com', smtpPort: '587', label: 'Yahoo' },
    'icloud.com': { imapHost: 'imap.mail.me.com', imapPort: '993', smtpHost: 'smtp.mail.me.com', smtpPort: '587', label: 'iCloud' },
    'zoho.com': { imapHost: 'imap.zoho.com', imapPort: '993', smtpHost: 'smtp.zoho.com', smtpPort: '587', label: 'Zoho' },
  };
  const handleEmailChange = (email) => {
    const domain = (email.split('@')[1] || '').toLowerCase();
    const preset = EMAIL_PRESETS[domain];
    if (preset) {
      setEmailForm(f => ({ ...f, email, username: email, imapHost: preset.imapHost, imapPort: preset.imapPort, smtpHost: preset.smtpHost, smtpPort: preset.smtpPort }));
    } else {
      setEmailForm(f => ({ ...f, email, username: email }));
    }
  };

  // Brand DNA
  const [brandDnaCreated, setBrandDnaCreated] = useState(false);
  const [brandDnaLoading, setBrandDnaLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState({});
  const [brandColors, setBrandColors] = useState({ primary: '', text: '', secondary: '' });
  const [mainFont, setMainFont] = useState('');
  const [secondaryFont, setSecondaryFont] = useState('');
  const [logo, setLogo] = useState(null);
  const [brandDnaPulse, setBrandDnaPulse] = useState(false);
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const docInputRefs = useRef({});
  const brandDnaRef = useRef(null);
  const initialLoadDone = useRef(false);
  const saveTimer = useRef(null);
  const location = useLocation();

  // Scroll to Brand DNA when navigated from Content page
  useEffect(() => {
    if (location.state?.scrollTo === 'brand-dna') {
      setTimeout(() => {
        brandDnaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setBrandDnaPulse(true);
        setTimeout(() => setBrandDnaPulse(false), 3000);
      }, 200);
    }
  }, [location.state]);

  // Load Brand DNA from DB
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setBrandDnaLoading(false); return; }
      const { data } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      if (data) {
        setBrandDnaCreated(true);
        if (data.photo_urls?.length) {
          setPhotos(data.photo_urls.map((url, i) => ({ id: `db-photo-${i}`, url })));
        }
        if (data.logo_url) setLogo({ url: data.logo_url });
        if (data.colors && Object.keys(data.colors).length) {
          setBrandColors(prev => ({ ...prev, ...data.colors }));
        }
        if (data.main_font) setMainFont(data.main_font);
        if (data.secondary_font) setSecondaryFont(data.secondary_font);
        if (data.documents && Object.keys(data.documents).length) {
          const docs = {};
          for (const [key, val] of Object.entries(data.documents)) {
            docs[key] = { name: val.name, url: val.url, extractedText: val.extracted_text };
          }
          setDocuments(docs);
        }
      }
      setBrandDnaLoading(false);
      setTimeout(() => { initialLoadDone.current = true; }, 500);
    });
  }, []);

  // Load integrations from DB
  useEffect(() => {
    async function load() {
      try {
        const [intResult, emailResult] = await Promise.all([
          getIntegrations(),
          getEmailAccounts(),
        ]);
        const map = {};
        for (const int of (intResult.integrations || [])) {
          map[int.provider] = int;
        }
        if (emailResult.accounts?.length > 0) {
          map.email = { is_active: true, provider: 'email' };
        }
        setIntegrations(map);
      } catch {
        // Silently fail
      } finally {
        setIntegrationsLoading(false);
      }
    }
    load();
  }, []);

  // Auto-save Brand DNA to DB when state changes
  useEffect(() => {
    if (!initialLoadDone.current || !brandDnaCreated) return;
    if (photos.some(p => p.uploading)) return;
    if (logo?.uploading) return;
    if (Object.values(documents).some(d => d?.uploading)) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('brand_dna').update({
        photo_urls: photos.map(p => p.url).filter(Boolean),
        logo_url: logo?.url || null,
        colors: brandColors,
        main_font: mainFont || null,
        secondary_font: secondaryFont || null,
        documents: Object.fromEntries(
          Object.entries(documents)
            .filter(([, v]) => v && v.url)
            .map(([k, v]) => [k, { name: v.name, url: v.url, extracted_text: v.extractedText || '' }])
        ),
        updated_at: new Date().toISOString(),
      }).eq('user_id', session.user.id);
    }, 1000);
    return () => clearTimeout(saveTimer.current);
  }, [brandDnaCreated, photos, logo, documents, brandColors, mainFont, secondaryFont]);

  const handleResetPassword = () => {
    setPasswordReset(true);
    setTimeout(() => setPasswordReset(false), 3000);
  };

  const openModal = (id) => {
    setApiKey('');
    setFirefliesStep(1);
    setGhlStep(1);
    setShopifyStep(1);
    setKajabiStep(1);
    setShopifyStoreUrl('');
    setCopiedField(null);
    setConnectError(null);
    setConnecting(false);
    setFirefliesWebhook({ url: '', secret: '' });
    setShopifyWebhook({ url: '', secret: '' });
    setKajabiWebhook({ url: '', secret: '' });
    setEmailForm({ email: '', senderName: '', username: '', password: '' });
    setModalOpen(id);
  };

  const handleConnect = async () => {
    if (!modalOpen || !apiKey.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration(modalOpen, apiKey);
      setIntegrations((prev) => ({ ...prev, [modalOpen]: result.integration }));
      setModalOpen(null);
      setApiKey('');
      setFirefliesStep(1);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id) => {
    try {
      if (id === 'email') {
        // Email uses separate email-accounts API
        const { accounts } = await getEmailAccounts();
        if (accounts?.length) {
          await Promise.all(accounts.map((a) => deleteEmailAccount(a.id)));
        }
      } else {
        await disconnectIntegration(id);
      }
      setIntegrations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      // Silently fail
    }
  };

  const handleFirefliesNext = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration('fireflies', apiKey);
      setIntegrations((prev) => ({ ...prev, fireflies: result.integration }));
      setFirefliesWebhook({
        url: result.integration.webhook_url || '',
        secret: result.integration.webhook_secret || '',
      });
      setFirefliesStep(2);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleGHLNext = async () => {
    if (!apiKey.trim() || !ghlLocationId.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration('gohighlevel', apiKey, { location_id: ghlLocationId.trim() });
      setIntegrations((prev) => ({ ...prev, gohighlevel: result.integration }));
      setModalOpen(null);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleShopifyNext = async () => {
    if (!apiKey.trim() || !shopifyStoreUrl.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration('shopify', apiKey, { store_url: shopifyStoreUrl });
      setIntegrations((prev) => ({ ...prev, shopify: result.integration }));
      setShopifyWebhook({
        url: result.integration.webhook_url || '',
        secret: result.integration.webhook_secret || '',
      });
      setShopifyStep(2);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleKajabiNext = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await connectIntegration('kajabi', apiKey);
      setIntegrations((prev) => ({ ...prev, kajabi: result.integration }));
      setKajabiWebhook({
        url: result.integration.webhook_url || '',
        secret: result.integration.webhook_secret || '',
      });
      setKajabiStep(2);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleEmailConnect = async () => {
    const { email, senderName, username, password, imapHost, imapPort, smtpHost, smtpPort } = emailForm;
    if (!email || !username || !password || !imapHost || !smtpHost) return;
    setConnecting(true);
    setConnectError(null);
    try {
      await addEmailAccount({
        email,
        display_name: senderName,
        username,
        password,
        imap_host: imapHost,
        imap_port: parseInt(imapPort) || 993,
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort) || 587,
      });
      setIntegrations((prev) => ({ ...prev, email: { is_active: true, provider: 'email' } }));
      setModalOpen(null);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    const remaining = 6 - photos.length;
    const toAdd = files.slice(0, remaining);
    if (!toAdd.length) return;
    e.target.value = '';

    const placeholders = toAdd.map((file, i) => ({
      id: `photo-${Date.now()}-${i}`,
      localUrl: URL.createObjectURL(file),
      uploading: true,
    }));
    setPhotos(prev => [...prev, ...placeholders]);

    try {
      const result = await uploadBrandDnaFiles(toAdd);
      const uploadedUrls = result.files.filter(f => f.type !== 'error').map(f => f.url);
      setPhotos(prev => prev.map(p => {
        if (!p.uploading) return p;
        const idx = placeholders.findIndex(ph => ph.id === p.id);
        if (idx === -1 || !uploadedUrls[idx]) return p;
        // Keep localUrl as fallback, add remote url, mark done
        return { ...p, url: uploadedUrls[idx], uploading: false };
      }));
    } catch {
      setPhotos(prev => prev.filter(p => !p.uploading));
    }
  };

  const removePhoto = (id) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo?.localUrl) URL.revokeObjectURL(photo.localUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (logo?.localUrl) URL.revokeObjectURL(logo.localUrl);
    setLogo({ localUrl: URL.createObjectURL(file), uploading: true });

    try {
      const result = await uploadBrandDnaFiles([file]);
      const uploaded = result.files.find(f => f.type !== 'error');
      if (!uploaded) throw new Error('Upload failed');
      setLogo({ url: uploaded.url });
    } catch {
      setLogo(null);
    }
  };

  const removeLogo = () => {
    if (logo?.localUrl) URL.revokeObjectURL(logo.localUrl);
    setLogo(null);
  };

  const handleDocUpload = async (docId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setDocuments(prev => ({ ...prev, [docId]: { name: file.name, uploading: true } }));

    try {
      const result = await uploadContextFiles([file]);
      const uploaded = result.files[0];
      if (uploaded.type === 'error') throw new Error(uploaded.error);
      setDocuments(prev => ({
        ...prev,
        [docId]: { name: file.name, url: uploaded.url, extractedText: uploaded.extractedText || '' },
      }));
    } catch {
      setDocuments(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    }
  };

  const removeDoc = (docId) => {
    setDocuments((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const handleCreateBrandDna = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from('brand_dna').upsert({
      user_id: session.user.id,
      photo_urls: [],
      video_urls: [],
      documents: {},
      colors: {},
    }, { onConflict: 'user_id' });
    setBrandDnaCreated(true);
    initialLoadDone.current = true;
  };

  const currentModal = modalOpen ? NOTE_TAKERS.find((n) => n.id === modalOpen) : null;

  return (
    <div className="page-container">
      <h1 className="page-title">Settings</h1>

      {/* Account Section */}
      <div className="settings-section">
        <h2 className="settings-section-title">Account</h2>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-icon">
              <Mail size={18} />
            </div>
            <div className="settings-row-content">
              <span className="settings-row-label">Email</span>
              <span className="settings-row-value">{user?.email}</span>
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <div className="settings-row-icon">
              <Lock size={18} />
            </div>
            <div className="settings-row-content">
              <span className="settings-row-label">Password</span>
              <span className="settings-row-value">••••••••</span>
            </div>
            <button
              className={`settings-btn ${passwordReset ? 'settings-btn--success' : ''}`}
              onClick={handleResetPassword}
              disabled={passwordReset}
            >
              {passwordReset ? (
                <><Check size={14} /> Email Sent</>
              ) : (
                'Reset Password'
              )}
            </button>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <div className="settings-row-icon">
              <CreditCard size={18} />
            </div>
            <div className="settings-row-content">
              <span className="settings-row-label">Subscription</span>
              <div className="settings-row-value">
                <span className="settings-plan-badge">{user?.plan} Plan</span>
                <span className="settings-status-badge">Active</span>
              </div>
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <div className="settings-row-icon">
              <Zap size={18} />
            </div>
            <div className="settings-row-content">
              <span className="settings-row-label">Credits</span>
              <span className="settings-row-value">{credits.toLocaleString()} remaining</span>
            </div>
            <button className="settings-btn settings-btn--primary">
              Buy More Credits
            </button>
          </div>
        </div>
      </div>

      {/* Integrations Section */}
      <div className="settings-section">
        <h2 className="settings-section-title">Integrations</h2>
        {integrationsLoading ? (
          <div className="settings-integrations">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="settings-integration-card">
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10 }} />
                <div className="settings-integration-info">
                  <div className="skeleton" style={{ width: 100, height: 14, marginBottom: 6 }} />
                  <div className="skeleton" style={{ width: 70, height: 12 }} />
                </div>
                <div className="skeleton" style={{ width: 80, height: 34, borderRadius: 8 }} />
              </div>
            ))}
          </div>
        ) : (
        <div className="settings-integrations">
          {NOTE_TAKERS.map((nt) => (
            <div key={nt.id} className="settings-integration-card">
              <img src={nt.logo} alt={nt.name} className={`settings-integration-logo ${nt.large ? 'settings-integration-logo--lg' : ''} ${nt.small ? 'settings-integration-logo--sm' : ''}`} />
              <div className="settings-integration-info">
                <span className="settings-integration-name">{nt.name}</span>
                <span className={`settings-integration-status ${integrations[nt.id]?.is_active ? 'settings-integration-status--connected' : ''}`}>
                  {integrations[nt.id]?.is_active ? 'Connected' : 'Not connected'}
                </span>
              </div>
              {integrations[nt.id]?.is_active ? (
                <button
                  className="settings-btn settings-btn--danger"
                  onClick={() => handleDisconnect(nt.id)}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className="settings-btn settings-btn--primary"
                  onClick={() => openModal(nt.id)}
                >
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Brand DNA Section */}
      <div className="settings-section" ref={brandDnaRef}>
        <h2 className="settings-section-title">Brand DNA</h2>
        {!brandDnaCreated ? (
          <div className="settings-card settings-brand-dna-card">
            <p className="settings-brand-dna-desc">
              Create your Brand DNA to help the AI CEO understand your personal brand, voice, and visual identity.
            </p>
            <button className={`settings-btn settings-btn--primary settings-btn--lg ${brandDnaPulse ? 'settings-btn--pulse' : ''}`} onClick={handleCreateBrandDna}>
              Create Brand DNA
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="settings-brand-dna-grid">
            {/* Photos Upload */}
            <div className="settings-card">
              <div className="settings-brand-dna-header">
                <h3 className="settings-brand-dna-title">Your Photos</h3>
                <span className="settings-brand-dna-count">{photos.length}/6 photos</span>
              </div>

              <div
                className={`settings-upload-box ${photos.length > 0 ? 'settings-upload-box--has-photos' : ''}`}
                onClick={() => photos.length < 6 && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
                {photos.length > 0 ? (
                  <>
                    <div className="settings-photo-grid-inline">
                      {photos.map((photo) => (
                        <div key={photo.id} className="settings-photo-item">
                          <img
                            src={photo.url || photo.localUrl}
                            alt=""
                            onError={(e) => { if (photo.localUrl && e.target.src !== photo.localUrl) e.target.src = photo.localUrl; }}
                          />
                          {photo.uploading && (
                            <div className="settings-photo-uploading">
                              <Loader size={18} className="settings-spinner" />
                            </div>
                          )}
                          <button
                            className="settings-photo-remove"
                            onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {photos.length < 6 && (
                        <div className="settings-photo-add">
                          <Upload size={18} />
                        </div>
                      )}
                    </div>
                    <span className="settings-upload-hint">{photos.length}/6 photos — click to add more</span>
                  </>
                ) : (
                  <>
                    <Upload size={28} />
                    <span>Upload photos of yourself</span>
                    <span className="settings-upload-hint">Click to browse — up to 6 images</span>
                  </>
                )}
              </div>
            </div>

            {/* Logo Upload */}
            <div className="settings-card settings-doc-card">
              <div className="settings-brand-dna-header">
                <h3 className="settings-brand-dna-title">Your Logo</h3>
              </div>

              {logo ? (
                <div className="settings-logo-uploaded">
                  <img src={logo.url || logo.localUrl} alt="Logo" className="settings-logo-preview" />
                  {logo.uploading ? (
                    <Loader size={18} className="settings-spinner" />
                  ) : (
                    <button
                      className="settings-btn settings-btn--danger"
                      onClick={removeLogo}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className="settings-upload-box settings-upload-box--doc"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload size={28} />
                  <span>Upload your logo</span>
                  <span className="settings-upload-hint">PNG, SVG, or JPG</span>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*,.svg"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>

            {/* Document Upload Boxes */}
            {DOC_TYPES.map((doc) => (
              <div key={doc.id} className="settings-card settings-doc-card">
                <div className="settings-brand-dna-header">
                  <h3 className="settings-brand-dna-title">{doc.label}</h3>
                </div>

                {documents[doc.id] ? (
                  <div className="settings-doc-uploaded">
                    <div className="settings-doc-file">
                      {documents[doc.id].uploading ? (
                        <Loader size={20} className="settings-spinner" />
                      ) : (
                        <FileText size={20} />
                      )}
                      <span className="settings-doc-filename">{documents[doc.id].name}</span>
                    </div>
                    {!documents[doc.id].uploading && (
                      <button
                        className="settings-btn settings-btn--danger"
                        onClick={() => removeDoc(doc.id)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="settings-upload-box settings-upload-box--doc"
                    onClick={() => docInputRefs.current[doc.id]?.click()}
                  >
                    <FileText size={28} />
                    <span>Upload {doc.label}</span>
                    <span className="settings-upload-hint">{doc.desc} — PDF, DOC, or TXT</span>
                    <input
                      ref={(el) => (docInputRefs.current[doc.id] = el)}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={(e) => handleDocUpload(doc.id, e)}
                      style={{ display: 'none' }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Brand Colors */}
            <div className="settings-card settings-color-picker-card">
              <div className="settings-brand-dna-header">
                <h3 className="settings-brand-dna-title">Brand Colors</h3>
              </div>
              <ColorWheelPicker colors={brandColors} onChange={setBrandColors} />
            </div>

            {/* Brand Fonts */}
            <div className="settings-card settings-font-selector-card">
              <div className="settings-brand-dna-header">
                <h3 className="settings-brand-dna-title">Brand Fonts</h3>
              </div>
              <FontSelector
                mainFont={mainFont}
                secondaryFont={secondaryFont}
                onMainChange={setMainFont}
                onSecondaryChange={setSecondaryFont}
              />
            </div>
          </div>
        )}
      </div>

      {/* Integration Modal */}
      {modalOpen && currentModal && (
        <div className="modal-overlay" onClick={() => setModalOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalOpen(null)}>
              <X size={18} />
            </button>

            <div className="modal-logo">
              <img src={currentModal.logo} alt={currentModal.name} />
            </div>

            {/* Fathom: single step */}
            {modalOpen === 'fathom' && (
              <>
                <p className="modal-description">
                  Connect your Fathom AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fathom API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
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
              </>
            )}

            {/* Fireflies: step 1 */}
            {modalOpen === 'fireflies' && firefliesStep === 1 && (
              <>
                <p className="modal-description">
                  Connect your Fireflies AI account to automatically sync all of your call recordings to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Fireflies API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleFirefliesNext}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Next'}
                </button>
              </>
            )}

            {/* Fireflies: step 2 */}
            {modalOpen === 'fireflies' && firefliesStep === 2 && (
              <>
                <p className="modal-instruction">Copy this into your Fireflies AI settings</p>
                <div className="modal-field">
                  <label className="modal-label">Webhook URL</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={firefliesWebhook.url}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(firefliesWebhook.url, 'url')}
                    >
                      {copiedField === 'url' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Webhook Secret</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={firefliesWebhook.secret}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(firefliesWebhook.secret, 'secret')}
                    >
                      {copiedField === 'secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={() => setModalOpen(null)}
                >
                  Done
                </button>
              </>
            )}

            {/* Stripe */}
            {modalOpen === 'stripe' && (
              <>
                <p className="modal-description">
                  Connect your Stripe account to automatically sync your payment and subscription data to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your Stripe API key</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer">Stripe Dashboard &gt; API Keys</a></li>
                      <li>Copy your <strong>Secret key</strong> (starts with <code>sk_live_</code>)</li>
                      <li>For testing, you can use the test key (<code>sk_test_</code>) instead</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Stripe Secret Key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="sk_live_..."
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
              </>
            )}

            {/* Whop */}
            {modalOpen === 'whop' && (
              <>
                <p className="modal-description">
                  Connect your Whop account to automatically sync your storefront and membership data to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your Whop API key</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to <a href="https://dash.whop.com/settings/developer" target="_blank" rel="noopener noreferrer">Whop Dashboard &gt; Settings &gt; Developer</a></li>
                      <li>Under <strong>API Keys</strong>, click "Create API Key"</li>
                      <li>Copy the generated key and paste it below</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Whop API Key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
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
              </>
            )}
            {/* GoHighLevel: step 1 */}
            {modalOpen === 'gohighlevel' && ghlStep === 1 && (
              <>
                <p className="modal-description">
                  Connect GoHighLevel for automatic bi-directional CRM syncing. New contacts sync both ways between GoHighLevel and your CRM.
                </p>
                <div className="modal-steps">
                  <div className="modal-step">
                    <span className="modal-step-number">1</span>
                    <span className="modal-step-text">
                      Go to your GoHighLevel{' '}
                      <strong>Settings &rarr; Business Profile</strong>{' '}
                      to find your Location ID, and{' '}
                      <strong>Settings &rarr; Integrations &rarr; Private Integrations</strong>{' '}
                      to create an API token.
                    </span>
                  </div>
                  <div className="modal-step">
                    <span className="modal-step-number">2</span>
                    <span className="modal-step-text">Paste both values below.</span>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Location ID (sub-account)</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. ve9EPM428h8vShlRW1KT"
                    value={ghlLocationId}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Private Integration API Token</label>
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
                  onClick={handleGHLNext}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}

            {/* Netlify: simple token entry */}
            {modalOpen === 'netlify' && (
              <>
                <p className="modal-description">
                  Connect Netlify to deploy landing pages directly from the Marketing tools with one click.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your Netlify token</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to <strong>app.netlify.com</strong> &gt; <strong>User settings</strong> &gt; <strong>Applications</strong></li>
                      <li>Under <strong>Personal access tokens</strong>, click <strong>New access token</strong></li>
                      <li>Give it a name (e.g. &quot;PurelyPersonal&quot;) and click <strong>Generate token</strong></li>
                      <li>Copy the token and paste it below</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Personal Access Token</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your Netlify token here"
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
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Connect'}
                </button>
              </>
            )}

            {/* Shopify: step 1 */}
            {modalOpen === 'shopify' && shopifyStep === 1 && (
              <>
                <p className="modal-description">
                  Connect your Shopify store to sync orders, products, and customer data for sales analytics.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your Shopify access token</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to your Shopify Admin &gt; <strong>Settings</strong> &gt; <strong>Apps and sales channels</strong></li>
                      <li>Click <strong>Develop apps</strong> &gt; <strong>Create an app</strong></li>
                      <li>Under <strong>Admin API access scopes</strong>, enable: <code>read_orders</code>, <code>read_products</code>, <code>read_customers</code></li>
                      <li>Click <strong>Install app</strong> and copy the <strong>Admin API access token</strong></li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Store URL</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="mystore.myshopify.com"
                    value={shopifyStoreUrl}
                    onChange={(e) => setShopifyStoreUrl(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Admin API Access Token</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="shpat_xxxxxxxxxxxxx"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || !shopifyStoreUrl.trim() || connecting}
                  onClick={handleShopifyNext}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Next'}
                </button>
              </>
            )}

            {/* Shopify: step 2 — webhook setup */}
            {modalOpen === 'shopify' && shopifyStep === 2 && (
              <>
                <p className="modal-instruction">Copy this webhook URL into your Shopify Admin &rarr; Settings &rarr; Notifications &rarr; Webhooks</p>
                <div className="modal-field">
                  <label className="modal-label">Webhook URL</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={shopifyWebhook.url}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(shopifyWebhook.url, 'shopify-url')}
                    >
                      {copiedField === 'shopify-url' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Webhook Secret</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={shopifyWebhook.secret}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(shopifyWebhook.secret, 'shopify-secret')}
                    >
                      {copiedField === 'shopify-secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <p className="modal-description" style={{ fontSize: 12, marginTop: 4 }}>
                  Subscribe to <strong>Order payment</strong> and <strong>Product creation/update</strong> events for real-time sync.
                </p>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={() => setModalOpen(null)}
                >
                  Done
                </button>
              </>
            )}

            {/* Kajabi: step 1 */}
            {modalOpen === 'kajabi' && kajabiStep === 1 && (
              <>
                <p className="modal-description">
                  Connect your Kajabi account to sync offers, sales, subscriptions, and member data for analytics.
                </p>
                <div className="modal-connect-instructions">
                  <details open>
                    <summary className="modal-connect-summary">How to get your Kajabi API key</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to your Kajabi admin &gt; <strong>Settings</strong></li>
                      <li>Navigate to <strong>API</strong> or <strong>Integrations</strong> section</li>
                      <li>Generate or copy your API key</li>
                    </ol>
                  </details>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Kajabi API Key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim() || connecting}
                  onClick={handleKajabiNext}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Validating...</> : 'Next'}
                </button>
              </>
            )}

            {/* Kajabi: step 2 — webhook setup */}
            {modalOpen === 'kajabi' && kajabiStep === 2 && (
              <>
                <p className="modal-instruction">Copy this webhook URL into your Kajabi &rarr; Settings &rarr; Webhooks</p>
                <div className="modal-field">
                  <label className="modal-label">Webhook URL</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={kajabiWebhook.url}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(kajabiWebhook.url, 'kajabi-url')}
                    >
                      {copiedField === 'kajabi-url' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Webhook Secret</label>
                  <div className="modal-copy-row">
                    <input
                      type="text"
                      className="modal-input modal-input--readonly"
                      value={kajabiWebhook.secret}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(kajabiWebhook.secret, 'kajabi-secret')}
                    >
                      {copiedField === 'kajabi-secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <p className="modal-description" style={{ fontSize: 12, marginTop: 4 }}>
                  Subscribe to <strong>purchase.completed</strong> and <strong>subscription.activated</strong> events for real-time sales updates.
                </p>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={() => setModalOpen(null)}
                >
                  Done
                </button>
              </>
            )}

            {/* Email (SMTP/IMAP) */}
            {modalOpen === 'email' && (
              <>
                <p className="modal-description">
                  Connect your email account via SMTP/IMAP to send and receive emails directly from the PuerlyPersonal AI CEO.
                </p>

                <div className="modal-connect-instructions">
                  <details>
                    <summary className="modal-connect-summary">Gmail setup instructions</summary>
                    <ol className="modal-connect-steps">
                      <li>Enable 2-Step Verification in your <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Google Account Security</a></li>
                      <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">App Passwords</a> and generate a new app password</li>
                      <li>Use <strong>imap.gmail.com</strong> (port 993) and <strong>smtp.gmail.com</strong> (port 587)</li>
                    </ol>
                  </details>
                  <details>
                    <summary className="modal-connect-summary">Outlook setup instructions</summary>
                    <ol className="modal-connect-steps">
                      <li>Go to <a href="https://account.microsoft.com/security" target="_blank" rel="noopener noreferrer">Microsoft Account Security</a></li>
                      <li>Enable Two-step verification, then create an app password</li>
                      <li>Use <strong>outlook.office365.com</strong> (port 993) and <strong>smtp-mail.outlook.com</strong> (port 587)</li>
                    </ol>
                  </details>
                </div>

                <div className="modal-field">
                  <label className="modal-label">Email address</label>
                  <input type="email" className="modal-input" placeholder="you@example.com" value={emailForm.email} onChange={(e) => handleEmailChange(e.target.value)} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Sender Name</label>
                  <input type="text" className="modal-input" placeholder="John Doe" value={emailForm.senderName} onChange={(e) => setEmailForm(f => ({ ...f, senderName: e.target.value }))} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Username</label>
                  <input type="text" className="modal-input" placeholder="you@example.com" value={emailForm.username} onChange={(e) => setEmailForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Password</label>
                  <input type="password" className="modal-input" placeholder="App password or mail password" value={emailForm.password} onChange={(e) => setEmailForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="modal-row">
                  <div className="modal-field modal-field--flex">
                    <label className="modal-label">IMAP Host</label>
                    <input type="text" className="modal-input" placeholder="imap.example.com" value={emailForm.imapHost} onChange={(e) => setEmailForm(f => ({ ...f, imapHost: e.target.value }))} />
                  </div>
                  <div className="modal-field modal-field--small">
                    <label className="modal-label">Port</label>
                    <input type="text" className="modal-input" placeholder="993" value={emailForm.imapPort} onChange={(e) => setEmailForm(f => ({ ...f, imapPort: e.target.value }))} />
                  </div>
                </div>
                <div className="modal-row">
                  <div className="modal-field modal-field--flex">
                    <label className="modal-label">SMTP Host</label>
                    <input type="text" className="modal-input" placeholder="smtp.example.com" value={emailForm.smtpHost} onChange={(e) => setEmailForm(f => ({ ...f, smtpHost: e.target.value }))} />
                  </div>
                  <div className="modal-field modal-field--small">
                    <label className="modal-label">Port</label>
                    <input type="text" className="modal-input" placeholder="587" value={emailForm.smtpPort} onChange={(e) => setEmailForm(f => ({ ...f, smtpPort: e.target.value }))} />
                  </div>
                </div>
                {connectError && <p className="modal-error">{connectError}</p>}
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!emailForm.email || !emailForm.username || !emailForm.password || !emailForm.imapHost || !emailForm.smtpHost || connecting}
                  onClick={handleEmailConnect}
                >
                  {connecting ? <><Loader size={14} className="settings-spinner" /> Connecting...</> : 'Connect'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
