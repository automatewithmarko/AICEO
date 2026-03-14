import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FileText, Plus, X, ChevronDown, User, DollarSign, Package, Check, Loader } from 'lucide-react';
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
import { getSalesRevenue, getSalesCalls, getSalesProducts, addManualSale, updateCallMetadata, syncSalesData, getIntegrations } from '../lib/api';
import './Pages.css';
import './Sales.css';

const REVENUE_SOURCES = [
  { id: 'whop', name: 'Whop', color: '#f97316', logo: '/whop-square-logo.jpeg', rounded: true },
  { id: 'stripe', name: 'Stripe', color: '#7c3aed', logo: '/stripe-square-logo.png', rounded: true },
  { id: 'shopify', name: 'Shopify', color: '#96bf48', logo: '/shopify-square-logo.png', rounded: true },
  { id: 'kajabi', name: 'Kajabi', color: '#2962ff', logo: '/kajabi-square-logo.png', rounded: true },
  { id: 'platform', name: 'PuerlyPersonal', color: '#e91a44', logo: '/our-square-logo.png', rounded: true },
];

const TIME_VIEWS = ['Year', 'Month', 'Week'];

const CONTENT_CASH_DATA = {
  Year: ['2021', '2022', '2023', '2024', '2025', '2026'].map((label, i) => ({
    label,
    revenue: Math.round(12000 + 9000 * Math.sin(i * 0.8) + i * 10000),
  })),
  Month: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((label, i) => ({
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

// Exported for Inbox.jsx backwards compat — will be replaced with API calls
export const MOCK_CALLS = [];

const CALL_TYPES = ['Sales call', 'Coaching call', 'Client call', 'Other'];
const SALES_STATUSES = ['Closed', 'Need to follow up', 'Not a fit'];

const RECORDER_LOGOS = {
  fireflies: '/fireflies-square-logo.png',
  fathom: '/fathom-square-logo.png',
  purelypersonal: '/our-square-logo.png',
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

  // Live data state
  const [chartData, setChartData] = useState([]);
  const [calls, setCalls] = useState([]);
  const [products, setProducts] = useState([{ id: 'all', name: 'All Products' }]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connectedSources, setConnectedSources] = useState(new Set(['platform'])); // platform always on

  // Call metadata local state (mirrors DB but allows instant UI updates)
  const [callTypes, setCallTypes] = useState({});
  const [callStatuses, setCallStatuses] = useState({});

  // Fetch revenue data when view changes
  const fetchRevenue = useCallback(async () => {
    const result = await getSalesRevenue(activeView);
    console.log('[Sales] Revenue data:', JSON.stringify(result.data?.map(d => ({ label: d.label, platform: d.platform, stripe: d.stripe }))));
    setChartData(result.data || []);
  }, [activeView]);

  // Initial load
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [revenueRes, callsRes, productsRes, integrationsRes] = await Promise.all([
        getSalesRevenue(activeView),
        getSalesCalls(),
        getSalesProducts(),
        getIntegrations(),
      ]);

      setChartData(revenueRes.data || []);
      setCalls(callsRes.calls || []);
      setProducts(productsRes.products?.length > 0 ? productsRes.products : [{ id: 'all', name: 'All Products' }]);

      // Determine which payment processors are connected
      const connected = new Set(['platform']); // always on
      const paymentProviders = ['stripe', 'whop', 'shopify', 'kajabi'];
      for (const intg of (integrationsRes.integrations || [])) {
        if (intg.is_active && paymentProviders.includes(intg.provider)) {
          connected.add(intg.provider);
        }
      }
      setConnectedSources(connected);
      setVisibleSources(connected);

      // Initialize call metadata from fetched data
      const types = {};
      const statuses = {};
      for (const c of (callsRes.calls || [])) {
        types[c.id] = c.callType || 'Other';
        if (c.status) statuses[c.id] = c.status;
      }
      setCallTypes(types);
      setCallStatuses(statuses);
      setLoading(false);
    }
    load();
  }, []);

  // Re-fetch revenue when view changes
  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

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

  const toggleSource = (sourceId) => {
    // Only allow toggling connected sources
    if (!connectedSources.has(sourceId)) return;
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

  const filteredChartData = useMemo(() => {
    if (activeProduct === 'all') return chartData;
    // When a specific product is selected, scale down (we don't have per-product breakdown)
    const idx = products.findIndex((p) => p.id === activeProduct);
    const scale = [0.35, 0.25, 0.2, 0.12, 0.08][idx - 1] || 0.2;
    return chartData.map((d) => ({
      label: d.label,
      whop: Math.round((d.whop || 0) * scale),
      stripe: Math.round((d.stripe || 0) * scale),
      shopify: Math.round((d.shopify || 0) * scale),
      kajabi: Math.round((d.kajabi || 0) * scale),
      platform: Math.round((d.platform || 0) * scale),
    }));
  }, [activeProduct, chartData, products]);

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
            const s = 24;
            const py = y - offsetY - s;
            offsetY += s + gap;
            el = (
              <g key={i}>
                <rect x={cx - s / 2} y={py} width={s} height={s} rx={4} ry={4}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                <path d={`M${cx - 5} ${py + s - 6} l4 -5 3 3 2 -2 3 4z`}
                  fill={`hsl(${piece.hue}, 30%, 72%)`} opacity={0.7} />
                <circle cx={cx - 4} cy={py + 7} r={2.5}
                  fill={`hsl(${piece.hue}, 40%, 78%)`} opacity={0.7} />
              </g>
            );
          } else if (piece.type === 'reel') {
            const w = 16;
            const h = 26;
            const py = y - offsetY - h;
            offsetY += h + gap;
            el = (
              <g key={i}>
                <rect x={cx - w / 2} y={py} width={w} height={h} rx={3} ry={3}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                <path d={`M${cx - 3} ${py + h / 2 - 4} l8 4 -8 4z`}
                  fill={`hsl(${piece.hue}, 30%, 68%)`} opacity={0.6} />
              </g>
            );
          } else if (piece.type === 'video') {
            const w = 30;
            const h = 18;
            const py = y - offsetY - h;
            offsetY += h + gap;
            el = (
              <g key={i}>
                <rect x={cx - w / 2} y={py} width={w} height={h} rx={3} ry={3}
                  fill={`hsl(${piece.hue}, 35%, 88%)`} stroke="#e5e7eb" strokeWidth={1} />
                <path d={`M${cx - 3} ${py + h / 2 - 4} l8 4 -8 4z`}
                  fill={`hsl(${piece.hue}, 30%, 68%)`} opacity={0.6} />
              </g>
            );
          } else {
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
                  {isLinkedIn ? 'in' : '\u{1D54F}'}
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
    : products.find((p) => p.id === saleProduct)?.name || '';

  const handleAddSale = async () => {
    const productName = saleProduct === '__new' ? saleNewProduct : products.find(p => p.id === saleProduct)?.name;
    if (!productName || !saleAmount) return;
    try {
      await addManualSale({
        product_name: productName,
        buyer_name: saleBuyer,
        amount: saleAmount,
      });
      closeAddSale();
      // Refresh revenue data
      fetchRevenue();
      // Refresh products
      getSalesProducts().then(res => {
        if (res.products?.length) setProducts(res.products);
      });
    } catch {
      // silently fail
    }
  };

  const handleCallTypeChange = async (callId, type) => {
    setCallTypes((prev) => ({ ...prev, [callId]: type }));
    if (type !== 'Sales call') {
      setCallStatuses((prev) => {
        const next = { ...prev };
        delete next[callId];
        return next;
      });
    }
    updateCallMetadata(callId, { call_type: type, status: type !== 'Sales call' ? null : callStatuses[callId] }).catch(() => {});
  };

  const handleStatusChange = async (callId, status) => {
    setCallStatuses((prev) => ({ ...prev, [callId]: status }));
    updateCallMetadata(callId, { call_type: callTypes[callId], status }).catch(() => {});
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncSalesData();
      // Refresh everything
      const [revenueRes, callsRes, productsRes] = await Promise.all([
        getSalesRevenue(activeView),
        getSalesCalls(),
        getSalesProducts(),
      ]);
      setChartData(revenueRes.data || []);
      setCalls(callsRes.calls || []);
      if (productsRes.products?.length) setProducts(productsRes.products);
    } catch {
      // silently fail
    } finally {
      setSyncing(false);
    }
  };

  const renderEndLabel = (source) => (props) => {
    const { index, x, y } = props;
    if (index !== filteredChartData.length - 1) return null;
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

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(typeof dateStr === 'number' && dateStr < 1e12 ? dateStr * 1000 : dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Sales</h1>
        <div className="sales-chart-section">
          <div className="skeleton-card">
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div className="skeleton" style={{ width: 80, height: 36, borderRadius: 20 }} />
              <div className="skeleton" style={{ width: 110, height: 36, borderRadius: 20 }} />
            </div>
            <div className="skeleton skeleton-chart" />
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <div className="skeleton skeleton-title" />
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card" style={{ marginBottom: 12 }}>
              <div className="skeleton-row">
                <div className="skeleton skeleton-avatar" />
                <div className="skeleton-lines">
                  <div className="skeleton skeleton-text" />
                  <div className="skeleton skeleton-text--short skeleton-text" />
                </div>
              </div>
              <div className="skeleton skeleton-text--medium skeleton-text" />
            </div>
          ))}
        </div>
      </div>
    );
  }

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
                  {REVENUE_SOURCES.filter(s => connectedSources.has(s.id)).map((s) => (
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
                  {REVENUE_SOURCES.filter(s => !connectedSources.has(s.id)).length > 0 && (
                    <span className="sales-source-divider" />
                  )}
                  {REVENUE_SOURCES.filter(s => !connectedSources.has(s.id)).map((s) => (
                    <button
                      key={s.id}
                      className="sales-source-logo-btn sales-source-logo-btn--disconnected"
                      title={`${s.name} — not connected`}
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
                    <AreaChart data={filteredChartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
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
                      {REVENUE_SOURCES.filter(s => connectedSources.has(s.id)).map((s) =>
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
                  {products.map((p) => (
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
        <div className="sales-calls-header">
          <h2 className="sales-section-title">Call Intelligence</h2>
          <button
            className="sales-add-sale-btn"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <><Loader size={14} className="settings-spinner" /> Syncing...</> : 'Sync Calls'}
          </button>
        </div>
        {calls.length === 0 && !loading ? (
          <div className="sales-empty-calls">
            <p>No calls yet. Connect Fireflies or Fathom in Settings to sync your call recordings.</p>
          </div>
        ) : (
          <div className="sales-calls-grid">
            {calls.map((call) => {
              const currentType = callTypes[call.id] || 'Other';
              const currentStatus = callStatuses[call.id];
              return (
                <div key={call.id} className="sales-call-card">
                  <div className="sales-call-left">
                    <img
                      src={RECORDER_LOGOS[call.recorder] || RECORDER_LOGOS.fireflies}
                      alt={call.recorder}
                      className="sales-call-logo"
                    />
                  </div>
                  <div className="sales-call-middle">
                    <div className="sales-call-name-row">
                      <h4 className="sales-call-name">{call.name}</h4>
                      <span className="sales-call-date">{formatDate(call.date)}</span>
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
        )}
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
                    {products.filter((p) => p.id !== 'all').map((p) => (
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
