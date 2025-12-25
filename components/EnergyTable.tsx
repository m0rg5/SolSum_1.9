import React, { useState, useEffect, useMemo } from 'react';
import { PowerItem, LoadCategory } from '../types';
import { calculateItemEnergy } from '../services/powerLogic';

interface EnergyTableProps {
  items: PowerItem[];
  systemVoltage: number;
  highlightedId: string | null;
  onUpdateItem: (id: string, field: keyof PowerItem, value: any) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (category: LoadCategory) => void;
  onAIAddItem: (category: LoadCategory) => void;
  onReorder: (fromId: string, toId: string) => void;
  onSort: (key: string, direction: 'asc' | 'desc') => void;
  visibleCategories: LoadCategory[];
}

const isMgmt = (item: PowerItem) => 
  item.name.toLowerCase().includes('inverter') || 
  item.name.toLowerCase().includes('controller') ||
  item.category === LoadCategory.SYSTEM_MGMT;

const NumberInput = ({ 
  value, 
  onChange, 
  className,
  step = "any",
  disabled = false,
  placeholder = "0"
}: { 
  value: number, 
  onChange: (val: number) => void, 
  className?: string,
  step?: string,
  disabled?: boolean,
  placeholder?: string
}) => {
  const [localStr, setLocalStr] = useState(value?.toString() || '');
  useEffect(() => {
    const v = Number(value) || 0;
    const parsed = parseFloat(localStr);
    if (Math.abs(parsed - v) > 0.0001 || isNaN(parsed)) setLocalStr(value?.toString() || '');
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
      type="number" step={step} disabled={disabled} placeholder={placeholder}
      className={`bg-transparent text-right text-white focus:outline-none w-full pr-0.5 font-medium placeholder-slate-600 ${className} ${disabled ? 'opacity-30' : ''}`}
      value={localStr} onChange={handleChange} onFocus={(e) => !disabled && e.target.select()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
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

const EnergyTable: React.FC<EnergyTableProps> = ({ 
  items, systemVoltage, highlightedId, onUpdateItem, onDeleteItem, onAddItem, onAIAddItem, onReorder, onSort, visibleCategories
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter(i => visibleCategories.includes(i.category));
  }, [items, visibleCategories]);

  const sortedItems = useMemo(() => {
    if (!sortState) return filteredItems;
    const { key, dir } = sortState;
    return [...filteredItems].sort((a, b) => {
      let valA: any = a[key as keyof PowerItem];
      let valB: any = b[key as keyof PowerItem];

      if (key === 'wh' || key === 'ah') {
        const energyA = calculateItemEnergy(a, systemVoltage);
        const energyB = calculateItemEnergy(b, systemVoltage);
        valA = energyA[key];
        valB = energyB[key];
      }

      if (typeof valA === 'string') return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
    });
  }, [filteredItems, sortState, systemVoltage]);

  const handleSortChange = (key: string, dir: 'asc' | 'desc') => {
    setSortState({ key, dir });
    onSort(key, dir);
  };

  const showQtyInput = visibleCategories.length === 1 && visibleCategories[0] !== LoadCategory.AC_LOADS;

  return (
    <div className="overflow-hidden bg-slate-900 rounded-lg shadow-2xl border border-slate-800 ring-1 ring-white/5">
      <table className="w-full text-left text-[12px] text-slate-300 table-auto border-collapse">
        <thead className="bg-slate-950 text-[8px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
          <tr>
            <th className="w-6"></th>
            <SortHeader label="Item" sortKey="name" currentSort={sortState} onSort={handleSortChange} widthClass="min-w-[180px]" />
            <th className="px-2 py-2 text-center whitespace-nowrap w-[40px]">@</th>
            <SortHeader label="POWER (W)" sortKey="watts" currentSort={sortState} onSort={handleSortChange} className="text-right" widthClass="w-[90px]" />
            <SortHeader label="HRS/DAY" sortKey="hours" currentSort={sortState} onSort={handleSortChange} className="text-right" widthClass="w-[80px]" />
            <th className="px-2 py-2 text-right whitespace-nowrap w-[80px]">DUTY %</th>
            <SortHeader label="DAILY WH" sortKey="wh" currentSort={sortState} onSort={handleSortChange} className="text-right" widthClass="w-[90px]" />
            <SortHeader label="AH TOTAL" sortKey="ah" currentSort={sortState} onSort={handleSortChange} className="text-right" widthClass="w-[90px]" />
            <th className="px-2 py-2 whitespace-nowrap uppercase">Notes</th>
            <th className="px-2 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sortedItems.map(item => {
            const { wh, ah } = calculateItemEnergy(item, systemVoltage);
            const isSuspicious = ah > 100 && (item.dutyCycle === undefined || item.dutyCycle === 100);
            const managementItem = isMgmt(item);
            const isHighlighted = highlightedId === item.id;
            
            return (
              <tr key={item.id} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-all duration-700 group ${draggedId === item.id ? 'opacity-50 bg-slate-800' : ''} ${managementItem ? 'bg-slate-900/40 opacity-60' : ''} ${isHighlighted ? 'bg-purple-900/40 border-purple-500/50 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)] ring-1 ring-purple-500/30' : ''}`} draggable
                onDragStart={(e) => { setDraggedId(item.id); e.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (draggedId && draggedId !== item.id) onReorder(draggedId, item.id); }}>
                <td className="pl-2 pr-0 py-1 w-6 text-center cursor-move text-slate-700 hover:text-slate-400">⋮⋮</td>
                <td className="px-2 py-1 whitespace-nowrap min-w-[180px]">
                  <input type="text" value={item.name} onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className={`bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-200 transition-colors text-[12px] font-medium outline-none ${managementItem ? 'italic' : ''}`}/>
                </td>
                <td className="px-1 py-1 text-right">
                  {showQtyInput ? (
                    <div className="inline-flex items-center justify-center w-[30px] bg-slate-850 border border-slate-700 rounded px-1 py-0.5 focus-within:border-blue-500 transition-colors">
                      <NumberInput value={item.quantity || 1} onChange={(val) => onUpdateItem(item.id, 'quantity', Math.max(1, val))} placeholder="1" className="text-center pr-0" />
                    </div>
                  ) : (
                    <div className="w-[30px] h-5 flex items-center justify-center opacity-20 text-slate-600 font-mono text-[8px]">-</div>
                  )}
                </td>
                <td className="px-1 py-1 text-right">
                  <div className={`inline-flex items-center justify-end w-[65px] bg-slate-850 border border-slate-700 rounded px-1.5 py-0.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                    <NumberInput value={item.watts} onChange={(val) => onUpdateItem(item.id, 'watts', val)} disabled={managementItem} />
                    <span className="text-[8px] text-slate-500 font-black uppercase shrink-0">W</span>
                  </div>
                </td>
                <td className="px-1 py-1 text-right">
                  <div className={`inline-flex items-center justify-end w-[60px] bg-slate-850 border border-slate-700 rounded px-1.5 py-0.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                    <NumberInput value={item.hours} onChange={(val) => onUpdateItem(item.id, 'hours', val)} step="0.1" disabled={managementItem} />
                    <span className="text-[8px] text-slate-500 font-black uppercase shrink-0">H</span>
                  </div>
                </td>
                <td className="px-1 py-1 text-right">
                   <div className={`inline-flex items-center justify-end w-[60px] bg-slate-850 border border-slate-700 rounded px-1.5 py-0.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                    <NumberInput value={item.dutyCycle || 100} onChange={(val) => onUpdateItem(item.id, 'dutyCycle', Math.min(100, Math.max(1, val)))} disabled={managementItem} className={item.dutyCycle < 100 ? 'text-amber-400' : ''}/>
                    <span className="text-[8px] text-slate-500 font-black uppercase shrink-0">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right font-mono text-emerald-400 font-bold text-[12px] whitespace-nowrap">{(wh || 0).toFixed(0)}</td>
                <td className="px-2 py-1 text-right font-mono text-amber-400 font-bold text-[12px] whitespace-nowrap relative">
                  <div className="flex items-center justify-end gap-1">{(ah || 0).toFixed(1)}
                     {isSuspicious && <div className="text-amber-500 animate-pulse"><svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg></div>}
                  </div>
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-[10px]">
                  <input type="text" value={item.notes} onChange={(e) => onUpdateItem(item.id, 'notes', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-500 italic transition-colors outline-none"/>
                </td>
                <td className="px-2 py-1 text-center w-8">
                  <button onClick={() => onDeleteItem(item.id)} className="text-slate-400 hover:text-red-400 opacity-60 hover:opacity-100 transition-all p-0.5 group/del">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 group-hover/del:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={10} className="px-2 py-1"><div className="flex gap-1.5">
              <button onClick={() => onAddItem(visibleCategories[0])} className="w-[10%] flex-none flex items-center justify-center gap-2 py-1 border border-dashed border-slate-700 rounded hover:bg-slate-800 text-slate-500 text-sm font-medium transition-all">+</button>
              <button onClick={() => onAIAddItem(visibleCategories[0])} className="flex-1 flex items-center justify-center gap-2 py-1 border border-dashed border-blue-900/50 bg-blue-950/20 rounded hover:bg-blue-900/40 text-blue-400/80 text-[8px] font-black uppercase tracking-widest transition-all">✨ Spec Asst.</button>
            </div></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default EnergyTable;