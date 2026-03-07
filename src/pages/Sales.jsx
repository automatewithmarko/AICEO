import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Plus, X, ChevronDown, User, DollarSign, Package, Check } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import './Pages.css';
import './Sales.css';

const REVENUE_SOURCES = [
  { id: 'whop', name: 'Whop', color: '#f97316', logo: '/whop-square-logo.jpeg', rounded: true },
  { id: 'stripe', name: 'Stripe', color: '#7c3aed', logo: '/stripe-square-logo.png', rounded: true },
  { id: 'platform', name: 'PuerlyPersonal', color: '#e91a44', logo: '/our-square-logo.png', rounded: true },
];

const TIME_VIEWS = ['Year', 'Month', 'Week'];

const YEAR_LABELS = ['2020', '2021', '2022', '2023', '2024', '2025'];
const MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MOCK_DATA_BY_VIEW = {
  Year: YEAR_LABELS.map((label, i) => ({
    label,
    whop: Math.round(14000 + 9000 * Math.sin(i * 0.8) + i * 8000),
    stripe: Math.round(24000 + 14000 * Math.sin(i * 0.5 + 1) + i * 12000),
    platform: Math.round(9000 + 7000 * Math.sin(i * 0.9 + 2) + i * 5000),
  })),
  Month: MONTH_LABELS.map((label, i) => ({
    label,
    whop: Math.round(1200 + 800 * Math.sin(i * 0.7) + i * 320),
    stripe: Math.round(2000 + 1200 * Math.sin(i * 0.5 + 1) + i * 450),
    platform: Math.round(800 + 600 * Math.sin(i * 0.9 + 2) + i * 200),
  })),
  Week: WEEK_LABELS.map((label, i) => ({
    label,
    whop: Math.round(300 + 200 * Math.sin(i * 1.2) + i * 40),
    stripe: Math.round(500 + 300 * Math.sin(i * 0.8 + 1) + i * 60),
    platform: Math.round(200 + 150 * Math.sin(i * 1.5 + 2) + i * 30),
  })),
};

// Content types: 'photo' (IG square), 'reel' (vertical video - TT/IG), 'video' (horizontal - YT), 'text' (LI/X logo)
const CONTENT_CASH_DATA = {
  Year: YEAR_LABELS.map((label, i) => ({
    label,
    revenue: Math.round(12000 + 9000 * Math.sin(i * 0.8) + i * 10000),
  })),
  Month: MONTH_LABELS.map((label, i) => ({
    label,
    revenue: Math.round(1500 + 1100 * Math.sin(i * 0.5 + 1) + i * 500),
  })),
  Week: [
    { label: 'Mon', revenue: 340, pieces: [{ platform: 'instagram', type: 'photo', hue: 320 }, { platform: 'tiktok', type: 'reel', hue: 180 }] },
    { label: 'Tue', revenue: 520, pieces: [{ platform: 'youtube', type: 'video', hue: 40 }] },
    { label: 'Wed', revenue: 280, pieces: [{ platform: 'instagram', type: 'reel', hue: 260 }, { platform: 'linkedin', type: 'text' }, { platform: 'tiktok', type: 'reel', hue: 150 }] },
    { label: 'Thu', revenue: 150, pieces: [] },
    { label: 'Fri', revenue: 680, pieces: [{ platform: 'tiktok', type: 'reel', hue: 200 }, { platform: 'instagram', type: 'photo', hue: 90 }] },
    { label: 'Sat', revenue: 420, pieces: [{ platform: 'youtube', type: 'video', hue: 280 }] },
    { label: 'Sun', revenue: 90, pieces: [] },
  ],
};

const MOCK_PRODUCTS = [
  { id: 'all', name: 'All Products' },
  { id: 'coaching', name: 'Coaching Program' },
  { id: 'course', name: 'Online Course' },
  { id: 'consulting', name: '1:1 Consulting' },
  { id: 'downloads', name: 'Digital Downloads' },
  { id: 'membership', name: 'Membership' },
];

const CALL_TYPES = ['Sales call', 'Coaching call', 'Client call', 'Other'];
const SALES_STATUSES = ['Closed', 'Need to follow up', 'Not a fit'];

