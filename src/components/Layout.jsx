import { useRef, useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navItems } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Search, User, ChevronDown, Check, Plus, Mail, X } from 'lucide-react';
import { getEmailAccounts, deleteEmailAccount } from '../lib/api';
import Sidebar from './Sidebar';
import BottomBar from './BottomBar';
import CreditPill from './CreditPill';
import MobileProfileButton from './MobileProfileButton';
import './Layout.css';

function TopBar({ accounts, selectedAccountId, setSelectedAccountId, onAddAccount, onRemoveAccount }) {
  const location = useLocation();
  const isInbox = location.pathname === '/inbox';
  const [searchValue, setSearchValue] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || null;

  useEffect(() => {
    if (!accountOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountOpen]);

  return (
    <div className="topbar">
      <div className="topbar-left" ref={dropdownRef}>
        <button
          className="topbar-profile-btn"
          onClick={() => setAccountOpen(!accountOpen)}
        >
          <div className="topbar-avatar">
            {activeAccount ? (
              <span className="topbar-avatar-letter">
                {(activeAccount.display_name || activeAccount.email)[0].toUpperCase()}
              </span>
            ) : (
              <Mail size={14} />
            )}
          </div>
          {activeAccount && (
            <span className="topbar-active-email">{activeAccount.email}</span>
          )}
          {!activeAccount && accounts.length > 1 && (
            <span className="topbar-active-email">All Accounts</span>
          )}
          <ChevronDown size={12} className={`topbar-profile-chevron ${accountOpen ? 'topbar-profile-chevron--open' : ''}`} />
        </button>
        {accountOpen && (
          <div className="topbar-account-menu">
            <div className="topbar-account-header">
              {accounts.length > 0 ? 'Email Accounts' : 'No Accounts'}
            </div>
            {/* All Accounts option */}
            {accounts.length > 1 && (
              <button
                className={`topbar-account-item ${!selectedAccountId ? 'topbar-account-item--active' : ''}`}
                onClick={() => { setSelectedAccountId(null); setAccountOpen(false); }}
              >
                <div className="topbar-account-avatar">
                  <Mail size={13} />
                </div>
                <div className="topbar-account-info">
                  <span className="topbar-account-name">All Accounts</span>
                  <span className="topbar-account-email">{accounts.length} connected</span>
                </div>
                {!selectedAccountId && <Check size={14} className="topbar-account-check" />}
              </button>
            )}
            {accounts.map((account) => (
              <div key={account.id} className="topbar-account-item-wrap">
                <button
                  className={`topbar-account-item ${selectedAccountId === account.id ? 'topbar-account-item--active' : ''}`}
                  onClick={() => { setSelectedAccountId(selectedAccountId === account.id && accounts.length > 1 ? null : account.id); setAccountOpen(false); }}
                >
                  <div className="topbar-account-avatar">
                    <span className="topbar-avatar-letter">
                      {(account.display_name || account.email)[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="topbar-account-info">
                    <span className="topbar-account-name">{account.display_name || account.email.split('@')[0]}</span>
                    <span className="topbar-account-email">{account.email}</span>
                  </div>
                  {selectedAccountId === account.id && <Check size={14} className="topbar-account-check" />}
                </button>
                <button
                  className="topbar-account-remove"
                  onClick={(e) => { e.stopPropagation(); onRemoveAccount(account.id); setAccountOpen(false); }}
                  title="Remove account"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <div className="topbar-account-divider" />
            <button
              className="topbar-account-item topbar-account-add"
              onClick={() => { onAddAccount(); setAccountOpen(false); }}
            >
              <div className="topbar-account-avatar topbar-account-avatar--add">
                <Plus size={13} />
              </div>
              <div className="topbar-account-info">
                <span className="topbar-account-name">Add Account</span>
              </div>
            </button>
          </div>
        )}
      </div>
      {isInbox ? (
        <>
          <div className="topbar-center">
            <div className="topbar-search">
              <Search size={15} className="topbar-search-icon" />
              <input
                type="text"
                className="topbar-search-input"
                placeholder={'Type to search or "/AI..." to search with AI'}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
          </div>
          <div className="topbar-right" />
        </>
      ) : (
        <div className="topbar-center" />
      )}
    </div>
  );
}

const SWIPE_THRESHOLD = 60;
const routes = navItems.map((item) => item.to);

function isMobile() {
  return window.innerWidth <= 768;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });
  const [slideDir, setSlideDir] = useState(null); // 'left' or 'right'
  const prevPath = useRef(location.pathname);

  // Email account state (shared with Inbox via outlet context)
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const loadEmailAccounts = useCallback(async () => {
    try {
      const { accounts: accs } = await getEmailAccounts();
      setEmailAccounts(accs || []);
      return accs || [];
    } catch (_) {
      return [];
    }
  }, []);

  useEffect(() => {
    loadEmailAccounts();
  }, [loadEmailAccounts]);

  const handleRemoveAccount = useCallback(async (id) => {
    await deleteEmailAccount(id);
    const accs = await loadEmailAccounts();
    if (selectedAccountId === id) setSelectedAccountId(null);
  }, [selectedAccountId, loadEmailAccounts]);

  // Detect route change and apply slide animation
  useEffect(() => {
    if (prevPath.current !== location.pathname && slideDir) {
      const timer = setTimeout(() => setSlideDir(null), 300);
      prevPath.current = location.pathname;
      return () => clearTimeout(timer);
    }
    prevPath.current = location.pathname;
  }, [location.pathname, slideDir]);

  const handleTouchStart = useCallback((e) => {
    if (!isMobile()) return;
    const tag = e.target.tagName.toLowerCase();
    const isInteractive = e.target.closest('button, a, input, select, textarea, [role="button"]');
    if (isInteractive || tag === 'button' || tag === 'a' || tag === 'input') return;

    const scrollable = e.target.closest('.aiceo-table-scroll');
    if (scrollable) return;

    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      swiping: true,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (!touchRef.current.swiping) return;
      touchRef.current.swiping = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - touchRef.current.startX;
      const diffY = endY - touchRef.current.startY;

      if (Math.abs(diffX) < SWIPE_THRESHOLD || Math.abs(diffY) > Math.abs(diffX)) return;

      const currentIndex = routes.indexOf(location.pathname);
      if (currentIndex === -1) return;

      if (diffX < 0 && currentIndex < routes.length - 1) {
        setSlideDir('left');
        navigate(routes[currentIndex + 1]);
      } else if (diffX > 0 && currentIndex > 0) {
        setSlideDir('right');
        navigate(routes[currentIndex - 1]);
      }
    },
    [location.pathname, navigate]
  );

  useEffect(() => {
    const main = document.querySelector('.layout-main');
    if (!main) return;
    main.addEventListener('touchstart', handleTouchStart, { passive: true });
    main.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      main.removeEventListener('touchstart', handleTouchStart);
      main.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  const slideClass = slideDir === 'left' ? 'slide-in-left' : slideDir === 'right' ? 'slide-in-right' : '';

  const inboxContext = {
    accounts: emailAccounts,
    selectedAccountId,
    setSelectedAccountId,
    addAccountOpen,
    setAddAccountOpen,
    loadAccounts: loadEmailAccounts,
    handleRemoveAccount,
  };

  return (
    <div className="layout">
      <Sidebar />
      <CreditPill />
      <MobileProfileButton />
      <div className={`layout-body ${slideClass}`}>
        {location.pathname === '/inbox' && (
          <TopBar
            accounts={emailAccounts}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
            onAddAccount={() => setAddAccountOpen(true)}
            onRemoveAccount={handleRemoveAccount}
          />
        )}
        <main className="layout-main">
          <Outlet context={inboxContext} />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
