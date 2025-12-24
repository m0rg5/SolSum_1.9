import React from 'react';
import { PowerItem, SystemTotals, BatteryConfig, ChargingSource } from '../types';
import { calculateAutonomy } from '../services/powerLogic';

interface SummaryPanelProps {
  items: PowerItem[];
  totals: SystemTotals;
  systemVoltage: number;
  battery: BatteryConfig;
  charging: ChargingSource[];
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({ totals, systemVoltage, items, battery, charging }) => {
  const socColor = totals.finalSoC > 50 ? 'text-emerald-400' : totals.finalSoC > 20 ? 'text-amber-400' : 'text-red-400';

  const renderAutonomyRow = (label: string, scenario: 'current' | 'peak' | 'cloud' | 'zero', icon: React.ReactNode) => {
    const forecast = battery.forecast ? { sunny: battery.forecast.sunnyHours, cloudy: battery.forecast.cloudyHours } : undefined;
    const { days, hours } = calculateAutonomy(items, charging, battery, scenario, forecast);
    
    let text = "";
    let textColor = "text-slate-400";

    if (days === Infinity || days > 30) {
      text = "∞";
      textColor = "text-emerald-400";
    } else {
      if (days > 1) {
         text = `${days.toFixed(1)} d`;
         textColor = days > 3 ? "text-emerald-400" : "text-amber-400";
      } else {
         text = `${hours.toFixed(1)} h`;
         textColor = "text-rose-400";
      }
    }

    return (
      <div className="flex items-start gap-4 w-full group/row py-1">
        <span className="text-lg grayscale group-hover/row:grayscale-0 transition-all shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center">
            {typeof icon === 'string' ? icon : icon}
        </span>
        <div className="flex flex-col items-start flex-1 border-l border-slate-800/50 pl-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{label}</span>
          <span className={`font-mono font-black text-[13px] leading-tight mt-0.5 ${textColor}`}>{text}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full text-center py-2 px-1">
      {/* Battery SoC Card */}
      <div className="w-full bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
        <h3 className="app-header-font text-[10px] text-slate-600 mb-2">24H SOC</h3>
        
        <div className={`app-header-font text-4xl mb-3 drop-shadow-lg transition-all duration-500 ${socColor}`}>
          {totals.finalSoC.toFixed(0)}%
        </div>

        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-4 border border-slate-700/50 shadow-inner max-w-[120px]">
          <div 
            className={`h-full transition-all duration-1000 relative ${totals.finalSoC > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
            style={{ width: `${totals.finalSoC}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent"></div>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[100px]">
          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 shadow-md flex flex-col items-center group/box hover:border-cyan-500/30 transition-colors">
             <span className="text-[7px] text-slate-600 uppercase font-black mb-0.5 tracking-widest leading-none">Input</span>
             <span className="font-mono text-cyan-400 font-black text-[10px] tracking-tight">+{totals.dailyAhGenerated.toFixed(0)}Ah</span>
          </div>
          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 shadow-md flex flex-col items-center group/box hover:border-rose-500/30 transition-colors">
             <span className="text-[7px] text-slate-600 uppercase font-black mb-0.5 tracking-widest leading-none">Output</span>
             <span className="font-mono text-rose-400 font-black text-[10px] tracking-tight">-{totals.dailyAhConsumed.toFixed(0)}Ah</span>
          </div>
        </div>
      </div>

      {/* Battery Life Card */}
      <div className="w-full bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
        <h3 className="app-header-font text-[10px] text-slate-600 mb-6">Battery Life</h3>
        
        <div className="w-full space-y-4 px-1 max-w-[180px]">
          {renderAutonomyRow("Realistic", "current", (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-slate-400">
               <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c-1.035 0-1.875.84-1.875 1.875v9.375c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V10.5c0-1.035-.84-1.875-1.875-1.875h-.75ZM3 13.125c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875v4.875c0 1.035-.84 1.875-1.875 1.875H4.875c-1.035 0-1.875-.84-1.875-1.875v-4.875Z" />
            </svg>
          ))}
          {renderAutonomyRow("Cloud", "cloud", "⛅")}
          {renderAutonomyRow("0%", "zero", "🌑")}
        </div>
      </div>
    </div>
  );
};

export default SummaryPanel;