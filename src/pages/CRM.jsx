import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, Plus, X, Phone, Mail, Building2, Calendar, Play, Download, ExternalLink, Send, Instagram, Linkedin, Trash2, RefreshCw, Loader2, CloudOff, AlertCircle, CheckCircle2, Upload, UserPlus, Check, Tag, ListPlus, FolderPlus, ChevronDown, FileText, Share2, Settings, GripVertical, Webhook, Copy, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

const DEFAULT_STATUSES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent'];

const DEFAULT_STATUS_COLORS = {
  'New Lead': { bg: '#eff6ff', color: '#2563eb' },
  'Contacted': { bg: '#fefce8', color: '#ca8a04' },
  'Qualified': { bg: '#f0fdf4', color: '#16a34a' },
  'Proposal Sent': { bg: '#fdf4ff', color: '#9333ea' },
};

const STATUS_COLOR_PALETTE = [
  { bg: '#fef2f2', color: '#dc2626' },
  { bg: '#fff7ed', color: '#ea580c' },
  { bg: '#ecfdf5', color: '#059669' },
  { bg: '#f0f9ff', color: '#0284c7' },
  { bg: '#faf5ff', color: '#7c3aed' },
  { bg: '#fdf2f8', color: '#db2777' },
  { bg: '#f7fee7', color: '#65a30d' },
  { bg: '#fffbeb', color: '#d97706' },
];

const STATUSES_STORAGE_KEY = 'crm_lead_statuses';
const STATUS_COLORS_STORAGE_KEY = 'crm_lead_status_colors';

