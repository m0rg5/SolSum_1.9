
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { INITIAL_DATA, INITIAL_CHARGING, INITIAL_BATTERY } from './constants';
import { PowerItem, ChargingSource, BatteryConfig, LoadCategory, ChatMode, AppStateExport } from './types';
import { calculateSystemTotals, calculateItemEnergy, getEffectiveSolarHours } from './services/powerLogic';
import { geocodeLocation, fetchNowSolarPSH, fetchMonthAvgSolarPSH, searchLocations, LatLon } from './services/weatherService';
import EnergyTable from './components/EnergyTable';
import ChargingTable from './components/ChargingTable';
import SummaryPanel from './components/SummaryPanel';
import ChatBot from './components/ChatBot';
import HeaderGraph from './components/HeaderGraph';

const STORAGE_KEY = "solsum_state_v2_8";
const STORAGE_SCHEMA_VERSION = "2.8";
const FORECAST_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<LatLon[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getSavedData = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.data) return parsed.data;
      }
    } catch (e) {
      console.warn("Failed to load saved state", e);
    }
    return null;
  };

  const savedData = useMemo(() => getSavedData(), []);

  const [items, setItems] = useState<PowerItem[]>(() => {
    const data = savedData?.items || INITIAL_DATA;
    return data.map((i: PowerItem) => ({ ...i, enabled: i.enabled ?? true }));
  });

  const [charging, setCharging] = useState<ChargingSource[]>(() => {
    const data = savedData?.charging || INITIAL_CHARGING;
    return data.map((c: ChargingSource) => ({ ...c, enabled: c.enabled ?? true }));
  });

  const [battery, setBattery] = useState<BatteryConfig>(() => {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    
    const savedBat = savedData?.battery;
    if (!savedBat) return { 
      ...INITIAL_BATTERY, 
      forecastMode: 'now',
      forecastMonth: defaultMonth
    };

    const merged = {
      ...INITIAL_BATTERY,
      forecastMode: 'now' as const,
      forecastMonth: defaultMonth,
      ...savedBat
    };

    if (merged.forecastMonth && merged.forecastMonth.split('-').length === 2) {
      merged.forecastMonth = `${merged.forecastMonth}-15`;
    }

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

  useEffect(() => {
    const timer = setTimeout(() => setHasHydrated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    const state = {
      version: STORAGE_SCHEMA_VERSION,
      savedAt: Date.now(),
      data: { items, charging, battery }
    };
    if (items.length === 0 && charging.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [items, charging, battery, hasHydrated]);

  const totals = useMemo(() => calculateSystemTotals(items, charging, battery), [items, charging, battery]);

  // Handle Location Typing & Search
  const handleLocationChange = (val: string) => {
    // Update location text, BUT clear specific 'geo' so we don't rely on old cached coords for new text
    setBattery(prev => ({ ...prev, location: val, geo: undefined }));
    setShowSuggestions(true);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(async () => {
      if (val.length < 2) {
        setSuggestions([]);
        return;
      }
      const results = await searchLocations(val);
      setSuggestions(results);
    }, 400);
  };

  const handleSelectLocation = (loc: LatLon) => {
    setBattery(prev => ({
      ...prev,
      location: loc.name,
      geo: { lat: loc.lat, lon: loc.lon, name: loc.name }
    }));
    setShowSuggestions(false);
  };

  useEffect(() => {
    // 1. Immediate loading state.
    setBattery(prev => ({ 
      ...prev, 
      forecast: { 
        ...(prev.forecast || { fetched: false }), 
        loading: true, 
        error: undefined 
      } 
    }));

    const updateForecast = async () => {
      if (!battery.location || battery.location.length < 1) return;
      
      try {
        let lat, lon, name;

        // PRIORITIZE EXACT GEO IF AVAILABLE (from Dropdown Selection)
        if (battery.geo && battery.geo.lat) {
             lat = battery.geo.lat;
             lon = battery.geo.lon;
             name = battery.geo.name;
        } else {
             // Fallback to text search (legacy or manual typing)
             const geo = await geocodeLocation(battery.location);
             if (!geo) throw new Error("Location not found");
             lat = geo.lat;
             lon = geo.lon;
             name = geo.name;
        }
        
        let forecastData: any = {};
        
        if (battery.forecastMode === 'now') {
          const nowPSH = await fetchNowSolarPSH(lat, lon);
          forecastData = { 
            nowHours: nowPSH, 
            sunnyHours: undefined, 
            cloudyHours: undefined 
          };
        } else {
          const apiMonth = (battery.forecastMonth || '').split('-').slice(0, 2).join('-');
          const monthPSH = await fetchMonthAvgSolarPSH(lat, lon, apiMonth);
          forecastData = { 
            sunnyHours: monthPSH.sunny, 
            cloudyHours: monthPSH.cloudy, 
            nowHours: undefined 
          };
        }

        setBattery(prev => ({ 
          ...prev, 
          forecast: { 
            ...(prev.forecast || { fetched: false }),
            ...forecastData,
            name: name,
            lat: lat,
            lon: lon,
            loading: false,
            fetched: true,
            updatedAt: new Date().toISOString()
          } as any
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
    
    // Slightly longer debounce to allow typing to finish if not using dropdown
    const timer = setTimeout(updateForecast, 800);
    return () => clearTimeout(timer);
  }, [battery.location, battery.geo, battery.forecastMode, battery.forecastMonth]);

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
      notes: '',
      enabled: true
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
    setItems(prev => [...prev, { 
      id, quantity: 1, watts: 0, dutyCycle: 100, notes: '', ...itemProps,
      hours: itemProps.hours === 0 ? 0 : (Number(itemProps.hours) || 1),
      category: itemProps.category as LoadCategory, enabled: true 
    }]);
    setHighlightedRow({ id, kind: 'load' });
    setTimeout(() => setHighlightedRow(null), 2500);
  }, []);

  const handleAIAddSource = useCallback((sourceProps: Omit<ChargingSource, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setCharging(prev => [...prev, { 
      id, quantity: 1, input: 0, efficiency: 0.85, ...sourceProps, 
      hours: sourceProps.hours === 0 ? 0 : (Number(sourceProps.hours) || 5),
      enabled: true 
    }]);
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
        if (data.items) setItems(data.items.map((i: any) => ({ ...i, enabled: i.enabled ?? true })));
        if (data.charging) setCharging(data.charging.map((c: any) => ({ ...c, enabled: c.enabled ?? true })));
        if (data.battery) setBattery(data.battery);
        alert(`Config v${data.version || '?' } imported.`);
      } catch (err) { alert("Import failed."); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const netKwh = totals.netWh / 1000;
  
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans app-root" onClick={() => setShowSuggestions(false)}>
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
              <div className="flex-1 min-w-[110px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center relative" onClick={(e) => e.stopPropagation()}>
                <label className="config-label-small uppercase text-slate-600 font-black block mb-0.5 tracking-widest">LOCATION</label>
                <input 
                  type="text" 
                  value={battery.location || ''} 
                  onChange={(e) => handleLocationChange(e.target.value)} 
                  onFocus={() => { if(battery.location && battery.location.length > 1) setShowSuggestions(true); }}
                  placeholder="e.g. 2048" 
                  className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" 
                />
                <div className="text-[9px] text-slate-500 font-mono truncate mt-0.5 min-h-[12px]">{(battery.forecast as any)?.name || '---'}</div>
                
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute top-full left-0 w-[180%] bg-slate-800 border border-slate-700 rounded-b-lg shadow-xl z-50 max-h-40 overflow-y-auto mt-1 no-scrollbar">
                    {suggestions.map((s, i) => (
                       <li key={i} onClick={() => handleSelectLocation(s)} className="text-[10px] p-2 hover:bg-slate-700 cursor-pointer text-slate-200 border-b border-slate-700/50 last:border-0">
                         <div className="font-bold">{s.name}</div>
                         <div className="text-slate-500 text-[8px]">{[s.admin1, s.country].filter(Boolean).join(', ')}</div>
                       </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex-1 min-w-[90px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center relative group">
                <div className="flex justify-between items-center mb-0.5 relative z-20">
                  <label className="config-label-small uppercase text-slate-600 font-black tracking-widest">DATE (MM/YY)</label>
                  <label className="flex items-center gap-1 cursor-pointer group/toggle" title="Toggle Real-time Forecast">
                    <span className={`text-[6px] font-black uppercase transition-colors ${battery.forecastMode === 'now' ? 'text-blue-400' : 'text-slate-600 group-hover/toggle:text-slate-400'}`}>Now</span>
                    <input type="checkbox" checked={battery.forecastMode === 'now'} onChange={(e) => handleUpdateBattery('forecastMode', e.target.checked ? 'now' : 'monthAvg')} className="w-2.5 h-2.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer" />
                  </label>
                </div>
                <div className={`flex items-center gap-1 h-6 w-full ${battery.forecastMode === 'now' ? 'opacity-30 pointer-events-none' : 'opacity-100'} transition-opacity`}>
                   <input type="text" placeholder="MM" maxLength={2} value={battery.forecastMonth?.split('-')[1] || ''} onChange={(e) => {
                       const val = e.target.value.replace(/\D/g, '');
                       if (val.length <= 2) {
                          const cur = battery.forecastMonth || `${new Date().getFullYear()}-01-01`;
                          const parts = cur.split('-');
                          handleUpdateBattery('forecastMonth', `${parts[0]}-${val}-${parts[2] || '01'}`);
                       }
                     }}
                     onBlur={(e) => {
                       let val = e.target.value;
                       if (val.length === 1) val = '0' + val;
                       if (val === '00' || val === '') val = '01';
                       if (Number(val) > 12) val = '12';
                       const cur = battery.forecastMonth || `${new Date().getFullYear()}-01-01`;
                       const parts = cur.split('-');
                       handleUpdateBattery('forecastMonth', `${parts[0]}-${val}-${parts[2] || '01'}`);
                     }}
                     className="bg-transparent text-slate-200 font-mono config-input-small font-black w-[24px] text-center focus:outline-none focus:text-blue-400 placeholder-slate-700 p-0" />
                   <span className="text-slate-600 font-black select-none">/</span>
                   <input type="text" placeholder="YY" maxLength={2} value={battery.forecastMonth?.split('-')[0].slice(2) || ''} onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val.length <= 2) {
                           const cur = battery.forecastMonth || `${new Date().getFullYear()}-01-01`;
                           const parts = cur.split('-');
                           handleUpdateBattery('forecastMonth', `20${val}-${parts[1] || '01'}-${parts[2] || '01'}`);
                        }
                     }}
                     onBlur={(e) => {
                        let val = e.target.value;
                        if (val.length === 1) val = '0' + val;
                        if (val === '') val = new Date().getFullYear().toString().slice(2);
                        const cur = battery.forecastMonth || `${new Date().getFullYear()}-01-01`;
                        const parts = cur.split('-');
                        handleUpdateBattery('forecastMonth', `20${val}-${parts[1] || '01'}-${parts[2] || '01'}`);
                     }}
                     className="bg-transparent text-slate-200 font-mono config-input-small font-black w-[24px] text-center focus:outline-none focus:text-blue-400 placeholder-slate-700 p-0" />
                    {battery.forecast?.loading && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"></div>}
                </div>
              </div>

              <div className="flex-1 min-w-[70px] bg-slate-900 p-[7px] rounded-lg border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-0.5 tracking-widest">VOLTAGE</label>
                <select value={battery.voltage} onChange={(e) => handleUpdateBattery('voltage', Number(e.target.value))} className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0 cursor-pointer">
                  <option value={12} className="bg-slate-900 text-slate-200">12V</option>
                  <option value={24} className="bg-slate-900 text-slate-200">24V</option>
                  <option value={48} className="bg-slate-900 text-slate-200">48V</option>
                </select>
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
                <button onClick={handleExport} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center justify-center group" title="Export JSON"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-slate-400 group-hover:text-blue-400 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg></button>
                <button onClick={handleTriggerImport} className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center justify-center group" title="Import JSON"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-slate-400 group-hover:text-emerald-400 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg><input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} className="hidden" /></button>
              </div>
            </div>
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">Generation (Power In)</h2>
            <ChargingTable sources={charging} battery={battery} highlightedId={highlightedRow?.kind === 'source' ? highlightedRow.id : null} onUpdateSource={handleUpdateSource} onDeleteSource={(id) => setCharging(p => p.filter(s => s.id !== id))} onAddSource={() => setCharging(p => [...p, { id: Math.random().toString(36).substr(2, 9), name: 'New Source', quantity: 1, input: 0, unit: 'W', efficiency: 0.9, type: 'solar', hours: 5, autoSolar: false, enabled: true }])} onAIAddSource={() => { setChatMode('source'); setChatOpen(true); }} onUpdateBattery={handleUpdateBattery} onReorder={handleReorderSources} onSort={() => {}} />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">System Mgmt</h2>
            <EnergyTable items={items} systemVoltage={battery.voltage} highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }} visibleCategories={[LoadCategory.SYSTEM_MGMT]} onReorder={handleReorderItems} onSort={() => {}} />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">AC (VIA INVERTER)</h2>
            <EnergyTable items={items} systemVoltage={battery.voltage} highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }} visibleCategories={[LoadCategory.AC_LOADS]} onReorder={handleReorderItems} onSort={() => {}} />
          </section>

          <section>
            <h2 className="app-header-font text-[11px] text-slate-400 mb-4 uppercase">DC (NATIVE &/OR VIA CONVERTER)</h2>
            <EnergyTable items={items} systemVoltage={battery.voltage} highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }} visibleCategories={[LoadCategory.DC_LOADS]} onReorder={handleReorderItems} onSort={() => {}} />
          </section>
        </div>
        <div className="w-full"><div className="lg:sticky lg:top-32"><SummaryPanel items={items} totals={totals} systemVoltage={battery.voltage} battery={battery} charging={charging} /></div></div>
      </main>

      <ChatBot items={items} totals={totals} battery={battery} charging={charging} isOpen={chatOpen} modeProp={chatMode} onOpen={() => { setChatMode('general'); setChatOpen(true); }} onClose={() => setChatOpen(false)} onAddLoadItem={handleAIAddLoad} onAddChargingSource={handleAIAddSource} />
    </div>
  );
};

export default App;
