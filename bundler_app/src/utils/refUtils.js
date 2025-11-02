/**
 * Reference utilities: preserve leading zeros for display and storage,
 * compare/filter via trimmed string equality, and provide numeric values
 * strictly for sorting purposes.
 */

/** Trim and return as string (no coercion). */
function normalizeRefString(ref) {
  if (ref == null) return '';
  return String(ref).trim();
}

/** Extract numeric value for sorting. Returns NaN if not numeric. */
function toNumericRef(ref) {
  const s = normalizeRefString(ref);
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.NaN;
}

/** Comparator for objects with a Reference field. */
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

/** Return a new array sorted by numeric reference (stable copy). */
function sortByNumericRef(items) {
  return items.slice().sort(compareByNumericRef);
}

/**
 * Format a reference with leading zeros to a specific width if purely numeric.
 * If not numeric, returns the input normalized.
 */
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
