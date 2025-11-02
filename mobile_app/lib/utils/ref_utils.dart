/// Reference utilities to keep behavior consistent across the app.
/// - Preserve original (possibly zero-padded) reference strings for display
/// - Normalize (trim) for comparisons
/// - Provide numeric extraction for sorting only
class RefUtils {
  /// Normalize a reference by trimming whitespace. Keeps as string.
  static String normalizeRefString(String? ref) {
    return (ref ?? '').trim();
  }

  /// Extract numeric value from a reference string for sorting.
  /// Returns null if no digits are found.
  static int? numericRef(String? ref) {
    final s = normalizeRefString(ref);
    final match = RegExp(r'\d+').firstMatch(s);
    if (match != null) {
      return int.tryParse(match.group(0)!);
    }
    return int.tryParse(s);
  }

  /// Comparator for reference strings using numeric value when possible.
  static int compareRefStrings(String a, String b) {
    final na = numericRef(a);
    final nb = numericRef(b);
    if (na != null && nb != null) {
      return na.compareTo(nb);
    }
    return normalizeRefString(a).compareTo(normalizeRefString(b));
  }

  /// Format numeric references to a fixed width with leading zeros.
  /// If not purely numeric, returns the normalized input.
  static String formatRefWidth(String ref, {int width = 4}) {
    final s = normalizeRefString(ref);
    final numericOnly = RegExp(r'^\d+$');
    if (numericOnly.hasMatch(s)) {
      return s.padLeft(width, '0');
    }
    return s;
  }
}
