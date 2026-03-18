import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { getContacts } from '../../lib/api';
import { assignContactToMeeting, assignExternalRecordingToContact } from '../../lib/meetings-api';
import './AssignContactModal.css';

export default function AssignContactModal({ meetingId, isExternal, onClose, onAssigned }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getContacts();
        // Use ghl_raw_data.email as source of truth, same as CRM page
        setContacts((data.contacts || []).map(c => {
          let email = c.email || '';
          if (c.ghl_raw_data) {
            email = c.ghl_raw_data.email || '';
          }
          return { ...c, email };
        }));
      } catch (err) {
        console.error('Failed to load contacts:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.business || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  const handleAssign = async (contact) => {
    setAssigning(contact.id);
    try {
      if (isExternal) {
        await assignExternalRecordingToContact(meetingId, contact.id);
      } else {
        await assignContactToMeeting(meetingId, contact.id);
      }
      onAssigned?.(contact);
      onClose();
    } catch (err) {
      console.error('Failed to assign contact:', err);
      setAssigning(null);
    }
  };

  return (
    <div className="assign-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="assign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="assign-header">
          <img src="/icon-assign-contact.png" alt="" className="assign-header-icon" />
          <h3>Assign Contact</h3>
          <button className="assign-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="assign-search">
          <Search size={15} className="assign-search-icon" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="assign-table-wrap">
          {loading ? (
            <div className="assign-loading">Loading contacts...</div>
          ) : filtered.length === 0 ? (
            <div className="assign-empty">
              {search ? 'No contacts match your search' : 'No contacts found'}
            </div>
          ) : (
            <table className="assign-table">
              <thead>
                <tr>
                  <th>Contact Name</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="assign-cell-name">{c.name || '—'}</td>
                    <td className="assign-cell-email">{c.email || '—'}</td>
                    <td className="assign-cell-action">
                      <button
                        className="assign-contact-btn"
                        onClick={() => handleAssign(c)}
                        disabled={assigning === c.id}
                      >
                        {assigning === c.id ? 'Assigning...' : 'Assign'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