export const MOCK_CALLS = [
  {
    id: 1,
    name: 'Call with Alex Thompson',
    date: 'Mar 5, 2026',
    summary: 'Discussed coaching program pricing and onboarding timeline. Prospect is comparing with two other providers and needs a proposal by Friday.',
    recorder: 'fireflies',
    callType: 'Sales call',
    status: 'Need to follow up',
  },
  {
    id: 2,
    name: 'Call with Sarah Chen',
    date: 'Mar 4, 2026',
    summary: 'Reviewed progress on Q1 goals and adjusted content strategy. Client is happy with results so far and wants to extend engagement.',
    recorder: 'fireflies',
    callType: 'Coaching call',
    status: null,
  },
  {
    id: 3,
    name: 'Call with Mike Johnson',
    date: 'Mar 3, 2026',
    summary: 'Initial discovery call about digital downloads package. Budget approved, ready to move forward next week with onboarding.',
    recorder: 'fireflies',
    callType: 'Sales call',
    status: 'Closed',
  },
  {
    id: 4,
    name: 'Call with Emily Davis',
    date: 'Feb 28, 2026',
    summary: 'Explored membership tier options and custom branding features. Needs internal approval before committing to annual plan.',
    recorder: 'fireflies',
    callType: 'Sales call',
    status: 'Not a fit',
  },
  {
    id: 5,
    name: 'Call with Jordan Lee',
    date: 'Feb 25, 2026',
    summary: 'Quarterly check-in on consulting engagement. Discussed expanding scope to include marketing automation and lead gen strategy.',
    recorder: 'fireflies',
    callType: 'Client call',
    status: null,
  },
];

const RECORDER_LOGOS = {
  fireflies: '/fireflies-square-logo.png',
  fathom: '/fathom-square-logo.png',
};

