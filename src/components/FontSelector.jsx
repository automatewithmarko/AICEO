import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const FONTS = [
  { name: 'Inter', category: 'Sans-serif', weight: 400 },
  { name: 'Montserrat', category: 'Sans-serif', weight: 400 },
  { name: 'Poppins', category: 'Sans-serif', weight: 400 },
  { name: 'Open Sans', category: 'Sans-serif', weight: 400 },
  { name: 'Raleway', category: 'Sans-serif', weight: 400 },
  { name: 'Nunito', category: 'Sans-serif', weight: 400 },
  { name: 'Work Sans', category: 'Sans-serif', weight: 400 },
  { name: 'DM Sans', category: 'Sans-serif', weight: 400 },
  { name: 'Oswald', category: 'Sans-serif', weight: 400 },
  { name: 'Bebas Neue', category: 'Sans-serif', weight: 400 },
  { name: 'Playfair Display', category: 'Serif', weight: 400 },
  { name: 'Lora', category: 'Serif', weight: 400 },
  { name: 'Merriweather', category: 'Serif', weight: 400 },
  { name: 'Crimson Text', category: 'Serif', weight: 400 },
  { name: 'Libre Baskerville', category: 'Serif', weight: 400 },
  { name: 'Source Serif 4', category: 'Serif', weight: 400 },
  { name: 'Space Mono', category: 'Monospace', weight: 400 },
  { name: 'JetBrains Mono', category: 'Monospace', weight: 400 },
  { name: 'Fira Code', category: 'Monospace', weight: 400 },
  { name: 'IBM Plex Mono', category: 'Monospace', weight: 400 },
];

const PREFIX = 'BrandDNA_';

function bdName(fontName) {
  return PREFIX + fontName;
}

// We use a two-step process:
// 1. Fetch the Google Fonts CSS to get the actual .woff2 file URLs
// 2. Register each font via the FontFace API under a prefixed name
//    so it NEVER collides with the app's own fonts
let fontsLoaded = false;

function loadGoogleFonts(setReady) {
  if (fontsLoaded) {
    setReady(true);
    return;
  }

  const families = FONTS.map((f) => f.name.replace(/ /g, '+')).join('&family=');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;

  // We must set a browser-like User-Agent to get woff2 URLs from Google.
  // fetch() sends one automatically from the browser, so this works fine.
  fetch(cssUrl)
    .then((res) => res.text())
    .then((cssText) => {
      // Parse the CSS to extract @font-face blocks
      // Each block looks like:
      //   /* latin */
      //   @font-face {
      //     font-family: 'Inter';
      //     ...
      //     src: url(...) format('woff2');
      //     unicode-range: U+0000-00FF, ...;
      //   }
      const faceRegex = /@font-face\s*\{([^}]+)\}/g;
      let match;
      const promises = [];

      while ((match = faceRegex.exec(cssText)) !== null) {
        const block = match[1];

        // Extract font-family
        const familyMatch = block.match(/font-family:\s*'([^']+)'/);
        if (!familyMatch) continue;
        const originalName = familyMatch[1];

        // Extract src url
        const srcMatch = block.match(/src:\s*url\(([^)]+)\)/);
        if (!srcMatch) continue;
        const srcUrl = srcMatch[1];

        // Extract font-style
        const styleMatch = block.match(/font-style:\s*(\w+)/);
        const fontStyle = styleMatch ? styleMatch[1] : 'normal';

        // Extract font-weight
        const weightMatch = block.match(/font-weight:\s*(\d+)/);
        const fontWeight = weightMatch ? weightMatch[1] : '400';

        // Extract unicode-range
        const rangeMatch = block.match(/unicode-range:\s*([^;]+)/);
        const unicodeRange = rangeMatch ? rangeMatch[1].trim() : undefined;

        // Register under prefixed name
        const descriptors = {
          style: fontStyle,
          weight: fontWeight,
        };
        if (unicodeRange) {
          descriptors.unicodeRange = unicodeRange;
        }

        const face = new FontFace(
          bdName(originalName),
          `url(${srcUrl})`,
          descriptors
        );
        promises.push(
          face.load().then((loaded) => {
            document.fonts.add(loaded);
          }).catch(() => {})
        );
      }

      return Promise.all(promises);
    })
    .then(() => {
      fontsLoaded = true;
      setReady(true);
    })
    .catch(() => {});
}

function FontDropdown({ label, value, onChange, fontsReady }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="settings-font-field" ref={ref}>
      <span className="settings-font-label">{label}</span>
      <button
        className={`settings-font-trigger ${open ? 'settings-font-trigger--open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span style={value && fontsReady ? { fontFamily: `"${bdName(value)}", sans-serif` } : undefined}>
          {value || 'Select a font'}
        </span>
        <ChevronDown size={14} className="settings-font-chevron" />
      </button>
      {open && (
        <div className="settings-font-dropdown">
          {FONTS.map((font) => (
            <button
              key={font.name}
              className={`settings-font-option ${value === font.name ? 'settings-font-option--active' : ''}`}
              style={fontsReady ? { fontFamily: `"${bdName(font.name)}", sans-serif` } : undefined}
              onClick={() => {
                onChange(font.name);
                setOpen(false);
              }}
            >
              <span className="settings-font-option-name">{font.name}</span>
              <span className="settings-font-option-cat">{font.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FontSelector({ mainFont, secondaryFont, onMainChange, onSecondaryChange }) {
  const [fontsReady, setFontsReady] = useState(fontsLoaded);

  useEffect(() => {
    loadGoogleFonts(setFontsReady);
  }, []);

  return (
    <div className="settings-font-selector">
      <FontDropdown label="Main Font" value={mainFont} onChange={onMainChange} fontsReady={fontsReady} />
      <FontDropdown label="Secondary Font" value={secondaryFont} onChange={onSecondaryChange} fontsReady={fontsReady} />
      {(mainFont || secondaryFont) && (
        <div className="settings-font-preview">
          {mainFont && (
            <p
              className="settings-font-preview-text"
              style={fontsReady ? { fontFamily: `"${bdName(mainFont)}", sans-serif` } : undefined}
            >
              The quick brown fox jumps over the lazy dog
            </p>
          )}
          {secondaryFont && (
            <p
              className="settings-font-preview-text"
              style={fontsReady ? { fontFamily: `"${bdName(secondaryFont)}", sans-serif` } : undefined}
            >
              The quick brown fox jumps over the lazy dog
            </p>
          )}
        </div>
      )}
    </div>
  );
}
