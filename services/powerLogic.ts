import { PowerItem, LoadCategory, ChargingSource, BatteryConfig, SystemTotals } from '../types';

const isMgmtItem = (name: string) => {
  const n = name.toLowerCase();
  return n.includes('mppt') || n.includes('inverter') || n.includes('controller') || n.includes('rover');
};

export const getInverterEfficiency = (watts: number): number => {
  const w = Number(watts) || 0;
  if (w <= 0) return 1;
  const loadRatio = w / 2000;
  if (loadRatio < 0.05) return 0.80;
  if (loadRatio < 0.15) return 0.88;
  if (loadRatio < 0.40) return 0.92;
  if (loadRatio < 0.80) return 0.95;
  return 0.91;
};

export const calculateItemEnergy = (item: PowerItem, systemVoltage: number) => {
  if (isMgmtItem(item.name)) return { wh: 0, ah: 0, efficiency: 1 };

  const watts = Number(item.watts) || 0;
  const hours = Number(item.hours) || 0;
  const v = Number(systemVoltage) || 24;
  const dutyMultiplier = (Number(item.dutyCycle) || 100) / 100;

  if (item.category === LoadCategory.AC_LOADS) {
    const efficiency = getInverterEfficiency(watts);
    const totalWatts = watts / (efficiency || 0.9);
    const wh = totalWatts * hours * dutyMultiplier;
    return { wh: wh || 0, ah: (wh / v) || 0, efficiency };
  }

  const wh = watts * hours * dutyMultiplier;
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
    if (isMgmtItem(source.name)) return;

    let hours = Number(source.hours) || 0;
    // LOGIC FIX: If forecast is loading/missing, default to 4.0h (Avg) to prevent "1.7d" panic
    if (source.autoSolar && source.type === 'solar' && battery.forecast && !battery.forecast.loading) {
       hours = Number(battery.forecast.sunnyHours) || 4.0;
    }

    const input = Number(source.input) || 0;
    const efficiency = Number(source.efficiency) || 0.85;

    if (source.unit === 'W') {
      dailyWhGenerated += (input * hours * efficiency);
    } else {
      dailyWhGenerated += (input * systemVoltage * hours * efficiency);
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
  solarForecast?: { sunny: number, cloudy: number }
) => {
  const totals = calculateSystemTotals(items, [], battery);
  const dailyWhConsumed = totals.dailyWhConsumed || 0;
  const systemV = Number(battery.voltage) || 24;
  const totalCapacityWh = (Number(battery.capacityAh) || 400) * systemV;

  let dailyWhGenerated = 0;
  if (scenario !== 'zero') {
    charging.forEach(source => {
      if (isMgmtItem(source.name)) return;

      let h = Number(source.hours) || 0;
      
      // SCENARIO LOGIC: Force defaults if forecast is 0/null
      if (source.type === 'solar') {
        if (scenario === 'current') h = solarForecast ? (Number(solarForecast.sunny) || 4.0) : 4.0;
        if (scenario === 'peak') h = solarForecast ? (Number(solarForecast.sunny) || 6.0) : 6.0;
        if (scenario === 'cloud') h = solarForecast ? (Number(solarForecast.cloudy) || 2.0) : 2.0;
      }

      const input = Number(source.input) || 0;
      const efficiency = Number(source.efficiency) || 0.85;
      const val = source.unit === 'W'
        ? (input * h * efficiency)
        : (input * systemV * h * efficiency);
      dailyWhGenerated += val;
    });
  }

  const netWhPerDay = dailyWhGenerated - dailyWhConsumed;

  // INVARIANT: Net Positive = Infinity
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