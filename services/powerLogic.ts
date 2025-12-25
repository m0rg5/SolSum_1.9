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
 * Single Source of Truth for Solar Hours.
 * Priortizes deterministic forecast when AUTO is enabled.
 * CLAMPED: Lowered threshold to 0.1h to allow for winter/cloudy days.
 */
export const getEffectiveSolarHours = (source: ChargingSource, battery: BatteryConfig): number => {
  const manualHours = Number(source.hours) || 0;
  if (!source.autoSolar || source.type !== 'solar' || !battery.forecast) {
    return manualHours;
  }

  const { forecast, forecastMode } = battery;
  if (forecast.loading) return manualHours > 0 ? manualHours : 4.0;

  let calculated = 4.0;
  if (forecastMode === 'now') {
    calculated = typeof forecast.nowHours === 'number' ? forecast.nowHours : (manualHours || 4.0);
  } else {
    calculated = typeof forecast.sunnyHours === 'number' ? forecast.sunnyHours : (manualHours || 4.5);
  }

  // Sanity Clamp: 0.1h to 14h. Low enough for bad weather, high enough for earth.
  if (calculated < 0.1 || calculated > 14.0) {
    return manualHours > 0 ? manualHours : 4.0;
  }

  return calculated;
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
    const { wh } = calculateItemEnergy(item, systemVoltage);
    dailyWhConsumed += (Number(wh) || 0);
  });

  let dailyWhGenerated = 0;
  charging.forEach(source => {
    const hours = source.type === 'solar' 
      ? getEffectiveSolarHours(source, battery)
      : (Number(source.hours) || 0);

    const input = Number(source.input) || 0;
    const efficiency = Number(source.efficiency) || 0.85;
    const qty = Number(source.quantity) || 1;

    if (source.unit === 'W') {
      dailyWhGenerated += (input * hours * efficiency * qty);
    } else {
      dailyWhGenerated += (input * systemVoltage * hours * efficiency * qty);
    }
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
  solarForecast?: { sunny?: number, cloudy?: number, now?: number }
) => {
  const totals = calculateSystemTotals(items, charging, battery);
  const systemV = Number(battery.voltage) || 24;
  const totalCapacityWh = (Number(battery.capacityAh) || 400) * systemV;
  
  let dailyWhConsumed = totals.dailyWhConsumed || 0;
  let dailyWhGenerated = 0;

  if (scenario === 'current') {
    dailyWhGenerated = totals.dailyWhGenerated;
  } else if (scenario === 'zero') {
    dailyWhGenerated = 0;
  } else {
    charging.forEach(source => {
      let h = Number(source.hours) || 0;
      if (source.type === 'solar') {
        if (scenario === 'peak') h = solarForecast ? (solarForecast.sunny || 6.0) : 6.0;
        if (scenario === 'cloud') h = solarForecast ? (solarForecast.cloudy || 1.5) : 1.5;
      }
      const input = Number(source.input) || 0;
      const efficiency = Number(source.efficiency) || 0.85;
      const qty = Number(source.quantity) || 1;
      const val = source.unit === 'W'
        ? (input * h * efficiency * qty)
        : (input * systemV * h * efficiency * qty);
      dailyWhGenerated += val;
    });
  }

  const netWhPerDay = dailyWhGenerated - dailyWhConsumed;

  if (netWhPerDay >= 0) {
    return { days: Infinity, hours: Infinity, netWh: netWhPerDay };
  }

  const dailyDeficitWh = Math.abs(netWhPerDay);
  const totalRemainingWh = totalCapacityWh * (battery.initialSoC / 100);
  const days = totalRemainingWh / dailyDeficitWh;

  return {
    days: (isFinite(days) && days < 365) ? days : Infinity,
    hours: (isFinite(days) && days < 365) ? days * 24 : Infinity,
    netWh: netWhPerDay
  };
};