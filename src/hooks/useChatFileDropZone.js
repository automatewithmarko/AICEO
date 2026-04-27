import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Window-level drag-and-drop file dropper. Listens on the whole window so
 * the user can drop a file ANYWHERE on the page (WhatsApp-style) — even
 * outside the chat input. Calls `onFiles(File[])` on drop.
 *
 * Returns { dragging } so the caller can render an overlay while files
 * are being dragged over the page.
 *
 * Notes:
 * - Internal drags (e.g. story-frame thumbnail reorder) DON'T set
 *   dataTransfer.types to include 'Files', so we early-out on those —
 *   the hook only activates for OS-level file drags from Finder /
 *   Explorer / desktop.
 * - We count enter/leave events (counterRef) so child-element traversal
 *   doesn't make the overlay strobe — common gotcha with HTML5 drag.
 * - Always preventDefault on dragover for the page; without it the
 *   browser would open the dropped file as a new navigation.
 */
export function useChatFileDropZone({ onFiles, enabled = true }) {
  const [dragging, setDragging] = useState(false);
  const counterRef = useRef(0);

  const reset = () => {
    counterRef.current = 0;
    setDragging(false);
  };

  const handleDragEnter = useCallback((e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    counterRef.current += 1;
    if (counterRef.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    counterRef.current = Math.max(0, counterRef.current - 1);
    if (counterRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    reset();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    onFiles?.(files);
  }, [onFiles]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      reset();
    };
  }, [enabled, handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return { dragging };
}

// True only when the user is dragging actual OS-level files (not an
// in-page drag like a list-reorder). dataTransfer.types is a DOMStringList
// containing 'Files' iff the drag carries files.
function hasFiles(e) {
  if (!e.dataTransfer) return false;
  const types = e.dataTransfer.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i += 1) {
    if (types[i] === 'Files') return true;
  }
  return false;
}
