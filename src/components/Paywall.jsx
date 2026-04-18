import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import './Paywall.css';

const featureDescriptions = {
  ai_ceo_unified: 'Get a unified AI CEO that manages your entire business from one conversation — content, emails, landing pages, newsletters, and more.',
  boost_email: 'Access a powerful email inbox with AI-powered drafting, follow-ups, and smart organization.',
};

export default function Paywall({ feature, featureLabel, planRequired = 'diamond' }) {
  const navigate = useNavigate();

  const planName = planRequired === 'diamond' ? 'Diamond' : 'Complete';
  const description = featureDescriptions[feature] || `Unlock ${featureLabel} and more with the ${planName} plan.`;

  return (
    <div className="paywall-backdrop">
      <div className="paywall-card">
        <div className="paywall-icon">
          <Lock size={28} />
        </div>
        <h2 className="paywall-title">
          Upgrade to {planName} to access {featureLabel}
        </h2>
        <p className="paywall-description">{description}</p>
        <div className="paywall-actions">
          <button className="paywall-btn paywall-btn--primary" onClick={() => navigate('/settings')}>
            View Plans
          </button>
          <button className="paywall-btn paywall-btn--secondary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
