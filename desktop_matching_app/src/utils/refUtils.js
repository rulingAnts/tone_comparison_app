/**
 * Reference utilities shared across Electron apps.
 * Preserve original, zero-padded strings; use numeric extraction for sorting only.
 */

function normalizeRefString(ref) {
  if (ref == null) return '';
  return String(ref).trim();
}

function toNumericRef(ref) {
  const s = normalizeRefString(ref);
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.NaN;
}

function compareByNumericRef(a, b) {
  const na = toNumericRef(a?.Reference);
  const nb = toNumericRef(b?.Reference);
  if (Number.isNaN(na) && Number.isNaN(nb)) {
    return normalizeRefString(a?.Reference).localeCompare(normalizeRefString(b?.Reference));
  }
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return na - nb;
}

function sortByNumericRef(items) {
  return items.slice().sort(compareByNumericRef);
}

function formatRefWidth(ref, width = 4) {
  const s = normalizeRefString(ref);
  if (/^\d+$/.test(s)) {
    return s.padStart(width, '0');
  }
  return s;
}

module.exports = {
  normalizeRefString,
  toNumericRef,
  compareByNumericRef,
  sortByNumericRef,
  formatRefWidth,
};
