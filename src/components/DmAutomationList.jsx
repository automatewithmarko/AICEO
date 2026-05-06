import { useState, useEffect, useCallback } from 'react';
import { getBoosendAutomations, getBoosendAutomation, getInstagramAccounts, activateBoosendAutomation, deactivateBoosendAutomation } from '../lib/api';

// ── SVG icons ──
function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function UsersIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
}
function CheckCircleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
}
function ChevronDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
}

function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}

export default function DmAutomationList({ onSelect, onCreateNew }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [toggleLoading, setToggleLoading] = useState(null);

  // Fetch accounts on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await getInstagramAccounts();
        const list = res.accounts || [];
        setAccounts(list);
        if (list.length > 0) setSelectedAccount(list[0]);
      } catch (err) {
        console.error('[DM List] accounts error:', err);
      } finally {
        setAccountsLoading(false);
      }
    })();
  }, []);

  // Fetch automations when selected account changes
  const fetchAutomations = useCallback(async (accountId) => {
    setLoading(true);
    try {
      const res = await getBoosendAutomations(accountId ? { instagram_account_id: accountId } : undefined);
      const list = (res.automations || []).map(a => ({
        ...a,
        isActive: a.status === 'active',
        sent: a.total_executions || 0,
        contacts: a.unique_contacts || 0,
      }));
      setAutomations(list);
    } catch (err) {
      console.error('[DM List] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountsLoading) return;
    fetchAutomations(selectedAccount?.id || selectedAccount?.instagram_account_id);
  }, [selectedAccount, accountsLoading, fetchAutomations]);

  const toggleAutomation = async (e, id, currentStatus) => {
    e.stopPropagation();
    setToggleLoading(id);
    try {
      if (currentStatus === 'active') {
        await deactivateBoosendAutomation(id);
        setAutomations(prev => prev.map(a => a.id === id ? { ...a, status: 'draft', isActive: false } : a));
      } else {
        await activateBoosendAutomation(id);
        setAutomations(prev => prev.map(a => a.id === id ? { ...a, status: 'active', isActive: true } : a));
      }
    } catch (err) {
      console.error('[DM List] toggle error:', err);
    } finally {
      setToggleLoading(null);
    }
  };

  const handleRowClick = async (automation) => {
    try {
      const res = await getBoosendAutomation(automation.id);
      const auto = res.automation || res;
      const nodes = auto.nodes || auto.graph_json?.nodes || [];
      const edges = auto.edges || auto.graph_json?.edges || [];
      onSelect({ ...automation, nodes, edges, _account: selectedAccount });
    } catch (err) {
      console.error('[DM List] fetch automation error:', err);
      onSelect({ ...automation, nodes: [], edges: [], _account: selectedAccount });
    }
  };

  const filtered = automations.filter(a => {
    if (filter === 'active' && a.status !== 'active') return false;
    if (filter === 'inactive' && a.status === 'active') return false;
    if (search && !a.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const accountLabel = selectedAccount
    ? (selectedAccount.instagram_username || selectedAccount.username || 'Account')
    : 'Select account';
  const accountPic = selectedAccount?.profile_picture_url;

  return (
    <div className="dma-list">
      {/* Account switcher + Search + Filters */}
      <div className="dma-list-toolbar">
        {/* Account switcher */}
        {accounts.length > 0 && (
          <div className="dma-account-switcher">
            <button
              className="dma-account-btn"
              onClick={() => setAccountDropdownOpen(v => !v)}
            >
              {accountPic
                ? <img src={accountPic} alt="" className="dma-account-avatar" />
                : <span className="dma-account-avatar dma-account-avatar--placeholder">@</span>
              }
              <span className="dma-account-name">@{accountLabel}</span>
              <ChevronDownIcon />
            </button>
            {accountDropdownOpen && (
              <div className="dma-account-dropdown">
                {accounts.map(acc => (
                  <button
                    key={acc.id || acc.instagram_account_id}
                    className={`dma-account-option ${(acc.id || acc.instagram_account_id) === (selectedAccount?.id || selectedAccount?.instagram_account_id) ? 'dma-account-option--active' : ''}`}
                    onClick={() => {
                      setSelectedAccount(acc);
                      setAccountDropdownOpen(false);
                    }}
                  >
                    {acc.profile_picture_url
                      ? <img src={acc.profile_picture_url} alt="" className="dma-account-avatar" />
                      : <span className="dma-account-avatar dma-account-avatar--placeholder">@</span>
                    }
                    <span>@{acc.instagram_username || acc.username || 'Account'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="dma-search-wrap">
          <span className="dma-search-icon"><SearchIcon /></span>
          <input
            className="dma-search"
            type="text"
            placeholder="Search automations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="dma-filters">
          <button className={`dma-filter-pill ${filter === 'all' ? 'dma-filter-pill--active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`dma-filter-pill dma-filter-pill--green ${filter === 'active' ? 'dma-filter-pill--active-green' : ''}`} onClick={() => setFilter('active')}>
            <span className="dma-filter-dot dma-filter-dot--green" />Active
          </button>
          <button className={`dma-filter-pill ${filter === 'inactive' ? 'dma-filter-pill--active-gray' : ''}`} onClick={() => setFilter('inactive')}>
            <span className="dma-filter-dot dma-filter-dot--gray" />Inactive
          </button>
          <button className="dma-new-btn" onClick={() => onCreateNew(selectedAccount)}>
            <PlusIcon />
            <span>New Automation</span>
          </button>
        </div>
      </div>

      {/* List */}
      {loading || accountsLoading ? (
        <div className="dma-skeleton-wrap">
          {[1, 2, 3].map(i => (
            <div key={i} className="dma-skeleton-card">
              <div className="dma-skeleton-bar" style={{ width: '40%' }} />
              <div className="dma-skeleton-bar" style={{ width: '25%', marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="dma-empty">
          <p>No Instagram accounts connected. Connect one in BooSend to see your automations.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dma-empty">
          <p>{automations.length === 0 ? 'No automations for this account yet.' : 'No automations match your search.'}</p>
        </div>
      ) : (
        <div className="dma-cards">
          {filtered.map(a => (
            <div key={a.id} className="dma-card" onClick={() => handleRowClick(a)}>
              <div className="dma-card-left">
                <div className="dma-card-icon">
                  <img src="/boosend-logo.png" alt="" />
                </div>
                <div className="dma-card-info">
                  <h3 className="dma-card-name">{a.name || 'Untitled'}</h3>
                  <span className="dma-card-date">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </span>
                  <span className={`dma-badge dma-badge--${a.status || 'draft'}`}>
                    {(a.status || 'draft').charAt(0).toUpperCase() + (a.status || 'draft').slice(1)}
                  </span>
                </div>
              </div>
              <div className="dma-card-right">
                <div className="dma-card-stats">
                  <div className="dma-stat" title="Total executions">
                    <CheckCircleIcon />
                    <span>{a.sent}</span>
                  </div>
                  <div className="dma-stat" title="Unique contacts">
                    <UsersIcon />
                    <span>{a.contacts}</span>
                  </div>
                </div>
                <button
                  className={`dma-toggle ${a.isActive ? 'dma-toggle--on' : ''}`}
                  onClick={(e) => toggleAutomation(e, a.id, a.status)}
                  disabled={toggleLoading === a.id}
                >
                  <span className="dma-toggle-thumb" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
