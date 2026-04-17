# LinkedIn Prompt Injection & Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LinkedIn system prompt with Notion-dox prompts (text post vs carousel, AI asks which), and add a LinkedIn-style artifact preview panel that opens when content is generated.

**Architecture:** The LinkedIn `PLATFORM_GUIDANCE` entry becomes a router that includes both full prompts with section headers. When the AI generates LinkedIn content, it's detected and rendered in a new `LinkedInPreview` component shown as a right-side panel. The Content page layout gains a split-view mode (chat left, preview right) toggled by state.

**Tech Stack:** React 19, CSS, existing Content.jsx patterns, existing auth context for user profile data.

---

### Task 1: Replace LinkedIn system prompt with Notion-dox prompts

**Files:**
- Modify: `src/pages/Content.jsx:87-292` (the `PLATFORM_GUIDANCE.linkedin` string)
- Read: `Notion-dox/New_Text.md`, `Notion-dox/Intent_Carousal.md`

The current `PLATFORM_GUIDANCE.linkedin` is a single ~200-line prompt. Replace it with a router prompt that includes both the text post prompt (from `New_Text.md`) and the carousel prompt (from `Intent_Carousal.md`), with routing instructions.

- [ ] **Step 1: Read the Notion-dox prompt files and prepare the replacement**

Replace the entire `linkedin: \`LINKEDIN TEXT POST STRATEGIST...\`` entry in the `PLATFORM_GUIDANCE` object (lines 87-292 of `Content.jsx`) with a new string that has this structure:

```javascript
  linkedin: `=== LINKEDIN CONTENT TYPE ROUTING ===
IMPORTANT: Before creating any LinkedIn content, you MUST first determine the content type.
Ask the user this question using the JSON format:
{"type":"question","text":"What type of LinkedIn content would you like to create?","options":["Text Post","Carousel"]}

Wait for their answer. Then follow the appropriate section below based on their choice.
If the user has already indicated the type (e.g. "write a text post" or "create a carousel"), skip the question and go directly to the matching section.

======= IF TEXT POST =======
${TEXT_POST_PROMPT}

======= IF CAROUSEL =======
${CAROUSEL_PROMPT}
`,
```

Where `TEXT_POST_PROMPT` and `CAROUSEL_PROMPT` are constants defined above `PLATFORM_GUIDANCE` containing the full contents of `Notion-dox/New_Text.md` and `Notion-dox/Intent_Carousal.md` respectively.

- [ ] **Step 2: Define the prompt constants above PLATFORM_GUIDANCE**

Add two constants before the `PLATFORM_GUIDANCE` object:

```javascript
const LINKEDIN_TEXT_PROMPT = `LINKEDIN TEXT POST STRATEGIST (INTENT-DRIVEN)
...entire contents of Notion-dox/New_Text.md...`;

const LINKEDIN_CAROUSEL_PROMPT = `LINKEDIN CAROUSEL CONTENT STRATEGIST (INTENT-DRIVEN)
...entire contents of Notion-dox/Intent_Carousal.md...`;
```

Copy the full file contents as template literal strings. Escape any backticks inside with `\``.

- [ ] **Step 3: Update PLATFORM_GUIDANCE.linkedin to reference the constants**

```javascript
  linkedin: `=== LINKEDIN CONTENT TYPE ROUTING ===
IMPORTANT: Before creating any LinkedIn content, you MUST first determine the content type.
Ask the user this question using the JSON format:
{"type":"question","text":"What type of LinkedIn content would you like to create?","options":["Text Post","Carousel"]}

Wait for their answer. Then follow the appropriate section below.
If the user already indicated the type (e.g. "write me a text post", "make a carousel"), skip the question and follow the matching section directly.

============================================================
SECTION A: TEXT POST (use when user chose "Text Post")
============================================================
${LINKEDIN_TEXT_PROMPT}

============================================================
SECTION B: CAROUSEL (use when user chose "Carousel")
============================================================
${LINKEDIN_CAROUSEL_PROMPT}
`,
```

