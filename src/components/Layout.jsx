import { useRef, useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navItems } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Search, User, ChevronDown, Check } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomBar from './BottomBar';
import CreditPill from './CreditPill';
import MobileProfileButton from './MobileProfileButton';
import './Layout.css';

const MOCK_ACCOUNTS = [
  { id: 1, name: 'Marko Filipovic', email: 'marko@puerlypersonal.com', plan: 'Growth' },
  { id: 2, name: 'Marko - Agency', email: 'marko@agency.io', plan: 'Pro' },
  { id: 3, name: 'Test Workspace', email: 'test@workspace.com', plan: 'Starter' },
];

function TopBar() {
  const location = useLocation();
  const isInbox = location.pathname === '/inbox';
  const [searchValue, setSearchValue] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeAccount, setActiveAccount] = useState(MOCK_ACCOUNTS[0]);
  const dropdownRef = useRef(null);

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
            <User size={14} />
          </div>
          <ChevronDown size={12} className={`topbar-profile-chevron ${accountOpen ? 'topbar-profile-chevron--open' : ''}`} />
        </button>
        {accountOpen && (
          <div className="topbar-account-menu">
            <div className="topbar-account-header">Switch Account</div>
            {MOCK_ACCOUNTS.map((account) => (
              <button
                key={account.id}
                className={`topbar-account-item ${activeAccount.id === account.id ? 'topbar-account-item--active' : ''}`}
                onClick={() => { setActiveAccount(account); setAccountOpen(false); }}
              >
                <div className="topbar-account-avatar">
                  <User size={13} />
                </div>
                <div className="topbar-account-info">
                  <span className="topbar-account-name">{account.name}</span>
                  <span className="topbar-account-email">{account.email}</span>
                </div>
                {activeAccount.id === account.id && <Check size={14} className="topbar-account-check" />}
              </button>
            ))}
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

  return (
    <div className="layout">
      <Sidebar />
      <CreditPill />
      <MobileProfileButton />
      <div className={`layout-body ${slideClass}`}>
        {location.pathname === '/inbox' && <TopBar />}
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
