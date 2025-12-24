import React, { useState, useEffect } from 'react';
import { PowerItem, LoadCategory } from '../types';
import { calculateItemEnergy } from '../services/powerLogic';

interface EnergyTableProps {
  items: PowerItem[];
  systemVoltage: number;
  onUpdateItem: (id: string, field: keyof PowerItem, value: any) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (category: LoadCategory) => void;
  onAIAddItem: (category: LoadCategory) => void;
  onReorder: (fromId: string, toId: string) => void;
  onSort: (key: string, direction: 'asc' | 'desc') => void;
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
    if (Math.abs(parsed - v) > 0.0001 || isNaN(parsed)) {
       setLocalStr(value?.toString() || '0');
    }
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
      disabled={disabled}
      className={`bg-transparent text-right text-white focus:outline-none w-full pr-1 font-medium placeholder-slate-600 ${className} ${disabled ? 'opacity-30' : ''}`}
      value={localStr} 
      onChange={handleChange}
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

const EnergyTable: React.FC<EnergyTableProps> = ({ items, systemVoltage, onUpdateItem, onDeleteItem, onAddItem, onAIAddItem, onReorder, onSort }) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);
  const categories = Object.values(LoadCategory);
  const handleSort = (key: string, dir: 'asc' | 'desc') => { setSortState({ key, dir }); onSort(key, dir); };

  const renderCategoryGroup = (category: LoadCategory) => {
    const categoryItems = items.filter(item => item.category === category);
    return (
      <React.Fragment key={category}>
        <tr className="bg-slate-950/80 border-t-2 border-slate-800">
          <td colSpan={9} className="px-4 py-3"><span className="app-header-font text-[10px] text-blue-400">{category}</span></td>
        </tr>
        {categoryItems.map(item => {
          const { wh, ah } = calculateItemEnergy(item, systemVoltage);
          const isSuspicious = ah > 100 && (item.dutyCycle === undefined || item.dutyCycle === 100);
          const managementItem = isMgmt(item);
          
          return (
            <tr key={item.id} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors group ${draggedId === item.id ? 'opacity-50 bg-slate-800' : ''} ${managementItem ? 'bg-slate-900/40 opacity-60' : ''}`} draggable
              onDragStart={(e) => { setDraggedId(item.id); e.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (draggedId && draggedId !== item.id) onReorder(draggedId, item.id); }}>
              <td className="pl-3 pr-0 py-3 w-8 text-center cursor-move text-slate-700 hover:text-slate-400">⋮⋮</td>
              <td className="px-4 py-3 whitespace-nowrap min-w-[200px]">
                <input type="text" value={item.name} onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className={`bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-200 transition-colors text-sm font-medium outline-none ${managementItem ? 'italic' : ''}`}/>
              </td>
              <td className="px-2 py-3 text-right">
                <div className={`inline-flex items-center justify-end w-[88px] bg-slate-850 border border-slate-700 rounded-md px-2 py-1.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                  <NumberInput value={item.watts} onChange={(val) => onUpdateItem(item.id, 'watts', val)} disabled={managementItem} />
                  <span className="text-[10px] text-slate-500 font-black uppercase shrink-0">W</span>
                </div>
              </td>
              <td className="px-2 py-3 text-right">
                <div className={`inline-flex items-center justify-end w-[80px] bg-slate-850 border border-slate-700 rounded-md px-2 py-1.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                  <NumberInput value={item.hours} onChange={(val) => onUpdateItem(item.id, 'hours', val)} step="0.1" disabled={managementItem} />
                  <span className="text-[10px] text-slate-500 font-black uppercase shrink-0">H</span>
                </div>
              </td>
              <td className="px-2 py-3 text-right">
                 <div className={`inline-flex items-center justify-end w-[80px] bg-slate-850 border border-slate-700 rounded-md px-2 py-1.5 focus-within:border-blue-500 transition-colors ${managementItem ? 'border-dashed' : ''}`}>
                  <NumberInput value={item.dutyCycle || 100} onChange={(val) => onUpdateItem(item.id, 'dutyCycle', Math.min(100, Math.max(1, val)))} disabled={managementItem} className={item.dutyCycle < 100 ? 'text-amber-400' : ''}/>
                  <span className="text-[10px] text-slate-500 font-black uppercase shrink-0">%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold text-sm whitespace-nowrap">{(wh || 0).toFixed(0)}</td>
              <td className="px-4 py-3 text-right font-mono text-amber-400 font-bold text-sm whitespace-nowrap relative">
                <div className="flex items-center justify-end gap-2">{(ah || 0).toFixed(1)}
                   {isSuspicious && <div className="text-amber-500 animate-pulse"><svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg></div>}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">
                <input type="text" value={item.notes} onChange={(e) => onUpdateItem(item.id, 'notes', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 w-full text-slate-500 italic transition-colors outline-none"/>
              </td>
              <td className="px-4 py-3 text-center w-10">
                <button onClick={() => onDeleteItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 group/del">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 group-hover/del:scale-110 transition-transform"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </td>
            </tr>
          );
        })}
        <tr>
          <td colSpan={9} className="px-4 py-2"><div className="flex gap-2">
            <button onClick={() => onAddItem(category)} className="w-[15%] flex-none flex items-center justify-center gap-2 py-3 border border-dashed border-slate-700 rounded-lg hover:bg-slate-800 text-slate-500 text-lg font-medium transition-all">+</button>
            <button onClick={() => onAIAddItem(category)} className="flex-1 flex items-center justify-center gap-2 py-3 border border-dashed border-blue-900/50 bg-blue-950/20 rounded-lg hover:bg-blue-900/40 text-blue-400/80 text-[12px] font-black uppercase tracking-widest transition-all">✨ Spec Asst.</button>
          </div></td>
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div className="overflow-hidden bg-slate-900 rounded-xl shadow-2xl border border-slate-800 ring-1 ring-white/5">
      <table className="w-full text-left text-sm text-slate-300 table-auto border-collapse">
        <thead className="bg-slate-950 text-[10px] uppercase text-slate-500 font-black tracking-widest">
          <tr>
            <th className="w-8"></th>
            <SortHeader label="Item" sortKey="name" currentSort={sortState} onSort={handleSort} widthClass="min-w-[200px]" />
            <SortHeader label="Power (W)" sortKey="watts" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[120px]" />
            <SortHeader label="Hrs/Day" sortKey="hours" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <th className="px-4 py-4 text-right whitespace-nowrap w-[110px]">Duty %</th>
            <SortHeader label="Daily Wh" sortKey="wh" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <SortHeader label="AH Total" sortKey="ah" currentSort={sortState} onSort={handleSort} className="text-right" widthClass="w-[110px]" />
            <th className="px-4 py-4 whitespace-nowrap">Notes</th>
            <th className="px-4 py-4 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">{categories.map(cat => renderCategoryGroup(cat))}</tbody>
      </table>
    </div>
  );
};

export default EnergyTable;