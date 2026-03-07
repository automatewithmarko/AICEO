import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X } from 'lucide-react';

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

const COLOR_SLOTS = [
  { key: 'primary', label: 'Brand primary color' },
  { key: 'text', label: 'Brand text color' },
  { key: 'secondary', label: 'Brand secondary color' },
];

function ColorWheelPopover({ currentColor, onSave, onClose }) {
  const canvasRef = useRef(null);
  const popoverRef = useRef(null);
  const [brightness, setBrightness] = useState(50);
  const [pickedColor, setPickedColor] = useState(currentColor || '');
  const [hexInput, setHexInput] = useState(currentColor || '');

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.offsetWidth;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist <= radius) {
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
          const sat = (dist / radius) * 100;
          const [r, g, b] = hslToRgb(angle, sat, brightness);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [brightness]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.sqrt(dx * dx + dy * dy) > canvas.width / 2) return;

    const ctx = canvas.getContext('2d');
    const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    if (pixel[3] === 0) return;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setPickedColor(hex);
    setHexInput(hex);
  };

  const handleHexChange = (e) => {
    let val = e.target.value;
    if (val && !val.startsWith('#')) val = '#' + val;
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setPickedColor(val.toLowerCase());
    }
  };

  const handleSave = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(pickedColor)) {
      onSave(pickedColor.toLowerCase());
    }
  };

  return (
    <div className="settings-cw-popover" ref={popoverRef}>
      <div className="settings-cw-popover-header">
        <span>Pick a color</span>
        <button className="settings-cw-popover-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="settings-cw-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="settings-cw-canvas"
          onClick={handleCanvasClick}
          style={{ cursor: 'crosshair' }}
        />
      </div>
      <div className="settings-cw-brightness">
        <span className="settings-cw-brightness-label">Brightness</span>
        <input
          type="range"
          min="10"
          max="90"
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="settings-cw-brightness-slider"
        />
      </div>
      <div className="settings-cw-hex-row">
        {pickedColor && (
          <div
            className="settings-cw-hex-preview"
            style={{ background: pickedColor }}
          />
        )}
        <input
          type="text"
          className="settings-cw-hex-input"
          placeholder="#000000"
          value={hexInput}
          onChange={handleHexChange}
          maxLength={7}
        />
        <button
          className="settings-cw-save-btn"
          onClick={handleSave}
          disabled={!/^#[0-9a-fA-F]{6}$/.test(pickedColor)}
        >
          <Check size={14} />
          Save
        </button>
      </div>
    </div>
  );
}

export default function ColorWheelPicker({ colors, onChange }) {
  const [openSlot, setOpenSlot] = useState(null);

  const handleSave = (key, hex) => {
    onChange({ ...colors, [key]: hex });
    setOpenSlot(null);
  };

  const handleClear = (key, e) => {
    e.stopPropagation();
    onChange({ ...colors, [key]: '' });
  };

  return (
    <div className="settings-color-rows">
      {COLOR_SLOTS.map(({ key, label }) => (
        <div key={key} className="settings-color-row">
          <div
            className={`settings-color-circle ${colors[key] ? '' : 'settings-color-circle--empty'}`}
            style={colors[key] ? { background: colors[key] } : undefined}
            onClick={() => setOpenSlot(openSlot === key ? null : key)}
          >
            {colors[key] && (
              <button
                className="settings-color-circle-clear"
                onClick={(e) => handleClear(key, e)}
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="settings-color-row-info">
            <span className="settings-color-row-label">{label}</span>
            {colors[key] && (
              <span className="settings-color-row-hex">{colors[key]}</span>
            )}
          </div>
          {openSlot === key && (
            <ColorWheelPopover
              currentColor={colors[key]}
              onSave={(hex) => handleSave(key, hex)}
              onClose={() => setOpenSlot(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
