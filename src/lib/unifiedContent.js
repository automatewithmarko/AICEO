// Unified content backend feature flag (docs/unified-content-backend-plan.md).
//
// DEFAULT: ON (founder decision 2026-07-15). The unified backend is the
// standing path on the dev branch — localhost and the dev site both use
// it. localStorage.aiceo_unified_content = '0' is the per-browser kill
// switch back to the legacy paths (client-side Grok chat in /Content,
// frontend carousel slide loops in /Content and AI CEO).
//
// MERGE NOTE: this default ships with the code — promoting dev→main puts
// the unified path live in production. That promotion is gated on the
// founder's stress-test sign-off (Phase 5), so by the time this reaches
// main it is the intended behavior.
//
// Shared by src/pages/Content.jsx (chat brain + carousel rendering) and
// src/pages/AiCeo.jsx (carousel rendering).
export function isUnifiedContentBackend() {
  try {
    if (localStorage.getItem('aiceo_unified_content') === '0') return false;
  } catch { /* no localStorage — stay on */ }
  return true;
}
