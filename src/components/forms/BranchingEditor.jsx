import { Plus, X } from 'lucide-react';

export default function BranchingEditor({ question, questions, rules, onChange }) {
  const answerOptions = question.type === 'yes_no'
    ? ['Yes', 'No']
    : question.options || [];

  const otherQuestions = questions.filter((q) => q.id !== question.id);

  function addRule() {
    onChange([
      ...rules,
      { question_id: question.id, answer_value: answerOptions[0] || '', target_question_id: otherQuestions[0]?.id || '' },
    ]);
  }

  function updateRule(index, field, value) {
    const updated = rules.map((r, i) => i === index ? { ...r, [field]: value } : r);
    onChange(updated);
  }

  function removeRule(index) {
    onChange(rules.filter((_, i) => i !== index));
  }

  if (otherQuestions.length === 0) return null;

  return (
    <div className="branching-editor">
      <label className="branching-editor-label">Branching Logic</label>
      <div className="branching-editor-hint">Skip to a specific question based on the answer</div>

      {rules.map((rule, i) => (
        <div key={i} className="branching-rule">
          <span>If</span>
          <select
            value={rule.answer_value}
            onChange={(e) => updateRule(i, 'answer_value', e.target.value)}
          >
            {answerOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <span>go to</span>
          <select
            value={rule.target_question_id}
            onChange={(e) => updateRule(i, 'target_question_id', e.target.value)}
          >
            {otherQuestions.map((q, qi) => (
              <option key={q.id} value={q.id}>
                {qi + 1}. {q.title || 'Untitled'}
              </option>
            ))}
          </select>
          <button onClick={() => removeRule(i)} className="branching-rule-remove">
            <X size={14} />
          </button>
        </div>
      ))}

      <button onClick={addRule} className="branching-add-rule">
        <Plus size={14} /> Add rule
      </button>
    </div>
  );
}
