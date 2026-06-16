// Central place for Anthropic model ids the backend talks to.
// When Anthropic deprecates a dated snapshot (e.g. claude-sonnet-4-20250514
// in mid-2026), the API starts returning 404 not_found_error for every call
// — and every hard-coded reference breaks at once. Keeping the ids here
// means the next deprecation is a one-line bump instead of a 12-file grep.
//
// Pick the "live" generation id (no date suffix) when possible — Anthropic
// keeps that pointer rolling forward to the latest minor revision of the
// model family.

export const SONNET_MODEL = 'claude-sonnet-4-6';
