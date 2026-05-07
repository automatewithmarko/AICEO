import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ChevronUp,
  ChevronDown,
  LogOut,
  Settings,
  User,
  CreditCard,
} from 'lucide-react';
import './Sidebar.css';

function ImgIcon({ src, alt, size = 20 }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

function AiCeoIcon({ size = 20 }) {
  return <ImgIcon src="/favicon.png" alt="AI CEO" size={size} />;
}
function DashboardIcon({ size = 20 }) {
  return <ImgIcon src="/icon-dashboard.png" alt="Dashboard" size={size} />;
}
function ContentIcon({ size = 20 }) {
  return <ImgIcon src="/icon-content.png" alt="Content" size={size} />;
}
function CreateContentIcon({ size = 20 }) {
  return <ImgIcon src="/icon-create-content.png" alt="Create Content" size={size * 1.7} />;
}
function OutlierDetectorIcon({ size = 20 }) {
  return <ImgIcon src="/icon-outlier-detector.png" alt="Outlier Detector" size={size} />;
}
function MarketingIcon({ size = 20 }) {
  return <ImgIcon src="/icon-marketing.png" alt="Marketing" size={size} />;
}
function SalesIcon({ size = 20 }) {
  return <ImgIcon src="/icon-sales.png" alt="Sales" size={size} />;
}
function InboxIcon({ size = 20 }) {
  return <ImgIcon src="/icon-inbox.png" alt="Inbox" size={size} />;
}
function ProductsIcon({ size = 20 }) {
  return <ImgIcon src="/icon-products.png" alt="Products" size={size} />;
}
function CrmIcon({ size = 20 }) {
  return <ImgIcon src="/icon-crm.png" alt="CRM" size={size} />;
}
function CallRecordingIcon({ size = 20 }) {
  return <ImgIcon src="/icon-call-recording.png" alt="Call Recording" size={size} />;
}
function ContentCalendarIcon({ size = 20 }) {
  return <ImgIcon src="/icon-content-calendar.png" alt="Content Calendar" size={size} />;
}
function AccountingIcon({ size = 20 }) {
  return <ImgIcon src="/icon-accounting.png" alt="Accounting" size={size} />;
}
function PressPlacementIcon({ size = 20 }) {
  return <ImgIcon src="/icon-press-placement.png" alt="Press Placement" size={size} />;
}
function ReviewsIcon({ size = 20 }) {
  return <ImgIcon src="/icon-reviews.png" alt="Reviews" size={size * 1.4} />;
}
function CreditsIcon({ size = 16 }) {
  return <ImgIcon src="/icon-credits.png" alt="Credits" size={size} />;
}

// `tab` is the permission key checked against the user's workspace
// permissions. Items without `tab` are unconditionally visible
// (coming-soon teasers). Children inherit the parent's tab key.
const navItems = [
  { to: '/ai-ceo', label: 'AI CEO', icon: AiCeoIcon, tab: 'ai-ceo' },
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, tab: 'dashboard' },
  {
    label: 'Content',
    icon: ContentIcon,
    tab: 'content',
    children: [
      { to: '/content', label: 'Create Content', icon: CreateContentIcon },
      { to: '/outlier-detector', label: 'Outlier Detector', icon: OutlierDetectorIcon },
      { to: '/content-calendar', label: 'Content Calendar', icon: ContentCalendarIcon },
    ],
  },
  { to: '/marketing', label: 'Marketing AI', icon: MarketingIcon, tab: 'marketing' },
  {
    label: 'Sales',
    icon: SalesIcon,
    tab: 'sales',
    children: [
      { to: '/sales', label: 'Sales Overview', icon: SalesIcon },
      { to: '/products', label: 'Products', icon: ProductsIcon },
      { to: '/meetings', label: 'Call Recording', icon: ({ size }) => <CallRecordingIcon size={size * 1.4} /> },
    ],
  },
  { to: '/inbox', label: 'Inbox', icon: InboxIcon, tab: 'inbox' },
  { to: '/forms', label: 'Forms', icon: ({ size }) => <ImgIcon src="/icon-forms.svg" alt="Forms" size={size} />, tab: 'forms' },
  { to: '/crm', label: 'CRM', icon: CrmIcon, tab: 'crm' },
  { label: 'Accounting', icon: AccountingIcon, comingSoon: true },
  { label: 'Press Placement', icon: PressPlacementIcon, comingSoon: true },
  { label: 'Reviews', icon: ReviewsIcon, comingSoon: true },
];

