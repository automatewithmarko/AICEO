import { useLocation } from 'react-router-dom';

const STYLE = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    padding: '48px 24px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#1d1d1f',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 40,
  },
  logoImg: {
    height: 48,
    width: 'auto',
  },
  logoText: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 32,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#e63946',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    maxWidth: 760,
    width: '100%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  h1: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 16,
    color: '#1d1d1f',
  },
  h2: {
    fontSize: 20,
    fontWeight: 600,
    marginTop: 32,
    marginBottom: 12,
    color: '#1d1d1f',
  },
  p: {
    fontSize: 15,
    lineHeight: 1.7,
    color: '#555',
    marginBottom: 12,
  },
  ul: {
    fontSize: 15,
    lineHeight: 1.8,
    color: '#555',
    paddingLeft: 24,
    marginBottom: 12,
  },
  footer: {
    marginTop: 48,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
};

function Logo() {
  return (
    <div style={STYLE.logo}>
      <img src="/logo.png" alt="PuerlyPersonal" style={STYLE.logoImg} />
      <span style={STYLE.logoText}>AI CEO</span>
    </div>
  );
}

function HomePage() {
  return (
    <div style={STYLE.page}>
      <Logo />
      <div style={STYLE.card}>
        <h1 style={{ ...STYLE.h1, textAlign: 'center', fontSize: 36, marginBottom: 24 }}>
          Your AI-Powered Chief Executive Officer
        </h1>
        <p style={{ ...STYLE.p, textAlign: 'center', fontSize: 17, maxWidth: 560, margin: '0 auto 24px' }}>
          PuerlyPersonal AI CEO orchestrates your entire business — marketing, email, sales, CRM, content creation, and meetings — all powered by AI agents that work 24/7.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginTop: 32 }}>
          {[
            { title: 'AI Email', desc: 'Smart inbox with AI-drafted replies and autonomous sending' },
            { title: 'Marketing Agents', desc: 'Landing pages, newsletters, carousels, and social content' },
            { title: 'Sales Pipeline', desc: 'CRM with deal tracking, contacts, and automated follow-ups' },
            { title: 'Content Studio', desc: 'Generate on-brand content across every channel' },
            { title: 'Meeting Intelligence', desc: 'Transcriptions, summaries, and action items from every call' },
            { title: 'Brand DNA', desc: 'Your brand voice, colors, fonts, and docs in one place' },
          ].map((f) => (
            <div key={f.title} style={{ background: '#f9f9f9', borderRadius: 12, padding: '20px 18px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#1d1d1f' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <p style={STYLE.footer}>PuerlyPersonal AI CEO &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div style={STYLE.page}>
      <Logo />
      <div style={STYLE.card}>
        <h1 style={STYLE.h1}>Privacy Policy</h1>
        <p style={{ ...STYLE.p, color: '#999', fontSize: 13 }}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <h2 style={STYLE.h2}>1. Information We Collect</h2>
        <p style={STYLE.p}>When you use PuerlyPersonal AI CEO, we collect information you provide directly:</p>
        <ul style={STYLE.ul}>
          <li>Account information (name, email address, password)</li>
          <li>Email account credentials or OAuth tokens when you connect email providers</li>
          <li>Business content you upload (brand assets, documents, media)</li>
          <li>Conversations and content generated through the platform</li>
          <li>Payment information processed securely through Stripe</li>
        </ul>

        <h2 style={STYLE.h2}>2. How We Use Your Information</h2>
        <p style={STYLE.p}>We use your information to:</p>
        <ul style={STYLE.ul}>
          <li>Provide, maintain, and improve the AI CEO platform and its features</li>
          <li>Process your email on your behalf (reading, drafting, and sending)</li>
          <li>Generate AI-powered content tailored to your brand</li>
          <li>Process payments and manage your subscription</li>
          <li>Communicate with you about your account and service updates</li>
        </ul>

        <h2 style={STYLE.h2}>3. Email Data</h2>
        <p style={STYLE.p}>
          When you connect an email account (via IMAP/SMTP or Microsoft OAuth), we access your email solely to provide inbox management features within the platform. We do not sell, share, or use your email content for advertising. Email credentials and OAuth tokens are stored encrypted and are only used to maintain your email connection.
        </p>

        <h2 style={STYLE.h2}>4. Third-Party Services</h2>
        <p style={STYLE.p}>We integrate with third-party services to provide our features:</p>
        <ul style={STYLE.ul}>
          <li><strong>Microsoft / Outlook:</strong> OAuth 2.0 for email access (IMAP and SMTP)</li>
          <li><strong>Stripe:</strong> Payment processing</li>
          <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
          <li><strong>AI Providers (Anthropic, OpenAI, xAI):</strong> Content generation and orchestration</li>
        </ul>
        <p style={STYLE.p}>Each third-party service operates under its own privacy policy.</p>

        <h2 style={STYLE.h2}>5. Data Security</h2>
        <p style={STYLE.p}>
          We implement appropriate security measures to protect your data, including encrypted storage of credentials, secure HTTPS connections, and row-level security on all database tables. Access to your data is restricted to your authenticated account.
        </p>

        <h2 style={STYLE.h2}>6. Data Retention & Deletion</h2>
        <p style={STYLE.p}>
          You can disconnect email accounts and delete your data at any time through Settings. When you disconnect an email account, stored credentials and OAuth tokens are permanently deleted. You may request full account deletion by contacting us.
        </p>

        <h2 style={STYLE.h2}>7. Contact</h2>
        <p style={STYLE.p}>
          If you have questions about this privacy policy, please contact us at the email address associated with your account administrator.
        </p>
      </div>
      <p style={STYLE.footer}>PuerlyPersonal AI CEO &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

function TermsAndConditions() {
  return (
    <div style={STYLE.page}>
      <Logo />
      <div style={STYLE.card}>
        <h1 style={STYLE.h1}>Terms and Conditions</h1>
        <p style={{ ...STYLE.p, color: '#999', fontSize: 13 }}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <h2 style={STYLE.h2}>1. Acceptance of Terms</h2>
        <p style={STYLE.p}>
          By accessing or using PuerlyPersonal AI CEO ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Service.
        </p>

        <h2 style={STYLE.h2}>2. Description of Service</h2>
        <p style={STYLE.p}>
          PuerlyPersonal AI CEO is a SaaS platform that provides AI-powered business management tools including email management, content creation, marketing automation, sales pipeline management, CRM, and meeting intelligence.
        </p>

        <h2 style={STYLE.h2}>3. Account Responsibilities</h2>
        <ul style={STYLE.ul}>
          <li>You are responsible for maintaining the security of your account credentials</li>
          <li>You must provide accurate information when creating your account</li>
          <li>You are responsible for all activity that occurs under your account</li>
          <li>You must be at least 18 years old to use the Service</li>
        </ul>

        <h2 style={STYLE.h2}>4. Email Integration</h2>
        <p style={STYLE.p}>
          When you connect an email account, you authorize the Service to access, read, and send emails on your behalf. You are responsible for ensuring you have the authority to connect any email accounts and that your use complies with your email provider's terms of service. The Service may send emails autonomously through AI agents when instructed by you.
        </p>

        <h2 style={STYLE.h2}>5. AI-Generated Content</h2>
        <p style={STYLE.p}>
          Content generated by AI agents is provided "as is." While we strive for accuracy and quality, you are responsible for reviewing all AI-generated content before publishing or sending. We are not liable for any consequences arising from AI-generated content.
        </p>

        <h2 style={STYLE.h2}>6. Subscription & Payments</h2>
        <ul style={STYLE.ul}>
          <li>Paid plans are billed through Stripe on a recurring basis</li>
          <li>You may cancel your subscription at any time through the Billing page</li>
          <li>Refunds are handled on a case-by-case basis</li>
          <li>We reserve the right to change pricing with reasonable notice</li>
        </ul>

        <h2 style={STYLE.h2}>7. Prohibited Use</h2>
        <p style={STYLE.p}>You may not use the Service to:</p>
        <ul style={STYLE.ul}>
          <li>Send spam, unsolicited bulk email, or phishing messages</li>
          <li>Violate any applicable laws or regulations</li>
          <li>Infringe on intellectual property rights of others</li>
          <li>Distribute malware or harmful content</li>
          <li>Attempt to gain unauthorized access to other accounts or systems</li>
        </ul>

        <h2 style={STYLE.h2}>8. Limitation of Liability</h2>
        <p style={STYLE.p}>
          The Service is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to loss of data, revenue, or business opportunities.
        </p>

        <h2 style={STYLE.h2}>9. Termination</h2>
        <p style={STYLE.p}>
          We reserve the right to suspend or terminate your account if you violate these terms. You may terminate your account at any time by contacting us or through the platform settings.
        </p>

        <h2 style={STYLE.h2}>10. Changes to Terms</h2>
        <p style={STYLE.p}>
          We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms.
        </p>

        <h2 style={STYLE.h2}>11. Contact</h2>
        <p style={STYLE.p}>
          For questions about these terms, please contact us through the platform or at the email address associated with your account administrator.
        </p>
      </div>
      <p style={STYLE.footer}>PuerlyPersonal AI CEO &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

export default function MicrosoftPages() {
  const { pathname } = useLocation();

  if (pathname === '/privacy') return <PrivacyPolicy />;
  if (pathname === '/terms') return <TermsAndConditions />;
  return <HomePage />;
}
