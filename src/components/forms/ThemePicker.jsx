import {
  THEMES,
  CUSTOM_DEFAULT,
  FONT_OPTIONS,
  isCustomTheme,
  parseCustomTheme,
  serializeCustomTheme,
} from './formThemes';

const COLOR_FIELDS = [
  { key: 'primary', label: 'Primary' },
  { key: 'background', label: 'Background' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
];

export default function ThemePicker({ value, onChange }) {
  const custom = isCustomTheme(value);
  const customConfig = custom ? (parseCustomTheme(value) || CUSTOM_DEFAULT) : CUSTOM_DEFAULT;

  const updateCustom = (field, fieldValue) => {
    onChange(serializeCustomTheme({ ...customConfig, [field]: fieldValue }));
  };

  const selectCustom = () => {
    if (!custom) onChange(serializeCustomTheme(customConfig));
  };

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

      <button
        className={`theme-card theme-card--custom ${custom ? 'theme-card--active' : ''}`}
        onClick={selectCustom}
      >
        <div className="theme-card-name">Custom</div>
        <div className="theme-card-swatches">
          <div className="theme-swatch" style={{ backgroundColor: customConfig.primary }} />
          <div className="theme-swatch" style={{ backgroundColor: customConfig.background }} />
          <div className="theme-swatch" style={{ backgroundColor: customConfig.text }} />
          <div className="theme-swatch" style={{ backgroundColor: customConfig.accent }} />
        </div>
      </button>

      {custom && (
        <div className="theme-custom-panel">
          <div className="theme-custom-title">Custom colors</div>
          {COLOR_FIELDS.map(({ key, label }) => (
            <label key={key} className="theme-custom-row">
              <span className="theme-custom-label">{label}</span>
              <div className="theme-custom-value">
                <input
                  type="color"
                  className="theme-custom-color"
                  value={customConfig[key]}
                  onInput={(e) => updateCustom(key, e.target.value)}
                  onChange={(e) => updateCustom(key, e.target.value)}
                />
                <input
                  type="text"
                  className="theme-custom-hex"
                  value={customConfig[key]}
                  onChange={(e) => updateCustom(key, e.target.value)}
                  maxLength={9}
                />
              </div>
            </label>
          ))}

          <label className="theme-custom-row">
            <span className="theme-custom-label">Font</span>
            <select
              className="theme-custom-select"
              value={customConfig.font}
              onChange={(e) => updateCustom('font', e.target.value)}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
