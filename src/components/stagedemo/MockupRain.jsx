// MockupRain — while AI CEO is generating, fly recognizable product mockups
// in from the back of the screen, scale them up to camera, then fade out.
// Ported from AICEO-SHELL/mockups.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import './MockupRain.css';

const MOCKUP_TYPES = ['landing', 'email', 'revenue', 'instagram'];

function LandingMockup() {
  return (
    <div className="mk mk-landing">
      <div className="mk-topbar">
        <div className="mk-logo" />
        <div className="mk-nav"><i/><i/><i/></div>
        <div className="mk-cta" />
      </div>
      <div className="mk-hero">
        <div className="mk-eyebrow" />
        <div className="mk-h1" />
        <div className="mk-h1 short" />
        <div className="mk-sub" />
        <div className="mk-sub short" />
        <div className="mk-btns">
          <div className="mk-btn primary" />
          <div className="mk-btn ghost" />
        </div>
      </div>
      <div className="mk-features">
        <div className="mk-tile" />
        <div className="mk-tile" />
        <div className="mk-tile" />
      </div>
    </div>
  );
}

function EmailMockup() {
  return (
    <div className="mk mk-email">
      <div className="mk-mailbar">
        <div className="mk-back" />
        <div className="mk-mailicons"><span/><span/><span/></div>
      </div>
      <div className="mk-sender">
        <div className="mk-avatar" />
        <div className="mk-sender-lines">
          <div className="mk-name" />
          <div className="mk-time" />
        </div>
      </div>
      <div className="mk-subject" />
      <div className="mk-body">
        <div className="mk-line" />
        <div className="mk-line" />
        <div className="mk-line short" />
        <div className="mk-gap" />
        <div className="mk-line" />
        <div className="mk-line" />
        <div className="mk-line short" />
      </div>
      <div className="mk-mail-cta">
        <div className="mk-btn primary" />
      </div>
    </div>
  );
}

function RevenueMockup() {
  return (
    <div className="mk mk-revenue">
      <div className="mk-revhead">
        <div className="mk-revtag" />
        <div className="mk-revdots"><i/><i/><i/></div>
      </div>
      <div className="mk-revbig" />
      <div className="mk-revdelta" />
      <div className="mk-chart">
        <div className="mk-bar" style={{ height: '38%' }} />
        <div className="mk-bar" style={{ height: '56%' }} />
        <div className="mk-bar" style={{ height: '46%' }} />
        <div className="mk-bar" style={{ height: '72%' }} />
        <div className="mk-bar" style={{ height: '64%' }} />
        <div className="mk-bar" style={{ height: '92%' }} />
      </div>
      <div className="mk-revfooter">
        <div className="mk-legend" />
        <div className="mk-legend" />
      </div>
    </div>
  );
}

function InstagramMockup() {
  return (
    <div className="mk mk-insta">
      <div className="mk-igtop">
        <div className="mk-igavatar" />
        <div className="mk-igmeta">
          <div className="mk-igname" />
          <div className="mk-iglocation" />
        </div>
        <div className="mk-igdots"><i/><i/><i/></div>
      </div>
      <div className="mk-igphoto" />
      <div className="mk-igactions">
        <div className="mk-igicons">
          <span className="mk-ig-heart" />
          <span className="mk-ig-comment" />
          <span className="mk-ig-send" />
        </div>
        <div className="mk-igbookmark" />
      </div>
      <div className="mk-iglikes" />
      <div className="mk-igcaption" />
      <div className="mk-igcaption short" />
    </div>
  );
}

const RENDERERS = { landing: LandingMockup, email: EmailMockup, revenue: RevenueMockup, instagram: InstagramMockup };

export default function MockupRain({ active }) {
  const [cards, setCards] = useState([]);
  const idRef = useRef(0);
  const lastTypeRef = useRef(null);

  useEffect(() => {
    if (!active) {
      const id = setTimeout(() => setCards([]), 600);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    let timeoutId;
    const spawn = () => {
      if (cancelled) return;
      let type;
      do { type = MOCKUP_TYPES[Math.floor(Math.random() * MOCKUP_TYPES.length)]; }
      while (type === lastTypeRef.current && Math.random() < 0.7);
      lastTypeRef.current = type;

      const id = ++idRef.current;
      const angle = Math.random() * Math.PI * 2;
      const dist = 220 + Math.random() * 240;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.7 - 40;
      const r = (Math.random() - 0.5) * 14;
      const dur = 3000 + Math.random() * 1400;
      const startSize = 0.95 + Math.random() * 0.15;

      setCards(prev => [...prev, { id, type, dx, dy, r, dur, startSize }]);
      timeoutId = setTimeout(spawn, 420 + Math.random() * 480);
    };
    timeoutId = setTimeout(spawn, 280);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [active]);

  const handleEnd = useCallback((id) => {
    setCards(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <div className={`mockups-stage ${active ? 'show' : ''}`} aria-hidden>
      {cards.map(c => {
        const Card = RENDERERS[c.type];
        return (
          <div
            key={c.id}
            className="mockup-card"
            style={{
              '--dx': c.dx + 'px',
              '--dy': c.dy + 'px',
              '--r': c.r + 'deg',
              '--s': c.startSize,
              animationDuration: c.dur + 'ms',
            }}
            onAnimationEnd={() => handleEnd(c.id)}
          >
            <Card />
          </div>
        );
      })}
    </div>
  );
}
