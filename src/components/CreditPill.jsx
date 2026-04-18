import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import './CreditPill.css';

export default function CreditPill() {
  const { credits, user, planData } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isLow = credits < 50;
  const isDepleted = credits === 0;

  return (
    <div className="credit-pill-wrapper" ref={ref}>
      <button
        className={`credit-pill ${isLow ? 'credit-pill--low' : ''} ${isDepleted ? 'credit-pill--depleted' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Zap size={14} />
        <span>{credits.toLocaleString()}</span>
      </button>

      {open && (
        <div className="credit-pill-dropdown">
          <div className="credit-pill-dropdown-header">
            <Zap size={16} />
            <span className="credit-pill-dropdown-title">Credits</span>
          </div>

          <div className="credit-pill-dropdown-balance">
            <span className={`credit-pill-dropdown-number ${isLow ? 'credit-pill-dropdown-number--low' : ''}`}>
              {credits.toLocaleString()}
            </span>
            {planData?.plan?.credits_per_month && (
              <span className="credit-pill-dropdown-allocation">
                / {planData.plan.credits_per_month.toLocaleString()} monthly
              </span>
            )}
          </div>

          {user?.plan && (
            <div className="credit-pill-dropdown-plan">
              <span className="credit-pill-dropdown-plan-label">Plan</span>
              <span className="credit-pill-dropdown-plan-name">{user.plan}</span>
            </div>
          )}

          <button
            className="credit-pill-dropdown-link"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          >
            <span>Billing & Usage</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
