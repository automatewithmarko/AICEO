import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Reorder } from 'framer-motion';
import {
  Save, Eye, Link2, Code, BarChart3,
  ChevronRight, Palette, Settings as SettingsIcon, List, Plus, ArrowLeft, X,
} from 'lucide-react';
import { getForm, updateForm, publishForm, unpublishForm, getBranchingRules, saveBranchingRules } from '../lib/forms-api';
import { createQuestion } from '../components/forms/questionTypes';
import QuestionCard from '../components/forms/QuestionCard';
import QuestionEditor from '../components/forms/QuestionEditor';
import AddQuestionDialog from '../components/forms/AddQuestionDialog';
import ThemePicker from '../components/forms/ThemePicker';
import FormSettings from '../components/forms/FormSettings';
import FormPreview from '../components/forms/FormPreview';
import '../components/forms/forms.css';
import './FormBuilder.css';

export default function FormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('questions');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [branchingRules, setBranchingRules] = useState([]);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [{ form: f }, { rules }] = await Promise.all([
          getForm(id),
          getBranchingRules(id),
        ]);
        setForm(f);
        setBranchingRules(rules);
        if (f.questions?.length > 0) setSelectedQuestionId(f.questions[0].id);
      } catch (err) {
        console.error('Failed to load form:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const selectedQuestion = form?.questions?.find((q) => q.id === selectedQuestionId);

  function updateLocal(updates) {
    setForm((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }

  function updateQuestions(newQuestions) {
    updateLocal({ questions: newQuestions });
  }

  function updateQuestion(updated) {
    updateQuestions(form.questions.map((q) => q.id === updated.id ? updated : q));
  }

  function deleteQuestion(qId) {
    updateQuestions(form.questions.filter((q) => q.id !== qId));
    setBranchingRules((prev) => prev.filter((r) => r.question_id !== qId && r.target_question_id !== qId));
    if (selectedQuestionId === qId) {
      setSelectedQuestionId(form.questions.find((q) => q.id !== qId)?.id || null);
    }
  }

  function addQuestion(type) {
    const q = createQuestion(type);
    updateQuestions([...form.questions, q]);
    setSelectedQuestionId(q.id);
    setShowAddDialog(false);
  }

  function handleBranchingChange(rulesForQuestion) {
    setBranchingRules((prev) => {
      const otherRules = prev.filter((r) => r.question_id !== selectedQuestionId);
      return [...otherRules, ...rulesForQuestion];
    });
    setDirty(true);
  }

  const handleSave = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        updateForm(id, {
          title: form.title,
          description: form.description,
          slug: form.slug,
          theme: form.theme,
          questions: form.questions,
          thank_you_message: form.thank_you_message,
        }),
        saveBranchingRules(id, branchingRules),
      ]);
      setDirty(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [form, branchingRules, id, saving]);

  async function handlePublish() {
    try {
      if (dirty) await handleSave();
      const { form: updated } = form.status === 'published'
        ? await unpublishForm(id)
        : await publishForm(id);
      setForm(updated);
    } catch (err) {
      console.error('Failed to publish:', err);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`);
  }

  if (loading) {
    return <div className="form-builder-loading">Loading...</div>;
  }

  if (!form) {
    return <div className="form-builder-loading">Form not found</div>;
  }

  const embedCode = `<iframe src="${window.location.origin}/f/${form.slug}" width="100%" height="600" frameborder="0"></iframe>`;

  return (
    <div className="form-builder">
      {/* Header */}
      <div className="form-builder-header">
        <div className="form-builder-header-left">
          <button
            className="form-builder-back"
            onClick={() => navigate('/forms')}
            title="Back to Forms"
            aria-label="Back to Forms"
          >
            <ArrowLeft size={18} />
          </button>
          <input
            className="form-builder-title-input"
            value={form.title}
            onChange={(e) => updateLocal({ title: e.target.value })}
            placeholder="Form title..."
            size={Math.max((form.title || 'Form title...').length, 8)}
          />
          <span className={`form-builder-status form-builder-status--${form.status}`}>
            {form.status}
          </span>
          {dirty && <span className="form-builder-unsaved">Unsaved changes</span>}
        </div>
        <div className="form-builder-header-right">
          <button className="form-builder-btn" onClick={handleSave} disabled={saving || !dirty}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="form-builder-btn" onClick={handlePublish}>
            {form.status === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          {form.status === 'published' && (
            <>
              <button className="form-builder-btn" onClick={copyLink} title="Copy link">
                <Link2 size={16} /> Copy Link
              </button>
              <button className="form-builder-btn" onClick={() => setShowPreview(true)} title="View form">
                <Eye size={16} /> View
              </button>
              <button className="form-builder-btn" onClick={() => setShowEmbed(!showEmbed)} title="Embed code">
                <Code size={16} /> Embed
              </button>
            </>
          )}
          <button className="form-builder-btn" onClick={() => navigate(`/forms/${id}/responses`)} title="Responses">
            <BarChart3 size={16} /> Responses
          </button>
        </div>
      </div>

      {/* Embed modal */}
      {showEmbed && (
        <div className="form-builder-embed-bar">
          <code>{embedCode}</code>
          <button onClick={() => { navigator.clipboard.writeText(embedCode); }}>Copy</button>
        </div>
      )}

      {/* Main 3-panel layout */}
      <div className="form-builder-body">
        {/* Left sidebar */}
        <div className="form-builder-sidebar">
          <div className="form-builder-sidebar-tabs">
            <button className={sidebarTab === 'questions' ? 'active' : ''} onClick={() => setSidebarTab('questions')}>
              <List size={16} /> Questions
            </button>
            <button className={sidebarTab === 'design' ? 'active' : ''} onClick={() => setSidebarTab('design')}>
              <Palette size={16} /> Design
            </button>
            <button className={sidebarTab === 'settings' ? 'active' : ''} onClick={() => setSidebarTab('settings')}>
              <SettingsIcon size={16} /> Settings
            </button>
          </div>

          <div className="form-builder-sidebar-content">
            {sidebarTab === 'questions' && (
              <>
                <Reorder.Group
                  axis="y"
                  values={form.questions}
                  onReorder={updateQuestions}
                  className="form-builder-question-list"
                >
                  {form.questions.map((q, i) => (
                    <Reorder.Item key={q.id} value={q}>
                      <QuestionCard
                        question={q}
                        index={i}
                        selected={selectedQuestionId === q.id}
                        onClick={() => setSelectedQuestionId(q.id)}
                        onDelete={() => deleteQuestion(q.id)}
                      />
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                <button className="form-builder-add-btn" onClick={() => setShowAddDialog(true)}>
                  <Plus size={16} /> Add Question
                </button>
              </>
            )}

            {sidebarTab === 'design' && (
              <ThemePicker value={form.theme} onChange={(theme) => updateLocal({ theme })} />
            )}

            {sidebarTab === 'settings' && (
              <FormSettings
                slug={form.slug}
                description={form.description}
                thankYouMessage={form.thank_you_message}
                onChange={(field, value) => updateLocal({ [field]: value })}
              />
            )}
          </div>
        </div>

        {/* Center: Question Editor */}
        <div className="form-builder-editor">
          {selectedQuestion ? (
            <QuestionEditor
              key={selectedQuestion.id}
              question={selectedQuestion}
              questions={form.questions}
              branchingRules={branchingRules}
              onUpdate={updateQuestion}
              onDelete={() => deleteQuestion(selectedQuestion.id)}
              onBranchingChange={handleBranchingChange}
            />
          ) : (
            <div className="form-builder-editor-empty">
              <p>Select a question to edit, or add a new one</p>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="form-builder-preview">
          <FormPreview
            questions={form.questions}
            theme={form.theme}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={setSelectedQuestionId}
          />
        </div>
      </div>

      {/* Add question dialog */}
      {showAddDialog && (
        <AddQuestionDialog
          onSelect={addQuestion}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Full-screen preview modal */}
      {showPreview && form?.slug && (
        <div className="form-preview-modal">
          <button
            className="form-preview-modal-close"
            onClick={() => setShowPreview(false)}
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
          <iframe
            src={`/f/${form.slug}`}
            className="form-preview-modal-frame"
            title="Form preview"
          />
        </div>
      )}
    </div>
  );
}
