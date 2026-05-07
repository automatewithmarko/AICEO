import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ── Shared styles ──
const HANDLE = { width: 20, height: 20, borderRadius: '50%', border: '4px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' };
const HANDLE_SM = { width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' };
const NODE_BASE = { borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', minWidth: 280, maxWidth: 380, userSelect: 'none' };

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

// ── Trigger node ──
function TriggerNodeView({ data }) {
  const conditions = data?.triggerConditions || [];
  return (
    <div style={{ padding: '24px 24px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <NodeIcon icon="zap" size={20} color="#4b5563" />
        <h3 style={{ fontSize: 18, fontWeight: 500, color: '#111', marginLeft: 12 }}>When</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {conditions.length > 0 ? conditions.map((c, i) => {
          const label = (c.label || getTriggerLabel(c.type)).replace(/_/g, ' ');
          return (
            <div key={c.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <NodeIcon icon={c.type === 'telegram_message' ? 'telegram' : 'instagram'} size={16} color={c.type === 'telegram_message' ? '#0088cc' : '#E4405F'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 4 }}>{label}</div>
                {c.messageDetectionType === 'keywords' && c.keywords?.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Keywords</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {c.keywords.slice(0, 3).map((k, j) => (
                        <span key={j} style={{ padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', fontSize: 12, fontWeight: 500, color: '#374151' }}>{k}</span>
                      ))}
                      {c.keywords.length > 3 && <span style={{ fontSize: 12, color: '#9ca3af' }}>+{c.keywords.length - 3} more</span>}
                    </div>
                  </>
                )}
                {(c.messageDetectionType === 'intent' || c.messageDetectionType === 'ai_intent') && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', background: '#f9fafb', padding: '4px 10px', borderRadius: 20 }}>
                      <NodeIcon icon="boosend" size={14} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>AI set up</span>
                    </span>
                  </div>
                )}
                {!c.messageDetectionType && !c.keywords?.length && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Any message</div>
                )}
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Click to configure trigger</div>
        )}
      </div>
    </div>
  );
}

function getTriggerLabel(type) {
  const labels = {
    message: 'User sends a message', comment: 'User comments on post', story_reply: 'User replies to story',
    follow: 'User follows account', live_comment: 'User comments on live', telegram_message: 'Telegram message',
    web_chat: 'Web chat message', whatsapp_message: 'WhatsApp message',
  };
  return labels[type] || (type || 'message').replace(/_/g, ' ');
}

// ── Instagram/Message node ──
function InstagramNodeView({ data }) {
  const buttons = data?.buttons || [];
  const hasButtons = data?.messageType === 'text' && buttons.length > 0;
  return (
    <div style={{ padding: '24px 24px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <NodeIcon icon="instagram" size={18} color="#E4405F" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Send Message</span>
      </div>
      {data?.messageType === 'image' ? (
        <div style={{ height: 80, background: '#f9fafb', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#6b7280' }}>
          {data.mediaUrl ? <img src={data.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : 'Image message'}
        </div>
      ) : data?.messageType === 'voice' ? (
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>Voice message</div>
      ) : data?.content ? (
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#111', lineHeight: 1.5, wordBreak: 'break-word', maxHeight: 80, overflow: 'auto' }}>
          {data.content}
        </div>
      ) : null}
      {/* Buttons with individual handles */}
      {hasButtons && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {buttons.map((b) => (
            <div key={b.id || b.title} style={{ position: 'relative' }}>
              <div style={{ width: '100%', padding: '8px 12px', borderRadius: 12, background: '#111', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'center', letterSpacing: '0.03em' }}>
                {(b.title || '').toUpperCase()}
              </div>
              {/* Button handle */}
              <div style={{ position: 'absolute', right: -28, top: '50%', transform: 'translateY(-50%)', ...HANDLE_SM, background: '#3b82f6' }} />
            </div>
          ))}
        </div>
      )}
      {data?.collectResponse && (
        <div style={{ marginTop: 10, padding: '6px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#1d4ed8' }}>Collecting {data.responseType || 'response'}</span>
        </div>
      )}
    </div>
  );
}

// ── AI Agent node (dark) ──
function AINodeView({ data }) {
  const isAdvanced = data?.selectedAITab === 'advanced' || data?.configType === 'advanced';
  const goals = Array.isArray(data?.goals) ? data.goals.filter(g => g?.task?.trim()) : [];
  const stepCount = goals.length || (Array.isArray(data?.goals) ? data.goals.length : 0);
  return (
    <div style={{ padding: '24px 24px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <NodeIcon icon="boosend" size={34} />
        <div style={{ marginLeft: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 500, color: '#fff', lineHeight: 1 }}>AI Agent</h3>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>{isAdvanced ? 'Advanced Agent' : 'Basic Agent'}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)' }}>
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
      {data?.knowledgeBaseId && data.knowledgeBaseId !== 'custom' && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>KB: {data.knowledgeBaseId}</div>
      )}
    </div>
  );
}

// ── Delay node ──
function DelayNodeView({ data }) {
  const t = data?.delayType || 'fixed';
  const typeLabel = t === 'random' ? 'Randomized' : t === 'schedule' ? 'Scheduled' : 'Fixed';
  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <NodeIcon icon="clock" size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Delay</div>
          <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
            <span style={{ background: '#111', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{typeLabel}</span>
            {t === 'fixed' && data?.duration != null && <span style={{ marginLeft: 6 }}>{data.duration} {data.unit || 'seconds'}</span>}
            {t === 'random' && data?.minDuration != null && <span style={{ marginLeft: 6 }}>{data.minDuration}-{data.maxDuration} {data.unit || 'seconds'}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Condition node ──
function ConditionNodeView({ data }) {
  const conditions = Array.isArray(data?.conditions) ? data.conditions : [];
  return (
    <div style={{ padding: '20px 24px', paddingRight: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <NodeIcon icon="branch" size={18} color="#6b7280" />
        <span style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Condition</span>
      </div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
        {conditions.length > 0 ? data.conditionSummary || conditions.map(c => c.type?.replace(/_/g, ' ')).join(` ${data.relationship || 'AND'} `) : 'Click to configure'}
      </div>
    </div>
  );
}

// ── Wait for Reply node ──
function WaitForReplyNodeView({ data }) {
  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <NodeIcon icon="message" size={20} color="#fff" />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Wait for Reply</h3>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Pauses until user replies</p>
        </div>
      </div>
      {data?.enableTimeout && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
          <NodeIcon icon="clock" size={14} color="#6b7280" />
          <span>Timeout: {data.timeout || 24} {data.timeoutUnit || 'hours'}</span>
        </div>
      )}
    </div>
  );
}

// ── Generic node fallback ──
function GenericNodeView({ type, data }) {
  const style = getNodeStyle(type);
  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <NodeIcon icon={style.icon} size={18} color={style.color} />
        <span style={{ fontSize: 16, fontWeight: 500, color: style.textColor || '#111' }}>{style.label}</span>
      </div>
      {data?.content && (
        <div style={{ marginTop: 8, fontSize: 13, color: style.textColor ? 'rgba(255,255,255,0.7)' : '#6b7280', lineHeight: 1.5, wordBreak: 'break-word' }}>
          {data.content}
        </div>
      )}
    </div>
  );
}

// ── Node Detail Modal (shown on click) ──
function NodeDetailModal({ node, onClose }) {
  if (!node) return null;
  const type = node.type || 'action';
  const style = getNodeStyle(type);
  const data = node.data || {};
  const isDark = ['ai', 'chatgpt', 'grok', 'gemini', 'aiExtractor', 'aiCondition'].includes(type);

  return (
    <div data-panel="1" onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: isDark ? '#111' : '#fff', borderRadius: 16, width: '90%', maxWidth: 480,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${isDark ? '#222' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NodeIcon icon={style.icon} size={20} color={style.color} />
            <span style={{ fontSize: 16, fontWeight: 600, color: isDark ? '#fff' : '#111' }}>{style.label}</span>
          </div>
          <button onClick={onClose} style={{ background: isDark ? '#222' : '#f3f4f6', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#9ca3af' : '#6b7280', fontSize: 16 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', color: isDark ? '#d1d5db' : '#374151', fontSize: 13, lineHeight: 1.6 }}>

          {/* AI Agent */}
          {['ai', 'chatgpt', 'grok', 'gemini'].includes(type) && (() => {
            const isAdvanced = data.selectedAITab === 'advanced' || data.configType === 'advanced';
            const goals = Array.isArray(data.goals) ? data.goals.filter(g => g?.task?.trim()) : [];
            return (<>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '3px 10px', borderRadius: 8, display: 'inline-block', marginBottom: 14 }}>
                {isAdvanced ? 'Advanced Agent' : 'Basic Agent'}
              </span>
              {data.prompt && <DRow label="Prompt" value={data.prompt} dark={isDark} block />}
              {goals.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Steps ({goals.length})</div>
                  {goals.map((g, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, padding: '10px 12px', background: isDark ? '#1a1a1a' : '#f9fafb', borderRadius: 10, border: `1px solid ${isDark ? '#222' : '#e5e7eb'}` }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: isDark ? '#333' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, color: isDark ? '#fff' : '#111' }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: isDark ? '#fff' : '#111' }}>{g.task}</div>
                        {g.description && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{g.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {data.knowledgeBase && <DRow label="Knowledge Base" value={data.knowledgeBaseName || data.knowledgeBase} dark={isDark} />}
            </>);
          })()}

          {type === 'aiExtractor' && (<>
            {data.extractionType && <DRow label="Extract" value={data.extractionType.replace(/_/g, ' ')} dark={isDark} />}
            {data.prompt && <DRow label="Prompt" value={data.prompt} dark={isDark} block />}
            {data.saveTo && <DRow label="Save to" value={data.saveTo} dark={isDark} />}
          </>)}

          {type === 'aiCondition' && (<>
            {data.prompt && <DRow label="Condition" value={data.prompt} dark={isDark} block />}
            {Array.isArray(data.paths) && data.paths.map((p, i) => <DRow key={i} label={`Path ${i + 1}`} value={p.label || p.description || `Option ${i + 1}`} dark={isDark} />)}
          </>)}

          {type === 'trigger' && (data.triggerConditions || []).map((c, i) => (
            <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: '#f9fafb', borderRadius: 10 }}>
              <div style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: 4 }}>{(c.type || 'message').replace(/_/g, ' ')}</div>
              {c.messageDetectionType && <DRow label="Detection" value={c.messageDetectionType.replace(/_/g, ' ')} />}
              {c.aiIntentPrompt && <DRow label="Intent" value={c.aiIntentPrompt} block />}
              {c.keywords?.length > 0 && <DRow label="Keywords" value={c.keywords.join(', ')} />}
            </div>
          ))}

          {['instagram', 'instagramReplyComment', 'telegram', 'gmail', 'outlook'].includes(type) && (<>
            {data.messageType && <DRow label="Type" value={data.messageType} />}
            {data.content && <DRow label="Message" value={data.content} block />}
            {data.buttons?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buttons ({data.buttons.length})</div>
                {data.buttons.map((b, i) => (
                  <div key={i} style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, marginBottom: 4, color: '#374151' }}>{b.title}{b.url ? ` - ${b.url}` : ''}</div>
                ))}
              </div>
            )}
            {data.imageUrl && <DRow label="Image" value={data.imageUrl} />}
            {data.collectResponse && <DRow label="Collects" value={data.responseType || 'response'} />}
          </>)}

          {type === 'condition' && (<>
            {data.conditionSummary && <DRow label="Logic" value={data.conditionSummary} block />}
            {data.relationship && <DRow label="Operator" value={data.relationship} />}
            {Array.isArray(data.conditions) && data.conditions.map((c, i) => <DRow key={i} label={`Rule ${i + 1}`} value={`${c.field || c.type || ''} ${c.operator || ''} ${c.value || ''}`} />)}
          </>)}

          {type === 'smartDelay' && (<>
            <DRow label="Type" value={data.delayType || 'fixed'} />
            {data.duration != null && <DRow label="Duration" value={`${data.duration} ${data.unit || 'seconds'}`} />}
            {data.minDuration != null && <DRow label="Min" value={`${data.minDuration} ${data.unit || 'seconds'}`} />}
            {data.maxDuration != null && <DRow label="Max" value={`${data.maxDuration} ${data.unit || 'seconds'}`} />}
          </>)}

          {type === 'waitForReply' && (<>
            {data.enableTimeout && <DRow label="Timeout" value={`${data.timeout || 24} ${data.timeoutUnit || 'hours'}`} />}
            {data.saveResponse && <DRow label="Save as" value={data.saveResponseAs || 'variable'} />}
          </>)}

          {type === 'action' && (<>
            {data.actionType && <DRow label="Action" value={data.actionType.replace(/_/g, ' ')} />}
            {data.tagName && <DRow label="Tag" value={data.tagName} />}
            {data.webhookUrl && <DRow label="Webhook" value={data.webhookUrl} />}
            {data.customFieldName && <DRow label="Field" value={`${data.customFieldName} = ${data.customFieldValue || ''}`} />}
          </>)}

          {type === 'tool' && (<>
            {data.toolType && <DRow label="Tool" value={data.toolType.replace(/_/g, ' ')} />}
            {data.spreadsheetId && <DRow label="Sheet" value={data.spreadsheetName || data.spreadsheetId} />}
            {data.notionDatabaseId && <DRow label="Database" value={data.notionDatabaseName || data.notionDatabaseId} />}
          </>)}

          {type === 'transferWorkflow' && data.targetAutomationId && <DRow label="Target" value={data.targetAutomationName || data.targetAutomationId} />}

          {type === 'randomizer' && Array.isArray(data.paths) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paths ({data.paths.length})</div>
              {data.paths.map((p, i) => <DRow key={i} label={`Path ${i + 1}`} value={`${p.weight || p.percentage || Math.round(100 / data.paths.length)}%`} />)}
            </div>
          )}

          {!['trigger', 'instagram', 'instagramReplyComment', 'ai', 'chatgpt', 'grok', 'gemini', 'aiExtractor', 'aiCondition', 'condition', 'smartDelay', 'waitForReply', 'action', 'tool', 'transferWorkflow', 'randomizer', 'telegram', 'gmail', 'outlook'].includes(type) && data.content && (
            <DRow label="Content" value={data.content} block />
          )}
        </div>
      </div>
    </div>
  );
}

function DRow({ label, value, dark, block }) {
  if (!value && value !== 0) return null;
  const labelColor = dark ? '#9ca3af' : '#6b7280';
  const textColor = dark ? '#fff' : '#111';
  return (
    <div style={{ marginBottom: block ? 14 : 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: labelColor, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {block
        ? <div style={{ background: dark ? '#1a1a1a' : '#f3f4f6', padding: '10px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: dark ? '#d1d5db' : '#374151' }}>{value}</div>
        : <div style={{ color: textColor, fontWeight: 500 }}>{String(value)}</div>
      }
    </div>
  );
}

// ── Node renderer ──
function AutomationNode({ node, isSelected, onSelect }) {
  const type = node.type || 'action';
  const style = getNodeStyle(type);
  const data = node.data || {};
  const isDark = style.bg === '#000';
  const isCondition = type === 'condition' || type === 'aiCondition';
  const isWaitForReply = type === 'waitForReply';
  const isAI = ['ai', 'chatgpt', 'grok', 'gemini'].includes(type);
  const hasButtons = type === 'instagram' && data.messageType === 'text' && data.buttons?.length > 0;
  const hasCollectResponse = (type === 'instagram' || type === 'instagramReplyComment') && data.collectResponse;

  let content;
  switch (type) {
    case 'trigger': content = <TriggerNodeView data={data} />; break;
    case 'instagram': case 'instagramReplyComment': content = <InstagramNodeView data={data} />; break;
    case 'ai': case 'chatgpt': case 'grok': case 'gemini': content = <AINodeView data={data} />; break;
    case 'smartDelay': content = <DelayNodeView data={data} />; break;
    case 'condition': case 'aiCondition': content = <ConditionNodeView data={data} />; break;
    case 'waitForReply': content = <WaitForReplyNodeView data={data} />; break;
    default: content = <GenericNodeView type={type} data={data} />;
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(node); }}
      style={{
        position: 'absolute',
        left: node.position?.x || 0,
        top: node.position?.y || 0,
        background: style.bg,
        border: `2px solid ${isSelected ? (isDark ? '#fff' : '#3b82f6') : style.border}`,
        ...NODE_BASE,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Left target handle (all except trigger) */}
      {type !== 'trigger' && (
        <div style={{ position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)', ...HANDLE, background: '#4b5563', zIndex: 2 }} />
      )}

      {content}

      {/* Right output handles — varies by node type */}
      {isCondition ? (
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>True</span>
            <div style={{ ...HANDLE, background: '#22c55e' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>False</span>
            <div style={{ ...HANDLE, background: '#ef4444' }} />
          </div>
        </div>
      ) : isWaitForReply ? (
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Reply</span>
            <div style={{ ...HANDLE, background: '#4b5563' }} />
          </div>
          {data.enableTimeout && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#f97316' }}>Timeout</span>
              <div style={{ ...HANDLE, background: '#f97316' }} />
            </div>
          )}
        </div>
      ) : hasButtons || hasCollectResponse ? (
        /* Buttons have their own handles in the content; skip default handle */
        null
      ) : (
        /* Default right handle */
        <div style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', ...HANDLE, background: '#4b5563', zIndex: 2 }} />
      )}

      {/* AI Agent: tools handle at bottom center */}
      {isAI && (
        <div style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', ...HANDLE_SM, background: '#3b82f6', zIndex: 2 }} />
      )}
    </div>
  );
}

// ── Edge renderer ──
function computeEdgePath(source, target, nodes) {
  const sNode = nodes.find(n => n.id === source);
  const tNode = nodes.find(n => n.id === target);
  if (!sNode || !tNode) return null;

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
  const [selectedNode, setSelectedNode] = useState(null);

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

  // Clear selection when nodes change
  useEffect(() => { setSelectedNode(null); }, [nodes]);

  // Wheel: pinch/ctrl+wheel = zoom, regular scroll = pan
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const h = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        setTf(p => {
          const ns = Math.min(Math.max(p.s * (e.deltaY > 0 ? 0.92 : 1.08), 0.1), 2.5);
          const ratio = ns / p.s;
          return { x: mx - ratio * (mx - p.x), y: my - ratio * (my - p.y), s: ns };
        });
      } else {
        setTf(p => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
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
      onMouseDown={(e) => {
        // Close panel when clicking on empty canvas
        if (!e.target.closest('[data-node]') && !e.target.closest('[data-panel]')) {
          setSelectedNode(null);
        }
        onMD(e);
      }}
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
            <AutomationNode
              node={node}
              isSelected={selectedNode?.id === node.id}
              onSelect={setSelectedNode}
            />
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {selectedNode && (
        <NodeDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
