import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Upload, Loader, Trash2 } from 'lucide-react';

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

// Custom uploaded fonts — registered straight from their storage URL
// (no Google CSS parse needed). Tracked by URL so re-renders and multiple
// FontSelector instances don't re-register the same file.
const registeredCustomUrls = new Set();

function loadCustomFonts(customFonts, onDone) {
  const toLoad = (customFonts || []).filter((f) => f?.url && f?.name && !registeredCustomUrls.has(f.url));
  if (toLoad.length === 0) {
    onDone();
    return;
  }
  Promise.all(toLoad.map((f) => {
    registeredCustomUrls.add(f.url);
    const face = new FontFace(bdName(f.name), `url(${f.url})`);
    return face.load().then((loaded) => {
      document.fonts.add(loaded);
    }).catch(() => {});
  })).then(() => onDone());
}

function FontDropdown({ label, value, onChange, fontsReady, customFonts = [] }) {
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
          {customFonts.map((font) => (
            <button
              key={`custom-${font.url || font.name}`}
              className={`settings-font-option ${value === font.name ? 'settings-font-option--active' : ''}`}
              style={fontsReady ? { fontFamily: `"${bdName(font.name)}", sans-serif` } : undefined}
              onClick={() => {
                onChange(font.name);
                setOpen(false);
              }}
            >
              <span className="settings-font-option-name">{font.name}</span>
              <span className="settings-font-option-cat">Your font</span>
            </button>
          ))}
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

export default function FontSelector({
  mainFont,
  secondaryFont,
  onMainChange,
  onSecondaryChange,
  // Custom uploaded fonts: [{ name, url, path, format }]
  customFonts = [],
  onUploadFont,           // (files: File[]) => void
  onDeleteFont,           // (font) => void
  uploadingFont = false,  // true while an upload is in flight
}) {
  const [fontsReady, setFontsReady] = useState(fontsLoaded);
  // Bump to re-render once newly-uploaded custom fonts finish registering.
  const [, setCustomTick] = useState(0);
  const uploadRef = useRef(null);

  useEffect(() => {
    loadGoogleFonts(setFontsReady);
  }, []);

  useEffect(() => {
    loadCustomFonts(customFonts, () => setCustomTick((t) => t + 1));
  }, [customFonts]);

  return (
    <div className="settings-font-selector">
      <FontDropdown label="Main Font" value={mainFont} onChange={onMainChange} fontsReady={fontsReady} customFonts={customFonts} />
      <FontDropdown label="Secondary Font" value={secondaryFont} onChange={onSecondaryChange} fontsReady={fontsReady} customFonts={customFonts} />
      {onUploadFont && (
        <div className="settings-font-upload">
          <input
            ref={uploadRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) onUploadFont(files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="settings-font-upload-btn"
            onClick={() => uploadRef.current?.click()}
            disabled={uploadingFont}
            title="Upload your own font file (.woff2, .woff, .ttf, .otf)"
          >
            {uploadingFont ? <Loader size={14} className="settings-font-upload-spin" /> : <Upload size={14} />}
            {uploadingFont ? 'Uploading…' : 'Upload custom font'}
          </button>
          {customFonts.length > 0 && (
            <div className="settings-font-custom-list">
              {customFonts.map((font) => (
                <div key={font.url || font.name} className="settings-font-custom-item">
                  <span
                    className="settings-font-custom-name"
                    style={{ fontFamily: `"${bdName(font.name)}", sans-serif` }}
                  >
                    {font.name}
                  </span>
                  <span className="settings-font-custom-format">{(font.format || '').toUpperCase()}</span>
                  {onDeleteFont && (
                    <button
                      type="button"
                      className="settings-font-custom-delete"
                      onClick={() => onDeleteFont(font)}
                      title={`Remove ${font.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
