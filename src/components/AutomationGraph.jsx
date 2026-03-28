import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ── Node type configs (colors, icons, labels) ──
const NODE_STYLES = {
  trigger: { bg: '#fff', border: '#3b82f6', headerBg: '#eff6ff', label: 'Trigger', icon: 'zap', color: '#3b82f6' },
  instagram: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Send Message', icon: 'instagram', color: '#E4405F' },
  ai: { bg: '#000', border: '#374151', headerBg: '#000', label: 'AI Agent', icon: 'boosend', color: '#22c55e', textColor: '#fff' },
  aiExtractor: { bg: '#000', border: '#374151', headerBg: '#000', label: 'AI Extractor', icon: 'boosend', color: '#a78bfa', textColor: '#fff' },
  aiCondition: { bg: '#000', border: '#374151', headerBg: '#000', label: 'AI Condition', icon: 'boosend', color: '#f59e0b', textColor: '#fff' },
  condition: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Condition', icon: 'branch', color: '#6b7280' },
  smartDelay: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Delay', icon: 'clock', color: '#6b7280' },
  waitForReply: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Wait for Reply', icon: 'message', color: '#6b7280' },
  action: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Action', icon: 'bolt', color: '#f59e0b' },
  randomizer: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Randomizer', icon: 'shuffle', color: '#8b5cf6' },
  chatgpt: { bg: '#000', border: '#374151', headerBg: '#000', label: 'ChatGPT', icon: 'chatgpt', color: '#10a37f', textColor: '#fff' },
  grok: { bg: '#000', border: '#374151', headerBg: '#000', label: 'Grok', icon: 'grok', color: '#fff', textColor: '#fff' },
  gemini: { bg: '#000', border: '#374151', headerBg: '#000', label: 'Gemini', icon: 'gemini', color: '#4285f4', textColor: '#fff' },
  tool: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Tool', icon: 'wrench', color: '#6b7280' },
  heygen: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'HeyGen Video', icon: 'video', color: '#6366f1' },
  assignContact: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Assign Contact', icon: 'user', color: '#6b7280' },
  telegram: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Send Telegram', icon: 'telegram', color: '#0088cc' },
  gmail: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Send Gmail', icon: 'mail', color: '#EA4335' },
  outlook: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Send Outlook', icon: 'mail', color: '#0078D4' },
  transferWorkflow: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Transfer', icon: 'arrow', color: '#6b7280' },
  instagramReplyComment: { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: 'Reply to Comment', icon: 'instagram', color: '#E4405F' },
};

function getNodeStyle(type) {
  return NODE_STYLES[type] || { bg: '#fff', border: '#e5e7eb', headerBg: '#fff', label: type || 'Node', icon: 'bolt', color: '#6b7280' };
}

// ── SVG Icons ──
function NodeIcon({ icon, size = 20, color }) {
  const s = size;
  const c = color || '#6b7280';
  switch (icon) {
    case 'zap':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'instagram':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill={c} stroke="none" /></svg>;
    case 'clock':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'message':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>;
    case 'branch':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></svg>;
    case 'bolt':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'mail':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 7 12 13 2 7" /></svg>;
    case 'user':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case 'video':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>;
    case 'shuffle':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;
    case 'wrench':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>;
    case 'arrow':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case 'boosend':
      return <img src="/boosend-logo.png" alt="" style={{ width: s + 10, height: s + 10, objectFit: 'contain' }} />;
    case 'chatgpt':
      return <img src="/ChatGPT-Logo2.png" alt="" style={{ width: s, height: s, objectFit: 'contain', borderRadius: 4 }} />;
    case 'telegram':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>;
    default:
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>;
  }
}

