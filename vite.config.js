import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// The /api/xai dev proxy was removed in the unified-backend Phase 5
// cleanup (2026-07-15) — /Content generation now runs through the AICEO
// backend (docs/unified-content-backend-plan.md); no client → x.ai calls
// remain.
export default defineConfig({
  plugins: [react()],
})
