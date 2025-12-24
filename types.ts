export enum LoadCategory {
  DC_LOADS = 'DC Loads (Native/DCDC)',
  AC_LOADS = 'AC Loads (Inverter)',
  SYSTEM_MGMT = 'System Mgmt'
}

export interface PowerItem {
  id: string;
  category: LoadCategory;
  name: string;
  watts: number;
  hours: number;
  dutyCycle: number; // Percentage (0-100)
  notes: string;
  technicalSpecs?: string;
}

export interface ChargingSource {
  id: string;
  name: string;
  input: number;
  unit: 'W' | 'A';
  hours: number;
  efficiency: number;
  type: 'solar' | 'alternator' | 'generator' | 'mppt' | 'charger' | 'wind' | 'other';
  autoSolar?: boolean;
}

export interface SolarForecast {
  sunnyHours: number;
  cloudyHours: number;
  loading: boolean;
}

export interface BatteryConfig {
  capacityAh: number;
  voltage: number;
  initialSoC: number;
  location: string;
  forecast?: SolarForecast;
}

export interface SystemTotals {
  dailyWhConsumed: number;
  dailyAhConsumed: number;
  dailyWhGenerated: number;
  dailyAhGenerated: number;
  netWh: number;
  netAh: number;
  finalSoC: number;
}

export type ChatMode = 'general' | 'load' | 'source';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  summary?: string;   // Brief version
  expanded?: string;  // Detailed version
  timestamp: Date;
  category?: 'general' | 'load' | 'source' | 'system'; 
  isError?: boolean;
}