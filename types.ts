
export enum LoadCategory {
  DC_LOADS = 'DC Loads (Native/DCDC)',
  AC_LOADS = 'AC Loads (Inverter)',
  SYSTEM_MGMT = 'System Mgmt'
}

export interface PowerItem {
  id: string;
  category: LoadCategory;
  name: string;
  quantity: number;
  watts: number;
  hours: number;
  dutyCycle: number; // Percentage (0-100)
  notes: string;
  technicalSpecs?: string;
  enabled?: boolean;
}

export interface ChargingSource {
  id: string;
  name: string;
  quantity: number;
  input: number;
  unit?: 'W'; // 'A' is deprecated. All inputs are Watts.
  hours: number;
  efficiency: number;
  type: 'solar' | 'alternator' | 'generator' | 'mppt' | 'charger' | 'wind' | 'other';
  autoSolar?: boolean;
  enabled?: boolean;
}

export interface SolarForecast {
  sunnyHours?: number; // Month Avg PSH
  cloudyHours?: number; // Typical bad day PSH
  nowHours?: number;   // Real-time weather PSH (deterministic)
  loading: boolean;
  fetched: boolean;
  updatedAt?: string;
  error?: string;
  lat?: number;
  lon?: number;
}

export interface BatteryConfig {
  capacityAh: number;
  voltage: number;
  initialSoC: number;
  location: string;
  forecastMode: 'now' | 'monthAvg';
  forecastMonth?: string; // YYYY-MM-DD
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
  summary?: string;
  expanded?: string;
  timestamp: Date;
  category?: 'general' | 'load' | 'source' | 'system'; 
  isError?: boolean;
}

export interface AppStateExport {
  version: string;
  items: PowerItem[];
  charging: ChargingSource[];
  battery: BatteryConfig;
}
