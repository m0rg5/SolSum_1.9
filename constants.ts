import { LoadCategory, PowerItem, ChargingSource, BatteryConfig } from './types';

export const SYSTEM_VOLTAGE = 24;

export const INITIAL_DATA: PowerItem[] = [
  // CLIMATE
  { id: 'c1', category: LoadCategory.DC_LOADS, name: 'DC Air Con', watts: 960, hours: 4.0, dutyCycle: 50, notes: 'High drain. Cycles on thermostat.' },
  { id: 'c2', category: LoadCategory.DC_LOADS, name: 'Sirocco Fan', watts: 4, hours: 8.0, dutyCycle: 100, notes: 'Sleeping/Desk (via 12V Conv)' },
  { id: 'c3', category: LoadCategory.DC_LOADS, name: 'Kitchen Exhaust', watts: 80, hours: 1.0, dutyCycle: 100, notes: 'High power mode (via 12V Conv)' },
  { id: 'c4', category: LoadCategory.DC_LOADS, name: 'Toilet/Cab Fans', watts: 15, hours: 1.0, dutyCycle: 100, notes: 'Intermittent (via 12V Conv)' },
  
  // COOKING (AC)
  { id: 'k1', category: LoadCategory.AC_LOADS, name: 'Induction Cooktop', watts: 1500, hours: 0.5, dutyCycle: 100, notes: 'Avg dinner session (via Inv1)' },
  { id: 'k2', category: LoadCategory.AC_LOADS, name: 'Ninja Oven', watts: 1700, hours: 0.3, dutyCycle: 100, notes: 'Baking/Reheat (via Inv1)' },
  { id: 'k3', category: LoadCategory.AC_LOADS, name: 'Kettle/Toaster', watts: 1500, hours: 0.1, dutyCycle: 100, notes: 'Short bursts (via Inv1)' },

  // OFFICE
  { id: 'o1', category: LoadCategory.DC_LOADS, name: 'Mac Mini (M4)', watts: 40, hours: 8.0, dutyCycle: 100, notes: 'Workstation (via UDF)' },
  { id: 'o2', category: LoadCategory.DC_LOADS, name: 'Monitor (USB-C)', watts: 40, hours: 8.0, dutyCycle: 100, notes: '(via UDF)' },
  { id: 'o3', category: LoadCategory.DC_LOADS, name: 'MacBook Air', watts: 30, hours: 3.0, dutyCycle: 100, notes: 'Charging (via UDF)' },
  { id: 'o4', category: LoadCategory.DC_LOADS, name: 'Starlink', watts: 50, hours: 12.0, dutyCycle: 100, notes: 'If active (via 12V Conv or Inv)' },

  // HOUSE / 12V
  { id: 'h1', category: LoadCategory.DC_LOADS, name: 'Fridge (NCC-80)', watts: 50, hours: 24.0, dutyCycle: 33, notes: '33% Duty Cycle factored' },
  { id: 'h2', category: LoadCategory.DC_LOADS, name: 'Water Pump', watts: 60, hours: 0.3, dutyCycle: 100, notes: 'Showers/Dishes (via 12V Conv)' },
  { id: 'h3', category: LoadCategory.DC_LOADS, name: 'LED Lights (All)', watts: 20, hours: 5.0, dutyCycle: 100, notes: 'Evening (via 12V Conv)' },
  { id: 'h4', category: LoadCategory.DC_LOADS, name: 'Phone/Misc USB', watts: 10, hours: 4.0, dutyCycle: 100, notes: 'Charging small devices' },

  // SYSTEM MGMT
  { id: 's1', category: LoadCategory.SYSTEM_MGMT, name: 'Inv1 Standby', watts: 25, hours: 2.0, dutyCycle: 100, notes: 'ON only during cooking' },
  { id: 's2', category: LoadCategory.SYSTEM_MGMT, name: 'Inv2 Standby', watts: 5, hours: 10.0, dutyCycle: 100, notes: 'ON during work hours' },
  { id: 's3', category: LoadCategory.SYSTEM_MGMT, name: '24-12V Converter', watts: 10, hours: 24.0, dutyCycle: 100, notes: 'Idle + Efficiency loss (Always ON)' },
  { id: 's4', category: LoadCategory.SYSTEM_MGMT, name: 'IoT/HA/Shunt', watts: 5, hours: 24.0, dutyCycle: 100, notes: '24/7 Monitoring' },
];

export const INITIAL_CHARGING: ChargingSource[] = [
  { id: 'solar1', name: 'Solar Array (Truck)', input: 1180, unit: 'W', hours: 5.0, efficiency: 0.85, type: 'solar' }
];

export const INITIAL_BATTERY: BatteryConfig = {
  capacityAh: 400,
  voltage: 24,
  initialSoC: 100,
  location: '2048',
};