/** @type {import('tailwindcss').Config} */
// Tailwind exists ONLY for the DM builder canvas (components ported verbatim
// from the BooSend builder, which is Tailwind-styled). Scoped content globs +
// disabled preflight keep it from touching the rest of the app's CSS.
export default {
  content: ['./src/components/dm-builder/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
