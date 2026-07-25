// Instagram account selector for BooSend publishing. A BooSend workspace
// can hold multiple connected IG accounts — every publish/schedule surface
// renders this so the user picks which account the post goes out from.
//
// Renders nothing while loading, on fetch failure, or when the user has
// 0–1 accounts (nothing to choose — BooSend auto-resolves the only one).
// With 2+ accounts it auto-selects the first and reports it via onChange,
// so the parent always holds a valid BooSend account row UUID.
import { useEffect, useState } from 'react';
import { Instagram } from 'lucide-react';
import { getInstagramAccounts } from '../lib/api';

// One fetch per page load — the pickers appear in several modals and the
// account list changes rarely (only when BooSend connections change).
let accountsCache = null;
let accountsPromise = null;
function loadAccounts() {
  if (accountsCache) return Promise.resolve(accountsCache);
  if (!accountsPromise) {
    accountsPromise = getInstagramAccounts()
      .then((d) => {
        accountsCache = d?.accounts || [];
        return accountsCache;
      })
      .catch(() => {
        accountsPromise = null; // allow retry on next mount
        return [];
      });
  }
  return accountsPromise;
}

export default function IgAccountPicker({ value, onChange, className = '', label = 'Post from' }) {
  const [accounts, setAccounts] = useState(accountsCache || []);

  useEffect(() => {
    let cancelled = false;
    loadAccounts().then((accs) => { if (!cancelled) setAccounts(accs); });
    return () => { cancelled = true; };
  }, []);

  // Keep the parent's selection valid: default to the first account when
  // nothing is selected yet, and clear a selection that no longer exists.
  useEffect(() => {
    if (accounts.length < 2) return;
    if (!value || !accounts.some((a) => a.id === value)) {
      onChange?.(accounts[0].id);
    }
  }, [accounts, value, onChange]);

  if (accounts.length < 2) return null;

  return (
    <label
      className={`ig-account-picker ${className}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
      onClick={(e) => e.stopPropagation()}
    >
      <Instagram size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>{label}</span>
      <select
        value={value || accounts[0].id}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid rgba(128,128,128,0.35)',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: 13,
        }}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>@{a.username || a.instagram_account_id}</option>
        ))}
      </select>
    </label>
  );
}