export default function Sidebar() {
  const { user, credits, logout, can, workspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({});

  const toggleDropdown = (label) => {
    setOpenDropdowns((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isDropdownActive = (item) => {
    return item.children?.some((child) => location.pathname === child.to);
  };

  // Filter nav items by the current workspace's permissions. Owner sees
  // everything; members only see tabs whose `tab` key is in their
  // permission set. Coming-soon teasers (no `tab`) always render.
  const visibleNavItems = navItems.filter((item) => {
    if (!item.tab) return true;
    return can(item.tab);
  });

  const workspaces = workspace?.workspaces || [];
  const showWorkspaceSwitcher = workspaces.length > 1;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="PuerlyPersonal" />
        </div>

        <div className="sidebar-credits">
          <CreditsIcon size={16} />
          <span>{credits.toLocaleString()} credits</span>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) =>
            item.children ? (
              <div key={item.label} className="sidebar-dropdown">
                <div className={`sidebar-link sidebar-link--dropdown ${isDropdownActive(item) ? 'sidebar-link--active' : ''}`}>
                  <NavLink to={item.children[0].to} className="sidebar-dropdown-link">
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </NavLink>
                  <button
                    className="sidebar-dropdown-toggle"
                    onClick={() => toggleDropdown(item.label)}
                  >
                    <ChevronDown
                      size={14}
                      className={`sidebar-dropdown-chevron ${openDropdowns[item.label] ? 'sidebar-dropdown-chevron--open' : ''}`}
                    />
                  </button>
                </div>
                {openDropdowns[item.label] && (
                  <div className="sidebar-dropdown-items">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          `sidebar-link sidebar-link--child ${isActive ? 'sidebar-link--active' : ''}`
                        }
                      >
                        <child.icon size={16} />
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : item.comingSoon ? (
              <div
                key={item.label}
                className="sidebar-link sidebar-link--disabled"
                aria-disabled="true"
                title="Coming soon"
              >
                <item.icon size={20} />
                <span>{item.label}</span>
                <span className="sidebar-soon-badge">Coming soon</span>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`
                }
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            )
          )}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div
          className={`profile-dropdown ${profileOpen ? 'profile-dropdown--open' : ''}`}
        >
          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-info">
                <div className="profile-avatar">
                  <User size={18} />
                </div>
                <div className="profile-details">
                  <span className="profile-name">{user?.name}</span>
                  <span className="profile-email">{user?.email}</span>
                </div>
              </div>
              {showWorkspaceSwitcher && (
                <>
                  <div className="profile-divider" />
                  <div className="profile-menu-section-label">Workspace</div>
                  <button
                    className="profile-menu-item"
                    onClick={() => setWorkspaceMenuOpen((v) => !v)}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {workspaces.find((w) => w.ownerId === workspace?.activeOwnerId)?.label || 'Workspace'}
                      {' '}
                      <span style={{ opacity: 0.6, fontSize: 11 }}>
                        ({workspace?.role})
                      </span>
                    </span>
                    {workspaceMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {workspaceMenuOpen && workspaces.map((w) => (
                    <button
                      key={w.ownerId}
                      className={`profile-menu-item ${w.ownerId === workspace?.activeOwnerId ? 'profile-menu-item--active' : ''}`}
                      style={{ paddingLeft: 28, fontSize: 12 }}
                      onClick={async () => {
                        setWorkspaceMenuOpen(false);
                        setProfileOpen(false);
                        await switchWorkspace(w.ownerId);
                        navigate('/dashboard');
                      }}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>
                        {w.label}
                        <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 11 }}>· {w.role}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              <div className="profile-divider" />
              {workspace?.isOwner && (
                <button className="profile-menu-item" onClick={() => { navigate('/billing'); setProfileOpen(false); }}>
                  <CreditCard size={16} />
                  <span>Billing & Credits</span>
                </button>
              )}
              {(workspace?.isOwner || workspace?.canManageMembers) && (
                <button className="profile-menu-item" onClick={() => { navigate('/settings'); setProfileOpen(false); }}>
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
              )}
              <button className="profile-menu-item profile-menu-item--danger" onClick={logout}>
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
          <button
            className="profile-trigger"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <div className="profile-avatar-sm">
              <User size={16} />
            </div>
            <div className="profile-trigger-info">
              <span className="profile-trigger-name">{user?.name}</span>
              <span className="profile-trigger-plan">{user?.plan} Plan</span>
            </div>
            <ChevronUp
              size={16}
              className={`profile-chevron ${profileOpen ? 'profile-chevron--open' : ''}`}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}

export { navItems };
