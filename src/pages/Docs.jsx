import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Sparkles,
  LayoutDashboard,
  PenLine,
  Search,
  Calendar,
  Megaphone,
  TrendingUp,
  Package,
  Video,
  Mail,
  ListChecks,
  Users,
  Settings as SettingsIcon,
  CreditCard,
  Clock,
  Zap,
  Plug,
} from 'lucide-react';
import './Docs.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'ai-ceo', label: 'AI CEO', icon: Sparkles },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'create-content', label: 'Create Content', icon: PenLine },
  { id: 'outlier-detector', label: 'Outlier Detector', icon: Search },
  { id: 'content-calendar', label: 'Content Calendar', icon: Calendar },
  { id: 'marketing-ai', label: 'Marketing AI', icon: Megaphone },
  { id: 'sales', label: 'Sales Overview', icon: TrendingUp },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'meetings', label: 'Call Recording', icon: Video },
  { id: 'inbox', label: 'Inbox', icon: Mail },
  { id: 'forms', label: 'Forms', icon: ListChecks },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'settings', label: 'Settings & Brand DNA', icon: SettingsIcon },
  { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
  { id: 'coming-soon', label: 'Coming Soon', icon: Clock },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'credits-gating', label: 'Credits & Gating', icon: Zap },
];

function Section({ id, title, lead, children }) {
  return (
    <section id={id} className="docs-section">
      <h2 className="docs-section-title">{title}</h2>
      {lead && <p className="docs-section-lead">{lead}</p>}
      {children}
    </section>
  );
}

