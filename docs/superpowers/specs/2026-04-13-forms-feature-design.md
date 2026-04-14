# Forms Feature Design Spec

**Date**: 2026-04-13
**Approach**: Port OpenForm (Typeform clone) into AICEO's React+Vite+Express+Supabase stack
**Branch**: `feature/forms`

## Overview

A full-featured form builder and player integrated into AICEO, inspired by [OpenForm](https://github.com/dabit3/openform). Users create customizable forms (Typeform-style, one question at a time), share them via public links or embeddable iframes, and collected data flows directly into the CRM.

## Requirements Summary

- 13 question types (matching OpenForm): short text, long text, email, phone, number, date, dropdown, checkboxes, yes/no, rating, opinion scale, file upload, URL
- Visual form builder with drag-and-drop reordering, 6 theme presets, live preview
- Typeform-style player with animated transitions, keyboard/scroll navigation
- Basic branching logic for yes/no and dropdown questions
- Auto-map submissions to CRM contacts (by question type convention)
- Store raw responses separately, viewable with search + CSV export
- Public link sharing + embeddable iframe snippet
- "Forms" nav item in sidebar

---

## 1. Data Model

### Table: `forms`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `user_id` | UUID | FK to `auth.users`, NOT NULL |
| `title` | text | NOT NULL, default 'Untitled Form' |
| `description` | text | nullable |
| `slug` | text | NOT NULL, unique per user |
| `status` | text | 'draft' / 'published' / 'closed', default 'draft' |
| `theme` | text | 'midnight' / 'ocean' / 'sunset' / 'forest' / 'lavender' / 'minimal', default 'minimal' |
| `questions` | JSONB | Array of question objects |
| `thank_you_message` | text | default 'Thank you for your response!' |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()`, auto-updated via trigger |

**Indexes**: `slug` + `user_id` (unique composite), `user_id`, `status`

**RLS**: Users can CRUD their own forms. Anyone can SELECT published forms (for the public player).

### Table: `form_responses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `form_id` | UUID | FK to `forms` ON DELETE CASCADE, NOT NULL |
| `answers` | JSONB | `{ "question_uuid": value }` -- values are strings, arrays, numbers, or file objects |
| `contact_id` | UUID | FK to `contacts`, nullable -- set when CRM auto-match happens |
| `submitted_at` | timestamptz | default `now()` |

**Indexes**: `form_id`, `submitted_at DESC`, `contact_id`

**RLS**: Form owners can SELECT and DELETE responses. Anyone can INSERT responses to published forms.

### Table: `form_branching_rules`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `form_id` | UUID | FK to `forms` ON DELETE CASCADE, NOT NULL |
| `question_id` | UUID | References a question ID in the JSONB array |
| `answer_value` | text | The answer that triggers this rule |
| `target_question_id` | UUID | The question to jump to |
| `created_at` | timestamptz | default `now()` |

**Indexes**: `form_id` + `question_id` (composite)

**RLS**: Same as forms -- only form owner can CRUD rules.

### Questions JSONB Structure

```json
[
  {
    "id": "uuid-v4",
    "type": "short_text|long_text|email|phone|number|date|dropdown|checkboxes|yes_no|rating|opinion_scale|file_upload|url",
    "title": "What's your email?",
    "description": "Optional helper text",
    "required": true,
    "options": ["Option A", "Option B"],
    "settings": {
      "min": 1,
      "max": 5,
      "placeholder": "Type here..."
    }
  }
]
```

### Answers JSONB Structure

```json
{
  "question-uuid-1": "John Doe",
  "question-uuid-2": "john@example.com",
  "question-uuid-3": ["Option A", "Option C"],
  "question-uuid-4": 4,
  "question-uuid-5": {
    "name": "photo.jpg",
    "url": "https://...",
    "type": "image/jpeg",
    "size": 12345
  }
}
```

---

## 2. Architecture & File Structure

### Frontend (new files)

```
src/pages/
  Forms.jsx              -- Forms list page (grid of form cards + create)
  Forms.css
  FormBuilder.jsx        -- 3-panel form builder
  FormBuilder.css
  FormPlayer.jsx         -- Public form player (Typeform-style)
  FormPlayer.css
  FormResponses.jsx      -- Responses table + CSV export
  FormResponses.css

src/components/forms/
  QuestionEditor.jsx     -- Edit panel for a single question
  QuestionRenderer.jsx   -- Renders a question input (all 13 types)
  QuestionCard.jsx       -- Sidebar card for drag-reorder list
  ThemePicker.jsx        -- 6-theme grid selector
  FormSettings.jsx       -- Slug, description, thank-you message
  BranchingEditor.jsx    -- Rule editor for yes/no and dropdown branching
  AddQuestionDialog.jsx  -- Type picker dialog (13 types in grid)
  FormPreview.jsx        -- Live preview panel in builder
```

### Backend (new files)

```
backend/routes/forms.js  -- All form endpoints
backend/migrations/add_forms_tables.sql -- Migration for 3 tables + RLS + triggers
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/forms` | Yes | List user's forms |
| POST | `/api/forms` | Yes | Create form |
| GET | `/api/forms/:id` | Yes | Get form by ID |
| PUT | `/api/forms/:id` | Yes | Update form (questions, settings, theme) |
| DELETE | `/api/forms/:id` | Yes | Delete form |
| POST | `/api/forms/:id/publish` | Yes | Set status to 'published' |
| POST | `/api/forms/:id/unpublish` | Yes | Set status to 'draft' |
| GET | `/api/forms/public/:slug` | No | Get published form for player |
| POST | `/api/forms/public/:slug/submit` | No | Submit response + CRM auto-mapping |
| GET | `/api/forms/:id/responses` | Yes | List responses |
| DELETE | `/api/forms/:id/responses/:rid` | Yes | Delete a response |
| GET | `/api/forms/:id/responses/csv` | Yes | Export responses as CSV |
| GET | `/api/forms/:id/branching` | Yes | Get branching rules |
| PUT | `/api/forms/:id/branching` | Yes | Save branching rules (full replace) |

### Routing (App.jsx changes)

```
/forms                   -- Forms list (auth'd, inside Layout)
/forms/:id/edit          -- Form builder (auth'd, inside Layout)
/forms/:id/responses     -- Responses view (auth'd, inside Layout)
/f/:slug                 -- Public form player (NO auth, outside Layout)
```

### Sidebar Change

Add "Forms" as a top-level nav item in `Sidebar.jsx`, positioned between "Inbox" and "CRM":

```javascript
{ to: '/forms', label: 'Forms' }
```

### New Dependency

- `framer-motion` -- for player slide transitions and drag-and-drop question reordering

---

## 3. Form Builder UX

### 3-Panel Layout

**Left sidebar (280px)** with 3 tabs:

1. **Questions tab**: Draggable list of question cards using framer-motion `Reorder.Group`. Each card shows: question number, type icon (lucide-react), truncated title, required badge, delete button. Click to select for editing.

2. **Design tab**: 6 theme preset cards in a 2x3 grid. Each shows the theme name and color swatches (primary, background, text, accent). Click to apply. Active theme has a highlight border.

3. **Settings tab**: Form URL slug (auto-sanitized to lowercase alphanumeric + hyphens), description textarea, thank-you message textarea.

**Center panel (384px)** -- Question Editor (slides in when a question is selected):

- Type badge (icon + label)
- Title textarea (auto-resize)
- Description textarea (optional)
- Type-specific settings:
  - Dropdown/Checkboxes: Options editor (add/edit/delete options with inline text inputs)
  - Rating: Min/max value inputs (default 1-5)
  - Opinion scale: Min/max value inputs (default 1-10)
  - Text inputs: Placeholder text
  - File upload: Max file size
- Required toggle (switch component)
- **Branching section** (only visible for yes/no and dropdown types):
  - "If answer is [value dropdown], go to [question picker dropdown]"
  - Add rule / remove rule buttons
  - Default behavior (no matching rule) = next question in order
- Delete question button

**Right panel (remaining space)** -- Live Preview:

- Renders all questions vertically with the selected theme applied via CSS custom properties
- Click any question in preview to select it for editing in the center panel
- Shows the form as it will appear to respondents (but scrollable, not one-at-a-time)

**Header bar**:

- Inline-editable form title
- Status badge (Draft / Published / Closed)
- Save button (with unsaved changes indicator)
- Publish / Unpublish button
- Copy Link button + View button (visible when published)
- Responses button (links to `/forms/:id/responses`)

**Add Question**:

- "+" button at bottom of question list in the sidebar
- Opens a modal/dialog with a 3-column grid of all 13 question types
- Each type shows: lucide icon, label, one-line description
- Clicking a type adds it to the end of the question list and selects it for editing

### 6 Theme Presets

| Theme | Primary | Background | Text | Accent | Font |
|-------|---------|------------|------|--------|------|
| Midnight | #8B5CF6 | #1a1a2e | #ffffff | #a78bfa | Inter |
| Ocean | #0EA5E9 | #0c1929 | #ffffff | #38bdf8 | Inter |
| Sunset | #F97316 | #fffbeb | #1a1a1a | #fb923c | Inter |
| Forest | #22C55E | #0a1f0a | #ffffff | #4ade80 | Inter |
| Lavender | #A855F7 | #faf5ff | #1a1a1a | #c084fc | Inter |
| Minimal | #000000 | #ffffff | #1a1a1a | #6b7280 | Inter |

Applied via CSS custom properties: `--theme-primary`, `--theme-background`, `--theme-text`, `--theme-accent`, `--theme-font`.

---

## 4. Form Player UX

### Layout

- Full-screen, no sidebar, no AICEO navigation
- Themed background + text colors via CSS custom properties
- Progress bar fixed at top (colored with `--theme-primary`)

### One Question at a Time

- Each question centered vertically and horizontally
- Shows: question number with arrow icon, large bold title, optional description, then the input
- Framer Motion `AnimatePresence` with vertical slide transitions (direction-aware)

### Navigation

- **Enter** advances to next question (Cmd/Ctrl+Enter for long text)
- **Arrow Up/Down** navigate between questions
- **Scroll wheel** navigates (500ms debounce, 50px delta threshold)
- **OK/Submit button** in footer advances or submits on last question
- **Chevron up/down buttons** in footer for mouse navigation

### Branching Logic

- After answering a yes/no or dropdown question, check `form_branching_rules` for a matching `answer_value`
- If a rule matches, jump to `target_question_id` instead of the next question in order
- If no rule matches, proceed to next question in array order
- Branching rules are fetched once with the form data and evaluated client-side

### Validation

- Per-question, inline, shown as animated red text below input
- Required field check
- Email: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Phone: regex `/^[+]?[\d\s\-().]+$/`
- URL: `new URL()` constructor validation
- Number: `isNaN()` check

### Auto-advance

- Dropdown, yes/no, opinion scale: selecting an answer automatically advances (skipping validation since a value was just chosen)

### Thank You Screen

- Checkmark animation
- Customizable thank-you message from form settings
- "Made with AICU" branding

### Submission

- Accumulated answers stored in React state as `Record<string, any>` keyed by question ID
- On final question submit, POST to `/api/forms/public/:slug/submit`
- No auth required

---

## 5. CRM Integration

### Auto-mapping (server-side, on form submission)

When a response is submitted via `/api/forms/public/:slug/submit`:

1. Look up the form to get its `user_id` (the form owner) and `questions` array
2. Extract field values by question type:
   - `email` type question -> contact email
   - `phone` type question -> contact phone
   - `short_text` where title contains "name" (case-insensitive) -> contact name
   - `short_text` where title contains "business" or "company" (case-insensitive) -> contact business
3. If an email was found:
   - Query `contacts` for existing contact with that email + same `user_id`
   - If found: update with any new mapped fields, append remaining answers to notes
   - If not found: create new contact with mapped fields, `source: "form"`, remaining answers as notes
4. Set `form_responses.contact_id` to the matched/created contact ID
5. If no email question exists, store response without CRM linkage

### Notes Format

Unmapped answers are stored as a formatted note on the contact:

```
Form: "My Survey" (2026-04-13)
- What's your budget? $5,000-$10,000
- How did you hear about us? Instagram
- Additional comments: Looking forward to working together
```

---

## 6. Sharing & Embedding

### Public Link

- URL format: `{FRONTEND_URL}/f/{slug}`
- Available after publishing
- "Copy Link" button in form builder header

### Embeddable iframe

- Generate snippet from the form builder:
  ```html
  <iframe src="{FRONTEND_URL}/f/{slug}" width="100%" height="600" frameborder="0"></iframe>
  ```
- "Embed" button in form builder header shows a modal with the snippet + copy button

---

## 7. Forms List Page

Grid layout showing form cards. Each card displays:
- Form title
- Status badge (draft/published/closed)
- Response count
- Created date
- Quick actions: Edit, View responses, Copy link (if published), Delete

Header: "Forms" title + "Create Form" button.

Empty state: Illustration + "Create your first form" CTA.

---

## 8. Responses Page

Data table with columns:
- "Submitted" timestamp
- One column per question (header = question title)
- Contact link (if `contact_id` is set, clickable to CRM)

Features:
- Search across all answer values
- Delete individual responses
- CSV export (client-side CSV generation + download)
- File upload answers render as clickable badges (preview in dialog)

---

## 9. Migration Plan

Single SQL migration file: `backend/migrations/add_forms_tables.sql`

Creates:
1. `forms` table with indexes and RLS policies
2. `form_responses` table with indexes and RLS policies
3. `form_branching_rules` table with indexes and RLS policies
4. `update_updated_at` trigger on `forms` (reuse existing function if available)
5. `generate_unique_slug` function for form slug generation

---

## 10. File Upload Storage

AICEO does not currently have Cloudflare R2 or similar object storage configured. For V1, file uploads in form responses will use **Supabase Storage** (already available via the Supabase instance). Files uploaded via the form player will be stored in a `form-uploads` bucket, and the answer JSONB will contain the public URL + file metadata. Supabase Storage provides a 1GB free tier which is sufficient for initial usage.
