import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { INITIAL_DATA, INITIAL_CHARGING, INITIAL_BATTERY } from './constants';
import { PowerItem, ChargingSource, BatteryConfig, LoadCategory, ChatMode } from './types';
import { calculateSystemTotals, calculateItemEnergy } from './services/powerLogic';
import { getSolarForecast } from './services/geminiService';
import EnergyTable from './components/EnergyTable';
import ChargingTable from './components/ChargingTable';
import SummaryPanel from './components/SummaryPanel';
import ChatBot from './components/ChatBot';
import HeaderGraph from './components/HeaderGraph';

const App: React.FC = () => {
  const [items, setItems] = useState<PowerItem[]>(() => {
    try {
      const saved = localStorage.getItem('solsum_items');
      return saved ? JSON.parse(saved) : INITIAL_DATA;
    } catch (e) {
      console.error("Failed to load items", e);
      return INITIAL_DATA;
    }
  });

  const [charging, setCharging] = useState<ChargingSource[]>(() => {
    try {
      const saved = localStorage.getItem('solsum_charging');
      return saved ? JSON.parse(saved) : INITIAL_CHARGING;
    } catch (e) {
      console.error("Failed to load charging sources", e);
      return INITIAL_CHARGING;
    }
  });

  const [battery, setBattery] = useState<BatteryConfig>(() => {
    try {
      const saved = localStorage.getItem('solsum_battery');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.forecast) parsed.forecast.loading = false;
        return parsed;
      }
      return INITIAL_BATTERY;
    } catch (e) {
      console.error("Failed to load battery config", e);
      return INITIAL_BATTERY;
    }
  });
  
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [chatContextItem, setChatContextItem] = useState<PowerItem | ChargingSource | null>(null);

  // Hardened persistence logic
  useEffect(() => {
    localStorage.setItem('solsum_items', JSON.stringify(items));
    localStorage.setItem('solsum_charging', JSON.stringify(charging));
    
    const batteryToSave = { ...battery };
    if (batteryToSave.forecast) {
      batteryToSave.forecast = { ...batteryToSave.forecast, loading: false };
    }
    localStorage.setItem('solsum_battery', JSON.stringify(batteryToSave));
  }, [items, charging, battery]);

  const totals = useMemo(() => calculateSystemTotals(items, charging, battery), [items, charging, battery]);

  useEffect(() => {
    const updateForecast = async () => {
      if (!battery.location || battery.location.length < 3) {
        setBattery(prev => ({ ...prev, forecast: undefined }));
        return;
      }
      setBattery(prev => ({ 
        ...prev, 
        forecast: prev.forecast ? { ...prev.forecast, loading: true } : { sunnyHours: 0, cloudyHours: 0, loading: true } 
      }));
      const forecast = await getSolarForecast(battery.location);
      if (forecast) {
        setBattery(prev => ({ 
          ...prev, 
          forecast: { 
            sunnyHours: forecast.sunnyHours, 
            cloudyHours: forecast.cloudyHours, 
            loading: false 
          } 
        }));
      } else {
        setBattery(prev => ({ ...prev, forecast: undefined }));
      }
    };
    const timer = setTimeout(updateForecast, 1500);
    return () => clearTimeout(timer);
  }, [battery.location]);

  const handleUpdateItem = useCallback((id: string, field: keyof PowerItem, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  const handleDeleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleAddItem = useCallback((category: LoadCategory) => {
    const newItem: PowerItem = {
      id: Math.random().toString(36).substr(2, 9),
      category: category,
      name: 'New Item',
      watts: 0,
      hours: 1,
      dutyCycle: 100,
      notes: ''
    };
    setItems(prev => [...prev, newItem]);
  }, []);

 const handleAIAddLoad = useCallback((itemProps: Omit<PowerItem, 'id'>) => {
  const rawCat = String(itemProps.category ?? '').trim();
  const rawName = String(itemProps.name ?? '').trim();
  const signal = `${rawCat} ${rawName}`.toLowerCase();

  let finalCategory = LoadCategory.DC_LOADS;

  // System Management (avoid matching generic "system")
  if (
    signal.includes('system management') ||
    signal.includes('system mgmt') ||
    signal.includes('mgmt') ||
    signal.includes('overhead') ||
    signal.includes('standby') ||
    signal.includes('idle') ||
    signal.includes('parasitic') ||
    signal.includes('vampire')
  ) {
    finalCategory = LoadCategory.SYSTEM_MGMT;
  }
  // AC Loads (Inverter)
  else if (
    signal.includes('ac load') ||
    signal.includes('ac') ||
    signal.includes('inverter') ||
    signal.includes('microwave') ||
    signal.includes('oven') ||
    signal.includes('induction') ||
    signal.includes('cooktop') ||
    signal.includes('kettle') ||
    signal.includes('toaster')
  ) {
    finalCategory = LoadCategory.AC_LOADS;
  }

  const catLooksCanonical =
    rawCat === 'DC Loads (Native/DCDC)' ||
    rawCat === 'AC Loads (Inverter)' ||
    rawCat === 'System Mgmt';

  const originalCatNote =
    rawCat && !catLooksCanonical ? ` (Model Cat: ${rawCat})` : '';

  const newItem: PowerItem = {
    id: Math.random().toString(36).substr(2, 9),
    ...itemProps,
    category: finalCategory,
    watts: Number(itemProps.watts) || 0,
    hours: Number(itemProps.hours) || 0,
    dutyCycle: Number(itemProps.dutyCycle) || 100,
    notes: `${String(itemProps.notes ?? '')}${originalCatNote}`.trim()
  };

  setItems(prev => [...prev, newItem]);
}, []);
  
  const handleReorderItem = useCallback((fromId: string, toId: string) => {
    setItems(prev => {
      const fromIndex = prev.findIndex(i => i.id === fromId);
      const toIndex = prev.findIndex(i => i.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
      if (prev[fromIndex].category !== prev[toIndex].category) return prev;
      const newItems = [...prev];
      const [moved] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, moved);
      return newItems;
    });
  }, []);

  const handleSortItems = useCallback((key: string, direction: 'asc' | 'desc') => {
    setItems(prev => {
      const groups = prev.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      }, {} as Record<string, PowerItem[]>);
      const sortedGroups: PowerItem[] = [];
      Object.values(LoadCategory).forEach(cat => {
         const group = groups[cat] || [];
         group.sort((a, b) => {
           let valA: number | string = 0;
           let valB: number | string = 0;
           if (key === 'wh' || key === 'ah') {
              valA = calculateItemEnergy(a, battery.voltage).wh;
              valB = calculateItemEnergy(b, battery.voltage).wh;
           } else {
              // @ts-ignore
              valA = a[key];
              // @ts-ignore
              valB = b[key];
           }
           if (typeof valA === 'string' && typeof valB === 'string') {
             return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
           }
           // @ts-ignore
           return direction === 'asc' ? valA - valB : valB - valA;
         });
         sortedGroups.push(...group);
      });
      return sortedGroups;
    });
  }, [battery.voltage]);

  const handleUpdateSource = useCallback((id: string, field: keyof ChargingSource, value: any) => {
    setCharging(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleDeleteSource = useCallback((id: string) => {
    setCharging(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleAddSource = useCallback(() => {
    const newSource: ChargingSource = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'New Source',
        input: 0,
        unit: 'W',
        efficiency: 0.9,
        type: 'solar',
        hours: 5,
        autoSolar: false
    };
    setCharging(prev => [...prev, newSource]);
  }, []);

  const handleAIAddSource = useCallback((sourceProps: Omit<ChargingSource, 'id'>) => {
    const newSource: ChargingSource = {
        id: Math.random().toString(36).substr(2, 9),
        ...sourceProps,
        input: Number(sourceProps.input) || 0,
        efficiency: Number(sourceProps.efficiency) || 0.85,
        hours: Number(sourceProps.hours) || 0,
        autoSolar: false
    };
    setCharging(prev => [...prev, newSource]);
  }, []);

  const handleReorderSource = useCallback((fromId: string, toId: string) => {
    setCharging(prev => {
      const fromIndex = prev.findIndex(s => s.id === fromId);
      const toIndex = prev.findIndex(s => s.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
      const newSources = [...prev];
      const [moved] = newSources.splice(fromIndex, 1);
      newSources.splice(toIndex, 0, moved);
      return newSources;
    });
  }, []);

  const handleSortSource = useCallback((key: string, direction: 'asc' | 'desc') => {
    setCharging(prev => {
       const sorted = [...prev];
       sorted.sort((a, b) => {
         let valA: number | string = 0;
         let valB: number | string = 0;
         if (key === 'dailyWh') {
           const getWh = (s: ChargingSource) => {
             let h = Number(s.hours) || 0;
             if (s.autoSolar && s.type === 'solar' && battery.forecast && !battery.forecast.loading) {
               h = Number(battery.forecast.sunnyHours) || 0;
             }
             const inputVal = Number(s.input) || 0;
             const effVal = Number(s.efficiency) || 0.85;
             return s.unit === 'W' ? (inputVal * h * effVal) : (inputVal * Number(battery.voltage) * h * effVal);
           };
           valA = getWh(a);
           valB = getWh(b);
         } else {
           // @ts-ignore
           valA = a[key];
           // @ts-ignore
           valB = b[key];
         }
         if (typeof valA === 'string' && typeof valB === 'string') {
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
         }
         // @ts-ignore
         return direction === 'asc' ? valA - valB : valB - valA;
       });
       return sorted;
    });
  }, [battery.voltage, battery.forecast]);

  const handleUpdateBattery = useCallback((field: keyof BatteryConfig, value: any) => {
    setBattery(prev => ({ ...prev, [field]: value }));
  }, []);

  const netKwh = totals.netWh / 1000;
  
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 shadow-2xl shadow-black/40 pb-6 pt-4">
        <div className="max-w-[98%] mx-auto flex flex-col lg:flex-row items-center justify-between px-6 gap-6">
          <div className="flex items-center gap-4 shrink-0 w-full lg:w-auto justify-between lg:justify-start">
             <div className="flex items-center gap-4">
               {/* Restored emoji ☀️ with 50px font size as requested */}
               <div className="text-[50px] drop-shadow-xl leading-none">☀️</div>
               <div>
                  <h1 className="app-header-font text-[2rem] text-white">Sol Sum</h1>
                  <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-[0.1em] mt-0.5">Solar Calc & Planner</p>
               </div>
             </div>
          </div>
          <div className="hidden md:block flex-1 w-full max-w-2xl px-4 lg:px-8">
            <HeaderGraph items={items} systemVoltage={battery.voltage} />
          </div>
          <div className="text-right shrink-0 min-w-[200px]">
             {/* Styled to match SOL SUM header font and increased to 5xl per request */}
             <div className={`app-header-font text-5xl flex items-baseline justify-end gap-1.5 ${netKwh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
               <span>{netKwh >= 0 ? '+' : ''}{netKwh.toFixed(1)}</span>
               <span className="text-xs text-slate-600 font-black uppercase tracking-tighter">kWh</span>
             </div>
             {/* Updated label to 'DAILY POWER IN' */}
             <div className="text-[10px] text-slate-700 font-black uppercase tracking-[0.2em] mt-1">Daily Power In</div>
          </div>
        </div>
      </header>

      <main className="max-w-[98%] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(150px,12%)] gap-8">
        <div className="space-y-12 min-w-0">
          <section>
            <h2 className="app-header-font text-sm text-slate-400 mb-6">Daily Consumption (Loads)</h2>
            <EnergyTable 
              items={items} 
              systemVoltage={battery.voltage}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              onReorder={handleReorderItem}
              onSort={handleSortItems}
            />
          </section>
          <section>
            <h2 className="app-header-font text-sm text-slate-400 mb-6">Generation (Power In)</h2>
            <ChargingTable 
              sources={charging}
              battery={battery}
              onUpdateSource={handleUpdateSource}
              onDeleteSource={handleDeleteSource}
              onAddSource={handleAddSource}
              onAIAddSource={() => { setChatMode('source'); setChatOpen(true); }}
              onUpdateBattery={handleUpdateBattery}
              onReorder={handleReorderSource}
              onSort={handleSortSource}
            />
          </section>
        </div>
        <div className="w-full">
          <div className="lg:sticky lg:top-40">
            <SummaryPanel items={items} totals={totals} systemVoltage={battery.voltage} battery={battery} charging={charging} />
          </div>
        </div>
      </main>

      <ChatBot 
        items={items} 
        totals={totals} 
        isOpen={chatOpen} 
        modeProp={chatMode} 
        contextItem={chatContextItem}
        onOpen={() => setChatOpen(true)}
        onClose={() => { setChatOpen(false); setChatContextItem(null); setChatMode('general'); }}
        onAddLoadItem={handleAIAddLoad} 
        onAddChargingSource={handleAIAddSource}
      />
    </div>
  );
};

export default App;