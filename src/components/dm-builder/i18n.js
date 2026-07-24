// Minimal react-i18next shim for the node components ported from BooSend.
// They call useTranslation('automation') and t('dot.path', { count }) —
// this resolves against the copied English locale JSON, including i18next's
// _one/_other plural suffixes and {{var}} interpolation. Nothing else from
// i18next is emulated.
import automation from './locales/automation.json';

function resolve(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
}

function interpolate(str, opts) {
  if (!opts) return str;
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => (opts[name] !== undefined ? String(opts[name]) : m));
}

function t(key, opts) {
  let value;
  if (opts && typeof opts.count === 'number') {
    value = resolve(automation, opts.count === 1 ? `${key}_one` : `${key}_other`);
  }
  if (value === undefined) value = resolve(automation, key);
  if (value === undefined) value = opts && opts.defaultValue !== undefined ? opts.defaultValue : key;
  return typeof value === 'string' ? interpolate(value, opts) : value;
}

export function useTranslation() {
  return { t, i18n: { language: 'en' } };
}
