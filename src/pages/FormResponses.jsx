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
    if (typeof val === 'object') return val.name || JSON.stringify(val);
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
                {questions.map((q) => (
                  <th key={q.id}>{q.title || q.type}</th>
                ))}
                <th>Contact</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.submitted_at).toLocaleString()}</td>
                  {questions.map((q) => (
                    <td key={q.id}>{formatAnswer(r.answers?.[q.id])}</td>
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