function Block({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="docs-block">
      <h4 className="docs-block-title">{title}</h4>
      <ul className="docs-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Docs() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  // Highlight the section currently nearest the top of the viewport.
  useEffect(() => {
    const elements = SECTIONS
      .map((s) => document.getElementById(s.id))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleNav = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  const lastUpdated = useMemo(() => new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }), []);

  return (
    <div className="docs-page">
      <aside className="docs-toc">
        <div className="docs-toc-header">
          <BookOpen size={18} />
          <span>Documentation</span>
        </div>
        <nav className="docs-toc-nav">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={handleNav(s.id)}
              className={`docs-toc-link ${activeId === s.id ? 'docs-toc-link--active' : ''}`}
            >
              <s.icon size={14} />
              <span>{s.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="docs-main">
        <header className="docs-header">
          <div className="docs-eyebrow">User Guide</div>
          <h1 className="docs-title">Everything you can do in AICEO</h1>
          <p className="docs-subtitle">
            A feature-by-feature walkthrough of what you can add, generate,
            and ship across the platform. Last updated {lastUpdated}.
          </p>
        </header>

        <Section
          id="overview"
          title="Overview"
          lead="AICEO is an end-to-end command center for solo founders and small teams. It bundles content creation, marketing assets, sales tracking, a CRM, an inbox, call recording, forms, and an AI assistant that knows your business — all behind one login."
        >
          <div className="docs-overview-grid">
            <div className="docs-overview-card">
              <h4>Talk to your business</h4>
              <p>The <strong>AI CEO</strong> chat orchestrates every tool in the app — write a newsletter, draft a DM sequence, generate a landing page, all from one prompt.</p>
            </div>
            <div className="docs-overview-card">
              <h4>Make content fast</h4>
              <p><strong>Create Content</strong> generates posts, carousels, stories, images, and video scripts. The <strong>Calendar</strong> ships them. The <strong>Outlier Detector</strong> tells you what's working.</p>
            </div>
            <div className="docs-overview-card">
              <h4>Run the back office</h4>
              <p><strong>Sales</strong>, <strong>Products</strong>, <strong>CRM</strong>, <strong>Inbox</strong>, <strong>Forms</strong>, and <strong>Call Recording</strong> keep revenue, leads, and conversations in one place.</p>
            </div>
            <div className="docs-overview-card">
              <h4>Train it on you</h4>
              <p><strong>Brand DNA</strong> in Settings (photos, logos, colors, fonts, business docs) is read by every generator so output sounds and looks like you.</p>
            </div>
          </div>
        </Section>

        <Section
          id="ai-ceo"
          title="AI CEO"
          lead="A multi-thread conversational assistant that orchestrates every other tool. Ask it to do a thing and it produces a real artifact — a newsletter, an image, a carousel, a DM script — not just a chat reply."
        >
          <Block title="What you can add" items={[
            'Free-form chat messages (typed or voice via speech recognition).',
            'Toggle research mode to let it pull live information from the web.',
            'Pull context from connected services: emails, sales calls, products, content templates, CRM contacts.',
            'Custom session names — keeps long-running threads organized.',
          ]} />
          <Block title="What you get back" items={[
            'Streamed text responses formatted in markdown.',
            'Artifacts opened in a side panel: newsletters, landing pages, social posts, images, carousels, story sequences, lead magnets, DM sequences.',
            'Generated images stored to your library and embedded into artifacts.',
            'Suggestions grounded in your real data ("follow up with these 3 leads", "announce this product").',
          ]} />
          <Block title="Key actions" items={[
            'Send a message, dictate by voice, or clear the thread.',
            'Browse and rename previous sessions.',
            'Expand the artifact panel into split-screen (or full modal on mobile).',
            'Edit, copy, download, share, or schedule any generated artifact inline.',
          ]} />
          <Block title="Notable" items={[
            'Available on the Diamond plan.',
            'Web research and image generation each consume credits.',
            'Image generation runs in parallel with text and swaps in live as it finishes.',
            'Sessions persist across navigation and reloads.',
          ]} />
        </Section>

        <Section
          id="dashboard"
          title="Dashboard"
          lead="Your home screen — onboarding checklist plus a high-level revenue and content overview."
        >
          <Block title="What you can add" items={[
            'Brand DNA: photos, logos, brand colors, fonts, business documents.',
            'Payment integrations: Stripe, Whop.',
            'Email and SMS accounts.',
            'Social media integrations.',
          ]} />
          <Block title="What you get back" items={[
            'Revenue chart (area chart, time-period selectable).',
            'Content mix by platform (pie chart).',
            'Onboarding progress and missing-setup nudges.',
            'Top-line stats: revenue, content volume, engagement.',
          ]} />
          <Block title="Key actions" items={[
            'Connect or disconnect integrations directly from the dashboard.',
            'Upload brand photos and logos to feed Brand DNA.',
            'Configure the Brand Brain via embedded panel.',
            'Filter all stats by week, month, year, or a custom date range.',
          ]} />
        </Section>

        <Section
          id="create-content"
          title="Create Content"
          lead="The flagship multi-format content studio — chat with an AI that already knows your brand and references your uploaded materials, then export polished posts, images, carousels, and pages."
        >
          <Block title="What you can add" items={[
            'Reference photos (mood board for image generation, up to 4).',
            'Documents for context (ICP, messaging house, product info — PDF, DOC, DOCX, TXT, etc.).',
            'Social URLs (Instagram, TikTok, YouTube, LinkedIn, X) — the system extracts transcripts/descriptions and uses them as structural blueprints.',
            'Drag-and-drop any file onto the Context panel — images become reference photos, files become documents automatically.',
            'Platform selection: Instagram, Facebook, LinkedIn, YouTube, X, TikTok.',
            'Brand DNA pulled from Settings, or uploaded inline if missing.',
            'Auto-pulled context: products, emails, sales calls from connected integrations.',
          ]} />
          <Block title="What you can generate" items={[
            'LinkedIn text posts using an intent framework: Educate, Nurture, Soft-Sell, Hard-Sell, Engagement.',
            'Single images and short-form video concepts.',
            'Carousels (Instagram and LinkedIn) with reusable templates.',
            'Newsletters with AI-generated cover images.',
            'Instagram Story sequences (3–5 frames, each with its own generated image).',
            'Squeeze pages (5–6 high-conversion sections with an opt-in form).',
            'Landing pages (multi-section premium designs with hero, features, testimonials, FAQ, CTA, footer).',
            'Lead magnets — downloadable PDFs (guides, checklists, cheat sheets).',
            'DM automation sequences with branching logic (Instagram, LinkedIn, X).',
          ]} />
          <Block title="Key actions" items={[
            'Choose platform(s), then choose content type (text, image, carousel, video, story).',
            'Refine output by chatting back and forth — every reply edits the live artifact.',
            'Edit raw HTML or content directly in the canvas.',
            'Preview on mobile.',
            'Use {{GENERATE:prompt}} placeholders to drop new images mid-document.',
            'Schedule a finished post directly to the Content Calendar.',
            'Save and reuse carousel templates.',
            'Copy code, deploy landing pages to Netlify.',
          ]} />
          <Block title="Notable" items={[
            'LinkedIn writing uses a sophisticated voice DNA prompt and intent labels for each post type.',
            'Outputs are pure HTML or pure JSON — no markdown fences or wrappers — so they paste cleanly into any tool.',
            'DM sequences support conditional flow logic (if user replies "X", branch to Y).',
            'Per-action credit costs apply (image generation, newsletter, landing page, etc.).',
          ]} />
        </Section>

        <Section
          id="outlier-detector"
          title="Outlier Detector"
          lead="Track the top-performing posts on accounts you care about. Find videos that broke their creator's average so you can study what worked."
        >
          <Block title="What you can add" items={[
            'Creator handles paired with a platform (YouTube, Instagram, TikTok, LinkedIn).',
            'Filters: platform, specific creator, performance metric (views/likes/comments), and multiplier threshold (2×, 5×, 10× the creator average).',
          ]} />
          <Block title="What you get back" items={[
            'Per-creator averages (views, likes, comments).',
            'Top videos ranked by how far they outperformed the creator\'s baseline.',
            'Thumbnails, engagement counts, and platform metadata for each video.',
            'A paginated feed of recent videos that crossed your threshold.',
          ]} />
          <Block title="Key actions" items={[
            'Add or remove tracked creators.',
            'Change metric and multiplier filters.',
            'Browse 50 videos per page; load more.',
            'Send a video into Create Content as reference material — it gets a green "Added" badge so you don\'t add it twice.',
          ]} />
        </Section>

        <Section
          id="content-calendar"
          title="Content Calendar"
          lead="A monthly grid where you draft, schedule, and publish posts to your connected social platforms."
        >
          <Block title="What you can add" items={[
            'Posts for Instagram (feed, reels, carousels) and LinkedIn (text, articles).',
            'Media uploads (images, videos) — aspect ratio is validated before upload.',
            'Captions and engagement copy.',
            'A publish time and status (draft, scheduled, published).',
          ]} />
          <Block title="What you get back" items={[
            'Month grid with thumbnails on each scheduled day.',
            'A list of posts with status indicators.',
          ]} />
          <Block title="Key actions" items={[
            'Compose a post: pick platform → type → upload media → write caption.',
            'Edit any draft (title, caption, media).',
            'Delete a post.',
            'Publish immediately or schedule for later.',
            'Navigate months forward and back.',
          ]} />
          <Block title="Notable" items={[
            'Instagram carousels support up to 10 files.',
            'Per-platform character limits enforced (Instagram 2,200; LinkedIn 3,000; Facebook 63,206).',
            'Facebook posting is in progress; Instagram and LinkedIn ship today.',
          ]} />
        </Section>

        <Section
          id="marketing-ai"
          title="Marketing AI"
          lead="Six dedicated builders. Each one asks a few clarifying questions, then drops a finished asset into a live canvas you can edit by chatting."
        >
          <div className="docs-tools-grid">
            <div className="docs-tool-card">
              <h4>Newsletter</h4>
              <p>Email campaigns with an AI-generated cover image and copy that mirrors your brand voice.</p>
            </div>
            <div className="docs-tool-card">
              <h4>Landing Page</h4>
              <p>Premium multi-section pages — hero, features, testimonials, FAQ, CTA, footer — with optional one-click Netlify deploy.</p>
            </div>
            <div className="docs-tool-card">
              <h4>Squeeze Page</h4>
              <p>5–6 section opt-in pages with email capture, trust signals, and conversion copywriting.</p>
            </div>
            <div className="docs-tool-card">
              <h4>Story Sequence</h4>
              <p>3–5 frame Instagram Story sequences with auto-generated visuals per frame.</p>
            </div>
            <div className="docs-tool-card">
              <h4>Lead Magnet</h4>
              <p>Downloadable PDFs — guides, checklists, cheat sheets — sized and styled to convert.</p>
            </div>
            <div className="docs-tool-card">
              <h4>DM Automation</h4>
              <p>Branching message flows for Instagram, LinkedIn, and X — publishable to BooSend.</p>
            </div>
          </div>
          <Block title="Common flow across all six tools" items={[
            'AI asks 1–4 clarifying questions, then generates the asset immediately on enough context.',
            'Edit by chatting — say "make the hero punchier" or "swap the testimonial section out" and the canvas updates.',
            'Drop in your own context files (testimonials, product info, brand assets) for the AI to lean on.',
            '{{GENERATE:prompt}} placeholders are auto-replaced with real images on render.',
          ]} />
          <Block title="Key actions" items={[
            'Start with a prompt or upload everything you have.',
            'Edit the rendered HTML/content directly.',
            'Copy code, save as template, import a saved template.',
            'Deploy landing pages to Netlify in one click.',
            'Download or export assets.',
            'Publish DM sequences to BooSend.',
          ]} />
        </Section>

        <Section
          id="sales"
          title="Sales Overview"
          lead="Aggregate revenue from every payment platform you've connected, log manual sales, and see which products are pulling weight."
        >
          <Block title="What you can add" items={[
            'Manual sales (product, buyer, amount).',
            'Payment sources: Whop, Stripe, Shopify, Kajabi, the PurelyPersonal platform itself.',
            'Filters: product, timeframe (year/month/week), revenue source.',
          ]} />
          <Block title="What you get back" items={[
            'Revenue charts (area or bar) broken down by time.',
            'A list of sales calls with platform, type, and status.',
            'Per-product revenue breakdown.',
            'Trends across week/month/year.',
          ]} />
          <Block title="Key actions" items={[
            'Add a manual sale and pick or create the product.',
            'Tag a call as Sales, Coaching, Client, or Other.',
            'Mark calls Closed, Need-to-follow-up, or Not-a-fit.',
            'Assign a contact from CRM to a call.',
            'Sync from connected payment platforms.',
            'Toggle revenue sources on/off in the chart.',
          ]} />
        </Section>

        <Section
          id="products"
          title="Products"
          lead="Your catalog — coaching offers, courses, SaaS subscriptions, lead magnets, communities — each with payment links you can paste anywhere."
        >
          <Block title="What you can add" items={[
            'Product name, description, type (Coaching, Course, SaaS, Lead Magnet, Community).',
            'Pricing — one-time or monthly recurring.',
            'Up to 3 product photos.',
            'A payment processor (Stripe, Whop).',
            'Imported products from Shopify or Kajabi.',
          ]} />
          <Block title="What you get back" items={[
            'A generated payment link for each product.',
            'A clean grid of products with photos, type, and pricing.',
          ]} />
          <Block title="Key actions" items={[
            'Create, edit, or delete a product.',
            'Upload or remove photos.',
            'Copy a payment link or regenerate it.',
            'Connect Shopify or Kajabi to import their catalogs.',
          ]} />
          <Block title="Notable" items={[
            'Imported products are read-only — edit them in the source platform.',
          ]} />
        </Section>

        <Section
          id="meetings"
          title="Call Recording"
          lead="A bot joins your Zoom, Google Meet, or Teams call. You get a transcript, a summary, action items, and chapter markers when it leaves."
        >
          <Block title="What you can add" items={[
            'A meeting URL (Zoom, Google Meet, Microsoft Teams).',
            'A custom title, summary template, and bot display name.',
            'A custom bot display photo (JPEG/PNG up to 1MB) — saved across launches in your browser.',
          ]} />
          <Block title="What you get back" items={[
            'A searchable, time-indexed transcript.',
            'An AI-generated summary (markdown, with optional sections).',
            'Auto-extracted action items with checkboxes.',
            'Chapter markers segmenting the call.',
            'Recording playback synced to the transcript — click any line to seek.',
          ]} />
          <Block title="Key actions" items={[
            'Launch a bot from the Meetings page.',
            'Stop an active recording on demand.',
            'Copy transcript, share via public link, or invite via email.',
            'Assign a CRM contact to a meeting.',
            'Reprocess to regenerate summary or action items.',
            'Delete a meeting (also tears down the bot if still in-call).',
          ]} />
          <Block title="Notable" items={[
            'Active meetings poll bot status every 5 seconds for live state.',
            'Both internal recordings and external recordings (e.g., from connected platforms) are listed.',
            'Summary view tabs into Summary, Action Items, and Chapters.',
          ]} />
        </Section>

        <Section
          id="inbox"
          title="Inbox"
          lead="A built-in email client that connects to Gmail, Outlook, or any IMAP/SMTP account, with AI-assisted drafting."
        >
          <Block title="What you can add" items={[
            'Email accounts — provider settings auto-detect for Gmail, Outlook, Yahoo, iCloud, Zoho.',
            'Custom IMAP/SMTP for everything else.',
          ]} />
          <Block title="What you get back" items={[
            'Folders: Inbox, Starred, Sent, Drafts, Archive.',
            'Threaded conversation view with sanitized HTML rendering and attachments.',
            'AI-suggested reply drafts.',
            'Per-folder counts and a paginated thread list.',
          ]} />
          <Block title="Key actions" items={[
            'Add and sync an account.',
            'Compose, reply, forward, star, archive, delete.',
            'Generate a reply with AI before sending.',
            'Search across mail.',
            'Switch between connected accounts.',
          ]} />
          <Block title="Notable" items={[
            'Drafts auto-save as you type.',
            'HTML email bodies are sanitized with DOMPurify.',
            'Sync shows a progress indicator on first connection.',
          ]} />
        </Section>

        <Section
          id="forms"
          title="Forms"
          lead="Build, share, and analyze forms — from quick polls to multi-step intake quizzes with branching logic."
        >
          <Block title="What you can add (Builder)" items={[
            'Questions of every common type: text, textarea, multiple choice, single select, checkboxes, rating, email, phone, contact block, date.',
            'Branching rules — show question N only if question M was answered with X.',
            'Drag-to-reorder questions.',
            'Form title, description, theme (colors, fonts).',
          ]} />
          <Block title="What you get back" items={[
            'A public, shareable URL at /f/{slug}.',
            'An embed code for your own site.',
            'A live preview that mirrors what respondents see.',
            'A response table with one row per submission.',
            'CSV export of all responses.',
          ]} />
          <Block title="Key actions" items={[
            'Create, edit, duplicate, or delete a form.',
            'Publish to generate the public link.',
            'View, search, or delete individual responses.',
            'Export all responses to CSV.',
          ]} />
          <Block title="Notable" items={[
            'The contact block question type auto-expands into firstName / lastName / email / phone columns in the response table.',
            'Branching rules are stored separately so reordering questions doesn\'t break them.',
          ]} />
        </Section>

        <Section
          id="crm"
          title="CRM"
          lead="A contact database with a sales pipeline, communication history, custom statuses, tags, and lists."
        >
          <Block title="What you can add" items={[
            'Contacts: name, email, phone, company, website, social handles.',
            'Custom lead statuses (defaults: New Lead, Contacted, Qualified, Proposal Sent) — each with its own color.',
            'Custom tags for bulk categorization.',
            'Custom lists for segmenting contacts.',
          ]} />
          <Block title="What you get back" items={[
            'A table view with name, company, email, phone, status, and tags.',
            'A contact detail panel showing every call, email, and product purchased.',
            'Synced contacts from GoHighLevel.',
          ]} />
          <Block title="Key actions" items={[
            'Create, edit, delete, or sync contacts.',
            'Apply or remove statuses, tags, and list memberships in bulk.',
            'Filter by list or status.',
            'Search contacts.',
            'Toggle between table and card view.',
            'Push qualified leads back to GoHighLevel.',
          ]} />
        </Section>

        <Section
          id="settings"
          title="Settings & Brand DNA"
          lead="Account, integrations, email, and the Brand DNA profile that every generator reads from."
        >
          <Block title="Account" items={[
            'Reset your password.',
            'See your email, current plan, and credits.',
          ]} />
          <Block title="Brand DNA — read by every AI tool in the app" items={[
            'Reference photos and logos.',
            'Brand colors (primary, secondary, text).',
            'Main and secondary fonts.',
            'Business documents (ICP, Business in a Box, Messaging House, Rule of One, Personal & Business Authority).',
            'A configurable Brand Brain panel for custom training.',
            'Multiple Brand DNA profiles — switch active brand on the fly.',
          ]} />
          <Block title="Email accounts" items={[
            'Add new account — provider presets auto-fill IMAP/SMTP for major providers.',
            'Sync new mail, or remove an account entirely.',
          ]} />
          <Block title="Integrations" items={[
            'Each integration walks through its own connection wizard with API keys, webhook URLs, and secrets where needed.',
            'Status indicators show whether each integration is live, pending, or disconnected.',
          ]} />
        </Section>

        <Section
          id="billing"
          title="Billing & Credits"
          lead="Plan management, credit balance, and the Stripe-backed billing portal."
        >
          <Block title="What you can see" items={[
            'Current plan and renewal date.',
            'Credits remaining and monthly refill amount.',
            'Per-action credit cost breakdown.',
            'A history of every credit transaction with timestamp, reason, and balance after.',
          ]} />
          <Block title="Key actions" items={[
            'Subscribe to a plan (Starter, Pro, Diamond, etc.).',
            'Upgrade or change your plan via the Stripe Customer Portal.',
            'Buy boost credit packs for one-off needs.',
            'Update payment method, view invoices, or cancel — all through Stripe Portal.',
          ]} />
          <Block title="How credits work" items={[
            'Every plan includes a monthly refill.',
            'Each AI action (chat message, image generation, newsletter, landing page, call recording, form submission, etc.) consumes credits.',
            'Per-action costs are listed on the Billing page so you always know the price before you click.',
          ]} />
        </Section>

        <Section
          id="coming-soon"
          title="Coming Soon"
          lead="Surfaces in the sidebar today; full features shipping next."
        >
          <Block title="On the roadmap" items={[
            'Accounting — financial dashboard and expense tracking.',
            'Press Placement — media outreach and PR distribution.',
            'Reviews — customer review monitoring and response.',
            'Facebook posting in the Content Calendar.',
          ]} />
        </Section>

        <Section
          id="integrations"
          title="Integrations"
          lead="Everything you can plug into AICEO."
        >
          <div className="docs-integrations-grid">
            <div className="docs-integrations-col">
              <h4>Payments</h4>
              <ul className="docs-list">
                <li>Stripe</li>
                <li>Whop</li>
                <li>Shopify (read-only catalog import)</li>
                <li>Kajabi (read-only catalog import)</li>
              </ul>
            </div>
            <div className="docs-integrations-col">
              <h4>CRM & Automation</h4>
              <ul className="docs-list">
                <li>GoHighLevel — sync contacts both ways</li>
                <li>BooSend — publish DM sequences</li>
              </ul>
            </div>
            <div className="docs-integrations-col">
              <h4>Email</h4>
              <ul className="docs-list">
                <li>Gmail, Outlook (preset)</li>
                <li>Yahoo, iCloud, Zoho (preset)</li>
                <li>Custom IMAP/SMTP</li>
              </ul>
            </div>
            <div className="docs-integrations-col">
              <h4>Social & Media</h4>
              <ul className="docs-list">
                <li>LinkedIn (OAuth — post text and articles)</li>
                <li>Instagram, TikTok, YouTube, X (read for Outlier Detector)</li>
              </ul>
            </div>
            <div className="docs-integrations-col">
              <h4>Deployment</h4>
              <ul className="docs-list">
                <li>Netlify — deploy generated landing pages in one click</li>
              </ul>
            </div>
            <div className="docs-integrations-col">
              <h4>Calendar</h4>
              <ul className="docs-list">
                <li>Google Calendar (optional, for meeting auto-join)</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section
          id="credits-gating"
          title="Credits & Gating"
          lead="Plans control which features unlock; credits control how much you can do per month."
        >
          <Block title="Plan gates" items={[
            'AI CEO is gated to the Diamond plan.',
            'Some integrations and bulk operations may require a higher tier — the UI shows a paywall when you cross the line.',
          ]} />
          <Block title="What costs credits" items={[
            'AI CEO chat messages.',
            'Web research lookups.',
            'Image generation.',
            'Carousels, lead magnets, story sequences, squeeze pages, newsletters, landing pages.',
            'Call recording and call intelligence (summary + action items).',
            'DM automation sequences.',
          ]} />
          <Block title="What’s free" items={[
            'Reading and managing your data: CRM, Inbox, Sales Overview, Products, Forms responses.',
            'Editing existing content (only generation costs credits).',
            'Connecting and disconnecting integrations.',
          ]} />
        </Section>

        <footer className="docs-footer">
          <p>Something out of date? <a href="mailto:support@purelypersonal.io">Tell us</a> and we'll fix the docs.</p>
        </footer>
      </main>
    </div>
  );
}
