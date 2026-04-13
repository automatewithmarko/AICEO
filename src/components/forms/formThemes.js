export const THEMES = {
  midnight: { name: 'Midnight', primary: '#8B5CF6', background: '#1a1a2e', text: '#ffffff', accent: '#a78bfa', font: 'Inter' },
  ocean: { name: 'Ocean', primary: '#0EA5E9', background: '#0c1929', text: '#ffffff', accent: '#38bdf8', font: 'Inter' },
  sunset: { name: 'Sunset', primary: '#F97316', background: '#fffbeb', text: '#1a1a1a', accent: '#fb923c', font: 'Inter' },
  forest: { name: 'Forest', primary: '#22C55E', background: '#0a1f0a', text: '#ffffff', accent: '#4ade80', font: 'Inter' },
  lavender: { name: 'Lavender', primary: '#A855F7', background: '#faf5ff', text: '#1a1a1a', accent: '#c084fc', font: 'Inter' },
  minimal: { name: 'Minimal', primary: '#000000', background: '#ffffff', text: '#1a1a1a', accent: '#6b7280', font: 'Inter' },
};

export function getThemeVars(themeKey) {
  const theme = THEMES[themeKey] || THEMES.minimal;
  return {
    '--theme-primary': theme.primary,
    '--theme-background': theme.background,
    '--theme-text': theme.text,
    '--theme-accent': theme.accent,
    '--theme-font': theme.font,
  };
}
