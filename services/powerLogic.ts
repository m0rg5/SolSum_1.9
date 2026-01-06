
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
        
        let baselineHours = manual || 4.0;
        
        if (source.autoSolar && solarForecast) {
             if (battery.forecastMode === 'now' && solarForecast.now !== undefined) {
                 baselineHours = solarForecast.now;
             } else if (solarForecast.sunny !== undefined) {
                 baselineHours = solarForecast.sunny;
             }
        }

        if (scenario === 'peak') {
           h = baselineHours;
        } else if (scenario === 'cloud') {
           /**
            * DHI / GHI Functional Model:
            * 'Cloud' scenario represents functional resilience in diffuse light.
            * Updated to 60% (Partly Cloudy) to represent realistic DHI contribution
            * rather than a pessimistic 50% floor.
            * "100% cloud cover still provides 15%–25%... Partly Cloudy provides 50%–75%".
            */
           const partlyCloudyFactor = 0.60;
           const overcastFloorFactor = 0.20;
           
           const functionalModel = baselineHours * partlyCloudyFactor;
           const physicsFloor = baselineHours * overcastFloorFactor;

           const forecastCloudy = (battery.forecastMode !== 'now' && solarForecast?.cloudy) ? solarForecast.cloudy : 0;

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
   * ALL Scenarios now respect the CURRENT SoC (Final SoC) if provided.
   * This ensures the Dashboard consistently answers: "From where I am NOW, how long do I last?"
   * Fallback to Initial SoC or 100 if current is unavailable.
   */
  const basisSoC = (currentSoC !== undefined) ? currentSoC : (battery.initialSoC || 100);

  const remainingWh = totalCapacityWh * (basisSoC / 100);
  const days = remainingWh / dailyDeficitWh;

  return {
    days: (isFinite(days) && days < 9999) ? days : Infinity,
    hours: (isFinite(days) && days < 9999) ? days * 24 : Infinity,
    netWh: netWhPerDay
  };
};
