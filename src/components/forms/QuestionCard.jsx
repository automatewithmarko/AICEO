import { X } from 'lucide-react';
import { getQuestionType } from './questionTypes';

export default function QuestionCard({ question, index, selected, onClick, onDelete }) {
  const qt = getQuestionType(question.type);
  const Icon = qt?.icon;

  return (
    <div
      className={`question-card ${selected ? 'question-card--selected' : ''}`}
      onClick={onClick}
    >
      <span className="question-card-number">{index + 1}</span>
      {Icon && <Icon size={16} className="question-card-icon" />}
      <div className="question-card-info">
        <div className="question-card-title">{question.title || 'Untitled'}</div>
        <div className="question-card-type">{qt?.label || question.type}</div>
      </div>
      <div className="question-card-badges">
        {question.required && <span className="question-card-required">Required</span>}
      </div>
      <button
        className="question-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete question"
      >
        <X size={14} />
      </button>
    </div>
  );
}
