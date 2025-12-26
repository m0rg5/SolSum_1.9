import React, { useState, useEffect, useMemo } from 'react';
import { ChargingSource, BatteryConfig } from '../types';
import { getEffectiveSolarHours, normalizeAutoSolarHours } from '../services/powerLogic';

interface ChargingTableProps {
  sources: ChargingSource[];
  battery: BatteryConfig;
  highlightedId: string | null;
  onUpdateSource: (id: string, field: keyof ChargingSource, value: any) => void;
  onDeleteSource: (id: string) => void;
  onAddSource: () => void;
  onAIAddSource: () => void;
  onUpdateBattery: (field: keyof BatteryConfig, value: any) => void;
  onReorder: (fromId: string, toId: string) => void;
  onSort: (key: string, direction: 'asc' | 'desc') => void;
}

const isMgmt = (source: ChargingSource) => 
  source.type === 'mppt' || 
  source.name.toLowerCase().includes('mppt') || 
  source.name.toLowerCase().includes('rover') ||
  source.name.toLowerCase().includes('inverter');

const NumberInput = ({ 
  value, 
  onChange, 
  className,
  step = "any",
  disabled = false,
  placeholder = ""
}: { 
  value: number, 
  onChange: (val: number) => void, 
  className?: string,
  step?: string,
  disabled?: boolean,
  placeholder?: string
}) => {
const [localStr, setLocalStr] = useState(
  Number.isFinite(value) ? String(value) : ''
);
  useEffect(() => {
  if (Number.isFinite(value)) {
    const next = String(value);
    if (localStr !== next) setLocalStr(next);
  } else {
    if (localStr !== '') setLocalStr('');
  }
}, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) onChange(parsed);
  };
  
  return (
    <input 
      type="number" 
      step={step} 
      placeholder={placeholder}
      className={`bg-transparent text-right text-white focus:outline-none w-full pr-0.5 font-medium placeholder-slate-600 ${className} ${disabled ? 'opacity-30' : ''}`} 
      value={localStr} 
      onChange={handleChange} 
      disabled={disabled}
      onFocus={(e) => !disabled && e.target.select()} 
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
};

const SortHeader = ({ label, sortKey, currentSort, onSort, className, widthClass }: { label: string, sortKey: string, currentSort: { key: string, dir: 'asc' | 'desc' } | null, onSort: (k: string, d: 'asc' | 'desc') => void, className?: string, widthClass?: string }) => {
  const isActive = currentSort?.key === sortKey;
  const handleClick = () => onSort(sortKey, isActive && currentSort.dir === 'desc' ? 'asc' : 'desc');
  return (
    <th className={`px-2 py-2 cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap ${className} ${widthClass}`} onClick={handleClick}>
      <div className={`flex items-center gap-1 ${className?.includes('right') ? 'justify-end' : ''}`}>
        {label}
        <span className={`text-[7px] flex flex-col leading-none ml-0.5 ${isActive ? 'text-blue-400' : 'text-slate-700 group-hover:text-slate-500'}`}>
           <span className={`${isActive && currentSort.dir === 'asc' ? 'opacity-100' : 'opacity-40'}`}>▲</span>
           <span className={`${isActive && currentSort.dir === 'desc' ? 'opacity-100' : 'opacity-40'}`}>▼</span>
        </span>
      </div>
    </th>
  );
};

