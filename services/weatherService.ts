
/**
 * Deterministic Weather Service using Open-Meteo
 * Handles Geocoding and Peak Sun Hours (PSH) calculations.
 */

export interface LatLon {
  lat: number;
  lon: number;
  name: string;
  admin1?: string;
  country?: string;
}

export const searchLocations = async (query: string): Promise<LatLon[]> => {
  if (!query || query.length < 2) return [];
  try {
    const searchTerm = /^\d{4}$/.test(query.trim()) ? `${query}, Australia` : query;
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=5&language=en&format=json`);
    const data = await res.json();
    
    if (!data.results) return [];

    return data.results.map((r: any) => ({
      lat: r.latitude,
      lon: r.longitude,
      name: r.name,
      admin1: r.admin1,
      country: r.country_code
    }));
  } catch (e) {
    console.error("Location search failed", e);
    return [];
  }
};

export const geocodeLocation = async (location: string): Promise<LatLon | null> => {
  try {
    // Smart Geocoding: If input is exactly 4 digits (e.g. "2048"), bias to Australia
    // This prevents 2048 resolving to a US Zip code in Winter, which breaks the logic.
    const searchTerm = /^\d{4}$/.test(location.trim()) ? `${location}, Australia` : location;

    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.latitude,
        lon: result.longitude,
        // Construct a readable name: "Bondi, NSW, AU"
        name: [result.name, result.admin1, result.country_code].filter(Boolean).join(', ')
      };
    }
    return null;
  } catch (e) {
    console.error("Geocoding failed", e);
    return null;
  }
};

/**
 * PSH Calculation: MJ/m² / 3.6 = kWh/m² (Peak Sun Hours)
 */
const MJ_TO_PSH_DIVISOR = 3.6;

export const fetchNowSolarPSH = async (lat: number, lon: number): Promise<number> => {
  try {
    // Force fresh fetch to avoid caching "yesterday's" Now data
    // Uses shortwave_radiation_sum (MJ/m²) instead of sunshine_duration
    // FETCH 3 DAYS to smooth out single-day volatility (rainy days)
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=shortwave_radiation_sum&timezone=auto&forecast_days=3`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    const mjSums = data.daily?.shortwave_radiation_sum as number[];
    
    if (!mjSums || mjSums.length === 0) return 4.0;

    // Calculate Average MJ over 3 days
    const totalMj = mjSums.reduce((acc, val) => acc + (val || 0), 0);
    const avgMj = totalMj / mjSums.length;
    
    // Convert MJ/m² to PSH (kWh/m²)
    return avgMj / MJ_TO_PSH_DIVISOR;
  } catch (e) {
    console.error("Now forecast failed", e);
    return 4.0;
  }
};

export const fetchMonthAvgSolarPSH = async (lat: number, lon: number, monthIso?: string): Promise<{ sunny: number, cloudy: number }> => {
  try {
    const date = monthIso ? new Date(monthIso + "-15") : new Date();
    const year = date.getFullYear() - 1;
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-28`;

    // Uses shortwave_radiation_sum (MJ/m²)
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=shortwave_radiation_sum&timezone=auto`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    
    const radiationSums = data.daily?.shortwave_radiation_sum as number[];
    if (!radiationSums || radiationSums.length === 0) return { sunny: 4.5, cloudy: 1.5 };

    const pshValues = radiationSums.map(mj => mj / MJ_TO_PSH_DIVISOR);
    
    // Filter out null/undefined/NaN just in case API returns gaps
    const validPsh = pshValues.filter(v => typeof v === 'number' && !isNaN(v));
    if (validPsh.length === 0) return { sunny: 4.5, cloudy: 1.5 };

    const avg = validPsh.reduce((a, b) => a + b, 0) / validPsh.length;
    const low = Math.min(...validPsh);

    return { 
      sunny: parseFloat(avg.toFixed(2)), 
      cloudy: parseFloat(Math.max(low, avg * 0.3).toFixed(2)) 
    };
  } catch (e) {
    console.error("Archive forecast failed", e);
    return { sunny: 4.5, cloudy: 1.5 };
  }
};
