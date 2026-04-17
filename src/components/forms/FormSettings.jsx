const REDIRECT_PREFIX = 'redirect::';

export default function FormSettings({ slug, description, thankYouMessage, onChange }) {
  const isRedirect = typeof thankYouMessage === 'string' && thankYouMessage.startsWith(REDIRECT_PREFIX);
  const redirectUrl = isRedirect ? thankYouMessage.slice(REDIRECT_PREFIX.length) : '';
  const messageValue = isRedirect ? '' : (thankYouMessage || '');

  const switchMode = (mode) => {
    if (mode === 'redirect' && !isRedirect) {
      onChange('thank_you_message', REDIRECT_PREFIX);
    } else if (mode === 'message' && isRedirect) {
      onChange('thank_you_message', '');
    }
  };

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
    </div>
  );
}