const ChargingTable: React.FC<ChargingTableProps> = ({ 
  sources, battery, highlightedId, onUpdateSource, onDeleteSource, onAddSource, onAIAddSource, onUpdateBattery, onReorder, onSort
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);

  const sortedSources = useMemo(() => {
    if (!sortState) return sources;
    const { key, dir } = sortState;
    return [...sources].sort((a, b) => {
      let valA: any = a[key as keyof ChargingSource];
      let valB: any = b[key as keyof ChargingSource];

      if (key === 'dailyWh') {
        const hA = getEffectiveSolarHours(a, battery);
        const hB = getEffectiveSolarHours(b, battery);
        valA = a.unit === 'W' ? (a.input * hA * a.efficiency * a.quantity) : (a.input * battery.voltage * hA * a.efficiency * a.quantity);
        valB = b.unit === 'W' ? (b.input * hB * b.efficiency * b.quantity) : (b.input * battery.voltage * hB * b.efficiency * b.quantity);
      }

      if (typeof valA === 'string') return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
    });
  }, [sources, sortState, battery]);

  const handleSort = (key: string, dir: 'asc' | 'desc') => { 
    setSortState({ key, dir }); 
    onSort(key, dir); 
  };

  return (
    <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-800 overflow-hidden ring-1 ring-white/5">
      <table className="w-full text-left text-[12px] text-slate-300 table-auto border-collapse border-spacing-0">
        <thead className="bg-slate-950 text-[8px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
          <tr>
            <th className="w-6"></th>
            <SortHeader label="Charging Source" sortKey="name" currentSort={sortState} onSort={handleSort} widthClass="min-w-[180px]" />
            <th className="px-1 py-2 text-center whitespace-nowrap w-[18px]">@</th>
            <SortHeader label="Input" sortKey="input" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[48px]" />
            <th className="px-1 py-2 text-center whitespace-nowrap w-[30px]">☀️ Auto</th>
            <SortHeader label="Hrs/Day" sortKey="hours" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[38px]" />
            <SortHeader label="Efficiency" sortKey="efficiency" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[38px]" />
            <SortHeader label="Daily Wh" sortKey="dailyWh" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[45px]" />
            <th className="px-2 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sortedSources.map(source => {
            const managementItem = isMgmt(source);
            const rawEffectiveHours = getEffectiveSolarHours(source, battery);
            // Limit to 1 decimal place (e.g. 7.1) for cleaner display
            const effectiveHours = Math.round(rawEffectiveHours * 10) / 10;
            
            const efficiency = Number(source.efficiency) || 0.85;
            const inputVal = Number(source.input) || 0;
            const systemV = Number(battery.voltage) || 24;
            const qty = Number(source.quantity) || 1;
            const dailyWh = managementItem ? 0 : (source.unit === 'W' ? (inputVal * rawEffectiveHours * efficiency * qty) : (inputVal * systemV * rawEffectiveHours * efficiency * qty));
            const isHighlighted = highlightedId === source.id;
            
            // Unified "AUTO ERR" logic using shared normalization result
            const norm = normalizeAutoSolarHours(battery);
            const isAutoErr = source.autoSolar && (norm.status === 'invalid' || norm.status === 'nodata');
              
            return (
              <tr key={source.id} className={`hover:bg-slate-800/40 transition-all duration-700 group ${draggedId === source.id ? 'opacity-50 bg-slate-800' : ''} ${managementItem ? 'bg-slate-900/40 opacity-60' : ''} ${isHighlighted ? 'bg-purple-900/40 border-purple-500/50 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)] ring-1 ring-purple-500/30' : ''}`}
                draggable onDragStart={(e) => { setDraggedId(source.id); e.dataTransfer.setData("text/plain", source.id); }}
                onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (draggedId && draggedId !== source.id) onReorder(draggedId, source.id); }}>
                <td className="pl-2 pr-0 py-1 w-6 text-center cursor-move text-slate-700 hover:text-slate-400">⋮⋮</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <input type="text" value={source.name} onChange={(e) => onUpdateSource(source.id, 'name', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className={`bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-200 transition-colors text-[12px] font-medium outline-none ${managementItem ? 'italic' : ''}`}/>
                </td>
                <td className="px-1 py-1 text-right">
                  <div className="inline-flex items-center justify-center w-[18px] bg-slate-850 border border-slate-700 rounded px-1 py-0.5 focus-within:border-blue-500 transition-colors">
                    <NumberInput value={source.quantity || 1} onChange={(val) => onUpdateSource(source.id, 'quantity', Math.max(1, val))} placeholder="1" className="text-center pr-0" />
                  </div>
                </td>
                <td className="px-1 py-1 text-right">
                  {!managementItem ? (
                    <div className="inline-flex items-center justify-end w-[42px] bg-slate-850 border border-slate-700 rounded px-1 py-0.5 focus-within:border-blue-500 transition-colors">
                      <NumberInput value={source.input} onChange={(val) => onUpdateSource(source.id, 'input', val)} />
                      <select 
                        value={source.unit} 
                        onChange={(e) => onUpdateSource(source.id, 'unit', e.target.value)}
                        className="bg-transparent text-[7px] text-slate-500 font-black uppercase outline-none cursor-pointer hover:text-blue-400"
                      >
                        <option value="W">W</option>
                        <option value="A">A</option>
                      </select>
                    </div>
                  ) : (
                    <span className="text-slate-600 italic text-[10px]">Internal</span>
                  )}
                </td>
                <td className="px-2 py-1 text-center">
                  {source.type === 'solar' && (
                    <input 
                      type="checkbox" 
                      checked={source.autoSolar} 
                      onChange={(e) => onUpdateSource(source.id, 'autoSolar', e.target.checked)}
                      className="w-3 h-3 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500/20"
                    />
                  )}
                </td>
                <td className="px-1 py-1 text-right relative">
                  <div className={`inline-flex items-center justify-end w-[32px] bg-slate-850 border border-slate-700 rounded px-1 py-0.5 focus-within:border-blue-500 transition-colors ${source.autoSolar ? 'opacity-50' : ''}`}>
                    <NumberInput 
                      value={effectiveHours} 
                      onChange={(val) => onUpdateSource(source.id, 'hours', val)} 
                      step="0.1" 
                      disabled={source.autoSolar || managementItem} 
                    />
                    <span className="text-[7px] text-slate-500 font-black uppercase shrink-0">H</span>
                  </div>
                  {isAutoErr && (
                    <div className="absolute -top-1 right-0.5 bg-rose-500 text-white text-[5px] font-black px-1 rounded animate-pulse">AUTO ERR</div>
                  )}
                </td>
                <td className="px-1 py-1 text-right">
                  <div className="inline-flex items-center justify-end w-[32px] bg-slate-850 border border-slate-700 rounded px-1 py-0.5 focus-within:border-blue-500 transition-colors">
                    <NumberInput 
                      value={efficiency} 
                      onChange={(val) => onUpdateSource(source.id, 'efficiency', val)} 
                      step="0.01" 
                      disabled={managementItem}
                    />
                  </div>
                </td>
                <td className="px-2 py-1 text-right font-mono text-emerald-400 font-bold text-[11px] whitespace-nowrap">
                  {dailyWh.toFixed(0)}
                </td>
                <td className="px-2 py-1 text-center w-8">
                  <button onClick={() => onDeleteSource(source.id)} className="text-slate-400 hover:text-red-400 opacity-60 hover:opacity-100 transition-all p-0.5 group/del">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 group-hover/del:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={9} className="px-2 py-1">
              <div className="flex gap-1.5">
                <button onClick={onAddSource} className="w-[10%] flex-none flex items-center justify-center gap-2 py-1 border border-dashed border-slate-700 rounded hover:bg-slate-800 text-slate-500 text-sm font-medium transition-all">+</button>
                <button onClick={onAIAddSource} className="flex-1 flex items-center justify-center gap-2 py-1 border border-dashed border-blue-900/50 bg-blue-950/20 rounded hover:bg-blue-900/40 text-blue-400/80 text-[8px] font-black uppercase tracking-widest transition-all">✨ Spec Asst.</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default ChargingTable;