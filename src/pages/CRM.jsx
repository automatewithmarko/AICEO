import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Filter, ArrowUpDown, Plus, X, Phone, Mail, Building2, Calendar, Play, Download, ExternalLink, Send, Instagram, Linkedin, Trash2, RefreshCw, Loader2, CloudOff, AlertCircle, CheckCircle2, Upload, UserPlus, Check } from 'lucide-react';
import { getContacts, createContact, updateContact as updateContactApi, deleteContact as deleteContactApi, getContactDetail, syncContacts, syncContactToGHL } from '../lib/api';
import './CRM.css';

function XIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

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

const STORAGE_KEY = 'crm_custom_lists';

function loadSavedLists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLists(lists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

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
  const [csvImporting, setCsvImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // List & filter state
  const [customLists, setCustomLists] = useState(loadSavedLists);
  const [showCreateList, setShowCreateList] = useState(false);
  const [listForm, setListForm] = useState({ name: '', statuses: [], tags: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ statuses: [], tags: [] });
  const pageRef = useRef(null);
  const saveTimerRef = useRef(null);
  const csvInputRef = useRef(null);
  const vcfInputRef = useRef(null);
  const filterRef = useRef(null);

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
    setErrorMsg('');
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
      setErrorMsg(err.message || 'Failed to add contact');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCsvImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setCsvImporting(false); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'contact name');
      const emailIdx = headers.findIndex(h => h === 'email' || h === 'email address');
      const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'phone number' || h === 'mobile');
      const bizIdx = headers.findIndex(h => h === 'business' || h === 'company' || h === 'business name');

      const rows = lines.slice(1).map(line => {
        const cols = line.match(/(".*?"|[^",]+|(?<=,)(?=,))/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || [];
        return {
          name: nameIdx >= 0 ? cols[nameIdx] || '' : '',
          email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
          phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
          business: bizIdx >= 0 ? cols[bizIdx] || '' : '',
        };
      }).filter(r => r.name || r.email);

      for (const row of rows) {
        try {
          const { contact } = await createContact(row);
          setContacts(prev => [{
            ...contact,
            tags: contact.tags || [],
            socials: contact.socials || { instagram: [], linkedin: [], x: [] },
            created: new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          }, ...prev]);
        } catch { /* skip duplicates */ }
      }
    } catch (err) {
      console.error('CSV import failed:', err);
    }
    setCsvImporting(false);
  };

  const [vcfImporting, setVcfImporting] = useState(false);

  const handleVcfImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setVcfImporting(true);
    setErrorMsg('');
    try {
      const text = await file.text();
      // Parse vCard format — split by BEGIN:VCARD blocks
      const cards = text.split('BEGIN:VCARD').filter(c => c.includes('END:VCARD'));
      if (!cards.length) {
        setErrorMsg('No valid contacts found in this file');
        setVcfImporting(false);
        setTimeout(() => setErrorMsg(''), 4000);
        return;
      }

      let imported = 0;
      for (const card of cards) {
        const getField = (field) => {
          const match = card.match(new RegExp(`^${field}[;:](.*)$`, 'mi'));
          return match ? match[1].replace(/\\n/g, ' ').replace(/\\;/g, ';').trim() : '';
        };

        // Parse FN (formatted name) or N (structured name)
        let name = getField('FN');
        if (!name) {
          const n = getField('N');
          if (n) {
            const parts = n.split(';');
            name = [parts[1], parts[0]].filter(Boolean).join(' ').trim();
          }
        }

        // Parse email — handle TYPE parameters like EMAIL;TYPE=INTERNET:
        const emailMatch = card.match(/^EMAIL[^:]*:(.+)$/mi);
        const email = emailMatch ? emailMatch[1].trim() : '';

        // Parse phone — handle TYPE parameters like TEL;TYPE=CELL:
        const telMatch = card.match(/^TEL[^:]*:(.+)$/mi);
        const phone = telMatch ? telMatch[1].trim() : '';

        // Parse org/business
        const org = getField('ORG').replace(/;+$/, '');

        if (!name && !email) continue;

        try {
          const { contact } = await createContact({ name, email, phone, business: org });
          setContacts(prev => [{
            ...contact,
            tags: contact.tags || [],
            socials: contact.socials || { instagram: [], linkedin: [], x: [] },
            created: new Date(contact.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          }, ...prev]);
          imported++;
        } catch { /* skip duplicates */ }
      }

      if (imported === 0) {
        setErrorMsg('No new contacts imported (all duplicates or empty)');
        setTimeout(() => setErrorMsg(''), 4000);
      }
    } catch (err) {
      setErrorMsg('Failed to import contacts from file');
      setTimeout(() => setErrorMsg(''), 4000);
    }
    setVcfImporting(false);
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

  // Collect all unique tags from contacts for filter UI
  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();

  // Determine active filter criteria (from list or toolbar)
  const activeListObj = customLists.find(l => l.id === activeList);
  const effectiveFilters = activeListObj
    ? { statuses: activeListObj.statuses, tags: activeListObj.tags }
    : activeFilters;

  const hasActiveFilters = effectiveFilters.statuses.length > 0 || effectiveFilters.tags.length > 0;

  const filtered = contacts.filter((c) => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      if (
        !(c.name || '').toLowerCase().includes(q) &&
        !(c.email || '').toLowerCase().includes(q) &&
        !(c.business || '').toLowerCase().includes(q) &&
        !(c.phone || '').includes(q)
      ) return false;
    }
    // Status filter
    if (effectiveFilters.statuses.length > 0 && !effectiveFilters.statuses.includes(c.status)) return false;
    // Tag filter
    if (effectiveFilters.tags.length > 0 && !(c.tags || []).some(t => effectiveFilters.tags.includes(t))) return false;
    return true;
  });

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  const handleCreateList = () => {
    if (!listForm.name.trim()) return;
    const newList = {
      id: `list-${Date.now()}`,
      name: listForm.name.trim(),
      statuses: listForm.statuses,
      tags: listForm.tags,
    };
    const updated = [...customLists, newList];
    setCustomLists(updated);
    saveLists(updated);
    setActiveList(newList.id);
    setShowCreateList(false);
    setListForm({ name: '', statuses: [], tags: [] });
    // Clear toolbar filters when switching to a list
    setActiveFilters({ statuses: [], tags: [] });
  };

  const handleDeleteList = (listId) => {
    const updated = customLists.filter(l => l.id !== listId);
    setCustomLists(updated);
    saveLists(updated);
    if (activeList === listId) setActiveList('all');
  };

  const toggleFilterStatus = (status) => {
    setActiveFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status],
    }));
    // Switch to "All" tab when using toolbar filters
    if (activeListObj) setActiveList('all');
  };

  const toggleFilterTag = (tag) => {
    setActiveFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
    if (activeListObj) setActiveList('all');
  };

  const clearFilters = () => {
    setActiveFilters({ statuses: [], tags: [] });
  };

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
          <button className="crm-list-tab crm-list-tab--create"><Plus size={14} /> Create a new list</button>
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
        <button
          className={`crm-list-tab ${activeList === 'all' ? 'crm-list-tab--active' : ''}`}
          onClick={() => { setActiveList('all'); clearFilters(); }}
        >
          All
        </button>
        {customLists.map((list) => (
          <button
            key={list.id}
            className={`crm-list-tab ${activeList === list.id ? 'crm-list-tab--active' : ''}`}
            onClick={() => { setActiveList(list.id); setActiveFilters({ statuses: [], tags: [] }); }}
          >
            {list.name}
            <span
              className="crm-list-tab-delete"
              onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
              title="Delete list"
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button className="crm-list-tab crm-list-tab--create" onClick={() => setShowCreateList(true)}>
          <Plus size={14} />
          Create a new list
        </button>
      </div>
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleCsvImport}
      />
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf,.vcard"
        style={{ display: 'none' }}
        onChange={handleVcfImport}
      />

      {/* Create List Modal */}
      {showCreateList && (
        <>
          <div className="crm-modal-overlay" onClick={() => setShowCreateList(false)} />
          <div className="crm-modal">
            <div className="crm-modal-header">
              <h3 className="crm-modal-title">Create a New List</h3>
              <button className="crm-modal-close" onClick={() => setShowCreateList(false)}><X size={16} /></button>
            </div>
            <div className="crm-modal-body">
              <div className="crm-modal-field">
                <label className="crm-modal-label">List Name</label>
                <input
                  className="crm-modal-input"
                  placeholder="e.g. Hot Leads, VIP Clients"
                  value={listForm.name}
                  onChange={(e) => setListForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="crm-modal-field">
                <label className="crm-modal-label">Filter by Status</label>
                <div className="crm-modal-checks">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      className={`crm-modal-check-btn ${listForm.statuses.includes(s) ? 'crm-modal-check-btn--active' : ''}`}
                      onClick={() => setListForm(f => ({
                        ...f,
                        statuses: f.statuses.includes(s) ? f.statuses.filter(x => x !== s) : [...f.statuses, s],
                      }))}
                    >
                      {listForm.statuses.includes(s) && <Check size={13} />}
                      <span className="crm-status" style={{ background: STATUS_COLORS[s].bg, color: STATUS_COLORS[s].color }}>{s}</span>
                    </button>
                  ))}
                </div>
              </div>
              {allTags.length > 0 && (
                <div className="crm-modal-field">
                  <label className="crm-modal-label">Filter by Tags</label>
                  <div className="crm-modal-checks">
                    {allTags.map((t) => (
                      <button
                        key={t}
                        className={`crm-modal-check-btn ${listForm.tags.includes(t) ? 'crm-modal-check-btn--active' : ''}`}
                        onClick={() => setListForm(f => ({
                          ...f,
                          tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
                        }))}
                      >
                        {listForm.tags.includes(t) && <Check size={13} />}
                        <span className="crm-tag">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="crm-modal-hint">
                {listForm.statuses.length === 0 && listForm.tags.length === 0
                  ? 'No filters selected — list will show all contacts.'
                  : `Will show contacts matching ${[
                      listForm.statuses.length > 0 ? `status: ${listForm.statuses.join(', ')}` : '',
                      listForm.tags.length > 0 ? `tags: ${listForm.tags.join(', ')}` : '',
                    ].filter(Boolean).join(' and ')}.`
                }
              </p>
            </div>
            <div className="crm-modal-footer">
              <button className="crm-modal-cancel" onClick={() => setShowCreateList(false)}>Cancel</button>
              <button className="crm-modal-save" onClick={handleCreateList} disabled={!listForm.name.trim()}>Create List</button>
            </div>
          </div>
        </>
      )}

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

      {/* Error banner */}
      {errorMsg && (
        <div className="crm-error-banner">
          <AlertCircle size={14} />
          {errorMsg}
          <button className="crm-error-dismiss" onClick={() => setErrorMsg('')}><X size={14} /></button>
        </div>
      )}

      {/* Toolbar */}
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <div className="crm-filter-wrap" ref={filterRef}>
            <button
              className={`crm-pill ${hasActiveFilters ? 'crm-pill--active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={14} />
              Filters
              {hasActiveFilters && <span className="crm-filter-count">{effectiveFilters.statuses.length + effectiveFilters.tags.length}</span>}
            </button>
            {showFilters && (
              <div className="crm-filter-dropdown">
                <div className="crm-filter-section">
                  <span className="crm-filter-section-label">Status</span>
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      className={`crm-filter-option ${activeFilters.statuses.includes(s) ? 'crm-filter-option--active' : ''}`}
                      onClick={() => toggleFilterStatus(s)}
                    >
                      <span className="crm-filter-check">{activeFilters.statuses.includes(s) && <Check size={12} />}</span>
                      <span className="crm-status" style={{ background: STATUS_COLORS[s].bg, color: STATUS_COLORS[s].color }}>{s}</span>
                    </button>
                  ))}
                </div>
                {allTags.length > 0 && (
                  <div className="crm-filter-section">
                    <span className="crm-filter-section-label">Tags</span>
                    {allTags.map((t) => (
                      <button
                        key={t}
                        className={`crm-filter-option ${activeFilters.tags.includes(t) ? 'crm-filter-option--active' : ''}`}
                        onClick={() => toggleFilterTag(t)}
                      >
                        <span className="crm-filter-check">{activeFilters.tags.includes(t) && <Check size={12} />}</span>
                        <span className="crm-tag">{t}</span>
                      </button>
                    ))}
                  </div>
                )}
                {hasActiveFilters && !activeListObj && (
                  <button className="crm-filter-clear" onClick={clearFilters}>Clear all filters</button>
                )}
              </div>
            )}
          </div>
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
          <button
            className="crm-pill"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
          >
            {csvImporting ? <Loader2 size={14} className="crm-spin" /> : <Upload size={14} />}
            {csvImporting ? 'Importing...' : 'Import CSV'}
          </button>
          <button
            className="crm-pill"
            onClick={() => vcfInputRef.current?.click()}
            disabled={vcfImporting}
          >
            {vcfImporting ? <Loader2 size={14} className="crm-spin" /> : <Download size={14} />}
            {vcfImporting ? 'Importing...' : 'Import vCard'}
          </button>
          <button
            className="crm-pill"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 size={14} className="crm-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button className="crm-add-contact-btn" onClick={() => setAddingContact(true)}>
            <UserPlus size={15} />
            <span className="crm-add-contact-label">Add Contact</span>
          </button>
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
                    <td className="crm-cell-name">
                      <span className="crm-cell-name-text">{c.name || '—'}</span>
                      {c.ghl_contact_id && (
                        <span className={`crm-ghl-badge crm-ghl-badge--${c.ghl_sync_status || 'synced'}`} title={
                          c.ghl_sync_status === 'error' ? `GHL sync error: ${c.ghl_sync_error || 'Unknown'}` :
                          c.ghl_sync_status === 'pending' ? 'Syncing to GHL...' :
                          c.ghl_sync_status === 'synced' ? 'Synced with GoHighLevel' : 'GHL'
                        }>
                          {c.ghl_sync_status === 'synced' && <CheckCircle2 size={12} />}
                          {c.ghl_sync_status === 'pending' && <Loader2 size={12} className="crm-spin" />}
                          {c.ghl_sync_status === 'error' && <AlertCircle size={12} />}
                          GHL
                        </span>
                      )}
                      {c.source === 'gohighlevel' && !c.ghl_contact_id && (
                        <span className="crm-ghl-badge crm-ghl-badge--local_only" title="Imported from GHL (local only)">
                          <CloudOff size={12} />
                          GHL
                        </span>
                      )}
                    </td>
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
                      <div className="crm-kb-card-name">
                        {c.name || c.email}
                        {c.ghl_contact_id && c.ghl_sync_status === 'synced' && (
                          <CheckCircle2 size={12} className="crm-ghl-inline-icon crm-ghl-inline-icon--synced" />
                        )}
                        {c.ghl_contact_id && c.ghl_sync_status === 'error' && (
                          <AlertCircle size={12} className="crm-ghl-inline-icon crm-ghl-inline-icon--error" />
                        )}
                      </div>
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

              {/* GHL Sync Status */}
              {(popup.contact.ghl_contact_id || popup.contact.ghl_sync_status === 'error' || popup.contact.ghl_sync_status === 'pending') && (
                <div className="crm-popup-ghl-sync">
                  {popup.contact.ghl_sync_status === 'synced' && (
                    <span className="crm-ghl-status crm-ghl-status--synced">
                      <CheckCircle2 size={14} />
                      Synced with GoHighLevel
                    </span>
                  )}
                  {popup.contact.ghl_sync_status === 'pending' && (
                    <span className="crm-ghl-status crm-ghl-status--pending">
                      <Loader2 size={14} className="crm-spin" />
                      Syncing to GoHighLevel...
                    </span>
                  )}
                  {popup.contact.ghl_sync_status === 'error' && (
                    <div className="crm-ghl-error-row">
                      <span className="crm-ghl-status crm-ghl-status--error">
                        <AlertCircle size={14} />
                        Sync error: {popup.contact.ghl_sync_error || 'Unknown'}
                      </span>
                      <button
                        className="crm-ghl-retry-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          updateLocalContact(popup.contact.id, c => ({ ...c, ghl_sync_status: 'pending', ghl_sync_error: null }));
                          try {
                            const { contact: updated } = await syncContactToGHL(popup.contact.id);
                            if (updated) updateLocalContact(popup.contact.id, () => ({
                              ...popup.contact,
                              ...updated,
                              created: popup.contact.created,
                            }));
                          } catch (err) {
                            updateLocalContact(popup.contact.id, c => ({ ...c, ghl_sync_status: 'error', ghl_sync_error: err.message }));
                          }
                        }}
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    </div>
                  )}
                  {popup.contact.ghl_sync_status === 'local_only' && (
                    <div className="crm-ghl-error-row">
                      <span className="crm-ghl-status crm-ghl-status--local">
                        <CloudOff size={14} />
                        Local only (not synced to GHL)
                      </span>
                      <button
                        className="crm-ghl-retry-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          updateLocalContact(popup.contact.id, c => ({ ...c, ghl_sync_status: 'pending' }));
                          try {
                            const { contact: updated } = await syncContactToGHL(popup.contact.id);
                            if (updated) updateLocalContact(popup.contact.id, () => ({
                              ...popup.contact,
                              ...updated,
                              created: popup.contact.created,
                            }));
                          } catch (err) {
                            updateLocalContact(popup.contact.id, c => ({ ...c, ghl_sync_status: 'error', ghl_sync_error: err.message }));
                          }
                        }}
                      >
                        <RefreshCw size={12} />
                        Sync to GHL
                      </button>
                    </div>
                  )}
                </div>
              )}

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
