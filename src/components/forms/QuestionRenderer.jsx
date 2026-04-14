import { useState } from 'react';
import { Star, Upload, Check } from 'lucide-react';

export default function QuestionRenderer({ question, value, onChange, themeVars }) {
  const [dragOver, setDragOver] = useState(false);

  const inputStyle = {
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${themeVars?.['--theme-accent'] || '#6b7280'}`,
    color: themeVars?.['--theme-text'] || '#1a1a1a',
    fontSize: '20px',
    padding: '8px 0',
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
  };

  switch (question.type) {
    case 'contact_first_name':
    case 'contact_last_name':
    case 'contact_full_name':
    case 'contact_email':
    case 'contact_phone':
    case 'contact_business':
    case 'contact_instagram':
    case 'contact_linkedin':
    case 'contact_x':
    case 'short_text':
    case 'email':
    case 'phone':
    case 'url':
    case 'number':
      return (
        <input
          type={question.type === 'number' ? 'number' : question.type === 'contact_email' ? 'email' : 'text'}
          style={inputStyle}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.settings?.placeholder || ''}
          autoFocus
        />
      );

    case 'long_text':
      return (
        <textarea
          style={{ ...inputStyle, borderBottom: 'none', border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`, borderRadius: '8px', padding: '12px', minHeight: '120px', resize: 'none' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.settings?.placeholder || ''}
          autoFocus
        />
      );

    case 'date':
      return (
        <input
          type="date"
          style={{ ...inputStyle, fontSize: '18px' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      );

    case 'dropdown':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {(question.options || []).map((opt, i) => (
            <button
              key={i}
              onClick={() => onChange(opt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 18px',
                border: `1px solid ${value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '8px',
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                color: themeVars?.['--theme-text'] || '#1a1a1a',
                fontSize: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`,
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                color: value === opt ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
              }}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
              {value === opt && <Check size={18} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      );

    case 'checkboxes':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {(question.options || []).map((opt, i) => {
            const selected = Array.isArray(value) && value.includes(opt);
            return (
              <button
                key={i}
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(selected ? current.filter((v) => v !== opt) : [...current, opt]);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 18px',
                  border: `1px solid ${selected ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                  borderRadius: '8px',
                  background: selected ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                  color: themeVars?.['--theme-text'] || '#1a1a1a',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '24px', height: '24px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                  border: `1px solid ${themeVars?.['--theme-accent'] || '#e5e7eb'}`,
                  background: selected ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                  color: selected ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
                }}>
                  {selected ? <Check size={14} /> : String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      );

    case 'yes_no':
      return (
        <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              style={{
                flex: 1,
                padding: '20px',
                border: `2px solid ${value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '12px',
                background: value === opt ? (themeVars?.['--theme-primary'] || '#6366f1') + '15' : 'transparent',
                color: themeVars?.['--theme-text'] || '#1a1a1a',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case 'rating': {
      const max = question.settings?.max || 5;
      const min = question.settings?.min || 1;
      return (
        <div style={{ display: 'flex', gap: '8px' }}>
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'transform 0.15s' }}
            >
              <Star
                size={32}
                fill={value >= n ? (themeVars?.['--theme-primary'] || '#6366f1') : 'none'}
                color={value >= n ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#d1d5db')}
              />
            </button>
          ))}
        </div>
      );
    }

    case 'opinion_scale': {
      const max = question.settings?.max || 10;
      const min = question.settings?.min || 1;
      return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{
                width: '44px', height: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${value === n ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
                borderRadius: '8px',
                background: value === n ? (themeVars?.['--theme-primary'] || '#6366f1') : 'transparent',
                color: value === n ? '#fff' : (themeVars?.['--theme-text'] || '#1a1a1a'),
                fontSize: '16px', fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    case 'file_upload':
      return (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) onChange({ name: file.name, type: file.type, size: file.size, file });
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf';
            input.onchange = (e) => {
              const file = e.target.files[0];
              if (file) onChange({ name: file.name, type: file.type, size: file.size, file });
            };
            input.click();
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            padding: '40px', border: `2px dashed ${dragOver ? (themeVars?.['--theme-primary'] || '#6366f1') : (themeVars?.['--theme-accent'] || '#e5e7eb')}`,
            borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.15s',
            color: themeVars?.['--theme-text'] || '#6b7280',
          }}
        >
          <Upload size={32} />
          {value?.name ? (
            <span>{value.name} ({(value.size / 1024 / 1024).toFixed(1)}MB)</span>
          ) : (
            <span>Click or drag to upload</span>
          )}
        </div>
      );

    default:
      return <div>Unsupported question type: {question.type}</div>;
  }
}