// ── Handle dot ──
function HandleDot({ side = 'left', color = '#6b7280', label, small }) {
  const sz = small ? 10 : 14;
  const pos = side === 'left'
    ? { left: -(sz / 2), top: '50%', transform: 'translateY(-50%)' }
    : side === 'right'
    ? { right: -(sz / 2), top: '50%', transform: 'translateY(-50%)' }
    : { bottom: -(sz / 2), left: '50%', transform: 'translateX(-50%)' };
  return (
    <>
      <div style={{ position: 'absolute', ...pos, width: sz, height: sz, borderRadius: '50%', background: color, border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 2 }} />
      {label && side === 'right' && (
        <div style={{ position: 'absolute', right: -(sz / 2) - 55, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>{label}</div>
      )}
    </>
  );
}

// ── Trigger node ──
function TriggerNodeView({ data }) {
  const conditions = data?.triggerConditions || [];
  return (
    <div style={{ padding: '16px 20px', minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <NodeIcon icon="boosend" size={22} />
        <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>Trigger</span>
      </div>
      {conditions.length > 0 ? conditions.map((c, i) => (
        <div key={c.id || i} style={{ marginTop: i > 0 ? 8 : 0, padding: '8px 10px', background: '#f9fafb', borderRadius: 10, fontSize: 13 }}>
          <div style={{ fontWeight: 500, color: '#374151', marginBottom: 4, textTransform: 'capitalize' }}>
            {(c.type || 'message').replace(/_/g, ' ')}
          </div>
          {c.messageDetectionType === 'ai_intent' && c.aiIntentPrompt && (
            <div style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.4 }}>"{c.aiIntentPrompt}"</div>
          )}
          {c.keywords?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {c.keywords.slice(0, 5).map((k, j) => (
                <span key={j} style={{ padding: '2px 8px', borderRadius: 12, background: '#e5e7eb', fontSize: 11, fontWeight: 500, color: '#374151' }}>{k}</span>
              ))}
              {c.keywords.length > 5 && <span style={{ fontSize: 11, color: '#9ca3af' }}>+{c.keywords.length - 5} more</span>}
            </div>
          )}
        </div>
      )) : (
        <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Click to configure</div>
      )}
    </div>
  );
}

// ── Instagram Message node ──
function InstagramNodeView({ data }) {
  return (
    <div style={{ padding: '12px 16px', minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <NodeIcon icon="instagram" size={18} color="#E4405F" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Send Message</span>
      </div>
      {data?.content && (
        <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#111', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {data.content.length > 120 ? data.content.slice(0, 120) + '...' : data.content}
        </div>
      )}
      {data?.messageType === 'image' && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Image message</div>}
      {data?.messageType === 'voice' && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Voice message</div>}
      {data?.buttons?.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.buttons.map((b, i) => (
            <div key={b.id || i} style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#374151', textAlign: 'center' }}>
              {b.title}
            </div>
          ))}
        </div>
      )}
      {data?.collectResponse && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>Collecting: {data.responseType || 'response'}</div>
      )}
    </div>
  );
}

