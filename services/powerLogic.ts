
import { PowerItem, LoadCategory, ChargingSource, BatteryConfig, SystemTotals } from '../types';

export const getInverterEfficiency = (watts: number): number => {
  const w = Number(watts) || 0;
  if (w <= 0) return 1;
  const loadRatio = w / 2000;
  if (loadRatio < 0.05) return 0.75;
  if (loadRatio < 0.15) return 0.85;
  if (loadRatio < 0.40) return 0.90;
  if (loadRatio < 0.80) return 0.94;
  return 0.91;
};

/**
 * Normalizes solar forecast data.
 * Returns status and value. value is null if status is not 'ok'.
 */
export const normalizeAutoSolarHours = (battery: BatteryConfig): { 
  status: 'ok' | 'loading' | 'nodata' | 'invalid', 
  value: number | null,
  fallbackValue: number 
} => {
  const DEFAULT_FALLBACK = 4.0;
  
  if (!battery.forecast) {
    return { status: 'nodata', value: null, fallbackValue: DEFAULT_FALLBACK };
  }
  
  if (battery.forecast.loading || !battery.forecast.fetched) {
    return { status: 'loading', value: null, fallbackValue: DEFAULT_FALLBACK };
  }

  const raw = battery.forecastMode === 'now' 
    ? battery.forecast?.nowHours 
    : battery.forecast?.sunnyHours;

  if (raw === undefined || raw === null || (raw as any) === '') {
    return { status: 'nodata', value: null, fallbackValue: DEFAULT_FALLBACK };
  }
  
  const val = Number(raw);
  if (!isFinite(val) || val < 0 || val > 15) {
    return { status: 'invalid', value: null, fallbackValue: DEFAULT_FALLBACK };
  }
  
  return { status: 'ok', value: val, fallbackValue: val };
};

export const getEffectiveSolarHours = (source: ChargingSource, battery: BatteryConfig): number => {
  const manualHours = Number(source.hours) || 0;
  const norm = normalizeAutoSolarHours(battery);

  if (source.autoSolar && source.type === 'solar') {
    if (norm.status === 'ok' && norm.value !== null) return norm.value;
    return manualHours > 0 ? manualHours : norm.fallbackValue;
  }
  
  if (source.type === 'solar' && manualHours === 0) {
    return norm.fallbackValue;
  }

  return manualHours;
};

export const calculateItemEnergy = (item: PowerItem, systemVoltage: number) => {
  const watts = Number(item.watts) || 0;
  const hours = Number(item.hours) || 0;
  const v = Number(systemVoltage) || 24;
  const dutyMultiplier = (Number(item.dutyCycle) || 100) / 100;
  const qty = Number(item.quantity) || 1;

  if (item.category === LoadCategory.AC_LOADS) {
    const efficiency = getInverterEfficiency(watts);
    const totalWatts = watts / (efficiency || 0.85);
    const wh = totalWatts * hours * dutyMultiplier * qty;
    return { wh: wh || 0, ah: (wh / v) || 0, efficiency };
  }

  const wh = watts * hours * dutyMultiplier * qty;
  return { wh: wh || 0, ah: (wh / v) || 0, efficiency: 1 };
};

export const calculateSystemTotals = (
  items: PowerItem[],
  charging: ChargingSource[],
  battery: BatteryConfig
): SystemTotals => {
  const systemVoltage = Number(battery.voltage) || 24;
  let dailyWhConsumed = 0;

  items.forEach(item => {
    if (item.enabled === false) return;
    const { wh } = calculateItemEnergy(item, systemVoltage);
    dailyWhConsumed += (Number(wh) || 0);
  });

  let dailyWhGenerated = 0;
  charging.forEach(source => {
    if (source.enabled === false) return;
    const hours = source.type === 'solar' 
      ? getEffectiveSolarHours(source, battery)
      : (Number(source.hours) || 0);

    const input = Number(source.input) || 0;
    const efficiency = Number(source.efficiency) || 0.85;
    const qty = Number(source.quantity) || 1;

    // STRICT: Input is Watts. NO VOLTAGE MULTIPLIER.
    dailyWhGenerated += (input * hours * efficiency * qty);
  });

  const dailyAhConsumed = (dailyWhConsumed / systemVoltage) || 0;
  const dailyAhGenerated = (dailyWhGenerated / systemVoltage) || 0;
  const netWh = dailyWhGenerated - dailyWhConsumed;
  const capacityAh = Number(battery.capacityAh) || 400;
  const capacityWh = capacityAh * systemVoltage;
  const initialSoC = Number(battery.initialSoC) || 100;

  const startWh = (initialSoC / 100) * capacityWh;
  const endWh = Math.min(capacityWh, Math.max(0, startWh + netWh));
  const finalSoC = (endWh / (capacityWh || 1)) * 100;

  return {
    dailyWhConsumed: isNaN(dailyWhConsumed) ? 0 : dailyWhConsumed,
    dailyAhConsumed: isNaN(dailyAhConsumed) ? 0 : dailyAhConsumed,
    dailyWhGenerated: isNaN(dailyWhGenerated) ? 0 : dailyWhGenerated,
    dailyAhGenerated: isNaN(dailyAhGenerated) ? 0 : dailyAhGenerated,
    netWh: isNaN(netWh) ? 0 : netWh,
    netAh: isNaN(dailyAhGenerated - dailyAhConsumed) ? 0 : dailyAhGenerated - dailyAhConsumed,
    finalSoC: isNaN(finalSoC) ? 0 : finalSoC
  };
};

