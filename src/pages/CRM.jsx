import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Filter, ArrowUpDown, Plus, X, Phone, Mail, Building2, Calendar, Play, Download, ExternalLink, Send, Instagram, Linkedin, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { getContacts, createContact, updateContact as updateContactApi, deleteContact as deleteContactApi, getContactDetail, syncContacts } from '../lib/api';
import './CRM.css';

function XIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const LISTS = [
  { id: 'all', name: 'All' },
];

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', Icon: Instagram, color: '#E1306C' },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin, color: '#0A66C2' },
  { key: 'x', label: 'X', Icon: XIcon, color: '#000000' },
];

const STATUSES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent'];

const STATUS_COLORS = {
  'New Lead': { bg: '#eff6ff', color: '#2563eb' },
  'Contacted': { bg: '#fefce8', color: '#ca8a04' },
  'Qualified': { bg: '#f0fdf4', color: '#16a34a' },
  'Proposal Sent': { bg: '#fdf4ff', color: '#9333ea' },
};

export default function CRM() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeList, setActiveList] = useState('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState('table');
  const [popup, setPopup] = useState(null);
  const [popupTab, setPopupTab] = useState('recordings');
  const [popupDetail, setPopupDetail] = useState({ recordings: [], emails: [], products: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [addingSocial, setAddingSocial] = useState(null);
  const [socialInput, setSocialInput] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', business: '' });
  const pageRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    setLoading(true);
    try {
      const { contacts: data } = await getContacts();
      setContacts(data.map(c => ({
        ...c,
        tags: c.tags || [],
        socials: c.socials || { instagram: [], linkedin: [], x: [] },
        created: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      })));
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
    setLoading(false);
  }

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { synced } = await syncContacts();
      console.log(`Synced ${synced} contacts`);
      await loadContacts();
    } catch (err) {
      console.error('Sync failed:', err);
    }
    setSyncing(false);
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim() && !newContact.email.trim()) return;
    try {
      const { contact } = await createContact(newContact);
      setContacts(prev => [{
        ...contact,
        tags: contact.tags || [],
        socials: contact.socials || { instagram: [], linkedin: [], x: [] },
        created: new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }, ...prev]);
      setNewContact({ name: '', email: '', phone: '', business: '' });
      setAddingContact(false);
    } catch (err) {
      console.error('Failed to add contact:', err);
    }
  };

  const handleDeleteContact = async (id) => {
    try {
      await deleteContactApi(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      if (popup?.contact.id === id) setPopup(null);
    } catch (err) {
      console.error('Failed to delete contact:', err);
    }
  };

  // Debounced save to DB when contact fields change
  const debouncedSave = useCallback((contactId, updates) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateContactApi(contactId, updates).catch(err => {
        console.error('Failed to save contact:', err);
      });
    }, 800);
  }, []);

  const updateLocalContact = useCallback((contactId, updater) => {
    setContacts((prev) => prev.map((c) => c.id === contactId ? updater(c) : c));
    setPopup((prev) => {
      if (!prev || prev.contact.id !== contactId) return prev;
      return { ...prev, contact: updater(prev.contact) };
    });
  }, []);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.business || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  const openContact = useCallback(async (contact, e) => {
    const page = pageRef.current;
    if (!page) return;
    const pageRect = page.getBoundingClientRect();
    const clickX = e.clientX - pageRect.left;
    const clickY = e.clientY - pageRect.top;
    const midX = pageRect.width / 2;

    const popupW = 520;
    const popupH = Math.min(700, pageRect.height - 40);
    const spikeW = 14;
    let arrowSide, px, py;

    if (clickX < midX) {
      arrowSide = 'left';
      px = clickX + spikeW;
    } else {
      arrowSide = 'right';
      px = clickX - popupW - spikeW;
    }

    px = Math.max(16, Math.min(px, pageRect.width - popupW - 16));
    py = Math.min(Math.max(clickY - popupH / 2, 10), pageRect.height - popupH - 10);

    setPopup({ contact, x: px, y: py, arrowSide, clickX, clickY });
    setPopupTab('recordings');
    setPopupDetail({ recordings: [], emails: [], products: [] });

    // Fetch detail data
    setDetailLoading(true);
    try {
      const detail = await getContactDetail(contact.id);
      setPopupDetail(detail);
    } catch (err) {
      console.error('Failed to load detail:', err);
    }
    setDetailLoading(false);
  }, []);

  const closePopup = () => setPopup(null);

  const recordings = popupDetail.recordings || [];
  const emails = popupDetail.emails || [];
  const products = popupDetail.products || [];

  if (loading) {
    return (
      <div className="crm-page" ref={pageRef}>
        <div className="crm-lists">
          <button className="crm-list-tab crm-list-tab--active">All</button>
        </div>
        <div className="crm-toolbar">
          <div className="crm-toolbar-left">
            <span className="crm-pill"><Filter size={14} /> Filters</span>
          </div>
        </div>
        <div className="crm-views">
          <button className="crm-view-tab crm-view-tab--active">Table</button>
          <button className="crm-view-tab">Kan-Ban</button>
        </div>
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Contact Name</th><th>Phone</th><th>Email</th><th>Business Name</th><th>Created At</th><th>Lead Status</th><th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5].map(i => (
                <tr key={i}>
                  <td><div className="skeleton" style={{width:'70%',height:14}}/></td>
                  <td><div className="skeleton" style={{width:'80%',height:14}}/></td>
                  <td><div className="skeleton" style={{width:'90%',height:14}}/></td>
                  <td><div className="skeleton" style={{width:'60%',height:14}}/></td>
                  <td><div className="skeleton" style={{width:'50%',height:14}}/></td>
                  <td><div className="skeleton" style={{width:'70%',height:22,borderRadius:50}}/></td>
                  <td><div className="skeleton" style={{width:'40%',height:18,borderRadius:4}}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-page" ref={pageRef}>
      {/* List tabs */}
      <div className="crm-lists">
        {LISTS.map((list) => (
          <button
            key={list.id}
            className={`crm-list-tab ${activeList === list.id ? 'crm-list-tab--active' : ''}`}
            onClick={() => setActiveList(list.id)}
          >
            {list.name}
          </button>
        ))}
        <button className="crm-list-tab crm-list-tab--create" onClick={() => setAddingContact(true)}>
          <Plus size={14} />
          Add Contact
        </button>
        <button
          className="crm-list-tab crm-list-tab--create"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? <Loader2 size={14} className="crm-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Syncing...' : 'Sync Contacts'}
        </button>
      </div>

      {/* Add contact inline form */}
      {addingContact && (
        <div className="crm-add-bar">
          <input className="crm-add-input" placeholder="Name" value={newContact.name} onChange={e => setNewContact(p => ({...p, name: e.target.value}))} autoFocus />
          <input className="crm-add-input" placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({...p, email: e.target.value}))} />
          <input className="crm-add-input" placeholder="Phone" value={newContact.phone} onChange={e => setNewContact(p => ({...p, phone: e.target.value}))} />
          <input className="crm-add-input" placeholder="Business" value={newContact.business} onChange={e => setNewContact(p => ({...p, business: e.target.value}))} />
          <button className="crm-add-save" onClick={handleAddContact} disabled={!newContact.name.trim() && !newContact.email.trim()}>Add</button>
          <button className="crm-add-cancel" onClick={() => { setAddingContact(false); setNewContact({ name: '', email: '', phone: '', business: '' }); }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <button className="crm-pill">
            <Filter size={14} />
            Filters
          </button>
          <button className="crm-pill">
            <ArrowUpDown size={14} />
            Sort
          </button>
        </div>
        <div className="crm-toolbar-right">
          {searchOpen ? (
            <div className="crm-search-box">
              <Search size={14} className="crm-search-icon" />
              <input
                className="crm-search-input"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                onBlur={() => { if (!search) setSearchOpen(false); }}
              />
            </div>
          ) : (
            <button className="crm-pill" onClick={() => setSearchOpen(true)}>
              <Search size={14} />
              Search Contacts
            </button>
          )}
        </div>
      </div>

      {/* View switcher */}
      <div className="crm-views">
        <button
          className={`crm-view-tab ${view === 'table' ? 'crm-view-tab--active' : ''}`}
          onClick={() => setView('table')}
        >
          Table
        </button>
        <button
          className={`crm-view-tab ${view === 'kanban' ? 'crm-view-tab--active' : ''}`}
          onClick={() => setView('kanban')}
        >
          Kan-Ban
        </button>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Business Name</th>
                <th>Created At</th>
                <th>Lead Status</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = STATUS_COLORS[c.status] || { bg: '#f3f4f6', color: '#374151' };
                return (
                  <tr key={c.id} onClick={(e) => openContact(c, e)} className="crm-row-clickable">
                    <td className="crm-cell-name">{c.name || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td className="crm-cell-email">{c.email || '—'}</td>
                    <td>{c.business || '—'}</td>
                    <td className="crm-cell-date">{c.created}</td>
                    <td>
                      <span className="crm-status" style={{ background: st.bg, color: st.color }}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="crm-tags">
                        {(c.tags || []).map((t) => (
                          <span key={t} className="crm-tag">{t}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="crm-empty">
                    {contacts.length === 0 ? 'No contacts yet. Click "Sync Contacts" to import from your integrations, or add one manually.' : 'No contacts found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="crm-kanban">
          {STATUSES.map((status) => {
            const st = STATUS_COLORS[status];
            const cards = filtered.filter((c) => c.status === status);
            return (
              <div key={status} className="crm-kb-col">
                <div className="crm-kb-col-header">
                  <span className="crm-kb-col-dot" style={{ background: st.color }} />
                  <span className="crm-kb-col-title">{status}</span>
                  <span className="crm-kb-col-count">{cards.length}</span>
                </div>
                <div className="crm-kb-cards">
                  {cards.map((c) => (
                    <div key={c.id} className="crm-kb-card" onClick={(e) => openContact(c, e)}>
                      <div className="crm-kb-card-name">{c.name || c.email}</div>
                      <div className="crm-kb-card-biz">{c.business || '—'}</div>
                      <div className="crm-kb-card-email">{c.email}</div>
                      <div className="crm-kb-card-footer">
                        <span className="crm-kb-card-date">{c.created}</span>
                        <div className="crm-tags">
                          {(c.tags || []).map((t) => (
                            <span key={t} className="crm-tag">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact Detail Popup */}
      {popup && (
        <>
          <div className="crm-popup-overlay" onClick={closePopup} />

          {/* Triangle spike */}
          {(() => {
            const popupW = 520;
            const gap = popup.arrowSide === 'left'
              ? Math.max(popup.x - popup.clickX, 8)
              : Math.max(popup.clickX - (popup.x + popupW), 8);
            const sw = gap + 1;

            if (popup.arrowSide === 'left') {
              return (
                <svg
                  className="crm-popup-spike-svg"
                  style={{ left: popup.clickX, top: popup.clickY - 10, width: sw, height: 20 }}
                >
                  <polygon points={`0,10 ${sw},0 ${sw},20`} fill="var(--bg-white)" />
                  <line x1="0" y1="10" x2={sw} y2="0" stroke="var(--border-light)" strokeWidth="1" />
                  <line x1="0" y1="10" x2={sw} y2="20" stroke="var(--border-light)" strokeWidth="1" />
                </svg>
              );
            } else {
              return (
                <svg
                  className="crm-popup-spike-svg"
                  style={{ left: popup.x + popupW - 1, top: popup.clickY - 10, width: sw, height: 20 }}
                >
                  <polygon points={`${sw},10 0,0 0,20`} fill="var(--bg-white)" />
                  <line x1={sw} y1="10" x2="0" y2="0" stroke="var(--border-light)" strokeWidth="1" />
                  <line x1={sw} y1="10" x2="0" y2="20" stroke="var(--border-light)" strokeWidth="1" />
                </svg>
              );
            }
          })()}

          <div
            className="crm-popup"
            style={{ left: popup.x, top: popup.y }}
          >
            {/* Close & Delete buttons */}
            <button className={`crm-popup-close ${popup.arrowSide === 'right' ? 'crm-popup-close--left' : ''}`} onClick={closePopup}>
              <X size={16} />
            </button>

            {/* Contact info */}
            <div className="crm-popup-info">
              <div className="crm-popup-name-row">
                <h2 className="crm-popup-name">{popup.contact.name || popup.contact.email}</h2>
                <button className="crm-popup-delete" onClick={() => handleDeleteContact(popup.contact.id)} title="Delete contact">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="crm-popup-fields">
                <div className="crm-popup-field">
                  <Phone size={14} className="crm-popup-field-icon" />
                  <span>{popup.contact.phone || '—'}</span>
                </div>
                <div className="crm-popup-field">
                  <Mail size={14} className="crm-popup-field-icon" />
                  <span className="crm-popup-field-email">{popup.contact.email || '—'}</span>
                </div>
                <div className="crm-popup-field">
                  <Building2 size={14} className="crm-popup-field-icon" />
                  <span>{popup.contact.business || '—'}</span>
                </div>
                <div className="crm-popup-field">
                  <Calendar size={14} className="crm-popup-field-icon" />
                  <span>Created {popup.contact.created}</span>
                </div>
              </div>
              <div className="crm-popup-meta">
                {/* Status dropdown */}
                <select
                  className="crm-status-select"
                  value={popup.contact.status}
                  style={{
                    background: STATUS_COLORS[popup.contact.status]?.bg,
                    color: STATUS_COLORS[popup.contact.status]?.color,
                  }}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    updateLocalContact(popup.contact.id, c => ({ ...c, status: newStatus }));
                    debouncedSave(popup.contact.id, { status: newStatus });
                  }}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {(popup.contact.tags || []).map((t) => (
                  <span key={t} className="crm-tag">{t}</span>
                ))}
              </div>

              {/* Social Media */}
              <div className="crm-popup-socials">
                <span className="crm-popup-section-label">Social Media</span>
                {SOCIAL_PLATFORMS.map(({ key, Icon, color }) => {
                  const accounts = popup.contact.socials?.[key] || [];
                  return (
                    <div key={key} className="crm-social-row">
                      <div className="crm-social-icon" style={{ color }}>
                        <Icon size={16} />
                      </div>
                      <div className="crm-social-accounts">
                        {accounts.map((url, i) => (
                          <div key={i} className="crm-social-link-chip">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="crm-social-url">{url.replace(/^https?:\/\//, '')}</a>
                            <button
                              className="crm-social-remove"
                              onClick={() => {
                                updateLocalContact(popup.contact.id, (c) => {
                                  const updated = {
                                    ...c,
                                    socials: {
                                      ...c.socials,
                                      [key]: c.socials[key].filter((_, idx) => idx !== i),
                                    },
                                  };
                                  debouncedSave(c.id, { socials: updated.socials });
                                  return updated;
                                });
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                        {addingSocial?.platform === key ? (
                          <form
                            className="crm-social-add-form"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              if (!socialInput.trim()) return;
                              updateLocalContact(popup.contact.id, (c) => {
                                const updated = {
                                  ...c,
                                  socials: {
                                    ...c.socials,
                                    [key]: [...(c.socials[key] || []), socialInput.trim()],
                                  },
                                };
                                debouncedSave(c.id, { socials: updated.socials });
                                return updated;
                              });
                              setSocialInput('');
                              setAddingSocial(null);
                            }}
                          >
                            <input
                              className="crm-social-add-input"
                              placeholder="https://..."
                              value={socialInput}
                              onChange={(ev) => setSocialInput(ev.target.value)}
                              autoFocus
                              onBlur={() => { if (!socialInput.trim()) { setAddingSocial(null); setSocialInput(''); } }}
                              onKeyDown={(ev) => { if (ev.key === 'Escape') { setAddingSocial(null); setSocialInput(''); } }}
                            />
                          </form>
                        ) : (
                          <button
                            className="crm-social-add-btn"
                            onClick={() => { setAddingSocial({ platform: key }); setSocialInput(''); }}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Editable Notes */}
              <div className="crm-popup-notes">
                <span className="crm-popup-section-label">Notes</span>
                <textarea
                  className="crm-popup-notes-textarea"
                  value={popup.contact.notes || ''}
                  onChange={(ev) => {
                    const val = ev.target.value;
                    updateLocalContact(popup.contact.id, (c) => ({ ...c, notes: val }));
                    debouncedSave(popup.contact.id, { notes: val });
                  }}
                  placeholder="Add notes about this contact..."
                  rows={3}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="crm-popup-tabs">
              <button
                className={`crm-view-tab ${popupTab === 'recordings' ? 'crm-view-tab--active' : ''}`}
                onClick={() => setPopupTab('recordings')}
              >
                Call Recordings
              </button>
              <button
                className={`crm-view-tab ${popupTab === 'emails' ? 'crm-view-tab--active' : ''}`}
                onClick={() => setPopupTab('emails')}
              >
                Emails
              </button>
              <button
                className={`crm-view-tab ${popupTab === 'products' ? 'crm-view-tab--active' : ''}`}
                onClick={() => setPopupTab('products')}
              >
                Products Purchased
              </button>
            </div>

            {/* Tab content */}
            <div className="crm-popup-tab-content">
              {detailLoading && (
                <div className="crm-popup-loading">
                  <Loader2 size={20} className="crm-spin" />
                  <span>Loading...</span>
                </div>
              )}

              {!detailLoading && popupTab === 'recordings' && (
                <div className="crm-popup-list">
                  {recordings.length === 0 && <p className="crm-popup-empty">No call recordings found for this contact.</p>}
                  {recordings.map((r) => (
                    <div key={r.id} className="crm-rec-item">
                      <img src="/fireflies-square-logo.png" alt="" className="crm-rec-logo" />
                      <div className="crm-rec-info">
                        <span className="crm-rec-name">{r.name}</span>
                        <span className="crm-rec-meta">{r.date}{r.duration ? ` \u00b7 ${r.duration}` : ''}</span>
                      </div>
                      <div className="crm-rec-actions">
                        <button className="crm-rec-btn" title="Play">
                          <Play size={14} />
                        </button>
                        <button className="crm-rec-btn" title="Download">
                          <Download size={14} />
                        </button>
                        <button className="crm-rec-btn" title="Open">
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!detailLoading && popupTab === 'emails' && (
                <div className="crm-popup-list">
                  {emails.length === 0 && <p className="crm-popup-empty">No emails found for this contact.</p>}
                  {emails.map((em) => (
                    <div key={em.id} className="crm-email-item">
                      <div className="crm-email-top">
                        <span className="crm-email-subject">{em.subject}</span>
                        <span className="crm-email-date">{em.date}</span>
                      </div>
                      <p className="crm-email-snippet">{em.snippet}</p>
                    </div>
                  ))}
                  {popup.contact.email && (
                    <button className="crm-email-compose">
                      <Send size={14} />
                      Compose New Email to {(popup.contact.name || popup.contact.email).split(' ')[0]}
                    </button>
                  )}
                </div>
              )}

              {!detailLoading && popupTab === 'products' && (
                <div className="crm-popup-list">
                  {products.length === 0 && <p className="crm-popup-empty">No products purchased yet.</p>}
                  {products.map((p) => (
                    <div key={p.id} className="crm-product-item">
                      <div className="crm-product-info">
                        <span className="crm-product-name">{p.name}</span>
                        <span className="crm-product-date">{p.date}</span>
                      </div>
                      <span className="crm-product-price">{p.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
