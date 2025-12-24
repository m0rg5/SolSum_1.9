import React from 'react';
import { PowerItem, LoadCategory } from '../types';
import { calculateItemEnergy } from '../services/powerLogic';

interface HeaderGraphProps {
  items: PowerItem[];
  systemVoltage: number;
}

const COLORS: Record<string, string> = {
  [LoadCategory.DC_LOADS]: 'bg-blue-500',
  [LoadCategory.AC_LOADS]: 'bg-emerald-500',
  [LoadCategory.SYSTEM_MGMT]: 'bg-amber-500',
};

const HeaderGraph: React.FC<HeaderGraphProps> = ({ items, systemVoltage }) => {
  // Calc totals
  const categoryTotals = Object.values(LoadCategory).map(cat => {
    const totalWh = items
      .filter(i => i.category === cat)
      .reduce((sum, i) => sum + calculateItemEnergy(i, systemVoltage).wh, 0);
    return { category: cat, totalWh };
  }).filter(d => d.totalWh > 0);

  // Normalize bars against the largest category
  const maxWh = Math.max(...categoryTotals.map(d => d.totalWh), 1);

  if (categoryTotals.length === 0) return null;

  return (
    <div className="w-full h-full flex flex-col justify-center px-4 border-l border-r border-slate-800/50">
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 text-center">Load Distribution</div>
      <div className="space-y-2">
        {categoryTotals.map((item) => (
          <div key={item.category} className="flex items-center gap-2 text-xs w-full">
            <div className="w-24 text-right text-slate-400 font-semibold text-[10px] truncate shrink-0">
               {item.category.split(' ')[0]}
            </div>
            <div className="flex-1 h-2 bg-slate-900 rounded-sm overflow-hidden border border-slate-800 relative">
              <div 
                className={`h-full absolute left-0 top-0 bottom-0 rounded-sm transition-all duration-1000 ${COLORS[item.category] || 'bg-slate-500'}`} 
                style={{ width: `${Math.max((item.totalWh / maxWh) * 100, 2)}%` }}
              />
            </div>
            <div className="w-16 font-mono text-slate-400 text-right shrink-0 text-[10px]">
              {item.totalWh.toFixed(0)} Wh
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeaderGraph;