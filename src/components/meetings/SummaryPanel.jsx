import { useState } from 'react';
import { CheckCircle, Circle, Clock, BookOpen, ChevronDown, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { formatTimestamp, generateActionItems, updateMeeting } from '../../lib/meetings-api';
import './SummaryPanel.css';

export default function SummaryPanel({ meeting, onSeek, onUpdate }) {
  const [tab, setTab] = useState('summary');

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'actions', label: `Action Items${meeting.action_items?.length ? ` (${meeting.action_items.length})` : ''}` },
    { id: 'chapters', label: 'Chapters' },
  ];

  return (
    <div className="summary-panel">
      <div className="summary-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`summary-tab ${tab === t.id ? 'summary-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="summary-content">
        {tab === 'summary' && <SummaryContent summary={meeting.summary} />}
        {tab === 'actions' && (
          <ActionItemsContent
            items={meeting.action_items}
            meetingId={meeting.id}
            onUpdate={onUpdate}
          />
        )}
        {tab === 'chapters' && <ChaptersContent chapters={meeting.chapters} onSeek={onSeek} />}
      </div>
    </div>
  );
}

function SummaryContent({ summary }) {
  if (!summary) {
    return <div className="summary-empty">No summary generated yet. Summary will appear after the meeting ends.</div>;
  }

  return (
    <div className="summary-body">
      {typeof summary === 'string' ? (
        <p>{summary}</p>
      ) : (
        Object.entries(summary).map(([key, value]) => {
          if (key === 'error') return null;
          return (
            <div key={key} className="summary-section">
              <h4>{key.replace(/_/g, ' ')}</h4>
              {Array.isArray(value) ? (
                <ul>
                  {value.map((item, i) => (
                    <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              ) : (
                <p>{String(value)}</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ActionItemsContent({ items, meetingId, onUpdate }) {
  const [generating, setGenerating] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [localItems, setLocalItems] = useState(items || []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateActionItems(meetingId);
      const newItems = result.action_items || [];
      setLocalItems(newItems);
      onUpdate?.(m => ({ ...m, action_items: newItems }));
    } catch (err) {
      console.error('Failed to generate action items:', err);
    } finally {
      setGenerating(false);
    }
  };

  const toggleComplete = async (idx) => {
    const updated = localItems.map((item, i) =>
      i === idx ? { ...item, completed: !item.completed } : item
    );
    setLocalItems(updated);
    onUpdate?.(m => ({ ...m, action_items: updated }));
    try {
      await updateMeeting(meetingId, { action_items: updated });
    } catch (err) {
      console.error('Failed to update action item:', err);
    }
  };

  const toggleExpand = (idx) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  return (
    <div className="action-items-container">
      <button
        className="action-items-generate-btn"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? (
          <>
            <Loader2 size={15} className="spinning" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles size={15} />
            Generate Action Items
          </>
        )}
      </button>

      {localItems.length === 0 ? (
        <div className="summary-empty">No action items yet. Click the button above to generate them from the transcript.</div>
      ) : (
        <div className="action-items-list">
          {localItems.map((item, i) => (
            <div key={i} className={`action-item ${item.completed ? 'action-item--completed' : ''}`}>
              <div className="action-item-main" onClick={() => toggleExpand(i)}>
                <button
                  className="action-item-checkbox"
                  onClick={(e) => { e.stopPropagation(); toggleComplete(i); }}
                >
                  {item.completed ? <CheckCircle size={18} /> : <Circle size={18} />}
                </button>
                <span className={`action-item-text ${item.completed ? 'action-item-text--done' : ''}`}>
                  {item.text}
                </span>
                <span className="action-item-expand">
                  {expandedIdx === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </div>
              {expandedIdx === i && (
                <div className="action-item-details">
                  {item.description && <p className="action-item-description">{item.description}</p>}
                  <div className="action-item-meta">
                    {item.assignee && item.assignee !== 'Unassigned' && (
                      <span className="action-item-assignee">{item.assignee}</span>
                    )}
                    {item.due_date && (
                      <span className="action-item-due">
                        <Clock size={12} />
                        {item.due_date}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChaptersContent({ chapters, onSeek }) {
  if (!chapters?.length) {
    return <div className="summary-empty">No chapters generated.</div>;
  }

  return (
    <div className="chapters-list">
      {chapters.map((ch, i) => (
        <div
          key={i}
          className="chapter-item"
          onClick={() => onSeek?.(ch.start_time)}
        >
          <div className="chapter-time">
            <BookOpen size={14} />
            {formatTimestamp(ch.start_time)}
          </div>
          <div className="chapter-body">
            <h4 className="chapter-title">{ch.title}</h4>
            {ch.summary && <p className="chapter-summary">{ch.summary}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
