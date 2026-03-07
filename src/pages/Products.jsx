import { useState, useRef } from 'react';
import { Plus, X, Upload, Trash2, ChevronDown, Check } from 'lucide-react';
import './Pages.css';
import './Products.css';

const PRODUCT_TYPES = ['Coaching', 'Course', 'SAAS', 'LeadMagnet', 'Community'];
const PRICE_MODES = ['One-time', 'Monthly'];

const INITIAL_PRODUCTS = [
  {
    id: 1,
    name: 'Premium Coaching Program',
    description: 'Personalized 1-on-1 coaching to help you scale your business with proven strategies and accountability.',
    type: 'Coaching',
    price: '2500',
    priceMode: 'Monthly',
    photos: [],
  },
  {
    id: 2,
    name: 'Growth Accelerator Course',
    description: 'A self-paced online course covering content strategy, lead generation, and conversion optimization.',
    type: 'Course',
    price: '497',
    priceMode: 'One-time',
    photos: [],
  },
];

export default function Products() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [editingId, setEditingId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [] });
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(null); // product id or 'new'
  const fileInputRefs = useRef({});

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
        if (photo) URL.revokeObjectURL(photo.url);
        return { ...prev, photos: prev.photos.filter((p) => p.id !== photoId) };
      });
    } else {
      setProducts((prev) => prev.map((p) => {
        if (p.id !== productId) return p;
        const photo = p.photos.find((ph) => ph.id === photoId);
        if (photo) URL.revokeObjectURL(photo.url);
        return { ...p, photos: p.photos.filter((ph) => ph.id !== photoId) };
      }));
    }
  };

  const updateProduct = (id, field, value) => {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };

  const deleteProduct = (id) => {
    const product = products.find((p) => p.id === id);
    if (product) product.photos.forEach((ph) => URL.revokeObjectURL(ph.url));
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addProduct = () => {
    if (!newProduct.name.trim() || !newProduct.type || !newProduct.price.trim()) return;
    const product = {
      ...newProduct,
      id: Date.now(),
    };
    setProducts((prev) => [...prev, product]);
    setNewProduct({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [] });
    setAddingNew(false);
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

  return (
    <div className="page-container">
      <div className="products-header">
        <h1 className="page-title">Products</h1>
        {!addingNew && (
          <button className="products-add-btn" onClick={() => setAddingNew(true)}>
            <Plus size={16} />
            Add Product
          </button>
        )}
      </div>

      {/* Add New Product Form */}
      {addingNew && (
        <div className="products-card products-card--new">
          <div className="products-card-header">
            <h3 className="products-card-title">New Product</h3>
            <button className="products-card-close" onClick={() => { setAddingNew(false); setNewProduct({ name: '', description: '', type: '', price: '', priceMode: 'One-time', photos: [] }); }}>
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

          <button
            className="products-save-btn"
            disabled={!newProduct.name.trim() || !newProduct.type || !newProduct.price.trim()}
            onClick={addProduct}
          >
            Add Product
          </button>
        </div>
      )}

      {/* Product List */}
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
                  <p className="products-value products-value--desc">{product.description}</p>
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
                {isEditing ? (
                  <>
                    {renderPriceMode(product.id, product.priceMode, (mode) => updateProduct(product.id, 'priceMode', mode))}
                    <div className="products-price-input-wrap">
                      <span className="products-price-prefix">$</span>
                      <input
                        type="text"
                        className="products-input products-input--price"
                        value={product.price}
                        onChange={(e) => updateProduct(product.id, 'price', e.target.value)}
                      />
                      {product.priceMode === 'Monthly' && <span className="products-price-suffix">/mo</span>}
                    </div>
                  </>
                ) : (
                  <p className="products-value products-price-display">
                    ${Number(product.price).toLocaleString()}
                    {product.priceMode === 'Monthly' && <span className="products-price-suffix-text">/mo</span>}
                  </p>
                )}
              </div>

              <div className="products-card-actions">
                {isEditing ? (
                  <button className="products-edit-btn" onClick={() => setEditingId(null)}>Done</button>
                ) : (
                  <button className="products-edit-btn" onClick={() => setEditingId(product.id)}>Edit</button>
                )}
                <button className="products-delete-btn" onClick={() => deleteProduct(product.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
