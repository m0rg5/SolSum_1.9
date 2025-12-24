import React, { useState, useEffect } from 'react';
import { ChargingSource, BatteryConfig } from '../types';

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
  disabled = false
}: { 
  value: number, 
  onChange: (val: number) => void, 
  className?: string,
  step?: string,
  disabled?: boolean
}) => {
  const [localStr, setLocalStr] = useState(value?.toString() || '0');
  useEffect(() => {
    const v = Number(value) || 0;
    const parsed = parseFloat(localStr);
    if (Math.abs(parsed - v) > 0.0001 || isNaN(parsed)) setLocalStr(value?.toString() || '0');
  }, [value]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) onChange(parsed);
    else if (val === '') onChange(0);
  };
  
  return (
    <input 
      type="number" 
      step={step} 
      className={`bg-transparent text-right text-white focus:outline-none w-full pr-1 font-medium placeholder-slate-600 ${className} ${disabled ? 'opacity-30' : ''}`} 
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
    <th className={`px-4 py-4 cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap ${className} ${widthClass}`} onClick={handleClick}>
      <div className={`flex items-center gap-1 ${className?.includes('right') ? 'justify-end' : ''}`}>
        {label}
        <span className={`text-[10px] flex flex-col leading-none ml-1 ${isActive ? 'text-blue-400' : 'text-slate-700 group-hover:text-slate-500'}`}>
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
  const handleSort = (key: string, dir: 'asc' | 'desc') => { setSortState({ key, dir }); onSort(key, dir); };

  return (
    <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 overflow-hidden ring-1 ring-white/5">
      <table className="w-full text-left text-sm text-slate-300 table-auto border-collapse">
        <thead className="bg-slate-950 text-[10px] uppercase text-slate-500 font-black tracking-widest">
          <tr>
            <th className="w-8"></th>
            <SortHeader label="Charging Source" sortKey="name" currentSort={sortState} onSort={handleSort} widthClass="min-w-[200px]" />
            <SortHeader label="Input" sortKey="input" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[140px]" />
            <th className="px-4 py-4 text-center whitespace-nowrap w-[80px]">☀️ Auto</th>
            <SortHeader label="Hrs/Day" sortKey="hours" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <SortHeader label="Efficiency" sortKey="efficiency" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <SortHeader label="Daily Wh" sortKey="dailyWh" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <th className="px-4 py-4 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sources.map(source => {
            const managementItem = isMgmt(source);
            let effectiveHours = Number(source.hours) || 0;
            let isAutoActive = false;
            if (source.autoSolar && source.type === 'solar' && battery.forecast && !battery.forecast.loading) {
                effectiveHours = Number(battery.forecast.sunnyHours) || 0;
                isAutoActive = true;
            }
            const efficiency = Number(source.efficiency) || 0.85;
            const inputVal = Number(source.input) || 0;
            const systemV = Number(battery.voltage) || 24;
            const dailyWh = managementItem ? 0 : (source.unit === 'W' ? (inputVal * effectiveHours * efficiency) : (inputVal * systemV * effectiveHours * efficiency));
            const isHighlighted = highlightedId === source.id;
              
            return (
              <tr key={source.id} className={`hover:bg-slate-800/40 transition-all duration-700 group ${draggedId === source.id ? 'opacity-50 bg-slate-800' : ''} ${managementItem ? 'bg-slate-900/40 opacity-60' : ''} ${isHighlighted ? 'bg-purple-900/40 border-purple-500/50 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)] ring-1 ring-purple-500/30' : ''}`}
                draggable onDragStart={(e) => { setDraggedId(source.id); e.dataTransfer.setData("text/plain", source.id); }}
                onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (draggedId && draggedId !== source.id) onReorder(draggedId, source.id); }}>
                <td className="pl-3 pr-0 py-3 w-8 text-center cursor-move text-slate-700 hover:text-slate-400">⋮⋮</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <input type="text" value={source.name} onChange={(e) => onUpdateSource(source.id, 'name', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className={`bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-200 transition-colors text-sm font-medium outline-none ${managementItem ? 'italic' : ''}`}/>
                </td>
                <td className="px-2 py-3 text-right">
                  {!managementItem ? (
                    <div className="inline-flex items-center justify-end w-[100px] bg-slate-850 border border-slate-700 rounded-md px-2 py-1.5 focus-within:border-blue-500 transition-colors">
                      <NumberInput value={source.input} onChange={(val) => onUpdateSource(source.id, 'input', val)} />
                      <select value={source.unit} onChange={(e) => onUpdateSource(source.id, 'unit', e.target.value)} className="bg-transparent border-none text-[10px] font-black p-0 text-slate-500 outline-none cursor-pointer hover:text-blue-400">
                        <option value="W" className="bg-slate-900">W</option><option value="A" className="bg-slate-900">A</option>
                      </select>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-600 italic font-mono pr-2">Mgmt Device</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {!managementItem && source.type === 'solar' && <input type="checkbox" checked={!!source.autoSolar} onChange={(e) => onUpdateSource(source.id, 'autoSolar', e.target.checked)} className="rounded border-slate-700 bg-slate-800 text-blue-600 w-4 h-4"/>}
                </td>
                <td className="px-2 py-3 text-right">
                  {!managementItem ? (
                    <div className={`inline-flex items-center justify-end w-[80px] bg-slate-850 border border-slate-700 rounded-md px-2 py-1.5 focus-within:border-blue-500 transition-colors ${source.autoSolar ? 'border-yellow-500/50' : ''}`}>
                      <NumberInput value={isAutoActive ? effectiveHours : (Number(source.hours) || 0)} onChange={(val) => onUpdateSource(source.id, 'hours', val)} step="0.1" disabled={source.autoSolar}
                        className={source.autoSolar ? 'text-yellow-400' : ''}/>
                      <span className="text-[10px] text-slate-500 font-black uppercase shrink-0">H</span>
                    </div>
                  ) : (
                    <span className="text-slate-800 font-mono">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm whitespace-nowrap">
                  {!managementItem ? `${(efficiency * 100).toFixed(0)}%` : '-'}
                </td>
                <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${managementItem ? 'text-slate-500 opacity-50 italic text-[10px]' : 'text-cyan-400'}`}>
                  {managementItem ? '--- (Mgmt)' : (dailyWh || 0).toFixed(0)}
                </td>
                <td className="px-4 py-3 text-center w-10">
                  <button onClick={() => onDeleteSource(source.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 group/del">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 group-hover/del:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={8} className="p-2"><div className="flex gap-2">
              <button onClick={onAddSource} className="w-[15%] flex-none flex items-center justify-center gap-2 py-3 border border-dashed border-slate-700 rounded-lg hover:bg-slate-800 text-slate-500 text-lg font-medium transition-all">
                 +
              </button>
              <button onClick={onAIAddSource} className="flex-1 flex items-center justify-center gap-2 py-3 border border-dashed border-blue-900/50 bg-blue-950/20 rounded-lg hover:bg-blue-900/40 text-blue-400 text-[12px] font-black uppercase tracking-widest transition-all">
                 ✨ Spec Asst.
              </button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ChargingTable;