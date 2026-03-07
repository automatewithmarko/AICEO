import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { Mail, Lock, CreditCard, Zap, Check, X, Copy, Upload, Trash2, ChevronRight, FileText } from 'lucide-react';
import ColorWheelPicker from '../components/ColorWheelPicker';
import FontSelector from '../components/FontSelector';
import './Pages.css';
import './Settings.css';

const NOTE_TAKERS = [
  { id: 'fireflies', name: 'Fireflies AI', logo: '/fireflies-logo.png' },
  { id: 'fathom', name: 'Fathom', logo: '/fathom-logo.png' },
  { id: 'stripe', name: 'Stripe', logo: '/stripe-logo.png' },
  { id: 'whop', name: 'Whop', logo: '/whop-logo.svg' },
  { id: 'gohighlevel', name: 'GoHighLevel', logo: '/gohighlevel-logo.png' },
  { id: 'email', name: 'Email (SMTP/IMAP)', logo: '/smtp-logo.png', large: true },
];

const MOCK_WEBHOOK_URL = 'https://api.puerlypersonal.com/webhooks/fireflies/abc123';
const MOCK_WEBHOOK_SECRET = 'whsec_k7x9Qm2pLnR4vT8wZ1yB3dF6';

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
  const [integrations, setIntegrations] = useState({ fireflies: false, fathom: false, stripe: false, whop: false, gohighlevel: false, email: false });
  const [modalOpen, setModalOpen] = useState(null); // 'fireflies' or 'fathom'
  const [apiKey, setApiKey] = useState('');
  const [firefliesStep, setFirefliesStep] = useState(1);
  const [copiedField, setCopiedField] = useState(null);

  // Brand DNA
  const [brandDnaCreated, setBrandDnaCreated] = useState(false);
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

  const handleResetPassword = () => {
    setPasswordReset(true);
    setTimeout(() => setPasswordReset(false), 3000);
  };

  const openModal = (id) => {
    setApiKey('');
    setFirefliesStep(1);
    setCopiedField(null);
    setModalOpen(id);
  };

  const handleConnect = () => {
    if (modalOpen) {
      setIntegrations((prev) => ({ ...prev, [modalOpen]: true }));
    }
    setModalOpen(null);
    setApiKey('');
    setFirefliesStep(1);
  };

  const handleDisconnect = (id) => {
    setIntegrations((prev) => ({ ...prev, [id]: false }));
  };

  const handleFirefliesNext = () => {
    if (!apiKey.trim()) return;
    setFirefliesStep(2);
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    const remaining = 6 - photos.length;
    const toAdd = files.slice(0, remaining);
    const newPhotos = toAdd.map((file) => ({
      id: `photo-${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const removePhoto = (id) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (logo) URL.revokeObjectURL(logo.url);
    setLogo({ file, url: URL.createObjectURL(file) });
    e.target.value = '';
  };

  const removeLogo = () => {
    if (logo) URL.revokeObjectURL(logo.url);
    setLogo(null);
  };

  const handleDocUpload = (docId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDocuments((prev) => ({ ...prev, [docId]: { name: file.name, file } }));
    e.target.value = '';
  };

  const removeDoc = (docId) => {
    setDocuments((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const handleCreateBrandDna = () => {
    setBrandDnaCreated(true);
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
        <div className="settings-integrations">
          {NOTE_TAKERS.map((nt) => (
            <div key={nt.id} className="settings-integration-card">
              <img src={nt.logo} alt={nt.name} className={`settings-integration-logo ${nt.large ? 'settings-integration-logo--lg' : ''}`} />
              <div className="settings-integration-info">
                <span className="settings-integration-name">{nt.name}</span>
                <span className={`settings-integration-status ${integrations[nt.id] ? 'settings-integration-status--connected' : ''}`}>
                  {integrations[nt.id] ? 'Connected' : 'Not connected'}
                </span>
              </div>
              {integrations[nt.id] ? (
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
                className="settings-upload-box"
                onClick={() => photos.length < 6 && fileInputRef.current?.click()}
              >
                <Upload size={28} />
                <span>Upload photos of yourself</span>
                <span className="settings-upload-hint">Click to browse — up to 6 images</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {photos.length > 0 && (
                <div className="settings-photo-grid">
                  {photos.map((photo) => (
                    <div key={photo.id} className="settings-photo-item">
                      <img src={photo.url} alt="" />
                      <button
                        className="settings-photo-remove"
                        onClick={() => removePhoto(photo.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Logo Upload */}
            <div className="settings-card settings-doc-card">
              <div className="settings-brand-dna-header">
                <h3 className="settings-brand-dna-title">Your Logo</h3>
              </div>

              {logo ? (
                <div className="settings-logo-uploaded">
                  <img src={logo.url} alt="Logo" className="settings-logo-preview" />
                  <button
                    className="settings-btn settings-btn--danger"
                    onClick={removeLogo}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
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
                      <FileText size={20} />
                      <span className="settings-doc-filename">{documents[doc.id].name}</span>
                    </div>
                    <button
                      className="settings-btn settings-btn--danger"
                      onClick={() => removeDoc(doc.id)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
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
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
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
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleFirefliesNext}
                >
                  Next
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
                      value={MOCK_WEBHOOK_URL}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(MOCK_WEBHOOK_URL, 'url')}
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
                      value={MOCK_WEBHOOK_SECRET}
                      readOnly
                    />
                    <button
                      className="modal-copy-btn"
                      onClick={() => copyToClipboard(MOCK_WEBHOOK_SECRET, 'secret')}
                    >
                      {copiedField === 'secret' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}

            {/* Stripe */}
            {modalOpen === 'stripe' && (
              <>
                <p className="modal-description">
                  Connect your Stripe account to automatically sync your payment and subscription data to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Stripe API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="sk_live_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}

            {/* Whop */}
            {modalOpen === 'whop' && (
              <>
                <p className="modal-description">
                  Connect your Whop account to automatically sync your storefront and membership data to the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Enter your Whop API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}
            {modalOpen === 'gohighlevel' && (
              <>
                <p className="modal-description">
                  Connect GoHighLevel for automatic CRM syncing and sending emails directly from the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Enter your GoHighLevel API key</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Paste your API key here"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}

            {/* Email (SMTP/IMAP) */}
            {modalOpen === 'email' && (
              <>
                <p className="modal-description">
                  Connect your email account via SMTP/IMAP to send and receive emails directly from the PuerlyPersonal AI CEO.
                </p>
                <div className="modal-field">
                  <label className="modal-label">Email address</label>
                  <input
                    type="email"
                    className="modal-input"
                    placeholder="you@example.com"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="modal-btn modal-btn--primary"
                  disabled={!apiKey.trim()}
                  onClick={handleConnect}
                >
                  Connect
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
