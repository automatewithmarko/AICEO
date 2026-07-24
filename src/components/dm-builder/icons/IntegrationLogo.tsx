// Stub of BooSend's manifest-driven IntegrationLogo — the ported node
// components only ever request a handful of logos, rendered here as inline
// SVGs so no manifest or /public assets are needed.
const LOGOS: Record<string, (className?: string) => JSX.Element> = {
  n8n: (className) => (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="4" cy="12" r="2.4" fill="#EA4B71" />
      <circle cx="12" cy="7" r="2.4" fill="#EA4B71" />
      <circle cx="12" cy="17" r="2.4" fill="#EA4B71" />
      <circle cx="20" cy="12" r="2.4" fill="#EA4B71" />
      <path d="M6 11l4-3M6 13l4 3M14 8l4 3M14 16l4-3" stroke="#EA4B71" strokeWidth="1.6" />
    </svg>
  ),
  outlook: (className) => (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="4" width="14" height="16" rx="2" fill="#0F6CBD" opacity="0.35" />
      <rect x="2" y="7" width="12" height="10" rx="2" fill="#0F6CBD" />
      <circle cx="8" cy="12" r="3" fill="#fff" />
      <path d="M8 10.2c.9 0 1.5.75 1.5 1.8S8.9 13.8 8 13.8 6.5 13.05 6.5 12s.6-1.8 1.5-1.8z" fill="#0F6CBD" />
    </svg>
  ),
};

export default function IntegrationLogo({ name, className }: { name: string; className?: string }) {
  const render = LOGOS[name];
  if (!render) return null;
  return render(className);
}
