import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Tag, Check } from 'lucide-react';
import { getContacts } from '../../lib/api';

const REDIRECT_PREFIX = 'redirect::';

export default function FormSettings({ slug, description, thankYouMessage, submissionTags, onChange }) {
  const isRedirect = typeof thankYouMessage === 'string' && thankYouMessage.startsWith(REDIRECT_PREFIX);
  const redirectUrl = isRedirect ? thankYouMessage.slice(REDIRECT_PREFIX.length) : '';
  const messageValue = isRedirect ? '' : (thankYouMessage || '');

  const tags = Array.isArray(submissionTags) ? submissionTags : [];
  const [existingTags, setExistingTags] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    getContacts()
      .then(({ contacts }) => {
        const all = [...new Set((contacts || []).flatMap(c => c.tags || []))].sort();
        setExistingTags(all);
      })
      .catch(() => { /* no-op */ });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
        setTagInput('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  const switchMode = (mode) => {
    if (mode === 'redirect' && !isRedirect) {
      onChange('thank_you_message', REDIRECT_PREFIX);
    } else if (mode === 'message' && isRedirect) {
      onChange('thank_you_message', '');
    }
  };

  const addTag = (tag) => {
    const value = String(tag || '').trim();
    if (!value) return;
    if (tags.includes(value)) return;
    onChange('submission_tags', [...tags, value]);
    setTagInput('');
  };

  const removeTag = (tag) => {
    onChange('submission_tags', tags.filter(t => t !== tag));
  };

  const filteredExisting = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const pool = existingTags.filter(t => !tags.includes(t));
    if (!q) return pool;
    return pool.filter(t => t.toLowerCase().includes(q));
  }, [existingTags, tags, tagInput]);

  const canCreateNew = tagInput.trim().length > 0
    && !tags.some(t => t.toLowerCase() === tagInput.trim().toLowerCase())
    && !existingTags.some(t => t.toLowerCase() === tagInput.trim().toLowerCase());

  return (
    <div className="form-settings">
      <div className="form-settings-field">
        <label>Form URL Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => onChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, ''))}
        />
        <div className="form-settings-hint">
          Your form will be available at /f/{slug}
        </div>
      </div>
      <div className="form-settings-field">
        <label>Description</label>
        <textarea
          rows={3}
          value={description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Optional form description..."
        />
      </div>
      <div className="form-settings-field">
        <label>On successful submission</label>
        <div className="form-settings-pill" role="tablist" aria-label="Submission action">
          <button
            type="button"
            role="tab"
            aria-selected={!isRedirect}
            className={`form-settings-pill-btn${!isRedirect ? ' form-settings-pill-btn--active' : ''}`}
            onClick={() => switchMode('message')}
          >
            Thank you message
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRedirect}
            className={`form-settings-pill-btn${isRedirect ? ' form-settings-pill-btn--active' : ''}`}
            onClick={() => switchMode('redirect')}
          >
            Redirect to URL
          </button>
        </div>
        {isRedirect ? (
          <input
            type="url"
            value={redirectUrl}
            onChange={(e) => onChange('thank_you_message', REDIRECT_PREFIX + e.target.value)}
            placeholder="https://example.com/thanks"
          />
        ) : (
          <textarea
            rows={3}
            value={messageValue}
            onChange={(e) => onChange('thank_you_message', e.target.value)}
            placeholder="Thank you for your response!"
          />
        )}
      </div>

      <div className="form-settings-field">
        <label><Tag size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Tags on submission</label>
        <div className="form-settings-hint">
          Apply these tags to every contact who submits this form. Pick existing tags or create new ones.
        </div>
        <div className="form-settings-tags">
          {tags.map((t) => (
            <span key={t} className="form-settings-tag">
              {t}
              <button
                type="button"
                className="form-settings-tag-remove"
                onClick={() => removeTag(t)}
                aria-label={`Remove tag ${t}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <div className="form-settings-tag-picker" ref={pickerRef}>
            <button
              type="button"
              className="form-settings-tag-add"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label="Add tag"
            >
              <Plus size={12} />
            </button>
            {pickerOpen && (
              <div className="form-settings-tag-menu">
                <input
                  className="form-settings-tag-input"
                  autoFocus
                  placeholder="Search or create a tag…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (canCreateNew) addTag(tagInput);
                      else if (filteredExisting.length > 0) addTag(filteredExisting[0]);
                    } else if (e.key === 'Escape') {
                      setPickerOpen(false);
                      setTagInput('');
                    }
                  }}
                />
                <div className="form-settings-tag-list">
                  {canCreateNew && (
                    <button
                      type="button"
                      className="form-settings-tag-option form-settings-tag-option--create"
                      onClick={() => addTag(tagInput)}
                    >
                      <Plus size={12} />
                      Create tag "{tagInput.trim()}"
                    </button>
                  )}
                  {filteredExisting.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="form-settings-tag-option"
                      onClick={() => addTag(t)}
                    >
                      <Check size={12} />
                      {t}
                    </button>
                  ))}
                  {!canCreateNew && filteredExisting.length === 0 && (
                    <div className="form-settings-tag-empty">
                      {existingTags.length === 0 ? 'No tags yet. Type to create one.' : 'No matches.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
