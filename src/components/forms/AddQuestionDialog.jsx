import { CONTACT_FIELD_TYPES, GENERIC_QUESTION_TYPES } from './questionTypes';

export default function AddQuestionDialog({ onSelect, onClose }) {
  return (
    <div className="add-question-overlay" onClick={onClose}>
      <div className="add-question-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Add Question</h3>

        <div className="add-question-section-label">Contact Fields</div>
        <p className="add-question-section-hint">Auto-maps to your CRM contacts</p>
        <div className="add-question-grid">
          {CONTACT_FIELD_TYPES.map((qt) => (
            <button
              key={qt.type}
              className="add-question-type add-question-type--contact"
              onClick={() => onSelect(qt.type)}
            >
              <qt.icon size={24} className="add-question-type-icon" />
              <span className="add-question-type-label">{qt.label}</span>
              <span className="add-question-type-desc">{qt.description}</span>
            </button>
          ))}
        </div>

        <div className="add-question-section-label" style={{ marginTop: '20px' }}>General</div>
        <div className="add-question-grid">
          {GENERIC_QUESTION_TYPES.map((qt) => (
            <button
              key={qt.type}
              className="add-question-type"
              onClick={() => onSelect(qt.type)}
            >
              <qt.icon size={24} className="add-question-type-icon" />
              <span className="add-question-type-label">{qt.label}</span>
              <span className="add-question-type-desc">{qt.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
