import { getThemeVars } from './formThemes';
import QuestionRenderer from './QuestionRenderer';
import { ArrowRight } from 'lucide-react';

export default function FormPreview({ questions, theme, selectedQuestionId, onSelectQuestion }) {
  const themeVars = getThemeVars(theme);

  return (
    <div
      className="form-preview"
      style={{
        ...themeVars,
        backgroundColor: themeVars['--theme-background'],
        color: themeVars['--theme-text'],
        fontFamily: themeVars['--theme-font'],
        padding: '32px',
        borderRadius: '12px',
        minHeight: '100%',
        overflowY: 'auto',
      }}
    >
      {questions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', opacity: 0.5 }}>
          <p>Add questions to see a preview</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '600px', margin: '0 auto' }}>
          {questions.map((q, i) => (
            <div
              key={q.id}
              onClick={() => onSelectQuestion(q.id)}
              style={{
                cursor: 'pointer',
                padding: '20px',
                borderRadius: '12px',
                border: selectedQuestionId === q.id ? `2px solid ${themeVars['--theme-primary']}` : '2px solid transparent',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ArrowRight size={16} color={themeVars['--theme-primary']} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: themeVars['--theme-primary'] }}>
                  {i + 1}
                </span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>
                {q.title || 'Untitled'}
                {q.required && <span style={{ color: themeVars['--theme-primary'] }}> *</span>}
              </h3>
              {q.description && (
                <p style={{ fontSize: '14px', opacity: 0.7, margin: '0 0 16px' }}>{q.description}</p>
              )}
              <div style={{ pointerEvents: 'none', opacity: 0.6 }}>
                <QuestionRenderer question={q} value={undefined} onChange={() => {}} themeVars={themeVars} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
