function isLikelyResidentialAddress(value) {
  const location = String(value || '').trim();
  if (!location) return false;
  // Public listings may identify a city/neighborhood, but never publish a
  // street number (including common "nº" / "number" forms).
  return /^\d{1,6}(?:\s|,|$)/.test(location)
    || /,\s*(?:n[ºo.]?\s*)?\d{1,6}(?:\s|$)/i.test(location)
    || /\b(?:n[ºo.]|número)\s*\d{1,6}\b/i.test(location);
}

module.exports = { isLikelyResidentialAddress };
