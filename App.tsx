import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { INITIAL_DATA, INITIAL_CHARGING, INITIAL_BATTERY } from './constants';
import { PowerItem, ChargingSource, BatteryConfig, LoadCategory, ChatMode, AppStateExport } from './types';
import { calculateSystemTotals } from './services/powerLogic';
import { geocodeLocation, fetchNowSolarPSH, fetchMonthAvgSolarPSH } from './services/weatherService';
import EnergyTable from './components/EnergyTable';
import ChargingTable from './components/ChargingTable';
import SummaryPanel from './components/SummaryPanel';
import ChatBot from './components/ChatBot';
import HeaderGraph from './components/HeaderGraph';

const STORAGE_KEY = "solsum_state_v2_1";
const STORAGE_SCHEMA_VERSION = "2.1";
const FORECAST_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Persistence Helper: Get Saved Data
  const getSavedData = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Schema version check can be added here if destructive changes occur
        if (parsed.data) return parsed.data;
      }
    } catch (e) {
      console.warn("Failed to load saved state", e);
    }
    return null;
  };

  const savedData = useMemo(() => getSavedData(), []);

  // Persistence: Load (Atomic Initializers)
  const [items, setItems] = useState<PowerItem[]>(() => savedData?.items || INITIAL_DATA);
  const [charging, setCharging] = useState<ChargingSource[]>(() => savedData?.charging || INITIAL_CHARGING);
  const [battery, setBattery] = useState<BatteryConfig>(() => {
    const savedBat = savedData?.battery;
    if (!savedBat) return { 
      ...INITIAL_BATTERY, 
      forecastMode: 'now',
      forecastMonth: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`
    };

    // Deep merge to ensure new system keys (like forecastMode) are present even in old saves
    const merged = {
      ...INITIAL_BATTERY,
      forecastMode: 'now' as const,
      forecastMonth: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`,
      ...savedBat
    };

    if (merged.forecast) {
      merged.forecast.loading = false;
      const updatedAt = merged.forecast.updatedAt ? new Date(merged.forecast.updatedAt).getTime() : 0;
      const isFresh = (Date.now() - updatedAt) < FORECAST_TTL_MS;
      merged.forecast.fetched = isFresh ? (merged.forecast.fetched || false) : false;
    }
    return merged;
  });
  
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [highlightedRow, setHighlightedRow] = useState<{ id: string, kind: 'load' | 'source' } | null>(null);

  // Persistence Step 1: Mark Hydration Complete AFTER first paint
  useEffect(() => {
    // Small timeout ensures all state initializers have settled
    const timer = setTimeout(() => setHasHydrated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Persistence Step 2: Save Trigger (Gated by hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return;

    const state = {
      version: STORAGE_SCHEMA_VERSION,
      savedAt: Date.now(),
      data: { items, charging, battery }
    };
    
    // Safety check: Don't save if state appears to be empty/corrupt during boot
    if (items.length === 0 && charging.length === 0) {
      console.warn("Blocking save: System state appears empty during sync.");
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [items, charging, battery, hasHydrated]);

  const totals = useMemo(() => calculateSystemTotals(items, charging, battery), [items, charging, battery]);

  useEffect(() => {
    const updateForecast = async () => {
      if (!battery.location || battery.location.length < 1) return;
      setBattery(prev => ({ 
        ...prev, 
        forecast: { 
          ...(prev.forecast || { fetched: false }), 
          loading: true, 
          error: undefined 
        } 
      }));
      try {
        const geo = await geocodeLocation(battery.location);
        if (!geo) throw new Error("Location not found");
        let forecastData: any = {};
        if (battery.forecastMode === 'now') {
          const nowPSH = await fetchNowSolarPSH(geo.lat, geo.lon);
          forecastData = { nowHours: nowPSH };
        } else {
          const monthPSH = await fetchMonthAvgSolarPSH(geo.lat, geo.lon, battery.forecastMonth);
          forecastData = { sunnyHours: monthPSH.sunny, cloudyHours: monthPSH.cloudy };
        }
        setBattery(prev => ({ 
          ...prev, 
          forecast: { 
            ...(prev.forecast || { fetched: false }),
            ...forecastData,
            lat: geo.lat,
            lon: geo.lon,
            loading: false,
            fetched: true,
            updatedAt: new Date().toISOString()
          } 
        }));
      } catch (e: any) {
        setBattery(prev => ({ 
          ...prev, 
          forecast: { 
            ...(prev.forecast || { fetched: false }), 
            loading: false, 
            error: e.message 
          } 
        }));
      }
    };
    const timer = setTimeout(updateForecast, 1000);
    return () => clearTimeout(timer);
  }, [battery.location, battery.forecastMode, battery.forecastMonth]);

  const handleUpdateItem = useCallback((id: string, field: keyof PowerItem, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  const handleDeleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleAddItem = useCallback((category: LoadCategory) => {
    setItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      category,
      name: 'New Item',
      quantity: 1,
      watts: 0,
      hours: 1,
      dutyCycle: 100,
      notes: ''
    }]);
  }, []);

  const handleReorderItems = useCallback((fromId: string, toId: string) => {
    setItems(prev => {
      const fromIndex = prev.findIndex(i => i.id === fromId);
      const toIndex = prev.findIndex(i => i.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const newItems = [...prev];
      const [movedItem] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, movedItem);
      return newItems;
    });
  }, []);

  const handleAIAddLoad = useCallback((itemProps: Omit<PowerItem, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setItems(prev => [...prev, { id, quantity: 1, ...itemProps, category: itemProps.category as LoadCategory }]);
    setHighlightedRow({ id, kind: 'load' });
    setTimeout(() => setHighlightedRow(null), 2500);
  }, []);

  const handleAIAddSource = useCallback((sourceProps: Omit<ChargingSource, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setCharging(prev => [...prev, { id, quantity: 1, ...sourceProps }]);
    setHighlightedRow({ id, kind: 'source' });
    setTimeout(() => setHighlightedRow(null), 2500);
  }, []);

  const handleUpdateSource = useCallback((id: string, field: keyof ChargingSource, value: any) => {
    setCharging(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleReorderSources = useCallback((fromId: string, toId: string) => {
    setCharging(prev => {
      const fromIndex = prev.findIndex(i => i.id === fromId);
      const toIndex = prev.findIndex(i => i.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const newSources = [...prev];
      const [movedSource] = newSources.splice(fromIndex, 1);
      newSources.splice(toIndex, 0, movedSource);
      return newSources;
    });
  }, []);

  const handleUpdateBattery = useCallback((field: keyof BatteryConfig, value: any) => {
    setBattery(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleExport = () => {
    const data: AppStateExport = { version: STORAGE_SCHEMA_VERSION, items, charging, battery };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solsum_v${STORAGE_SCHEMA_VERSION}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleTriggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.items) setItems(data.items);
        if (data.charging) setCharging(data.charging);
        if (data.battery) setBattery(data.battery);
        alert(`Config v${data.version || '?' } imported.`);
      } catch (err) { alert("Import failed."); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatMonthShort = (isoMonth: string) => {
    if (!isoMonth) return '';
    const [year, month] = isoMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    const monthStr = date.toLocaleString('default', { month: 'short' });
    const shortYear = year.slice(-2);
    return `${monthStr} ${shortYear}`;
  };

  const netKwh = totals.netWh / 1000;
  
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans app-root">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 shadow-2xl pb-3 pt-2.5">
        <div className="max-w-[98%] mx-auto flex flex-col lg:flex-row items-center justify-between px-6 gap-6">
          <div className="flex items-center gap-3 shrink-0">
             <div className="text-[40px] leading-none">☀️</div>
             <div>
                <h1 className="app-header-font text-[1.6rem] text-white">Sol Sum</h1>
                <p className="text-slate-500 text-[8px] font-semibold uppercase tracking-[0.1em] mt-0.5">Solar Calc & Planner</p>
             </div>
          </div>
          <div className="hidden md:block flex-1 max-w-xl px-8">
            <HeaderGraph items={items} systemVoltage={battery.voltage} />
          </div>
          <div className="text-right">
             <div className={`app-header-font text-4xl flex items-baseline justify-end gap-1.5 ${netKwh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
               <span>{netKwh >= 0 ? '+' : ''}{netKwh.toFixed(1)}</span>
               <span className="text-[10px] text-slate-600 font-black uppercase tracking-tighter">kWh</span>
             </div>
             <div className="text-[8px] text-slate-700 font-black uppercase tracking-[0.2em] mt-1">24HR POWER</div>
          </div>
        </div>
      </header>

      <main className="max-w-[98%] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(150px,12%)] gap-8">
        <div className="space-y-6 min-w-0">
          <section className="pb-0">
            <div className="flex flex-wrap md:flex-nowrap gap-2.5 items-stretch">
              <div className="flex-1 min-w-[110px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-0.5 tracking-widest">LOCATION</label>
                <input type="text" value={battery.location || ''} onChange={(e) => handleUpdateBattery('location', e.target.value)} placeholder="e.g. 2048" className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              <div className="flex-1 min-w-[70px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner relative flex flex-col justify-center">
                <div className="flex justify-between items-center mb-0.5">
                  <label className="config-label-small uppercase text-slate-600 font-black tracking-widest">MTH</label>
                  <label className="flex items-center gap-1 cursor-pointer group">
                    <span className="text-[6px] font-black text-slate-600 uppercase group-hover:text-blue-400 transition-colors">Now</span>
                    <input type="checkbox" checked={battery.forecastMode === 'now'} onChange={(e) => handleUpdateBattery('forecastMode', e.target.checked ? 'now' : 'monthAvg')} className="w-2.5 h-2.5 rounded bg-slate-800 border-slate-700 text-blue-600" />
                  </label>
                </div>
                <div className="relative group/mth flex items-center h-4">
                  <input type="month" disabled={battery.forecastMode === 'now'} value={battery.forecastMonth || ''} onChange={(e) => handleUpdateBattery('forecastMonth', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed w-full" />
                  <div className={`text-slate-200 font-mono config-input-small font-black ${battery.forecastMode === 'now' ? 'opacity-30' : ''}`}>
                    {battery.forecastMode === 'now' ? formatMonthShort(new Date().toISOString().slice(0, 7)) : formatMonthShort(battery.forecastMonth || '')}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-[70px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-0.5 tracking-widest">BATTERY AH</label>
                <input type="number" value={battery.capacityAh} onChange={(e) => handleUpdateBattery('capacityAh', Number(e.target.value))} className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              <div className="flex-1 min-w-[70px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-0.5 tracking-widest">INITIAL SOC (%)</label>
                <input type="number" value={battery.initialSoC} onChange={(e) => handleUpdateBattery('initialSoC', Math.min(100, Number(e.target.value)))} className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              <div className="w-[40px] flex flex-col gap-1 self-stretch">
                <button onClick={handleExport} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center justify-center group" title="Export JSON">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-slate-400 group-hover:text-blue-400 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                </button>
                <button onClick={handleTriggerImport} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-800 transition-colors flex items-center justify-center group" title="Import JSON">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-slate-400 group-hover:text-emerald-400 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  <input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} className="hidden" />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">Generation (Power In)</h2>
            <ChargingTable 
              sources={charging} battery={battery}
              highlightedId={highlightedRow?.kind === 'source' ? highlightedRow.id : null}
              onUpdateSource={handleUpdateSource}
              onDeleteSource={(id) => setCharging(p => p.filter(s => s.id !== id))}
              onAddSource={() => setCharging(p => [...p, { id: Math.random().toString(36).substr(2, 9), name: 'New Source', quantity: 1, input: 0, unit: 'W', efficiency: 0.9, type: 'solar', hours: 5, autoSolar: false }])}
              onAIAddSource={() => { setChatMode('source'); setChatOpen(true); }}
              onUpdateBattery={handleUpdateBattery}
              onReorder={handleReorderSources} onSort={() => {}}
            />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">System Mgmt</h2>
            <EnergyTable 
              items={items} systemVoltage={battery.voltage}
              highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              visibleCategories={[LoadCategory.SYSTEM_MGMT]}
              onReorder={handleReorderItems} onSort={() => {}}
            />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">AC (VIA INVERTER)</h2>
            <EnergyTable 
              items={items} systemVoltage={battery.voltage}
              highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              visibleCategories={[LoadCategory.AC_LOADS]}
              onReorder={handleReorderItems} onSort={() => {}}
            />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">DC (NATIVE &/OR VIA CONVERTER)</h2>
            <EnergyTable 
              items={items} systemVoltage={battery.voltage}
              highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              visibleCategories={[LoadCategory.DC_LOADS]}
              onReorder={handleReorderItems} onSort={() => {}}
            />
          </section>
        </div>
        <div className="w-full">
          <div className="lg:sticky lg:top-32">
            <SummaryPanel items={items} totals={totals} systemVoltage={battery.voltage} battery={battery} charging={charging} />
          </div>
        </div>
      </main>

      <ChatBot 
        items={items} totals={totals} battery={battery} charging={charging} isOpen={chatOpen} modeProp={chatMode} 
        onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)}
        onAddLoadItem={handleAIAddLoad} onAddChargingSource={handleAIAddSource}
      />
    </div>
  );
};

export default App;