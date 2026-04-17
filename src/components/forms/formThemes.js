export const THEMES = {
  minimal: { name: 'Minimal', primary: '#000000', background: '#ffffff', text: '#1a1a1a', accent: '#6b7280', font: 'Inter' },
  purelypersonal: { name: 'PurelyPersonal', primary: '#e91a44', background: '#ffffff', text: '#1a1a1a', accent: '#c71538', font: 'Inter' },
  midnight: { name: 'Midnight', primary: '#8B5CF6', background: '#1a1a2e', text: '#ffffff', accent: '#a78bfa', font: 'Inter' },
  ocean: { name: 'Ocean', primary: '#0EA5E9', background: '#0c1929', text: '#ffffff', accent: '#38bdf8', font: 'Inter' },
  sunset: { name: 'Sunset', primary: '#F97316', background: '#fffbeb', text: '#1a1a1a', accent: '#fb923c', font: 'Inter' },
  forest: { name: 'Forest', primary: '#22C55E', background: '#0a1f0a', text: '#ffffff', accent: '#4ade80', font: 'Inter' },
  lavender: { name: 'Lavender', primary: '#A855F7', background: '#faf5ff', text: '#1a1a1a', accent: '#c084fc', font: 'Inter' },
};

export const CUSTOM_PREFIX = 'custom:';

export const CUSTOM_DEFAULT = {
  name: 'Custom',
  primary: '#3B82F6',
  background: '#ffffff',
  text: '#1a1a1a',
  accent: '#60a5fa',
  font: 'Inter',
};

export const FONT_OPTIONS = ['Inter', 'System', 'Serif', 'Mono'];

export function isCustomTheme(themeKey) {
  return typeof themeKey === 'string' && themeKey.startsWith(CUSTOM_PREFIX);
}

export function parseCustomTheme(themeKey) {
  if (!isCustomTheme(themeKey)) return null;
  try {
    const parsed = JSON.parse(themeKey.slice(CUSTOM_PREFIX.length));
    return { ...CUSTOM_DEFAULT, ...parsed };
  } catch {
    return { ...CUSTOM_DEFAULT };
  }
}

export function serializeCustomTheme(config) {
  const { primary, background, text, accent, font } = { ...CUSTOM_DEFAULT, ...config };
  return `${CUSTOM_PREFIX}${JSON.stringify({ primary, background, text, accent, font })}`;
}

export function resolveTheme(themeKey) {
  if (isCustomTheme(themeKey)) return parseCustomTheme(themeKey) || CUSTOM_DEFAULT;
  return THEMES[themeKey] || THEMES.minimal;
}

export function getThemeVars(themeKey) {
  const theme = resolveTheme(themeKey);
  return {
    '--theme-primary': theme.primary,
    '--theme-background': theme.background,
    '--theme-text': theme.text,
    '--theme-accent': theme.accent,
    '--theme-font': theme.font,
  };
}
