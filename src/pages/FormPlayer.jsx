import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import { getPublicForm, submitFormResponse } from '../lib/forms-api';
import { getThemeVars } from '../components/forms/formThemes';
import QuestionRenderer from '../components/forms/QuestionRenderer';
import './FormPlayer.css';

const AUTO_ADVANCE_TYPES = ['dropdown', 'yes_no', 'opinion_scale'];

export default function FormPlayer() {
  const { slug } = useParams();
  const [form, setForm] = useState(null);
  const [branchingRules, setBranchingRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validationError, setValidationError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState(1);
  const [questionHistory, setQuestionHistory] = useState([0]);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    async function load() {
      try {
        const { form: f, branchingRules: rules } = await getPublicForm(slug);
        setForm(f);
        setBranchingRules(rules || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const questions = form?.questions || [];
  const currentQuestion = questions[currentIndex];
  const themeVars = form ? getThemeVars(form.theme) : {};
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function validate(question, value) {
    if (question.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
      return 'This field is required';
    }
    if (value && question.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address';
    }
    if (value && question.type === 'phone' && !/^[+]?[\d\s\-().]+$/.test(value)) {
      return 'Please enter a valid phone number';
    }
    if (value && question.type === 'url') {
      try { new URL(value); } catch { return 'Please enter a valid URL'; }
    }
    if (value && question.type === 'number' && isNaN(Number(value))) {
      return 'Please enter a valid number';
    }
    return '';
  }

  function getNextIndex(fromIndex, answerValue) {
    const q = questions[fromIndex];
    if (q && (q.type === 'yes_no' || q.type === 'dropdown') && answerValue !== undefined) {
      const rule = branchingRules.find(
        (r) => r.question_id === q.id && r.answer_value === String(answerValue)
      );
      if (rule) {
        const targetIdx = questions.findIndex((qu) => qu.id === rule.target_question_id);
        if (targetIdx !== -1) return targetIdx;
      }
    }
    return fromIndex + 1;
  }

  const goNext = useCallback((skipValidation = false) => {
    if (!currentQuestion) return;
    const val = answers[currentQuestion.id];

    if (!skipValidation) {
      const err = validate(currentQuestion, val);
      if (err) { setValidationError(err); return; }
    }
    setValidationError('');

    if (isLast) {
      handleSubmit();
      return;
    }

    const nextIdx = getNextIndex(currentIndex, val);
    if (nextIdx < questions.length) {
      setDirection(1);
      setCurrentIndex(nextIdx);
      setQuestionHistory((prev) => [...prev, nextIdx]);
    }
  }, [currentQuestion, answers, currentIndex, isLast, questions, branchingRules]);

  function goPrev() {
    if (questionHistory.length <= 1) return;
    setDirection(-1);
    const newHistory = questionHistory.slice(0, -1);
    setQuestionHistory(newHistory);
    setCurrentIndex(newHistory[newHistory.length - 1]);
    setValidationError('');
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitFormResponse(slug, answers);
      setSubmitted(true);
    } catch (err) {
      setValidationError(err.message);
      setSubmitting(false);
    }
  }

  function handleAnswerChange(value) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
    setValidationError('');

    if (AUTO_ADVANCE_TYPES.includes(currentQuestion.type) && value !== undefined && value !== '') {
      setTimeout(() => {
        const nextIdx = getNextIndex(currentIndex, value);
        if (nextIdx < questions.length) {
          setDirection(1);
          setCurrentIndex(nextIdx);
          setQuestionHistory((prev) => [...prev, nextIdx]);
        } else {
          handleSubmit();
        }
      }, 300);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (submitted) return;
      if (e.key === 'Enter') {
        if (currentQuestion?.type === 'long_text' && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, submitted, currentQuestion]);

  // Scroll navigation
  useEffect(() => {
    function handleWheel(e) {
      if (submitted) return;
      const now = Date.now();
      if (now - lastScrollTime.current < 500) return;
      if (Math.abs(e.deltaY) < 50) return;
      lastScrollTime.current = now;
      if (e.deltaY > 0) goNext();
      else goPrev();
    }
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [goNext, submitted]);

  if (loading) {
    return <div className="form-player" style={{ ...themeVars, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>Loading...</span></div>;
  }

  if (error) {
    return <div className="form-player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>{error}</span></div>;
  }

  if (submitted) {
    return (
      <div className="form-player" style={{ ...themeVars, backgroundColor: themeVars['--theme-background'], color: themeVars['--theme-text'] }}>
        <div className="form-player-thankyou">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="form-player-check"
            style={{ backgroundColor: themeVars['--theme-primary'] }}
          >
            <Check size={40} color="#fff" />
          </motion.div>
          <h2>{form.thank_you_message}</h2>
          <p style={{ opacity: 0.5, fontSize: '14px' }}>Made with AICU</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-player" style={{ ...themeVars, backgroundColor: themeVars['--theme-background'], color: themeVars['--theme-text'], fontFamily: themeVars['--theme-font'] }}>
      {/* Progress bar */}
      <div className="form-player-progress">
        <div className="form-player-progress-bar" style={{ width: `${progress}%`, backgroundColor: themeVars['--theme-primary'] }} />
      </div>

      {/* Question area */}
      <div className="form-player-content">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentQuestion?.id}
            custom={direction}
            initial={{ y: direction * 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: direction * -50, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="form-player-question"
          >
            <div className="form-player-question-number" style={{ color: themeVars['--theme-primary'] }}>
              {currentIndex + 1} →
            </div>
            <h2 className="form-player-question-title">
              {currentQuestion?.title || 'Untitled'}
              {currentQuestion?.required && <span style={{ color: themeVars['--theme-primary'] }}> *</span>}
            </h2>
            {currentQuestion?.description && (
              <p className="form-player-question-desc">{currentQuestion.description}</p>
            )}
            <div className="form-player-input">
              <QuestionRenderer
                question={currentQuestion}
                value={answers[currentQuestion?.id]}
                onChange={handleAnswerChange}
                themeVars={themeVars}
              />
            </div>
            {validationError && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="form-player-error"
              >
                {validationError}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navigation */}
      <div className="form-player-footer">
        {!AUTO_ADVANCE_TYPES.includes(currentQuestion?.type) && (
          <button
            className="form-player-ok-btn"
            onClick={() => goNext()}
            style={{ backgroundColor: themeVars['--theme-primary'], color: '#fff' }}
          >
            {isLast ? (submitting ? 'Submitting...' : 'Submit') : 'OK'} ✓
          </button>
        )}
        <span className="form-player-hint" style={{ color: themeVars['--theme-accent'] }}>
          press <strong>Enter ↵</strong>
        </span>
        <div className="form-player-nav-arrows">
          <button onClick={goPrev} disabled={questionHistory.length <= 1} style={{ color: themeVars['--theme-text'] }}>
            <ChevronUp size={18} />
          </button>
          <button onClick={() => goNext()} style={{ color: themeVars['--theme-text'] }}>
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
