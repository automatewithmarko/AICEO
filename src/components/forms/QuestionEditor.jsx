import { Trash2, Plus, X } from 'lucide-react';
import { getQuestionType } from './questionTypes';
import BranchingEditor from './BranchingEditor';

export default function QuestionEditor({ question, questions, branchingRules, onUpdate, onDelete, onBranchingChange }) {
  const qt = getQuestionType(question.type);
  const Icon = qt?.icon;
  const hasOptions = question.type === 'dropdown' || question.type === 'checkboxes';
  const hasMinMax = question.type === 'rating' || question.type === 'opinion_scale';
  const hasPlaceholder = ['short_text', 'long_text', 'email', 'phone', 'number', 'url'].includes(question.type);
  const hasBranching = question.type === 'yes_no' || question.type === 'dropdown';

  function updateField(field, value) {
    onUpdate({ ...question, [field]: value });
  }

  function updateSetting(key, value) {
    onUpdate({ ...question, settings: { ...question.settings, [key]: value } });
  }

  function updateOption(index, value) {
    const options = [...question.options];
    options[index] = value;
    onUpdate({ ...question, options });
  }

  function addOption() {
    onUpdate({ ...question, options: [...question.options, `Option ${question.options.length + 1}`] });
  }

  function removeOption(index) {
    onUpdate({ ...question, options: question.options.filter((_, i) => i !== index) });
  }

  return (
    <div className="question-editor">
      <div className="question-editor-header">
        {Icon && <Icon size={18} />}
        <span className="question-editor-type-label">{qt?.label}</span>
      </div>

      <div className="question-editor-field">
        <label>Question Title</label>
        <textarea
          value={question.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Enter your question..."
          rows={2}
        />
      </div>

      <div className="question-editor-field">
        <label>Description (optional)</label>
        <textarea
          value={question.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Add a description..."
          rows={2}
        />
      </div>

      {hasPlaceholder && (
        <div className="question-editor-field">
          <label>Placeholder</label>
          <input
            type="text"
            value={question.settings?.placeholder || ''}
            onChange={(e) => updateSetting('placeholder', e.target.value)}
          />
        </div>
      )}

      {hasOptions && (
        <div className="question-editor-field">
          <label>Options</label>
          <div className="question-editor-options">
            {question.options.map((opt, i) => (
              <div key={i} className="question-editor-option">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                <button onClick={() => removeOption(i)} className="question-editor-option-remove">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button onClick={addOption} className="question-editor-add-option">
              <Plus size={14} /> Add option
            </button>
          </div>
        </div>
      )}

      {hasMinMax && (
        <div className="question-editor-row">
          <div className="question-editor-field">
            <label>Min</label>
            <input
              type="number"
              value={question.settings?.min ?? 1}
              onChange={(e) => updateSetting('min', Number(e.target.value))}
            />
          </div>
          <div className="question-editor-field">
            <label>Max</label>
            <input
              type="number"
              value={question.settings?.max ?? (question.type === 'rating' ? 5 : 10)}
              onChange={(e) => updateSetting('max', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {question.type === 'file_upload' && (
        <div className="question-editor-field">
          <label>Max file size (MB)</label>
          <input
            type="number"
            value={question.settings?.maxSizeMB ?? 10}
            onChange={(e) => updateSetting('maxSizeMB', Number(e.target.value))}
          />
        </div>
      )}

      <div className="question-editor-toggle">
        <label>
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => updateField('required', e.target.checked)}
          />
          Required
        </label>
      </div>

      {hasBranching && (
        <BranchingEditor
          question={question}
          questions={questions}
          rules={branchingRules.filter((r) => r.question_id === question.id)}
          onChange={onBranchingChange}
        />
      )}

      <button className="question-editor-delete" onClick={onDelete}>
        <Trash2 size={16} />
        Delete Question
      </button>
    </div>
  );
}
