import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit3, BarChart3, Link2, Trash2, FileText } from 'lucide-react';
import { listForms, createForm, deleteForm } from '../lib/forms-api';
import './Forms.css';

export default function Forms() {
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadForms();
  }, []);

  async function loadForms() {
    try {
      const { forms } = await listForms();
      setForms(forms);
    } catch (err) {
      console.error('Failed to load forms:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const { form } = await createForm('Untitled Form');
      navigate(`/forms/${form.id}/edit`);
    } catch (err) {
      console.error('Failed to create form:', err);
      setCreating(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this form and all its responses?')) return;
    try {
      await deleteForm(id);
      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error('Failed to delete form:', err);
    }
  }

  function handleCopyLink(e, slug) {
    e.stopPropagation();
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url);
  }

  const statusColors = {
    draft: '#6b7280',
    published: '#22c55e',
    closed: '#ef4444',
  };

  if (loading) {
    return (
      <div className="forms-page">
        <div className="forms-header">
          <h1>Forms</h1>
        </div>
        <div className="forms-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="forms-page">
      <div className="forms-header">
        <h1>Forms</h1>
        <button className="forms-create-btn" onClick={handleCreate} disabled={creating}>
          <Plus size={18} />
          {creating ? 'Creating...' : 'Create Form'}
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="forms-empty">
          <FileText size={48} strokeWidth={1} />
          <h3>No forms yet</h3>
          <p>Create your first form to start collecting responses</p>
          <button className="forms-create-btn" onClick={handleCreate} disabled={creating}>
            <Plus size={18} />
            Create Form
          </button>
        </div>
      ) : (
        <div className="forms-grid">
          {forms.map((form) => (
            <div
              key={form.id}
              className="form-card"
              onClick={() => navigate(`/forms/${form.id}/edit`)}
            >
              <div className="form-card-header">
                <h3 className="form-card-title">{form.title}</h3>
                <span
                  className="form-card-status"
                  style={{ backgroundColor: statusColors[form.status] + '20', color: statusColors[form.status] }}
                >
                  {form.status}
                </span>
              </div>
              <div className="form-card-meta">
                <span>{form.responseCount} response{form.responseCount !== 1 ? 's' : ''}</span>
                <span>{new Date(form.created_at).toLocaleDateString()}</span>
              </div>
              <div className="form-card-actions">
                <button onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/edit`); }} title="Edit">
                  <Edit3 size={16} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/responses`); }} title="Responses">
                  <BarChart3 size={16} />
                </button>
                {form.status === 'published' && (
                  <button onClick={(e) => handleCopyLink(e, form.slug)} title="Copy link">
                    <Link2 size={16} />
                  </button>
                )}
                <button onClick={(e) => handleDelete(e, form.id)} title="Delete" className="form-card-delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
