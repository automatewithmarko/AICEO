import { THEMES } from './formThemes';

export default function ThemePicker({ value, onChange }) {
  return (
    <div className="theme-picker">
      {Object.entries(THEMES).map(([key, theme]) => (
        <button
          key={key}
          className={`theme-card ${value === key ? 'theme-card--active' : ''}`}
          onClick={() => onChange(key)}
        >
          <div className="theme-card-name">{theme.name}</div>
          <div className="theme-card-swatches">
            <div className="theme-swatch" style={{ backgroundColor: theme.primary }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.background }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.text }} />
            <div className="theme-swatch" style={{ backgroundColor: theme.accent }} />
          </div>
        </button>
      ))}
    </div>
  );
}