function loadSavedStatuses() {
  try {
    const raw = localStorage.getItem(STATUSES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadSavedStatusColors() {
  try {
    const raw = localStorage.getItem(STATUS_COLORS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveStatuses(statuses) {
  localStorage.setItem(STATUSES_STORAGE_KEY, JSON.stringify(statuses));
}

function saveStatusColors(colors) {
  localStorage.setItem(STATUS_COLORS_STORAGE_KEY, JSON.stringify(colors));
}

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
  const navigate = useNavigate();
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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMenu, setBulkMenu] = useState(null); // 'tag' | 'status' | 'addToList' | 'createList' | null
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkListName, setBulkListName] = useState('');
  const [popupStatusOpen, setPopupStatusOpen] = useState(false);
  const [popupTagInput, setPopupTagInput] = useState('');
  const [popupTagAdding, setPopupTagAdding] = useState(false);
  const popupStatusRef = useRef(null);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', business: '' });
  const [csvImporting, setCsvImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookExpandedAction, setWebhookExpandedAction] = useState(null);
  const [webhookCopied, setWebhookCopied] = useState(null);
  const [inlineStatusId, setInlineStatusId] = useState(null); // contact id with open inline status dropdown
  const [inlineStatusPos, setInlineStatusPos] = useState(null); // {top, left} for fixed-position dropdown
  const [inlineTagId, setInlineTagId] = useState(null); // contact id with open inline tag input
  const [inlineTagInput, setInlineTagInput] = useState('');
  // Kanban drag-and-drop state
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  // List & filter state
  const [customLists, setCustomLists] = useState(loadSavedLists);
  const [showCreateList, setShowCreateList] = useState(false);
  const [listForm, setListForm] = useState({ name: '', statuses: [], tags: [], businesses: [], contactIds: [] });
  const [listContactSearch, setListContactSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ statuses: [], tags: [] });
  // Lead status management
  const [statuses, setStatuses] = useState(() => loadSavedStatuses() || DEFAULT_STATUSES);
  const [savedStatusColors, setSavedStatusColors] = useState(() => loadSavedStatusColors() || {});
  const [showStatusSettings, setShowStatusSettings] = useState(false);
  const [statusInput, setStatusInput] = useState('');
  const statusSettingsRef = useRef(null);

  const statusColors = useMemo(() => {
    const colors = { ...DEFAULT_STATUS_COLORS, ...savedStatusColors };
    let paletteIdx = 0;
    statuses.forEach((s) => {
      if (!colors[s]) {
        colors[s] = STATUS_COLOR_PALETTE[paletteIdx % STATUS_COLOR_PALETTE.length];
        paletteIdx++;
      }
    });
    return colors;
  }, [statuses, savedStatusColors]);

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
      setContacts(data.map(c => {
        // For GHL contacts, always use ghl_raw_data.email as source of truth
        // The DB email column may contain a stale placeholder like ghl-xxx@placeholder.local
        let email = c.ghl_raw_data ? (c.ghl_raw_data.email || '') : (c.email || '');
        return {
          ...c,
          email,
          tags: c.tags || [],
          socials: c.socials || { instagram: [], linkedin: [], x: [] },
          created: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        };
      }));
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
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, input: '' });

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

  // ── Bulk actions ──
  const bulkDeleteContacts = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Delete ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}?`)) return;
    for (const id of selectedIds) {
      try { await deleteContactApi(id); } catch {}
    }
    setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
    if (popup && selectedIds.has(popup.contact.id)) setPopup(null);
    setSelectedIds(new Set());
  };

  const bulkAddTag = (tag) => {
    if (!tag.trim()) return;
    const tagVal = tag.trim();
    for (const id of selectedIds) {
      const c = contacts.find(x => x.id === id);
      if (c && !(c.tags || []).includes(tagVal)) {
        const newTags = [...(c.tags || []), tagVal];
        updateLocalContact(id, prev => ({ ...prev, tags: newTags }));
        updateContactApi(id, { tags: newTags }).catch(() => {});
      }
    }
    setBulkMenu(null);
    setBulkTagInput('');
  };

  const bulkChangeStatus = (status) => {
    for (const id of selectedIds) {
      updateLocalContact(id, prev => ({ ...prev, status }));
      updateContactApi(id, { status }).catch(() => {});
    }
    setBulkMenu(null);
  };

  const bulkCreateList = () => {
    if (!bulkListName.trim()) return;
    // Collect the unique tags and statuses from selected contacts to define the list
    const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
    const tags = [...new Set(selectedContacts.flatMap(c => c.tags || []))];
    const statuses = [...new Set(selectedContacts.map(c => c.status))];
    const newList = {
      id: `list-${Date.now()}`,
      name: bulkListName.trim(),
      statuses,
      tags,
    };
    const updated = [...customLists, newList];
    setCustomLists(updated);
    saveLists(updated);
    setActiveList(newList.id);
    setBulkMenu(null);
    setBulkListName('');
  };

  const bulkAddToList = (list) => {
    // Add a shared tag matching the list name so contacts appear in that list's tag filter
    const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
    const listTags = list.tags || [];
    if (listTags.length > 0) {
      const tagToAdd = listTags[0];
      for (const c of selectedContacts) {
        if (!(c.tags || []).includes(tagToAdd)) {
          const newTags = [...(c.tags || []), tagToAdd];
          updateLocalContact(c.id, prev => ({ ...prev, tags: newTags }));
          updateContactApi(c.id, { tags: newTags }).catch(() => {});
        }
      }
    }
    setBulkMenu(null);
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
    ? { statuses: activeListObj.statuses || [], tags: activeListObj.tags || [], businesses: activeListObj.businesses || [], contactIds: activeListObj.contactIds || [] }
    : { ...activeFilters, businesses: [], contactIds: [] };

  const hasActiveFilters = effectiveFilters.statuses.length > 0 || effectiveFilters.tags.length > 0 || effectiveFilters.businesses.length > 0 || effectiveFilters.contactIds.length > 0;

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
    // If list has manually selected contacts, only show those (plus any matching filters)
    if (effectiveFilters.contactIds.length > 0) {
      if (effectiveFilters.contactIds.includes(c.id)) return true;
    }
    // Status filter
    if (effectiveFilters.statuses.length > 0 && !effectiveFilters.statuses.includes(c.status)) return false;
    // Tag filter
    if (effectiveFilters.tags.length > 0 && !(c.tags || []).some(t => effectiveFilters.tags.includes(t))) return false;
    // Business filter
    if (effectiveFilters.businesses.length > 0 && !effectiveFilters.businesses.includes(c.business)) return false;
    // If ONLY contactIds were set (no other filters), we already returned true above for matches
    if (effectiveFilters.contactIds.length > 0 && effectiveFilters.statuses.length === 0 && effectiveFilters.tags.length === 0 && effectiveFilters.businesses.length === 0) return false;
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

  // Close bulk dropdown on outside click
  useEffect(() => {
    if (!bulkMenu) return;
    const handler = (e) => {
      if (!e.target.closest('.crm-bulk-dropdown-wrap')) setBulkMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bulkMenu]);

  // Close popup status dropdown on outside click
  useEffect(() => {
    if (!popupStatusOpen) return;
    const handler = (e) => {
      if (popupStatusRef.current && !popupStatusRef.current.contains(e.target)) setPopupStatusOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popupStatusOpen]);

  // Close status settings on outside click
  useEffect(() => {
    if (!showStatusSettings) return;
    const handler = (e) => {
      if (statusSettingsRef.current && !statusSettingsRef.current.contains(e.target)) setShowStatusSettings(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStatusSettings]);

  // Close inline status dropdown on outside click / scroll / resize
  useEffect(() => {
    if (!inlineStatusId) return;
    const handler = (e) => {
      if (
        !e.target.closest('.crm-inline-status-picker') &&
        !e.target.closest('.crm-status-dropdown--table')
      ) {
        setInlineStatusId(null);
        setInlineStatusPos(null);
      }
    };
    const close = () => {
      setInlineStatusId(null);
      setInlineStatusPos(null);
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [inlineStatusId]);

  const addStatus = (name) => {
    const trimmed = name.trim();
    if (!trimmed || statuses.includes(trimmed)) return;
    const next = [...statuses, trimmed];
    setStatuses(next);
    saveStatuses(next);
    setStatusInput('');
  };

  const removeStatus = (name) => {
    if (statuses.length <= 1) return;
    const next = statuses.filter(s => s !== name);
    setStatuses(next);
    saveStatuses(next);
    // Move any contacts with this status to the first remaining status
    contacts.forEach(c => {
      if (c.status === name) {
        updateLocalContact(c.id, prev => ({ ...prev, status: next[0] }));
        updateContactApi(c.id, { status: next[0] }).catch(() => {});
      }
    });
  };

  const reorderStatus = (fromIdx, toIdx) => {
    const next = [...statuses];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setStatuses(next);
    saveStatuses(next);
  };

  const handleCreateList = () => {
    if (!listForm.name.trim()) return;
    const newList = {
      id: `list-${Date.now()}`,
      name: listForm.name.trim(),
      statuses: listForm.statuses,
      tags: listForm.tags,
      businesses: listForm.businesses,
      contactIds: listForm.contactIds,
    };
    const updated = [...customLists, newList];
    setCustomLists(updated);
    saveLists(updated);
    setActiveList(newList.id);
    setShowCreateList(false);
    setListForm({ name: '', statuses: [], tags: [], businesses: [], contactIds: [] });
    setListContactSearch('');
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

  const closePopup = () => { setPopup(null); setDeleteConfirm({ open: false, input: '' }); setPopupStatusOpen(false); setPopupTagAdding(false); setPopupTagInput(''); };

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
        <button className="crm-list-tab crm-list-tab--create" onClick={() => { setListForm({ name: '', statuses: [], tags: [], businesses: [], contactIds: [] }); setListContactSearch(''); setShowCreateList(true); }}>
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
                  {statuses.map((s) => (
                    <button
                      key={s}
                      className={`crm-modal-check-btn ${listForm.statuses.includes(s) ? 'crm-modal-check-btn--active' : ''}`}
                      onClick={() => setListForm(f => ({
                        ...f,
                        statuses: f.statuses.includes(s) ? f.statuses.filter(x => x !== s) : [...f.statuses, s],
                      }))}
                    >
                      {listForm.statuses.includes(s) && <Check size={13} />}
                      <span className="crm-status" style={{ background: statusColors[s].bg, color: statusColors[s].color }}>{s}</span>
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
              {(() => {
                const allBusinesses = [...new Set(contacts.map(c => c.business).filter(Boolean))].sort();
                return allBusinesses.length > 0 && (
                  <div className="crm-modal-field">
                    <label className="crm-modal-label">Filter by Business</label>
                    <div className="crm-modal-checks">
                      {allBusinesses.map((b) => (
                        <button
                          key={b}
                          className={`crm-modal-check-btn ${listForm.businesses.includes(b) ? 'crm-modal-check-btn--active' : ''}`}
                          onClick={() => setListForm(f => ({
                            ...f,
                            businesses: f.businesses.includes(b) ? f.businesses.filter(x => x !== b) : [...f.businesses, b],
                          }))}
                        >
                          {listForm.businesses.includes(b) && <Check size={13} />}
                          <span>{b}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="crm-modal-field">
                <label className="crm-modal-label">Manually Select Contacts</label>
                <input
                  className="crm-modal-input"
                  placeholder="Search contacts..."
                  value={listContactSearch}
                  onChange={(e) => setListContactSearch(e.target.value)}
                />
                <div className="crm-modal-contact-list">
                  {contacts
                    .filter(c => {
                      if (!listContactSearch) return listForm.contactIds.includes(c.id);
                      const q = listContactSearch.toLowerCase();
                      return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.business || '').toLowerCase().includes(q);
                    })
                    .slice(0, listContactSearch ? 20 : undefined)
                    .map(c => (
                      <button
                        key={c.id}
                        className={`crm-modal-contact-row ${listForm.contactIds.includes(c.id) ? 'crm-modal-contact-row--active' : ''}`}
                        onClick={() => setListForm(f => ({
                          ...f,
                          contactIds: f.contactIds.includes(c.id) ? f.contactIds.filter(x => x !== c.id) : [...f.contactIds, c.id],
                        }))}
                      >
                        <span className="crm-modal-contact-check">{listForm.contactIds.includes(c.id) && <Check size={13} />}</span>
                        <span className="crm-modal-contact-name">{c.name || c.email}</span>
                        {c.business && <span className="crm-modal-contact-biz">{c.business}</span>}
                      </button>
                    ))
                  }
                  {listForm.contactIds.length > 0 && !listContactSearch && (
                    <p className="crm-modal-contact-count">{listForm.contactIds.length} contact{listForm.contactIds.length !== 1 ? 's' : ''} selected</p>
                  )}
                </div>
              </div>
              <p className="crm-modal-hint">
                {listForm.statuses.length === 0 && listForm.tags.length === 0 && listForm.businesses.length === 0 && listForm.contactIds.length === 0
                  ? 'No filters selected — list will show all contacts.'
                  : `Will show contacts matching ${[
                      listForm.statuses.length > 0 ? `status: ${listForm.statuses.join(', ')}` : '',
                      listForm.tags.length > 0 ? `tags: ${listForm.tags.join(', ')}` : '',
                      listForm.businesses.length > 0 ? `business: ${listForm.businesses.join(', ')}` : '',
                      listForm.contactIds.length > 0 ? `${listForm.contactIds.length} manually selected` : '',
                    ].filter(Boolean).join(' + ')}.`
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

      {/* Webhook Modal */}
      {showWebhookModal && (() => {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const webhookUrl = `${apiBase}/api/contacts/webhook`;
        const copyToClipboard = (text, key) => {
          navigator.clipboard.writeText(text);
          setWebhookCopied(key);
          setTimeout(() => setWebhookCopied(null), 2000);
        };
        const actions = [
          {
            key: 'add',
            title: 'Add A Contact',
            desc: 'Automate adding contacts to your Puerly Personal AI CEO',
            curl: `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "add", "name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "business": "Acme Inc", "status": "New Lead"}'`,
          },
          {
            key: 'delete',
            title: 'Delete A Contact',
            desc: 'Delete a contact from the AI CEO automatically',
            curl: `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "delete", "email": "john@example.com"}'`,
          },
          {
            key: 'update',
            title: 'Update A Contact',
            desc: 'Update the contact\'s phone, email, status and description',
            curl: `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "update", "email": "john@example.com", "name": "John Updated", "phone": "+0987654321", "status": "Contacted", "notes": "Updated via webhook"}'`,
          },
          {
            key: 'tag',
            title: 'Add A Tag',
            desc: 'Automatically add a tag to any contact in your AI CEO',
            curl: `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "add_tag", "email": "john@example.com", "tag": "VIP"}'`,
          },
        ];
        return (
          <>
            <div className="crm-modal-overlay" onClick={() => { setShowWebhookModal(false); setWebhookExpandedAction(null); }} />
            <div className="crm-webhook-modal">
              <button className="crm-modal-close" onClick={() => { setShowWebhookModal(false); setWebhookExpandedAction(null); }}>
                <X size={18} />
              </button>
              <div className="crm-webhook-modal-header">
                <Webhook size={20} />
                <h2>Manage contacts with a webhook</h2>
              </div>
              <p className="crm-webhook-modal-desc">
                If you need to add, update, or delete any contact, you can do so effortlessly and automatically using the webhook URL below.
              </p>
              <div className="crm-webhook-url-row">
                <input className="crm-webhook-url-input" readOnly value={webhookUrl} />
                <button className="crm-webhook-copy-btn" onClick={() => copyToClipboard(webhookUrl, 'url')}>
                  {webhookCopied === 'url' ? <Check size={14} /> : <Copy size={14} />}
                  {webhookCopied === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="crm-webhook-actions">
                {actions.map((a, i) => (
                  <div key={a.key} className="crm-webhook-action">
                    <div className="crm-webhook-action-header">
                      <div className="crm-webhook-action-info">
                        <span className="crm-webhook-action-num">{i + 1}</span>
                        <div>
                          <div className="crm-webhook-action-title">{a.title}</div>
                          <div className="crm-webhook-action-desc">{a.desc}</div>
                        </div>
                      </div>
                      <div className="crm-webhook-action-btns">
                        <button className="crm-webhook-action-copy" onClick={() => copyToClipboard(a.curl, a.key)} title="Copy cURL">
                          {webhookCopied === a.key ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                        <button
                          className={`crm-webhook-action-expand ${webhookExpandedAction === a.key ? 'expanded' : ''}`}
                          onClick={() => setWebhookExpandedAction(webhookExpandedAction === a.key ? null : a.key)}
                          title="View cURL"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                    {webhookExpandedAction === a.key && (
                      <pre className="crm-webhook-curl">{a.curl}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

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
                  {statuses.map((s) => (
                    <button
                      key={s}
                      className={`crm-filter-option ${activeFilters.statuses.includes(s) ? 'crm-filter-option--active' : ''}`}
                      onClick={() => toggleFilterStatus(s)}
                    >
                      <span className="crm-filter-check">{activeFilters.statuses.includes(s) && <Check size={12} />}</span>
                      <span className="crm-status" style={{ background: statusColors[s].bg, color: statusColors[s].color }}>{s}</span>
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
          {selectedIds.size > 0 ? (
            <>
              <span className="crm-bulk-count">{selectedIds.size} selected</span>
              <button className="crm-pill crm-pill--danger" onClick={bulkDeleteContacts}>
                <Trash2 size={14} />
                Delete
              </button>
              <div className="crm-bulk-dropdown-wrap">
                <button className="crm-pill" onClick={() => setBulkMenu(bulkMenu === 'tag' ? null : 'tag')}>
                  <Tag size={14} />
                  Add Tag
                  <ChevronDown size={12} />
                </button>
                {bulkMenu === 'tag' && (
                  <div className="crm-bulk-dropdown">
                    <input
                      className="crm-bulk-dropdown-input"
                      placeholder="Type a tag..."
                      value={bulkTagInput}
                      onChange={(e) => setBulkTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') bulkAddTag(bulkTagInput); }}
                      autoFocus
                    />
                    {allTags.map(t => (
                      <button key={t} className="crm-bulk-dropdown-item" onClick={() => bulkAddTag(t)}>{t}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="crm-bulk-dropdown-wrap">
                <button className="crm-pill" onClick={() => setBulkMenu(bulkMenu === 'status' ? null : 'status')}>
                  <Filter size={14} />
                  Change Status
                  <ChevronDown size={12} />
                </button>
                {bulkMenu === 'status' && (
                  <div className="crm-bulk-dropdown">
                    {statuses.map(s => (
                      <button key={s} className="crm-bulk-dropdown-item" onClick={() => bulkChangeStatus(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="crm-bulk-dropdown-wrap">
                <button className="crm-pill" onClick={() => setBulkMenu(bulkMenu === 'addToList' ? null : 'addToList')}>
                  <ListPlus size={14} />
                  Add to List
                  <ChevronDown size={12} />
                </button>
                {bulkMenu === 'addToList' && (
                  <div className="crm-bulk-dropdown">
                    {customLists.map(l => (
                      <button key={l.id} className="crm-bulk-dropdown-item" onClick={() => bulkAddToList(l)}>{l.name}</button>
                    ))}
                    <div className="crm-bulk-dropdown-divider" />
                    <input
                      className="crm-bulk-dropdown-input"
                      placeholder="New list name..."
                      value={bulkListName}
                      onChange={(e) => setBulkListName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') bulkCreateList(); }}
                      autoFocus
                    />
                    <button className="crm-bulk-dropdown-item crm-bulk-dropdown-item--action" onClick={bulkCreateList} disabled={!bulkListName.trim()}>
                      <FolderPlus size={14} />
                      Create New List
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
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
              <button className="crm-webhook-btn" onClick={() => setShowWebhookModal(true)} title="Webhook">
                <Webhook size={15} />
              </button>
            </>
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
                <th className="crm-cell-check">
                  <label className="crm-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(filtered.map(c => c.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                    <span className="crm-checkbox-box"><Check size={12} /></span>
                  </label>
                </th>
                <th>Contact Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Business Name</th>
                <th>Created At</th>
                <th>
                  <div className="crm-th-status" ref={statusSettingsRef}>
                    Lead Status
                    <button className="crm-th-settings-btn" onClick={() => setShowStatusSettings(prev => !prev)} title="Manage statuses">
                      <Settings size={13} />
                    </button>
                    {showStatusSettings && (
                      <div className="crm-status-settings">
                        <div className="crm-status-settings-title">Manage Statuses</div>
                        <div className="crm-status-settings-list">
                          {statuses.map((s, idx) => (
                            <div key={s} className="crm-status-settings-item">
                              <span className="crm-status-settings-grip">
                                {idx > 0 && (
                                  <button className="crm-status-settings-move" onClick={() => reorderStatus(idx, idx - 1)} title="Move up">&#8593;</button>
                                )}
                                {idx < statuses.length - 1 && (
                                  <button className="crm-status-settings-move" onClick={() => reorderStatus(idx, idx + 1)} title="Move down">&#8595;</button>
                                )}
                              </span>
                              <span className="crm-status" style={{ background: (statusColors[s] || {}).bg, color: (statusColors[s] || {}).color }}>{s}</span>
                              {statuses.length > 1 && (
                                <button className="crm-status-settings-remove" onClick={() => removeStatus(s)} title="Remove status">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <form className="crm-status-settings-add" onSubmit={(e) => { e.preventDefault(); addStatus(statusInput); }}>
                          <input
                            className="crm-status-settings-input"
                            placeholder="New status…"
                            value={statusInput}
                            onChange={(e) => setStatusInput(e.target.value)}
                          />
                          <button type="submit" className="crm-status-settings-add-btn" disabled={!statusInput.trim()}>
                            <Plus size={14} />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = statusColors[c.status] || { bg: '#f3f4f6', color: '#374151' };
                return (
                  <tr key={c.id} onClick={(e) => openContact(c, e)} className="crm-row-clickable">
                    <td className="crm-cell-check" onClick={(e) => e.stopPropagation()}>
                      <label className="crm-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            });
                          }}
                        />
                        <span className="crm-checkbox-box"><Check size={12} /></span>
                      </label>
                    </td>
                    <td className="crm-cell-name">
                      <div className="crm-cell-name-wrap">
                        <span className="crm-cell-name-text">{c.name || '—'}</span>
                        {c.ghl_raw_data && (
                          <img
                            src="/gohighlevel_logoSquare.png"
                            alt="GHL"
                            className="crm-ghl-icon"
                            title="Imported from GoHighLevel"
                          />
                        )}
                      </div>
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td className="crm-cell-email">{c.email || '—'}</td>
                    <td>{c.business || '—'}</td>
                    <td className="crm-cell-date">{c.created}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="crm-inline-status-picker">
                        <button
                          className="crm-status crm-status--clickable"
                          style={{ background: st.bg, color: st.color }}
                          onClick={(e) => {
                            if (inlineStatusId === c.id) {
                              setInlineStatusId(null);
                              setInlineStatusPos(null);
                            } else {
                              const r = e.currentTarget.getBoundingClientRect();
                              setInlineStatusPos({ top: r.bottom + 4, left: r.left });
                              setInlineStatusId(c.id);
                            }
                          }}
                        >
                          {c.status}
                        </button>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="crm-tags crm-tags--inline">
                        {(c.tags || []).map((t) => (
                          <span key={t} className="crm-tag">{t}</span>
                        ))}
                        {inlineTagId === c.id ? (
                          <form
                            className="crm-tag-add-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const val = inlineTagInput.trim();
                              if (!val) return;
                              if ((c.tags || []).includes(val)) { setInlineTagInput(''); return; }
                              const newTags = [...(c.tags || []), val];
                              updateLocalContact(c.id, prev => ({ ...prev, tags: newTags }));
                              debouncedSave(c.id, { tags: newTags });
                              setInlineTagInput('');
                            }}
                          >
                            <input
                              className="crm-tag-add-input"
                              autoFocus
                              placeholder="Tag…"
                              value={inlineTagInput}
                              onChange={(e) => setInlineTagInput(e.target.value)}
                              onBlur={() => { setInlineTagId(null); setInlineTagInput(''); }}
                              onKeyDown={(e) => { if (e.key === 'Escape') { setInlineTagId(null); setInlineTagInput(''); } }}
                            />
                          </form>
                        ) : (
                          <button className="crm-tag-add-btn crm-tag-add-btn--table" onClick={() => setInlineTagId(c.id)}>
                            <Plus size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="crm-empty">
                    {contacts.length === 0 ? 'No contacts yet. Click "Sync Contacts" to import from your integrations, or add one manually.' : 'No contacts found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating inline status dropdown (escapes table stacking context) */}
      {inlineStatusId && inlineStatusPos && (() => {
        const current = filtered.find(c => c.id === inlineStatusId);
        if (!current) return null;
        return (
          <div
            className="crm-status-dropdown crm-status-dropdown--table"
            style={{ position: 'fixed', top: inlineStatusPos.top, left: inlineStatusPos.left }}
          >
            {statuses.map(s => (
              <button
                key={s}
                className={`crm-status-option${s === current.status ? ' active' : ''}`}
                style={{ background: (statusColors[s] || {}).bg, color: (statusColors[s] || {}).color }}
                onClick={() => {
                  updateLocalContact(current.id, prev => ({ ...prev, status: s }));
                  debouncedSave(current.id, { status: s });
                  setInlineStatusId(null);
                  setInlineStatusPos(null);
                }}
              >
                {s}
                {s === current.status && <Check size={12} style={{ marginLeft: 4 }} />}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="crm-kanban">
          {statuses.map((status) => {
            const st = statusColors[status];
            const cards = filtered.filter((c) => c.status === status);
            const isDropTarget = dragOverStatus === status;
            return (
              <div
                key={status}
                className={`crm-kb-col${isDropTarget ? ' crm-kb-col--drop' : ''}`}
                onDragOver={(e) => {
                  if (draggingCardId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverStatus !== status) setDragOverStatus(status);
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the column entirely
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setDragOverStatus(prev => (prev === status ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = draggingCardId || e.dataTransfer.getData('text/plain');
                  if (id) {
                    const card = filtered.find(c => String(c.id) === String(id));
                    if (card && card.status !== status) {
                      updateLocalContact(card.id, prev => ({ ...prev, status }));
                      debouncedSave(card.id, { status });
                    }
                  }
                  setDraggingCardId(null);
                  setDragOverStatus(null);
                }}
              >
                <div className="crm-kb-col-header">
                  <span className="crm-kb-col-dot" style={{ background: st.color }} />
                  <span className="crm-kb-col-title">{status}</span>
                  <span className="crm-kb-col-count">{cards.length}</span>
                </div>
                <div className="crm-kb-cards">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className={`crm-kb-card${draggingCardId === c.id ? ' crm-kb-card--dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggingCardId(c.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(c.id));
                      }}
                      onDragEnd={() => {
                        setDraggingCardId(null);
                        setDragOverStatus(null);
                      }}
                      onClick={(e) => {
                        // Don't open popup if a drag just happened
                        if (draggingCardId) return;
                        openContact(c, e);
                      }}
                    >
                      <div className="crm-kb-card-name">
                        <span className="crm-kb-card-name-text">{c.name || c.email}</span>
                        {c.ghl_raw_data && (
                          <img src="/gohighlevel_logoSquare.png" alt="GHL" className="crm-ghl-icon" title="Imported from GoHighLevel" />
                        )}
                      </div>
                      <div className="crm-kb-card-biz">{c.business || '—'}</div>
                      <div className="crm-kb-card-email">{c.email || '—'}</div>
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
                  {cards.length === 0 && isDropTarget && (
                    <div className="crm-kb-drop-placeholder">Drop here</div>
                  )}
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
              <h2 className="crm-popup-name">{popup.contact.name || popup.contact.email}</h2>
              <div className="crm-popup-meta">
                <div className="crm-status-picker" ref={popupStatusRef}>
                  <button
                    className="crm-status-pill-btn"
                    style={{
                      background: statusColors[popup.contact.status]?.bg,
                      color: statusColors[popup.contact.status]?.color,
                    }}
                    onClick={() => setPopupStatusOpen(prev => !prev)}
                  >
                    {popup.contact.status}
                    <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.7 }} />
                  </button>
                  {popupStatusOpen && (
                    <div className="crm-status-dropdown">
                      {statuses.map(s => (
                        <button
                          key={s}
                          className={`crm-status-option${s === popup.contact.status ? ' active' : ''}`}
                          style={{
                            background: statusColors[s]?.bg,
                            color: statusColors[s]?.color,
                          }}
                          onClick={() => {
                            updateLocalContact(popup.contact.id, c => ({ ...c, status: s }));
                            debouncedSave(popup.contact.id, { status: s });
                            setPopupStatusOpen(false);
                          }}
                        >
                          {s}
                          {s === popup.contact.status && <Check size={12} style={{ marginLeft: 4 }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
              {/* Tags section */}
              <div className="crm-popup-tags-section">
                <span className="crm-popup-section-label"><Tag size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Tags</span>
                <div className="crm-popup-tags-row">
                  {(popup.contact.tags || []).map((t) => (
                    <span key={t} className="crm-tag crm-tag--removable">
                      {t}
                      <button
                        className="crm-tag-remove"
                        onClick={() => {
                          const newTags = (popup.contact.tags || []).filter(x => x !== t);
                          updateLocalContact(popup.contact.id, c => ({ ...c, tags: newTags }));
                          debouncedSave(popup.contact.id, { tags: newTags });
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {popupTagAdding ? (
                    <form
                      className="crm-tag-add-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = popupTagInput.trim();
                        if (!val) return;
                        if ((popup.contact.tags || []).includes(val)) { setPopupTagInput(''); return; }
                        const newTags = [...(popup.contact.tags || []), val];
                        updateLocalContact(popup.contact.id, c => ({ ...c, tags: newTags }));
                        debouncedSave(popup.contact.id, { tags: newTags });
                        setPopupTagInput('');
                      }}
                    >
                      <input
                        className="crm-tag-add-input"
                        autoFocus
                        placeholder="Tag name…"
                        value={popupTagInput}
                        onChange={(e) => setPopupTagInput(e.target.value)}
                        onBlur={() => {
                          if (!popupTagInput.trim()) { setPopupTagAdding(false); setPopupTagInput(''); }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setPopupTagAdding(false); setPopupTagInput(''); }
                        }}
                      />
                    </form>
                  ) : (
                    <button className="crm-tag-add-btn" onClick={() => setPopupTagAdding(true)}>
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* GHL Sync Status */}
              {(popup.contact.ghl_contact_id || popup.contact.ghl_raw_data || popup.contact.ghl_sync_status === 'error' || popup.contact.ghl_sync_status === 'pending') && (
                <div className={`crm-ghl-badge${popup.contact.ghl_sync_status === 'error' ? ' crm-ghl-badge--error' : ''}`}>
                  <img src="/gohighlevel_logoSquare.png" alt="GoHighLevel" className="crm-ghl-badge-logo" />
                  <div className="crm-ghl-badge-content">
                    {popup.contact.ghl_sync_status === 'synced' && (
                      <span className="crm-ghl-badge-text">
                        {popup.contact.ghl_raw_data ? 'Imported from GoHighLevel' : 'Synced to GoHighLevel'}
                      </span>
                    )}
                    {popup.contact.ghl_sync_status === 'pending' && (
                      <span className="crm-ghl-badge-text crm-ghl-badge-text--pending">
                        <Loader2 size={12} className="crm-spin" />
                        Syncing to GoHighLevel...
                      </span>
                    )}
                    {popup.contact.ghl_sync_status === 'error' && (
                      <>
                        <span className="crm-ghl-badge-text crm-ghl-badge-text--error">
                          Sync failed: {popup.contact.ghl_sync_error || 'Unknown error'}
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
                      </>
                    )}
                    {popup.contact.ghl_sync_status === 'local_only' && (
                      <>
                        <span className="crm-ghl-badge-text crm-ghl-badge-text--local">Not synced</span>
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
                          Sync now
                        </button>
                      </>
                    )}
                  </div>
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
                <div className="crm-notes-toolbar">
                  <button
                    className="crm-notes-toolbar-btn"
                    title="Bold (Ctrl+B)"
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}
                  ><strong>B</strong></button>
                  <button
                    className="crm-notes-toolbar-btn"
                    title="Italic (Ctrl+I)"
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}
                  ><em>I</em></button>
                  <button
                    className="crm-notes-toolbar-btn"
                    title="Underline (Ctrl+U)"
                    onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline'); }}
                  ><u>U</u></button>
                </div>
                <div
                  className="crm-popup-notes-editor"
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: popup.contact.notes || '' }}
                  onInput={(ev) => {
                    const val = ev.currentTarget.innerHTML;
                    const isEmpty = ev.currentTarget.textContent.trim() === '' && !ev.currentTarget.querySelector('img');
                    updateLocalContact(popup.contact.id, (c) => ({ ...c, notes: isEmpty ? '' : val }));
                    debouncedSave(popup.contact.id, { notes: isEmpty ? '' : val });
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      document.execCommand('insertParagraph');
                    }
                  }}
                  data-placeholder="Add notes about this contact..."
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
              {popup.contact.ghl_raw_data && (
                <button
                  className={`crm-view-tab ${popupTab === 'ghl' ? 'crm-view-tab--active' : ''}`}
                  onClick={() => setPopupTab('ghl')}
                >
                  GHL Data
                </button>
              )}
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
                      <img
                        src={r.provider === 'fathom' ? '/fathom-square-logo.png' : r.provider === 'fireflies' ? '/fireflies-square-logo.png' : '/our-square-logo.png'}
                        alt=""
                        className="crm-rec-logo"
                      />
                      <div className="crm-rec-info">
                        <span className="crm-rec-name">{r.name}</span>
                        <span className="crm-rec-meta">{r.date}{r.duration ? ` \u00b7 ${r.duration}` : ''}</span>
                      </div>
                      <div className="crm-rec-actions">
                        {r.provider === 'purelypersonal' ? (
                          <>
                            <button className="crm-rec-btn" title="Play" onClick={() => navigate(`/meetings/${r.id}`)}>
                              <Play size={14} />
                            </button>
                            <button className="crm-rec-btn" title="Share">
                              <Share2 size={14} />
                            </button>
                            <button className="crm-rec-btn" title="Open" onClick={() => navigate(`/meetings/${r.id}`)}>
                              <ExternalLink size={14} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="crm-rec-btn crm-rec-btn--transcript"
                            title="View Transcript"
                            onClick={() => navigate(`/meetings/${r.id}`, { state: { external: true, source: r.provider } })}
                          >
                            <FileText size={14} />
                            <span>View Transcript</span>
                          </button>
                        )}
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

              {popupTab === 'ghl' && popup.contact.ghl_raw_data && (
                <div className="crm-popup-list crm-ghl-data">
                  {Object.entries(popup.contact.ghl_raw_data)
                    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
                    .map(([key, value]) => (
                      <div key={key} className="crm-ghl-data-row">
                        <span className="crm-ghl-data-key">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                        <span className="crm-ghl-data-value">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Delete contact — bottom of card */}
            <div className="crm-popup-delete-section">
              {!deleteConfirm.open ? (
                <button
                  className="crm-popup-delete-btn"
                  onClick={() => setDeleteConfirm({ open: true, input: '' })}
                >
                  <Trash2 size={14} />
                  Delete Contact
                </button>
              ) : (
                <div className="crm-popup-delete-confirm">
                  <p className="crm-popup-delete-warn">Type <strong>DELETE</strong> to confirm</p>
                  <div className="crm-popup-delete-row">
                    <input
                      className="crm-popup-delete-input"
                      value={deleteConfirm.input}
                      onChange={(e) => setDeleteConfirm(prev => ({ ...prev, input: e.target.value }))}
                      placeholder="DELETE"
                      autoFocus
                    />
                    <button
                      className="crm-popup-delete-btn crm-popup-delete-btn--confirm"
                      disabled={deleteConfirm.input !== 'DELETE'}
                      onClick={() => handleDeleteContact(popup.contact.id)}
                    >
                      Confirm
                    </button>
                    <button
                      className="crm-popup-delete-btn crm-popup-delete-btn--cancel"
                      onClick={() => setDeleteConfirm({ open: false, input: '' })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