export const calculateAutonomy = (
  items: PowerItem[],
  charging: ChargingSource[],
  battery: BatteryConfig,
  scenario: 'current' | 'peak' | 'cloud' | 'zero',
  solarForecast?: { sunny?: number, cloudy?: number, now?: number },
  currentSoC?: number
) => {
  const systemVoltage = Number(battery.voltage) || 24;
  let dailyWhConsumed = 0;
  items.forEach(item => {
    if (item.enabled === false) return;
    const { wh } = calculateItemEnergy(item, systemVoltage);
    dailyWhConsumed += (Number(wh) || 0);
  });

  let dailyWhGenerated = 0;
  
  if (scenario === 'zero') {
    dailyWhGenerated = 0;
  } else {
    charging.forEach(source => {
      if (source.enabled === false) return;
      
      let h = Number(source.hours) || 0;
      
      if (source.type === 'solar') {
        const manual = Number(source.hours) || 0;
        const sunnyHours = (source.autoSolar && solarForecast?.sunny) ? solarForecast.sunny : (manual || 4.0);

        if (scenario === 'peak') {
           h = sunnyHours;
        } else if (scenario === 'cloud') {
           /**
            * DHI / GHI Functional Model:
            * 'CLOUD' represents functional production minimums.
            * Partly Cloudy typically provides 50-75% output.
            * Overcast typically provides 15-25% output.
            * We use 50% as the default "Cloud" scenario to reflect functional resilience.
            */
           const partlyCloudyFactor = 0.50;
           const overcastFloorFactor = 0.20;
           
           // Use the best available data between forecast and the 50% "Partly Cloudy" functional model.
           const forecastCloudy = (source.autoSolar && solarForecast?.cloudy) ? solarForecast.cloudy : 0;
           const functionalModel = sunnyHours * partlyCloudyFactor;
           const physicsFloor = sunnyHours * overcastFloorFactor;

           h = Math.max(forecastCloudy, functionalModel, physicsFloor);
        } else if (scenario === 'current') {
           h = getEffectiveSolarHours(source, battery);
        }
      } 
      
      const input = Number(source.input) || 0;
      const efficiency = Number(source.efficiency) || 0.85;
      const qty = Number(source.quantity) || 1;
      dailyWhGenerated += (input * h * efficiency * qty);
    });
  }

  const netWhPerDay = dailyWhGenerated - dailyWhConsumed;
  if (netWhPerDay >= 0) return { days: Infinity, hours: Infinity, netWh: netWhPerDay };

  const dailyDeficitWh = Math.abs(netWhPerDay);
  const totalCapacityWh = (Number(battery.capacityAh) || 400) * systemVoltage;
  
  /**
   * Basis Logic:
   * 'Realistic' shows time remaining at CURRENT SoC (Final SoC).
   * 'Cloud' and '0%' show theoretical autonomy from FULL (100%) to represent System Buffer capacity.
   */
  const basisSoC = (scenario === 'current') 
    ? (currentSoC !== undefined ? currentSoC : (battery.initialSoC || 100))
    : 100;

  const remainingWh = totalCapacityWh * (basisSoC / 100);
  const days = remainingWh / dailyDeficitWh;

  return {
    days: (isFinite(days) && days < 9999) ? days : Infinity,
    hours: (isFinite(days) && days < 9999) ? days * 24 : Infinity,
    netWh: netWhPerDay
  };
};
