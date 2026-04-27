import { Upload } from 'lucide-react';
import './ChatDropOverlay.css';

/**
 * Full-screen overlay shown while the user drags files over the page.
 * Pairs with useChatFileDropZone — render this anywhere in the tree;
 * it's position: fixed and covers the viewport when `visible`.
 *
 * pointer-events: none on the overlay itself so the underlying window
 * keeps receiving the dragenter/dragover/drop events that the hook
 * listens to. If we set pointer-events: auto here, the browser would
 * route drop events to this div and the hook (listening on window)
 * would still fire — but we'd also be intercepting clicks if the
 * overlay rendered briefly during state transitions. Safer to keep it
 * pass-through and let the window handle the events.
 */
export default function ChatDropOverlay({ visible, hint }) {
  if (!visible) return null;
  return (
    <div className="chat-drop-overlay" aria-hidden="true">
      <div className="chat-drop-overlay-inner">
        <div className="chat-drop-overlay-icon">
          <Upload size={48} strokeWidth={1.5} />
        </div>
        <h2 className="chat-drop-overlay-title">Drop to attach</h2>
        <p className="chat-drop-overlay-sub">
          {hint || 'Release anywhere on the page to add the file to your message.'}
        </p>
      </div>
    </div>
  );
}