// ── AI Agent node (dark) ──
function AINodeView({ data }) {
  const isAdvanced = data?.selectedAITab === 'advanced' || data?.configType === 'advanced';
  const goals = Array.isArray(data?.goals) ? data.goals.filter(g => g?.task?.trim()) : [];
  return (
    <div style={{ padding: '16px 20px', minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <NodeIcon icon="boosend" size={22} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#fff' }}>AI Agent</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80' }}>{isAdvanced ? 'Advanced Agent' : 'Basic Agent'}</span>
            {goals.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)' }}>
                {goals.length} step{goals.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delay node ──
function DelayNodeView({ data }) {
  const t = data?.delayType || 'fixed';
  const typeLabel = t === 'random' ? 'Randomized' : t === 'schedule' ? 'Scheduled' : 'Fixed';
  return (
    <div style={{ padding: '12px 16px', minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <NodeIcon icon="clock" size={18} color="#6b7280" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Delay</span>
      </div>
      <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
        This is a{' '}
        <span style={{ background: '#111', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{typeLabel}</span>
        {' '}delay.
        {t === 'random' && data?.minDuration != null && data?.maxDuration != null && (
          <div style={{ marginTop: 4 }}>
            Between <span style={{ fontWeight: 600, borderBottom: '2px solid #111' }}>{data.minDuration}</span> and{' '}
            <span style={{ fontWeight: 600, borderBottom: '2px solid #111' }}>{data.maxDuration}</span>{' '}
            <span style={{ background: '#111', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{data.unit || 'seconds'}</span>
          </div>
        )}
        {t === 'fixed' && data?.duration != null && (
          <div style={{ marginTop: 4 }}>
            Wait <span style={{ fontWeight: 600, borderBottom: '2px solid #111' }}>{data.duration}</span>{' '}
            <span style={{ background: '#111', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{data.unit || 'seconds'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Condition node ──
function ConditionNodeView({ data }) {
  const conditions = Array.isArray(data?.conditions) ? data.conditions : [];
  return (
    <div style={{ padding: '16px 20px', minWidth: 300, paddingRight: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <NodeIcon icon="branch" size={18} color="#6b7280" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Condition</span>
      </div>
      <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
        {conditions.length > 0 ? data.conditionSummary || conditions.map(c => c.type?.replace(/_/g, ' ')).join(` ${data.relationship || 'AND'} `) : 'Click to configure'}
      </div>
    </div>
  );
}

// ── Wait for Reply node ──
function WaitForReplyNodeView({ data }) {
  return (
    <div style={{ padding: '12px 16px', minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <NodeIcon icon="message" size={18} color="#6b7280" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Wait for Reply</span>
      </div>
      {data?.enableTimeout && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Timeout: {data.timeout || 24} {data.timeoutUnit || 'hours'}</div>
      )}
    </div>
  );
}

// ── Generic node fallback ──
function GenericNodeView({ type, data }) {
  const style = getNodeStyle(type);
  return (
    <div style={{ padding: '12px 16px', minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NodeIcon icon={style.icon} size={18} color={style.color} />
        <span style={{ fontSize: 16, fontWeight: 500, color: style.textColor || '#111' }}>{style.label}</span>
      </div>
      {data?.content && (
        <div style={{ marginTop: 6, fontSize: 13, color: style.textColor ? 'rgba(255,255,255,0.7)' : '#6b7280', lineHeight: 1.4 }}>
          {data.content.length > 100 ? data.content.slice(0, 100) + '...' : data.content}
        </div>
      )}
    </div>
  );
}

// ── Node renderer ──
function AutomationNode({ node }) {
  const type = node.type || 'action';
  const style = getNodeStyle(type);
  const isDark = style.bg === '#000';

  let content;
  switch (type) {
    case 'trigger': content = <TriggerNodeView data={node.data} />; break;
    case 'instagram': case 'instagramReplyComment': content = <InstagramNodeView data={node.data} />; break;
    case 'ai': case 'chatgpt': case 'grok': case 'gemini': content = <AINodeView data={node.data} />; break;
    case 'smartDelay': content = <DelayNodeView data={node.data} />; break;
    case 'condition': case 'aiCondition': content = <ConditionNodeView data={node.data} />; break;
    case 'waitForReply': content = <WaitForReplyNodeView data={node.data} />; break;
    default: content = <GenericNodeView type={type} data={node.data} />;
  }

  const isCondition = type === 'condition' || type === 'aiCondition';

  return (
    <div
      style={{
        position: 'absolute',
        left: node.position?.x || 0,
        top: node.position?.y || 0,
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: 20,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        minWidth: 260,
        maxWidth: 380,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Left handle (target) */}
      {type !== 'trigger' && <HandleDot side="left" color="#6b7280" />}
      {/* Content */}
      {content}
      {/* Right handle(s) */}
      {isCondition ? (
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>True</span>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>False</span>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          </div>
        </div>
      ) : (
        <HandleDot side="right" color="#6b7280" />
      )}
    </div>
  );
}

// ── Edge renderer ──
function computeEdgePath(source, target, nodes) {
  const sNode = nodes.find(n => n.id === source);
  const tNode = nodes.find(n => n.id === target);
  if (!sNode || !tNode) return null;

  // Approximate node dimensions
  const sw = 300, sh = 120;
  const sx = (sNode.position?.x || 0) + sw;
  const sy = (sNode.position?.y || 0) + sh / 2;
  const tx = tNode.position?.x || 0;
  const ty = (tNode.position?.y || 0) + sh / 2;

  const dx = Math.abs(tx - sx) * 0.5;
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

// ── Main graph component ──
export default function AutomationGraph({ nodes = [], edges = [] }) {
  const vpRef = useRef(null);
  const [tf, setTf] = useState({ x: 0, y: 0, s: 0.65 });
  const panRef = useRef({ active: false, lx: 0, ly: 0 });

  // Auto-fit on mount
  const fitView = useCallback(() => {
    if (!nodes.length) return;
    const el = vpRef.current;
    if (!el) return;
    const vw = el.clientWidth, vh = el.clientHeight;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const x = n.position?.x || 0, y = n.position?.y || 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + 300 > maxX) maxX = x + 300;
      if (y + 140 > maxY) maxY = y + 140;
    }
    const cw = maxX - minX + 80, ch = maxY - minY + 80;
    const s = Math.min((vw * 0.9) / cw, (vh * 0.9) / ch, 1.2);
    setTf({
      x: (vw - cw * s) / 2 - minX * s + 40 * s,
      y: (vh - ch * s) / 2 - minY * s + 40 * s,
      s,
    });
  }, [nodes]);

  useEffect(() => {
    fitView();
    const el = vpRef.current;
    if (!el) return;
    const obs = new ResizeObserver(fitView);
    obs.observe(el);
    return () => obs.disconnect();
  }, [fitView]);

  // Wheel zoom
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const h = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setTf(p => {
        const ns = Math.min(Math.max(p.s * (e.deltaY > 0 ? 0.92 : 1.08), 0.1), 2.5);
        const ratio = ns / p.s;
        return { x: mx - ratio * (mx - p.x), y: my - ratio * (my - p.y), s: ns };
      });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Mouse pan
  const onMD = useCallback((e) => {
    if (e.target.closest('[data-node]')) return;
    panRef.current = { active: true, lx: e.clientX, ly: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
  }, []);
  const onMM = useCallback((e) => {
    if (!panRef.current.active) return;
    setTf(p => ({
      ...p,
      x: p.x + e.clientX - panRef.current.lx,
      y: p.y + e.clientY - panRef.current.ly,
    }));
    panRef.current.lx = e.clientX;
    panRef.current.ly = e.clientY;
  }, []);
  const onMU = useCallback(() => {
    panRef.current.active = false;
    if (vpRef.current) vpRef.current.style.cursor = 'grab';
  }, []);

  // Compute edge paths
  const edgePaths = useMemo(() => {
    return edges.map(e => ({
      id: e.id,
      path: computeEdgePath(e.source, e.target, nodes),
    })).filter(e => e.path);
  }, [edges, nodes]);

  if (!nodes.length) return null;

  return (
    <div
      ref={vpRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: 'grab', position: 'relative', background: '#fafafa' }}
      onMouseDown={onMD}
      onMouseMove={onMM}
      onMouseUp={onMU}
      onMouseLeave={onMU}
      onDoubleClick={fitView}
    >
      {/* Dot grid background */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="ag-dots" x={tf.x % (20 * tf.s)} y={tf.y % (20 * tf.s)} width={20 * tf.s} height={20 * tf.s} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="#d1d5db" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ag-dots)" />
      </svg>

      <div style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}>
        {/* Edges */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: 9999, height: 9999, pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
            </marker>
          </defs>
          {edgePaths.map(e => (
            <path key={e.id} d={e.path} stroke="#9ca3af" strokeWidth={2} fill="none" markerEnd="url(#ag-arrow)" />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <div key={node.id} data-node="1">
            <AutomationNode node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}