- [ ] **Step 4: Verify no syntax errors**

Run: `cd /Users/bazil/Documents/Marko/AICEO && npm run build 2>&1 | head -30`
Expected: Build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Content.jsx
git commit -m "feat(content): inject Notion-dox LinkedIn prompts with text/carousel routing"
```

---

### Task 2: Create the LinkedInPreview component

**Files:**
- Create: `src/components/LinkedInPreview.jsx`
- Create: `src/components/LinkedInPreview.css`

This component renders a pixel-perfect LinkedIn post mockup with editable text and optional image.

- [ ] **Step 1: Create LinkedInPreview.jsx**

```jsx
import { useState, useRef, useEffect } from 'react';
import { Copy, Check, ImagePlus, Loader, X } from 'lucide-react';
import './LinkedInPreview.css';

export default function LinkedInPreview({ content, images, userName, userAvatar, onClose, onGenerateImage, isGeneratingImage }) {
  const [text, setText] = useState(content || '');
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  // Sync when new content arrives (streaming)
  useEffect(() => {
    if (content) setText(content);
  }, [content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTextInput = (e) => {
    setText(e.currentTarget.innerText);
  };

  const sortedImages = images ? [...images].sort((a, b) => a.idx - b.idx) : [];
  const hasImage = sortedImages.length > 0;

  return (
    <div className="li-preview">
      <div className="li-preview-header">
        <span className="li-preview-title">LinkedIn Preview</span>
        <button className="li-preview-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="li-preview-body">
        <div className="li-card">
          {/* Post header */}
          <div className="li-card-header">
            <div className="li-avatar">
              {userAvatar ? (
                <img src={userAvatar} alt="" />
              ) : (
                <div className="li-avatar-placeholder">{(userName || 'U')[0]}</div>
              )}
            </div>
            <div className="li-meta">
              <span className="li-name">{userName || 'Your Name'}</span>
              <span className="li-headline">Your headline here</span>
              <span className="li-time">Just now · <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 107 7 7 7 0 00-7-7zM3 8a5 5 0 1110 0A5 5 0 013 8z"/><path d="M12 3.07l-.39.35a9.27 9.27 0 01-3.22 2.15 10.63 10.63 0 01-3.44.85L4 6.53V8a4 4 0 104-4z"/></svg></span>
            </div>
          </div>

          {/* Post text — editable */}
          <div
            className="li-card-text"
            ref={textRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleTextInput}
          >
            {text}
          </div>

          {/* Post image */}
          {hasImage && (
            <div className="li-card-image">
              <img src={sortedImages[0].src} alt="" />
            </div>
          )}

          {/* Reactions bar */}
          <div className="li-reactions">
            <div className="li-reactions-icons">
              <span className="li-reaction li-reaction--like">👍</span>
              <span className="li-reaction li-reaction--celebrate">👏</span>
              <span className="li-reaction li-reaction--love">❤️</span>
            </div>
            <span className="li-reactions-count">Be the first to react</span>
          </div>

          <div className="li-divider" />

          {/* Action buttons */}
          <div className="li-actions">
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 22V11l-5 4V7l5 4V2l10 10L7 22z"/></svg>
              Like
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Comment
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
              Repost
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="li-preview-toolbar">
        <button className="li-toolbar-btn" onClick={handleCopy}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Text</>}
        </button>
        {onGenerateImage && (
          <button
            className="li-toolbar-btn li-toolbar-btn--primary"
            onClick={() => onGenerateImage(text)}
            disabled={isGeneratingImage || !text.trim()}
          >
            {isGeneratingImage ? <><Loader size={14} className="li-spin" /> Generating...</> : <><ImagePlus size={14} /> Generate Image</>}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create LinkedInPreview.css**

```css
/* ── LinkedIn Preview Panel ── */
.li-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #0a0a0a);
  border-left: 1px solid rgba(255,255,255,0.08);
}

.li-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.li-preview-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  letter-spacing: 0.3px;
}

.li-preview-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.li-preview-close:hover {
  color: #fff;
  background: rgba(255,255,255,0.08);
}

.li-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* ── LinkedIn Card ── */
.li-card {
  width: 100%;
  max-width: 520px;
  background: #1b1f23;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  overflow: hidden;
}

.li-card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px 0;
}

.li-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}
.li-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.li-avatar-placeholder {
  width: 100%;
  height: 100%;
  background: #0a66c2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
}

.li-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.li-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.95);
}
.li-headline {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
}
.li-time {
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  display: flex;
  align-items: center;
  gap: 4px;
}
.li-time svg {
  opacity: 0.6;
}

/* ── Editable post text ── */
.li-card-text {
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255,255,255,0.9);
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 80px;
  outline: none;
  cursor: text;
  border: 1px solid transparent;
  border-radius: 4px;
  margin: 0 8px;
  transition: border-color 0.15s;
}
.li-card-text:focus {
  border-color: rgba(10, 102, 194, 0.5);
  background: rgba(255,255,255,0.02);
}
.li-card-text:hover:not(:focus) {
  border-color: rgba(255,255,255,0.1);
}

/* ── Post image ── */
.li-card-image {
  width: 100%;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.li-card-image img {
  width: 100%;
  display: block;
}

/* ── Reactions ── */
.li-reactions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
}
.li-reactions-icons {
  display: flex;
  gap: -2px;
}
.li-reaction {
  font-size: 14px;
}
.li-reactions-count {
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  margin-left: 4px;
}

.li-divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 0 16px;
}

/* ── Action buttons ── */
.li-actions {
  display: flex;
  justify-content: space-around;
  padding: 4px 8px;
}
.li-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  font-weight: 500;
  cursor: default;
  border-radius: 4px;
  font-family: inherit;
}

/* ── Bottom toolbar ── */
.li-preview-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.li-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.8);
  transition: all 0.15s;
}
.li-toolbar-btn:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.25);
}
.li-toolbar-btn--primary {
  background: #0a66c2;
  border-color: #0a66c2;
  color: #fff;
}
.li-toolbar-btn--primary:hover {
  background: #004182;
  border-color: #004182;
}
.li-toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* spinner */
.li-spin {
  animation: li-spin 1s linear infinite;
}
@keyframes li-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/bazil/Documents/Marko/AICEO && npm run build 2>&1 | head -30`
Expected: Build completes without errors (component not yet used, tree-shaken).

- [ ] **Step 4: Commit**

```bash
git add src/components/LinkedInPreview.jsx src/components/LinkedInPreview.css
git commit -m "feat(content): add LinkedInPreview component with editable text and LinkedIn-style UI"
```

---

### Task 3: Integrate LinkedInPreview into Content page

**Files:**
- Modify: `src/pages/Content.jsx` (import, state, detection logic, layout)
- Modify: `src/pages/Content.css` (split-view layout)

Wire up the preview panel: detect when LinkedIn text content is generated (an assistant message on LinkedIn platform with text content and no current question), open the panel, and handle the "Generate Image" action.

- [ ] **Step 1: Add import and state to Content.jsx**

At the top of `Content.jsx`, add the import (after the existing imports around line 8):

```javascript
import LinkedInPreview from '../components/LinkedInPreview';
```

Inside the `Content()` function, after the existing state declarations (around line 839), add:

```javascript
const [linkedinPreview, setLinkedinPreview] = useState(null); // { content, images, msgId }
const [liGeneratingImage, setLiGeneratingImage] = useState(false);
```

- [ ] **Step 2: Add LinkedIn preview detection in sendToAI**

In the `sendToAI` callback, after the question parsing block (around line 1278, after the `if (questionParsed)` block), add logic to detect LinkedIn text content and open the preview:

```javascript
      // Open LinkedIn preview when text content is generated on LinkedIn platform (no question, has text)
      if (selectedPlatform === 'linkedin' && !questionParsed && streamedContent && streamedContent.trim().length > 100) {
        // Get the latest message's images
        const latestMsg = messages.find(m => m.id === assistantMsgId) || {};
        setLinkedinPreview({
          content: streamedContent.replace(/\[CONTEXT[^\]]*\]\n?/g, '').trim(),
          images: latestMsg.images || [],
          msgId: assistantMsgId,
        });
      }
```

Note: This must go inside the `try` block of `sendToAI`, right after line 1278 (after the question handling `if` block), but still before the `catch`.

- [ ] **Step 3: Keep preview images in sync**

The images arrive asynchronously after text. Add an effect to sync preview images when they update. After the `linkedinPreview` state declaration, add:

```javascript
// Keep LinkedIn preview images in sync with the message's images
useEffect(() => {
  if (!linkedinPreview?.msgId) return;
  const msg = messages.find(m => m.id === linkedinPreview.msgId);
  if (msg && msg.images?.length !== linkedinPreview.images?.length) {
    setLinkedinPreview(prev => prev ? { ...prev, images: msg.images } : null);
  }
}, [messages, linkedinPreview?.msgId]);
```

- [ ] **Step 4: Add handleLinkedinGenerateImage function**

After the `handleImageEdit` callback (around line 1367), add:

```javascript
const handleLinkedinGenerateImage = useCallback(async (postText) => {
  if (!linkedinPreview || liGeneratingImage) return;
  setLiGeneratingImage(true);
  try {
    const imgPrompt = `Professional LinkedIn post image. Clean, minimal design with authority. 4:3 landscape ratio. The image should complement this LinkedIn post: "${postText.slice(0, 200)}". Use brand colors if available. Bold headline text, professional photography or clean graphic design. No cartoons, no clip-art.`;
    const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
    const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
    const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
    const brandImageData = {
      photoUrls: allPhotoUrls,
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    const result = await generateImage(imgPrompt, 'linkedin', brandImageData, null);
    if (result.image) {
      const src = `data:${result.image.mimeType};base64,${result.image.data}`;
      const newImg = { src, idx: 0 };
      // Update the message
      setMessages(prev => prev.map(m =>
        m.id === linkedinPreview.msgId
          ? { ...m, images: [...(m.images || []), newImg] }
          : m
      ));
      // Update the preview
      setLinkedinPreview(prev => prev ? { ...prev, images: [...(prev.images || []), newImg] } : null);
    }
  } catch (err) {
    console.error('LinkedIn image generation failed:', err);
  } finally {
    setLiGeneratingImage(false);
  }
}, [linkedinPreview, liGeneratingImage, photos, brandDna, selectedPlatform]);
```

- [ ] **Step 5: Add the LinkedInPreview to the JSX layout**

In the return statement of `Content()`, wrap `content-main` and the preview panel in a container. Find the `<div className="content-main">` (around line 2175) and wrap it:

Change the structure from:
```jsx
<div className="content-page">
  <aside className={`content-sidebar ...`}> ... </aside>
  {/* Mobile sheets */}
  <div className="content-main"> ... </div>
</div>
```

To:
```jsx
<div className="content-page">
  <aside className={`content-sidebar ...`}> ... </aside>
  {/* Mobile sheets */}
  <div className={`content-main ${linkedinPreview ? 'content-main--split' : ''}`}>
    <div className="content-main-chat">
      {/* Everything that was inside content-main goes here */}
    </div>
    {linkedinPreview && (
      <div className="content-main-preview">
        <LinkedInPreview
          content={linkedinPreview.content}
          images={linkedinPreview.images}
          userName={user?.name}
          userAvatar={user?.avatar}
          onClose={() => setLinkedinPreview(null)}
          onGenerateImage={handleLinkedinGenerateImage}
          isGeneratingImage={liGeneratingImage}
        />
      </div>
    )}
  </div>
</div>
```

Also add the `useAuth` import at the top if not already present:
```javascript
import { useAuth } from '../context/AuthContext';
```

And inside the `Content()` function, add:
```javascript
const { user } = useAuth();
```

- [ ] **Step 6: Update Content.css with split-view layout**

Add these styles to `Content.css`:

```css
/* ── Split view for LinkedIn preview ── */
.content-main--split {
  flex-direction: row;
}

.content-main--split .content-main-chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content-main-preview {
  width: 420px;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}

/* When NOT in split mode, content-main-chat takes full width */
.content-main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Mobile: preview takes full screen overlay */
@media (max-width: 768px) {
  .content-main-preview {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    z-index: 100;
    background: var(--bg-primary, #0a0a0a);
  }
}
```

- [ ] **Step 7: Move existing content-main children into content-main-chat**

The existing elements inside `.content-main` (the top bar, sessions panel, chat area, and input area) need to be wrapped in `.content-main-chat`. This is a structural change — all the JSX currently inside `<div className="content-main">` (the platform pills, sessions overlay, chat area, and input area) should be moved inside `<div className="content-main-chat">`.

Specifically, move everything from the `{/* Platform Pill Selector */}` comment through the closing of the input area `</div>` into the new `content-main-chat` wrapper.

- [ ] **Step 8: Verify build**

Run: `cd /Users/bazil/Documents/Marko/AICEO && npm run build 2>&1 | head -30`
Expected: Build completes without errors.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Content.jsx src/pages/Content.css
git commit -m "feat(content): integrate LinkedIn preview panel with split-view layout and image generation"
```

---

### Task 4: Close preview on platform switch and new conversation

**Files:**
- Modify: `src/pages/Content.jsx`

Ensure the LinkedIn preview closes when the user switches platforms or starts a new conversation.

- [ ] **Step 1: Close preview on platform switch**

Find the platform selector `onClick` handler (around line 2191):
```jsx
onClick={() => setSelectedPlatform(p.id)}
```

Change to:
```jsx
onClick={() => { setSelectedPlatform(p.id); setLinkedinPreview(null); }}
```

- [ ] **Step 2: Close preview on new conversation**

In the `newConversation` callback (around line 1055), add `setLinkedinPreview(null)`:

```javascript
const newConversation = useCallback(() => {
  setSessionId(null);
  setMessages([]);
  setCurrentQuestion(null);
  setShowSessions(false);
  setLinkedinPreview(null);
}, []);
```

- [ ] **Step 3: Close preview on session load**

In the `loadSession` callback (around line 1040), add `setLinkedinPreview(null)`:

```javascript
const loadSession = useCallback(async (id) => {
  const { data, error } = await supabase
    .from('content_sessions')
    .select('id, title, platform, messages')
    .eq('id', id)
    .single();
  if (error || !data) return;
  setSessionId(data.id);
  setSelectedPlatform(data.platform || 'instagram');
  setMessages(data.messages || []);
  setCurrentQuestion(null);
  setShowSessions(false);
  setLinkedinPreview(null);
}, []);
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Content.jsx
git commit -m "fix(content): close LinkedIn preview on platform switch and new conversation"
```

---

### Task 5: Final verification and polish

**Files:**
- All modified files

- [ ] **Step 1: Full build check**

Run: `cd /Users/bazil/Documents/Marko/AICEO && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/bazil/Documents/Marko/AICEO && npm run lint 2>&1 | tail -20`
Expected: No errors (warnings are OK).

- [ ] **Step 3: Manual test checklist**

Run `npm run dev` and verify:
1. Select LinkedIn platform tab
2. Type "create a post about AI" — AI should ask "Text Post or Carousel?"
3. Select "Text Post" — AI follows New_Text.md prompt structure
4. When text content is generated, preview panel opens on the right
5. Post text is editable in the preview
6. "Copy Text" button works
7. "Generate Image" button triggers image generation and shows result in preview
8. Switching platforms closes the preview
9. Starting a new conversation closes the preview

- [ ] **Step 4: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore: polish LinkedIn preview integration"
```
