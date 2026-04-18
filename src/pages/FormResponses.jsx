import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Download, Search, User } from 'lucide-react';
import { getForm, getFormResponses, deleteFormResponse, exportFormCSV } from '../lib/forms-api';
import './FormResponses.css';

export default function FormResponses() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [{ form: f }, { responses: r }] = await Promise.all([
          getForm(id),
          getFormResponses(id),
        ]);
        setForm(f);
        setResponses(r);
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleDelete(rid) {
    if (!confirm('Delete this response?')) return;
    try {
      await deleteFormResponse(id, rid);
      setResponses((prev) => prev.filter((r) => r.id !== rid));
    } catch (err) {
      console.error('Failed to delete response:', err);
    }
  }

  const questions = form?.questions || [];

  // Build display columns — expand contact_block into individual fields
  const columns = [];
  for (const q of questions) {
    if (q.type === 'contact_block') {
      const includePhone = !!q.settings?.includePhone;
      columns.push({ id: `${q.id}__firstName`, label: 'First Name', getValue: (ans) => ans?.[q.id]?.firstName || '-' });
      columns.push({ id: `${q.id}__lastName`, label: 'Last Name', getValue: (ans) => ans?.[q.id]?.lastName || '-' });
      columns.push({ id: `${q.id}__email`, label: 'Email', getValue: (ans) => ans?.[q.id]?.email || '-' });
      if (includePhone) {
        columns.push({ id: `${q.id}__phone`, label: 'Phone', getValue: (ans) => ans?.[q.id]?.phone || '-' });
      }
    } else {
      columns.push({ id: q.id, label: q.title || q.type, getValue: (ans) => formatAnswer(ans?.[q.id]) });
    }
  }

  const filtered = responses.filter((r) => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return Object.values(r.answers || {}).some((v) => {
      const str = Array.isArray(v) ? v.join(' ') : String(v ?? '');
      return str.toLowerCase().includes(lc);
    });
  });

  function formatAnswer(val) {
    if (val === undefined || val === null) return '-';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') {
      // contact_block: { firstName, lastName, email, phone }
      if (val.firstName || val.lastName || val.email) {
        const parts = [];
        if (val.firstName || val.lastName) parts.push([val.firstName, val.lastName].filter(Boolean).join(' '));
        if (val.email) parts.push(val.email);
        if (val.phone) parts.push(val.phone);
        return parts.join(' · ');
      }
      if (val.name) return val.name;
      // Other objects: show key-value pairs
      const entries = Object.entries(val).filter(([, v]) => v !== null && v !== undefined && v !== '');
      if (entries.length > 0) return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
      return '-';
    }
    return String(val);
  }

  if (loading) {
    return <div className="form-responses-page"><div className="form-responses-loading">Loading...</div></div>;
  }

  return (
    <div className="form-responses-page">
      <div className="form-responses-header">
        <button className="form-responses-back" onClick={() => navigate(`/forms/${id}/edit`)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{form?.title || 'Form'} - Responses</h1>
          <span className="form-responses-count">{responses.length} response{responses.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="form-responses-actions">
          <div className="form-responses-search">
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search responses..."
            />
          </div>
          <button className="form-responses-export" onClick={() => exportFormCSV(id)}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="form-responses-empty">
          {responses.length === 0 ? 'No responses yet' : 'No matches found'}
        </div>
      ) : (
        <div className="form-responses-table-wrap">
          <table className="form-responses-table">
            <thead>
              <tr>
                <th>Submitted</th>
                {columns.map((col) => (
                  <th key={col.id}>{col.label}</th>
                ))}
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.submitted_at).toLocaleString()}</td>
                  {columns.map((col) => (
                    <td key={col.id}>{col.getValue(r.answers)}</td>
                  ))}
                  <td>
                    {r.contact_id ? (
                      <Link to="/crm" className="form-responses-contact-link">
                        <User size={14} /> View
                      </Link>
                    ) : '-'}
                  </td>
                  <td>
                    <button className="form-responses-delete" onClick={() => handleDelete(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