export default function Sales() {
  const [activeTab, setActiveTab] = useState('revenue');
  const [visibleSources, setVisibleSources] = useState(new Set(['whop', 'stripe', 'platform']));
  const [activeProduct, setActiveProduct] = useState('all');
  const [activeView, setActiveView] = useState('Month');
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const [saleProduct, setSaleProduct] = useState('');
  const [saleNewProduct, setSaleNewProduct] = useState('');
  const [saleBuyer, setSaleBuyer] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!productDropdownOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [productDropdownOpen]);
  const [callTypes, setCallTypes] = useState(
    () => Object.fromEntries(MOCK_CALLS.map((c) => [c.id, c.callType]))
  );
  const [callStatuses, setCallStatuses] = useState(
    () => Object.fromEntries(MOCK_CALLS.filter((c) => c.status).map((c) => [c.id, c.status]))
  );

  const toggleSource = (sourceId) => {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        if (next.size > 1) next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const baseData = MOCK_DATA_BY_VIEW[activeView];

  const chartData = useMemo(() => {
    if (activeProduct === 'all') return baseData;
    const idx = MOCK_PRODUCTS.findIndex((p) => p.id === activeProduct);
    const scale = [0.35, 0.25, 0.2, 0.12, 0.08][idx - 1] || 0.2;
    return baseData.map((d) => ({
      label: d.label,
      whop: Math.round(d.whop * scale),
      stripe: Math.round(d.stripe * scale),
      platform: Math.round(d.platform * scale),
    }));
  }, [activeProduct, baseData]);

  const contentCashData = CONTENT_CASH_DATA[activeView];

  const renderContentPieceLabels = (props) => {
    const { x, y, width, index } = props;
    if (activeView !== 'Week') return null;
    const pieces = CONTENT_CASH_DATA.Week[index]?.pieces || [];
    if (pieces.length === 0) return null;
    const gap = 6;
    const cx = x + width / 2;
    let offsetY = 8;

    return (
      <g>
        {pieces.map((piece, i) => {
          let el;
          if (piece.type === 'photo') {
            // Square photo (Instagram post)
            const s = 24;
            const py = y - offsetY - s;
            offsetY += s + gap;
            el = (
              <g key={i}>
                <rect x={cx - s / 2} y={py} width={s} height={s} rx={4} ry={4}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                {/* mini landscape icon */}
                <path d={`M${cx - 5} ${py + s - 6} l4 -5 3 3 2 -2 3 4z`}
                  fill={`hsl(${piece.hue}, 30%, 72%)`} opacity={0.7} />
                <circle cx={cx - 4} cy={py + 7} r={2.5}
                  fill={`hsl(${piece.hue}, 40%, 78%)`} opacity={0.7} />
              </g>
            );
          } else if (piece.type === 'reel') {
            // Vertical video (TikTok / IG Reel)
            const w = 16;
            const h = 26;
            const py = y - offsetY - h;
            offsetY += h + gap;
            el = (
              <g key={i}>
                <rect x={cx - w / 2} y={py} width={w} height={h} rx={3} ry={3}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                {/* play triangle */}
                <path d={`M${cx - 3} ${py + h / 2 - 4} l8 4 -8 4z`}
                  fill={`hsl(${piece.hue}, 30%, 68%)`} opacity={0.6} />
              </g>
            );
          } else if (piece.type === 'video') {
            // Horizontal video (YouTube)
            const w = 30;
            const h = 18;
            const py = y - offsetY - h;
            offsetY += h + gap;
            el = (
              <g key={i}>
                <rect x={cx - w / 2} y={py} width={w} height={h} rx={3} ry={3}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                {/* play triangle */}
                <path d={`M${cx - 3} ${py + h / 2 - 4} l8 4 -8 4z`}
                  fill={`hsl(${piece.hue}, 30%, 68%)`} opacity={0.6} />
              </g>
            );
          } else {
            // Text-based (LinkedIn / X) — show platform logo circle
            const s = 22;
            const py = y - offsetY - s;
            offsetY += s + gap;
            const isLinkedIn = piece.platform === 'linkedin';
            el = (
              <g key={i}>
                <rect x={cx - s / 2} y={py} width={s} height={s} rx={5} ry={5}
                  fill={isLinkedIn ? '#0A66C2' : '#14171A'} />
                <text x={cx} y={py + s / 2} textAnchor="middle" dominantBaseline="central"
                  fill="#fff" fontSize={isLinkedIn ? 8 : 9} fontWeight={800}>
                  {isLinkedIn ? 'in' : '𝕏'}
                </text>
              </g>
            );
          }
          return el;
        })}
      </g>
    );
  };

  const closeAddSale = () => {
    setAddSaleOpen(false);
    setSaleProduct('');
    setSaleNewProduct('');
    setSaleBuyer('');
    setSaleAmount('');
    setProductDropdownOpen(false);
  };

  const selectProduct = (id) => {
    setSaleProduct(id);
    setProductDropdownOpen(false);
    if (id !== '__new') setSaleNewProduct('');
  };

  const selectedProductName = saleProduct === '__new'
    ? 'New product'
    : MOCK_PRODUCTS.find((p) => p.id === saleProduct)?.name || '';

  const handleAddSale = () => {
    // In production this would save to backend
    closeAddSale();
  };

  const handleCallTypeChange = (callId, type) => {
    setCallTypes((prev) => ({ ...prev, [callId]: type }));
    if (type !== 'Sales call') {
      setCallStatuses((prev) => {
        const next = { ...prev };
        delete next[callId];
        return next;
      });
    }
  };

  const handleStatusChange = (callId, status) => {
    setCallStatuses((prev) => ({ ...prev, [callId]: status }));
  };

  const renderEndLabel = (source) => (props) => {
    const { index, x, y } = props;
    if (index !== chartData.length - 1) return null;
    const size = 22;
    const r = size / 2;
    return (
      <g>
        {source.rounded ? (
          <>
            <defs>
              <clipPath id={`clip-${source.id}`}>
                <rect x={x - r} y={y - r} width={size} height={size} rx={5} ry={5} />
              </clipPath>
            </defs>
            <image
              href={source.logo}
              x={x - r}
              y={y - r}
              width={size}
              height={size}
              clipPath={`url(#clip-${source.id})`}
              preserveAspectRatio="xMidYMid slice"
            />
          </>
        ) : (
          <image
            href={source.logo}
            x={x - r}
            y={y - r}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </g>
    );
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Sales</h1>

      {/* Earnings Chart Section */}
      <div className="sales-chart-section">
        <div className="sales-chart-column">
          {/* Browser-style tabs */}
          <div className="sales-tabs">
            <button
              className={`sales-tab ${activeTab === 'revenue' ? 'sales-tab--active' : ''}`}
              onClick={() => setActiveTab('revenue')}
            >
              Revenue
            </button>
            <button
              className={`sales-tab ${activeTab === 'content-cash' ? 'sales-tab--active' : ''}`}
              onClick={() => setActiveTab('content-cash')}
            >
              Content to Cash
            </button>
          </div>

          <div className="sales-chart-area">
            <div className="sales-chart-header">
              {activeTab === 'revenue' ? (
                <div className="sales-source-filters">
                  {REVENUE_SOURCES.map((s) => (
                    <button
                      key={s.id}
                      className={`sales-source-logo-btn ${visibleSources.has(s.id) ? 'sales-source-logo-btn--active' : ''}`}
                      onClick={() => toggleSource(s.id)}
                    >
                      <img
                        src={s.logo}
                        alt={s.name}
                        className={`sales-source-logo-img ${s.rounded ? 'sales-source-logo-img--rounded' : ''}`}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sales-cc-legend">
                  <span className="sales-cc-legend-item">
                    <span className="sales-cc-legend-dot" style={{ background: '#e91a44' }} />
                    Revenue
                  </span>
                </div>
              )}
              <div className="sales-chart-controls">
                <div className="sales-view-pills">
                  {TIME_VIEWS.map((v) => (
                    <button
                      key={v}
                      className={`sales-view-pill ${activeView === v ? 'sales-view-pill--active' : ''}`}
                      onClick={() => setActiveView(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {activeTab === 'revenue' && (
                  <button className="sales-add-sale-btn" onClick={() => setAddSaleOpen(true)}>
                    <Plus size={14} />
                    Add a sale
                  </button>
                )}
              </div>
            </div>

            <div className="sales-chart-body">
              <div className="sales-chart-graph">
                {activeTab === 'revenue' ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                      <defs>
                        {REVENUE_SOURCES.map((s) => (
                          <linearGradient key={s.id} id={`gradient-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={s.color} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '10px',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          fontSize: '13px',
                        }}
                        formatter={(value) => [`$${value.toLocaleString()}`]}
                      />
                      {REVENUE_SOURCES.map((s) =>
                        visibleSources.has(s.id) ? (
                          <Area
                            key={s.id}
                            type="linear"
                            dataKey={s.id}
                            name={s.name}
                            stroke={s.color}
                            strokeWidth={2.5}
                            fill={`url(#gradient-${s.id})`}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2 }}
                            label={renderEndLabel(s)}
                          />
                        ) : null
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={activeView === 'Week' ? 380 : 320}>
                    <BarChart
                      data={contentCashData}
                      margin={{ top: activeView === 'Week' ? 80 : 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '10px',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          fontSize: '13px',
                        }}
                        formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']}
                      />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="#e91a44"
                        radius={[6, 6, 0, 0]}
                        barSize={activeView === 'Week' ? 32 : undefined}
                        label={activeView === 'Week' ? renderContentPieceLabels : false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {activeTab === 'revenue' && (
                <div className="sales-products-sidebar">
                  <h3 className="sales-products-title">Products</h3>
                  {MOCK_PRODUCTS.map((p) => (
                    <button
                      key={p.id}
                      className={`sales-product-item ${activeProduct === p.id ? 'sales-product-item--active' : ''}`}
                      onClick={() => setActiveProduct(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Call Intelligence Section */}
      <div className="sales-calls-section">
        <h2 className="sales-section-title">Call Intelligence</h2>
        <div className="sales-calls-grid">
          {MOCK_CALLS.map((call) => {
            const currentType = callTypes[call.id];
            const currentStatus = callStatuses[call.id];
            return (
              <div key={call.id} className="sales-call-card">
                <div className="sales-call-left">
                  <img
                    src={RECORDER_LOGOS[call.recorder]}
                    alt={call.recorder}
                    className="sales-call-logo"
                  />
                </div>
                <div className="sales-call-middle">
                  <div className="sales-call-name-row">
                    <h4 className="sales-call-name">{call.name}</h4>
                    <span className="sales-call-date">{call.date}</span>
                  </div>
                  <p className="sales-call-summary">{call.summary}</p>
                  <div className="sales-call-tag-row">
                    <span className="sales-call-row-label">Call Type</span>
                    <div className="sales-pill-group">
                      {CALL_TYPES.map((type) => (
                        <button
                          key={type}
                          className={`sales-pill-option ${currentType === type ? 'sales-pill-option--active' : ''}`}
                          onClick={() => handleCallTypeChange(call.id, type)}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  {currentType === 'Sales call' && (
                    <div className="sales-call-tag-row">
                      <span className="sales-call-row-label">After Call Status</span>
                      <div className="sales-pill-group">
                        {SALES_STATUSES.map((status) => {
                          const slug = status === 'Closed' ? 'closed' : status === 'Need to follow up' ? 'follow-up' : 'not-fit';
                          return (
                            <button
                              key={status}
                              className={`sales-pill-option ${currentStatus === status ? `sales-pill-option--active sales-pill-option--${slug}` : ''}`}
                              onClick={() => handleStatusChange(call.id, status)}
                            >
                              {status}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="sales-call-right">
                  {currentType === 'Sales call' && (
                    <button className="sales-action-btn">Analyze objections</button>
                  )}
                  <button className="sales-action-btn">Write email follow up</button>
                  <button className="sales-action-btn">
                    <FileText size={14} />
                    Add to context
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Sale Modal */}
      {addSaleOpen && (
        <div className="sales-modal-overlay" onClick={closeAddSale}>
          <div className="sales-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sales-modal-close" onClick={closeAddSale}>
              <X size={18} />
            </button>

            <div className="sales-modal-header">
              <div className="sales-modal-logo">
                <img src="/our-square-logo.png" alt="PuerlyPersonal" />
              </div>
              <div>
                <h3 className="sales-modal-title">Log a New Sale</h3>
                <p className="sales-modal-subtitle">Record a sale manually to your dashboard</p>
              </div>
            </div>

            <div className="sales-modal-divider" />

            {/* Custom Product Dropdown */}
            <div className="sales-modal-field">
              <label className="sales-modal-label">
                <Package size={13} />
                Product
              </label>
              <div className="sales-dropdown" ref={dropdownRef}>
                <button
                  className={`sales-dropdown-trigger ${productDropdownOpen ? 'sales-dropdown-trigger--open' : ''}`}
                  onClick={() => setProductDropdownOpen(!productDropdownOpen)}
                >
                  <span className={saleProduct ? 'sales-dropdown-value' : 'sales-dropdown-placeholder'}>
                    {selectedProductName || 'Select a product'}
                  </span>
                  <ChevronDown size={16} className={`sales-dropdown-chevron ${productDropdownOpen ? 'sales-dropdown-chevron--open' : ''}`} />
                </button>
                {productDropdownOpen && (
                  <div className="sales-dropdown-menu">
                    {MOCK_PRODUCTS.filter((p) => p.id !== 'all').map((p) => (
                      <button
                        key={p.id}
                        className={`sales-dropdown-item ${saleProduct === p.id ? 'sales-dropdown-item--selected' : ''}`}
                        onClick={() => selectProduct(p.id)}
                      >
                        <span>{p.name}</span>
                        {saleProduct === p.id && <Check size={14} className="sales-dropdown-check" />}
                      </button>
                    ))}
                    <div className="sales-dropdown-divider" />
                    <button
                      className={`sales-dropdown-item sales-dropdown-item--add ${saleProduct === '__new' ? 'sales-dropdown-item--selected' : ''}`}
                      onClick={() => selectProduct('__new')}
                    >
                      <Plus size={14} />
                      <span>Add another product</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {saleProduct === '__new' && (
              <div className="sales-modal-field sales-modal-field--indent">
                <label className="sales-modal-label">
                  <Package size={13} />
                  New product name
                </label>
                <input
                  type="text"
                  className="sales-modal-input"
                  placeholder="e.g. Premium Coaching Package"
                  value={saleNewProduct}
                  onChange={(e) => setSaleNewProduct(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="sales-modal-field">
              <label className="sales-modal-label">
                <User size={13} />
                Sold to
              </label>
              <input
                type="text"
                className="sales-modal-input"
                placeholder="Customer name"
                value={saleBuyer}
                onChange={(e) => setSaleBuyer(e.target.value)}
              />
            </div>

            <div className="sales-modal-field">
              <label className="sales-modal-label">
                <DollarSign size={13} />
                Amount
              </label>
              <div className="sales-modal-amount-wrap">
                <span className="sales-modal-amount-prefix">$</span>
                <input
                  type="text"
                  className="sales-modal-input sales-modal-input--amount"
                  placeholder="0.00"
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                />
              </div>
            </div>

            <button
              className="sales-modal-submit"
              disabled={!saleProduct || (saleProduct === '__new' && !saleNewProduct.trim()) || !saleBuyer.trim() || !saleAmount.trim()}
              onClick={handleAddSale}
            >
              Log Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
