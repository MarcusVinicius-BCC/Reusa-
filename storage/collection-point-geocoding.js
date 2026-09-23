const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function text(value, limit = 120) {
  return String(value || '').trim().slice(0, limit);
}

function postalCode(value) {
  return text(value, 12).replace(/\D/g, '').slice(0, 8);
}

function buildCollectionPointAddress(input = {}) {
  const street = text(input.street, 140);
  const number = text(input.number, 24);
  const neighborhood = text(input.neighborhood, 100);
  const city = text(input.city, 100);
  const state = text(input.state, 40);
  const cep = postalCode(input.postalCode || input.cep);
  const fallback = text(input.location, 240);
  const streetLine = [street, number].filter(Boolean).join(', ');
  const cityLine = [city, state].filter(Boolean).join(' - ');
  const location = [streetLine, neighborhood, cityLine, cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : '', 'Brasil'].filter(Boolean).join(', ') || fallback;
  return { street, number, neighborhood, city, state, postalCode: cep, location };
}

async function geocodeCollectionPoint(address) {
  if (!address.location || (!address.street && !address.city && !address.postalCode)) return null;
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'br' });
  const street = [address.number, address.street].filter(Boolean).join(' ');
  if (street) params.set('street', street);
  if (address.city) params.set('city', address.city);
  if (address.state) params.set('state', address.state);
  if (address.postalCode) params.set('postalcode', address.postalCode);
  if (!street && !address.city && !address.postalCode) params.set('q', address.location);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': 'ReusaPlus/1.0 (collection-point-geocoding)' },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const results = await response.json();
    const result = Array.isArray(results) ? results[0] : null;
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { buildCollectionPointAddress, geocodeCollectionPoint };
