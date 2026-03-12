import { useState, useEffect, useRef } from 'react';
import { Plus, X, Upload, Trash2, ChevronDown, Check, Link2, Copy, CheckCheck, RefreshCw, Loader2, ExternalLink, ShoppingBag } from 'lucide-react';
import { getProducts, getImportedProducts, createProduct, updateProduct as updateProductApi, deleteProduct as deleteProductApi, regeneratePaymentLink } from '../lib/api';
import './Pages.css';
import './Products.css';

const PRODUCT_TYPES = ['Coaching', 'Course', 'SAAS', 'LeadMagnet', 'Community'];
const PRICE_MODES = ['One-time', 'Monthly'];

export const INITIAL_PRODUCTS = [];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [importedProducts, setImportedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [], paymentProcessor: 'none' });
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(null);
  const fileInputRefs = useRef({});
  const [connectModal, setConnectModal] = useState(null); // 'kajabi' | 'shopify' | null
  const [connectApiKey, setConnectApiKey] = useState('');
  const [connectSaving, setConnectSaving] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const [{ products: data }, { products: imported }] = await Promise.all([
        getProducts(),
        getImportedProducts(),
      ]);
      setProducts(data.map(p => ({
        ...p,
        price: (p.price_cents / 100).toString(),
        priceMode: p.price_mode === 'monthly' ? 'Monthly' : 'One-time',
        photos: p.photos || [],
      })));
      setImportedProducts(imported);
    } catch (err) {
      console.error('Failed to load products:', err);
    }
    setLoading(false);
  }

  const handlePhotoUpload = (productId, e) => {
    const files = Array.from(e.target.files);
    if (productId === 'new') {
      const remaining = 3 - newProduct.photos.length;
      const toAdd = files.slice(0, remaining).map((file) => ({
        id: `photo-${Date.now()}-${Math.random()}`,
        url: URL.createObjectURL(file),
        file,
      }));
      setNewProduct((prev) => ({ ...prev, photos: [...prev.photos, ...toAdd] }));
    } else {
      setProducts((prev) => prev.map((p) => {
        if (p.id !== productId) return p;
        const remaining = 3 - p.photos.length;
        const toAdd = files.slice(0, remaining).map((file) => ({
          id: `photo-${Date.now()}-${Math.random()}`,
          url: URL.createObjectURL(file),
          file,
        }));
        return { ...p, photos: [...p.photos, ...toAdd] };
      }));
    }
    e.target.value = '';
  };

  const removePhoto = (productId, photoId) => {
    if (productId === 'new') {
      setNewProduct((prev) => {
        const photo = prev.photos.find((p) => p.id === photoId);
        if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url);
        return { ...prev, photos: prev.photos.filter((p) => p.id !== photoId) };
      });
    } else {
      setProducts((prev) => prev.map((p) => {
        if (p.id !== productId) return p;
        const photo = p.photos.find((ph) => ph.id === photoId);
        if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url);
        return { ...p, photos: p.photos.filter((ph) => ph.id !== photoId) };
      }));
    }
  };

  const updateProduct = (id, field, value) => {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleDelete = async (id) => {
    try {
      await deleteProductApi(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async (product) => {
    setSaving(true);
    setError('');
    try {
      const { product: updated } = await updateProductApi(product.id, {
        name: product.name,
        description: product.description,
        type: product.type,
      });
      setProducts((prev) => prev.map((p) => p.id === product.id ? {
        ...p,
        ...updated,
        price: (updated.price_cents / 100).toString(),
        priceMode: updated.price_mode === 'monthly' ? 'Monthly' : 'One-time',
        photos: updated.photos || p.photos,
      } : p));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const addProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.type || !newProduct.price.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { product } = await createProduct({
        name: newProduct.name,
        description: newProduct.description,
        type: newProduct.type,
        price: newProduct.price,
        priceMode: newProduct.priceMode,
        paymentProcessor: newProduct.paymentProcessor,
      });
      setProducts((prev) => [{
        ...product,
        price: (product.price_cents / 100).toString(),
        priceMode: product.price_mode === 'monthly' ? 'Monthly' : 'One-time',
        photos: product.photos || [],
      }, ...prev]);
      setNewProduct({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [], paymentProcessor: 'none' });
      setAddingNew(false);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const copyLink = (id, url) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerateLink = async (id) => {
    setRegeneratingId(id);
    try {
      const { product } = await regeneratePaymentLink(id);
      setProducts((prev) => prev.map((p) => p.id === id ? {
        ...p,
        payment_link_url: product.payment_link_url,
        stripe_payment_link_id: product.stripe_payment_link_id,
      } : p));
    } catch (err) {
      setError(err.message);
    }
    setRegeneratingId(null);
  };

  const renderPhotoSection = (productId, photos) => {
    const maxPhotos = 3;
    return (
      <div className="products-photos">
        {photos.map((photo) => (
          <div key={photo.id} className="products-photo-item">
            <img src={photo.url} alt="" />
            <button className="products-photo-remove" onClick={() => removePhoto(productId, photo.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <button
            className="products-photo-add"
            onClick={() => fileInputRefs.current[productId]?.click()}
          >
            <Upload size={16} />
            <span>Add photo</span>
            <input
              ref={(el) => (fileInputRefs.current[productId] = el)}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePhotoUpload(productId, e)}
              style={{ display: 'none' }}
            />
          </button>
        )}
      </div>
    );
  };

  const renderTypeDropdown = (productId, currentType, onChange) => {
    const isOpen = typeDropdownOpen === productId;
    return (
      <div className="products-type-dropdown">
        <button
          className={`products-type-trigger ${isOpen ? 'products-type-trigger--open' : ''}`}
          onClick={() => setTypeDropdownOpen(isOpen ? null : productId)}
        >
          <span className={currentType ? 'products-type-value' : 'products-type-placeholder'}>
            {currentType || 'Select type'}
          </span>
          <ChevronDown size={14} className={`products-type-chevron ${isOpen ? 'products-type-chevron--open' : ''}`} />
        </button>
        {isOpen && (
          <div className="products-type-menu">
            {PRODUCT_TYPES.map((type) => (
              <button
                key={type}
                className={`products-type-option ${currentType === type ? 'products-type-option--selected' : ''}`}
                onClick={() => { onChange(type); setTypeDropdownOpen(null); }}
              >
                <span>{type}</span>
                {currentType === type && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPriceMode = (productId, currentMode, onChange) => {
    return (
      <div className="products-price-mode">
        {PRICE_MODES.map((mode) => (
          <button
            key={mode}
            className={`products-price-mode-btn ${currentMode === mode ? 'products-price-mode-btn--active' : ''}`}
            onClick={() => onChange(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
    );
  };

  const renderPaymentLink = (product) => {
    if (!product.payment_link_url) return null;
    return (
      <div className="products-payment-link">
        <div className="products-payment-link-header">
          <Link2 size={13} />
          <span>Payment Link</span>
        </div>
        <div className="products-payment-link-row">
          <span className="products-payment-link-url">{product.payment_link_url}</span>
          <button
            className={`products-copy-btn ${copiedId === product.id ? 'products-copy-btn--copied' : ''}`}
            onClick={() => copyLink(product.id, product.payment_link_url)}
            title="Copy link"
          >
            {copiedId === product.id ? <CheckCheck size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="products-regen-btn"
            onClick={() => handleRegenerateLink(product.id)}
            disabled={regeneratingId === product.id}
            title="Regenerate link"
          >
            {regeneratingId === product.id ? <Loader2 size={14} className="products-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="products-header">
          <h1 className="page-title">Products</h1>
        </div>
        <div className="products-grid">
          {[1, 2].map(i => (
            <div key={i} className="products-card">
              <div className="skeleton skeleton-text" style={{ width: '60%', height: 18, marginBottom: 16 }} />
              <div className="skeleton skeleton-text" style={{ width: '100%', height: 14, marginBottom: 8 }} />
              <div className="skeleton skeleton-text" style={{ width: '80%', height: 14, marginBottom: 16 }} />
              <div className="skeleton skeleton-text--short" style={{ width: '30%', height: 24, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: '100%', height: 36, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '100%', height: 40 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="products-header">
        <div className="products-header-left">
          <h1 className="page-title">Products</h1>
          <div className="products-connect-buttons">
            <button className="products-connect-btn" onClick={() => { setConnectModal('kajabi'); setConnectApiKey(''); }}>
              <span>Connect with</span>
              <img src="/icon-kajabi-text.png" alt="Kajabi" />
            </button>
            <button className="products-connect-btn" onClick={() => { setConnectModal('shopify'); setConnectApiKey(''); }}>
              <span>Connect with</span>
              <img src="/icon-shopify-text.png" alt="Shopify" />
            </button>
          </div>
        </div>
        {!addingNew && (
          <button className="products-add-btn" onClick={() => setAddingNew(true)}>
            <Plus size={16} />
            Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="products-error">
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* Add New Product Form */}
      {addingNew && (
        <div className="products-card products-card--new">
          <div className="products-card-header">
            <h3 className="products-card-title">New Product</h3>
            <button className="products-card-close" onClick={() => { setAddingNew(false); setNewProduct({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [], paymentProcessor: 'none' }); }}>
              <X size={16} />
            </button>
          </div>

          {renderPhotoSection('new', newProduct.photos)}

          <div className="products-field">
            <label className="products-label">Name</label>
            <input
              type="text"
              className="products-input"
              placeholder="Product name"
              value={newProduct.name}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="products-field">
            <label className="products-label">Description</label>
            <textarea
              className="products-textarea"
              placeholder="Describe your product..."
              value={newProduct.description}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="products-field">
            <label className="products-label">Product Type</label>
            {renderTypeDropdown('new', newProduct.type, (type) => setNewProduct((prev) => ({ ...prev, type })))}
          </div>

          <div className="products-field">
            <label className="products-label">Pricing</label>
            {renderPriceMode('new', newProduct.priceMode, (mode) => setNewProduct((prev) => ({ ...prev, priceMode: mode })))}
            <div className="products-price-input-wrap">
              <span className="products-price-prefix">$</span>
              <input
                type="text"
                className="products-input products-input--price"
                placeholder="0.00"
                value={newProduct.price}
                onChange={(e) => setNewProduct((prev) => ({ ...prev, price: e.target.value }))}
              />
              {newProduct.priceMode === 'Monthly' && <span className="products-price-suffix">/mo</span>}
            </div>
          </div>

          <div className="products-field">
            <label className="products-label">Payment Link</label>
            <div className="products-processor-select">
              {[
                { value: 'none', label: 'No Payment Link' },
                { value: 'stripe', label: 'Stripe', logo: '/stripe-logo.png' },
                { value: 'whop', label: 'Whop', logo: '/whop-logo.svg' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`products-processor-btn ${newProduct.paymentProcessor === opt.value ? 'products-processor-btn--active' : ''}`}
                  onClick={() => setNewProduct((prev) => ({ ...prev, paymentProcessor: opt.value }))}
                >
                  {opt.logo && <img src={opt.logo} alt="" className="products-processor-logo" />}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="products-save-btn"
            disabled={!newProduct.name.trim() || !newProduct.type || !newProduct.price.trim() || saving}
            onClick={addProduct}
          >
            {saving ? (
              <><Loader2 size={16} className="products-spin" /> {newProduct.paymentProcessor === 'none' ? 'Creating...' : `Creating on ${newProduct.paymentProcessor.charAt(0).toUpperCase() + newProduct.paymentProcessor.slice(1)}...`}</>
            ) : (
              newProduct.paymentProcessor === 'none' ? 'Create Product' : `Create Product & Generate ${newProduct.paymentProcessor.charAt(0).toUpperCase() + newProduct.paymentProcessor.slice(1)} Link`
            )}
          </button>
        </div>
      )}

      {/* Empty state */}
      {products.length === 0 && !addingNew && (
        <div className="products-empty">
          <Link2 size={40} />
          <h3>No products yet</h3>
          <p>Create a product and generate a payment link you can share with clients.</p>
          <button className="products-add-btn" onClick={() => setAddingNew(true)}>
            <Plus size={16} />
            Create Your First Product
          </button>
        </div>
      )}

      {/* Your Products (Stripe / Whop / Manual) */}
      {products.length > 0 && (
        <>
          {importedProducts.length > 0 && <h2 className="products-section-title">Your Products</h2>}
          <div className="products-grid">
            {products.map((product) => {
              const isEditing = editingId === product.id;
              return (
                <div key={product.id} className="products-card">
                  {renderPhotoSection(product.id, product.photos)}

                  <div className="products-field">
                    <label className="products-label">Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        className="products-input"
                        value={product.name}
                        onChange={(e) => updateProduct(product.id, 'name', e.target.value)}
                      />
                    ) : (
                      <p className="products-value">{product.name}</p>
                    )}
                  </div>

                  <div className="products-field">
                    <label className="products-label">Description</label>
                    {isEditing ? (
                      <textarea
                        className="products-textarea"
                        value={product.description}
                        onChange={(e) => updateProduct(product.id, 'description', e.target.value)}
                        rows={3}
                      />
                    ) : (
                      <p className="products-value products-value--desc">{product.description || 'No description'}</p>
                    )}
                  </div>

                  <div className="products-field">
                    <label className="products-label">Product Type</label>
                    {isEditing ? (
                      renderTypeDropdown(product.id, product.type, (type) => updateProduct(product.id, 'type', type))
                    ) : (
                      <span className="products-type-badge">{product.type}</span>
                    )}
                  </div>

                  <div className="products-field">
                    <label className="products-label">Pricing</label>
                    <p className="products-value products-price-display">
                      ${Number(product.price).toLocaleString()}
                      {product.priceMode === 'Monthly' && <span className="products-price-suffix-text">/mo</span>}
                    </p>
                  </div>

                  {product.payment_processor && product.payment_processor !== 'none' && (
                    <div className="products-field">
                      <label className="products-label">Payment Processor</label>
                      <span className="products-type-badge">{product.payment_processor.charAt(0).toUpperCase() + product.payment_processor.slice(1)}</span>
                    </div>
                  )}

                  {renderPaymentLink(product)}

                  <div className="products-card-actions">
                    {isEditing ? (
                      <button className="products-edit-btn" onClick={() => handleSaveEdit(product)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    ) : (
                      <button className="products-edit-btn" onClick={() => setEditingId(product.id)}>Edit</button>
                    )}
                    <button className="products-delete-btn" onClick={() => handleDelete(product.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Imported Products (Shopify / Kajabi) */}
      {importedProducts.length > 0 && (
        <>
          <h2 className="products-section-title">
            <ShoppingBag size={18} />
            Imported Products
          </h2>
          <div className="products-grid">
            {importedProducts.map((product) => (
              <div key={product.id} className="products-card products-card--imported">
                {product.image_url && (
                  <div className="products-imported-image">
                    <img src={product.image_url} alt={product.name} />
                  </div>
                )}

                <div className="products-field">
                  <label className="products-label">Name</label>
                  <p className="products-value">{product.name}</p>
                </div>

                {product.description && (
                  <div className="products-field">
                    <label className="products-label">Description</label>
                    <p className="products-value products-value--desc">{product.description}</p>
                  </div>
                )}

                {product.price != null && (
                  <div className="products-field">
                    <label className="products-label">Price</label>
                    <p className="products-value products-price-display">${Number(product.price).toLocaleString()}</p>
                  </div>
                )}

                <div className="products-field">
                  <label className="products-label">Source</label>
                  <div className="products-source-badge">
                    <img
                      src={product.provider === 'shopify' ? '/shopify-logo.png' : '/kajabi-logo.png'}
                      alt=""
                      className="products-processor-logo"
                    />
                    <span>{product.provider === 'shopify' ? 'Shopify' : 'Kajabi'}</span>
                  </div>
                </div>

                <div className="products-field">
                  <label className="products-label">Status</label>
                  <span className={`products-status-badge products-status-badge--${product.status}`}>
                    {product.status}
                  </span>
                </div>

                {product.checkout_url && (
                  <a
                    href={product.checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="products-external-link"
                  >
                    <ExternalLink size={14} />
                    View on {product.provider === 'shopify' ? 'Shopify' : 'Kajabi'}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Connect Platform Modal */}
      {connectModal && (
        <div className="modal-overlay" onClick={() => setConnectModal(null)}>
          <div className="modal products-connect-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setConnectModal(null)}>
              <X size={18} />
            </button>

            <div className="products-connect-modal-logo">
              <img
                src={connectModal === 'kajabi' ? '/icon-kajabi-text.png' : '/icon-shopify-text.png'}
                alt={connectModal === 'kajabi' ? 'Kajabi' : 'Shopify'}
              />
            </div>

            <h3 className="products-connect-modal-title">
              Connect {connectModal === 'kajabi' ? 'Kajabi' : 'Shopify'}
            </h3>
            <p className="products-connect-modal-desc">
              Enter your {connectModal === 'kajabi' ? 'Kajabi' : 'Shopify'} API key to import your products.
            </p>

            <div className="modal-field">
              <label className="modal-label">API Key</label>
              <input
                type="text"
                className="modal-input"
                placeholder={`Paste your ${connectModal === 'kajabi' ? 'Kajabi' : 'Shopify'} API key`}
                value={connectApiKey}
                onChange={(e) => setConnectApiKey(e.target.value)}
                autoFocus
              />
            </div>

            <div className="products-connect-modal-actions">
              <button className="products-connect-modal-cancel" onClick={() => setConnectModal(null)}>
                Cancel
              </button>
              <button
                className="products-connect-modal-submit"
                disabled={!connectApiKey.trim() || connectSaving}
                onClick={async () => {
                  setConnectSaving(true);
                  // TODO: integrate with backend API
                  setTimeout(() => {
                    setConnectSaving(false);
                    setConnectModal(null);
                    setConnectApiKey('');
                  }, 1500);
                }}
              >
                {connectSaving ? 'Connecting...' : 'Connect & Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
