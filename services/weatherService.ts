/**
 * Deterministic Weather Service using Open-Meteo
 * Handles Geocoding and Peak Sun Hours (PSH) calculations.
 */

export interface LatLon {
  lat: number;
  lon: number;
  name: string;
}

export const geocodeLocation = async (location: string): Promise<LatLon | null> => {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.latitude,
        lon: result.longitude,
        name: result.name
      };
    }
    return null;
  } catch (e) {
    console.error("Geocoding failed", e);
    return null;
  }
};

/**
 * PSH Calculation: sunshine_duration (seconds) / 3600 = hours
 */
const SEC_TO_HOURS = 1 / 3600;

export const fetchNowSolarPSH = async (lat: number, lon: number): Promise<number> => {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunshine_duration&timezone=auto&forecast_days=1`);
    const data = await res.json();
    const sum = data.daily?.sunshine_duration?.[0];
    return typeof sum === 'number' ? sum * SEC_TO_HOURS : 4.0;
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

    const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=sunshine_duration&timezone=auto`);
    const data = await res.json();
    
    const durations = data.daily?.sunshine_duration as number[];
    if (!durations || durations.length === 0) return { sunny: 4.5, cloudy: 1.5 };

    const pshValues = durations.map(s => s * SEC_TO_HOURS);
    const avg = pshValues.reduce((a, b) => a + b, 0) / pshValues.length;
    const low = Math.min(...pshValues);

    return { 
      sunny: parseFloat(avg.toFixed(2)), 
      cloudy: parseFloat(Math.max(low, avg * 0.3).toFixed(2)) 
    };
  } catch (e) {
    console.error("Archive forecast failed", e);
    return { sunny: 4.5, cloudy: 1.5 };
  }
};