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

const STORAGE_SCHEMA_VERSION = "2.1";

const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PowerItem[]>(() => {
    try {
      const saved = localStorage.getItem('solsum_items');
      return saved ? JSON.parse(saved) : INITIAL_DATA;
    } catch (e) { return INITIAL_DATA; }
  });

  const [charging, setCharging] = useState<ChargingSource[]>(() => {
    try {
      const saved = localStorage.getItem('solsum_charging');
      return saved ? JSON.parse(saved) : INITIAL_CHARGING;
    } catch (e) { return INITIAL_CHARGING; }
  });

  const [battery, setBattery] = useState<BatteryConfig>(() => {
    try {
      const saved = localStorage.getItem('solsum_battery');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.forecast) parsed.forecast.loading = false;
        if (!parsed.forecastMode) parsed.forecastMode = 'now';
        if (!parsed.forecastMonth) {
          const now = new Date();
          parsed.forecastMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        }
        return parsed;
      }
      return { 
        ...INITIAL_BATTERY, 
        forecastMode: 'now',
        forecastMonth: `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`
      };
    } catch (e) { return { ...INITIAL_BATTERY, forecastMode: 'now' }; }
  });
  
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('general');
  const [highlightedRow, setHighlightedRow] = useState<{ id: string, kind: 'load' | 'source' } | null>(null);

  useEffect(() => {
    localStorage.setItem('solsum_items', JSON.stringify(items));
    localStorage.setItem('solsum_charging', JSON.stringify(charging));
    localStorage.setItem('solsum_battery', JSON.stringify(battery));
    localStorage.setItem('solsum_version', STORAGE_SCHEMA_VERSION);
  }, [items, charging, battery]);

  const totals = useMemo(() => calculateSystemTotals(items, charging, battery), [items, charging, battery]);

  useEffect(() => {
    const updateForecast = async () => {
      if (!battery.location || battery.location.length < 1) return;
      setBattery(prev => ({ 
        ...prev, 
        forecast: { ...(prev.forecast || {}), loading: true, error: undefined } 
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
            ...(prev.forecast || {}),
            ...forecastData,
            lat: geo.lat,
            lon: geo.lon,
            loading: false,
            updatedAt: new Date().toISOString()
          } 
        }));
      } catch (e: any) {
        setBattery(prev => ({ 
          ...prev, 
          forecast: { ...(prev.forecast || {}), loading: false, error: e.message } 
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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 shadow-2xl pb-6 pt-4">
        <div className="max-w-[98%] mx-auto flex flex-col lg:flex-row items-center justify-between px-6 gap-6">
          <div className="flex items-center gap-4 shrink-0">
             <div className="text-[50px] leading-none">☀️</div>
             <div>
                <h1 className="app-header-font text-[2rem] text-white">Sol Sum</h1>
                <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-[0.1em] mt-0.5">Solar Calc & Planner</p>
             </div>
          </div>
          <div className="hidden md:block flex-1 max-w-2xl px-8">
            <HeaderGraph items={items} systemVoltage={battery.voltage} />
          </div>
          <div className="text-right">
             <div className={`app-header-font text-5xl flex items-baseline justify-end gap-1.5 ${netKwh >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
               <span>{netKwh >= 0 ? '+' : ''}{netKwh.toFixed(1)}</span>
               <span className="text-xs text-slate-600 font-black uppercase tracking-tighter">kWh</span>
             </div>
             <div className="text-[10px] text-slate-700 font-black uppercase tracking-[0.2em] mt-1">24HR POWER</div>
          </div>
        </div>
      </header>

      <main className="max-w-[98%] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-[1fr_minmax(150px,12%)] gap-8">
        <div className="space-y-8 min-w-0">
          <section className="pb-4">
            <div className="flex flex-wrap md:flex-nowrap gap-3 items-stretch">
              {/* Location */}
              <div className="flex-1 min-w-[120px] bg-slate-900 p-[10px] rounded-xl border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-1 tracking-widest">LOCATION / POSTCODE</label>
                <input type="text" value={battery.location || ''} onChange={(e) => handleUpdateBattery('location', e.target.value)} placeholder="e.g. 2048" className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              {/* Month */}
              <div className="flex-1 min-w-[120px] bg-slate-900 p-[10px] rounded-xl border border-slate-800 ring-1 ring-white/5 shadow-inner relative flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1">
                  <label className="config-label-small uppercase text-slate-600 font-black tracking-widest">MTH</label>
                  <label className="flex items-center gap-1 cursor-pointer group">
                    <span className="text-[6px] font-black text-slate-600 uppercase group-hover:text-blue-400 transition-colors">Now</span>
                    <input 
                      type="checkbox" 
                      checked={battery.forecastMode === 'now'} 
                      onChange={(e) => handleUpdateBattery('forecastMode', e.target.checked ? 'now' : 'monthAvg')}
                      className="w-2.5 h-2.5 rounded bg-slate-800 border-slate-700 text-blue-600"
                    />
                  </label>
                </div>
                <div className="relative group/mth flex items-center h-5">
                  <input 
                    type="month" 
                    disabled={battery.forecastMode === 'now'}
                    value={battery.forecastMonth || ''} 
                    onChange={(e) => handleUpdateBattery('forecastMonth', e.target.value)} 
                    className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed w-full" 
                  />
                  <div className={`text-slate-200 font-mono config-input-small font-black ${battery.forecastMode === 'now' ? 'opacity-30' : ''}`}>
                    {battery.forecastMode === 'now' ? formatMonthShort(new Date().toISOString().slice(0, 7)) : formatMonthShort(battery.forecastMonth || '')}
                  </div>
                </div>
              </div>

              {/* Battery Ah */}
              <div className="flex-1 min-w-[120px] bg-slate-900 p-[10px] rounded-xl border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-1 tracking-widest">BATTERY AH</label>
                <input type="number" value={battery.capacityAh} onChange={(e) => handleUpdateBattery('capacityAh', Number(e.target.value))} className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              {/* SoC */}
              <div className="flex-1 min-w-[120px] bg-slate-900 p-[10px] rounded-xl border border-slate-800 ring-1 ring-white/5 shadow-inner flex flex-col justify-center">
                <label className="config-label-small uppercase text-slate-600 font-black block mb-1 tracking-widest">INITIAL SOC (%)</label>
                <input type="number" value={battery.initialSoC} onChange={(e) => handleUpdateBattery('initialSoC', Math.min(100, Number(e.target.value)))} className="bg-transparent border-none w-full text-slate-200 font-mono config-input-small focus:ring-0 font-black outline-none p-0" />
              </div>

              {/* Export/Import Icons (Swapped per request) */}
              <div className="w-[48px] flex flex-col gap-1.5 self-stretch">
                <button 
                  onClick={handleExport} 
                  className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center justify-center group" 
                  title="Export JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </button>
                <button 
                  onClick={handleTriggerImport} 
                  className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center justify-center group" 
                  title="Import JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  <input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} className="hidden" />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h2 className="app-header-font text-sm text-slate-400 mb-6 uppercase">Generation (Power In)</h2>
            <ChargingTable 
              sources={charging} battery={battery}
              highlightedId={highlightedRow?.kind === 'source' ? highlightedRow.id : null}
              onUpdateSource={handleUpdateSource}
              onDeleteSource={(id) => setCharging(p => p.filter(s => s.id !== id))}
              onAddSource={() => setCharging(p => [...p, { id: Math.random().toString(36).substr(2, 9), name: 'New Source', quantity: 1, input: 0, unit: 'W', efficiency: 0.9, type: 'solar', hours: 5, autoSolar: false }])}
              onAIAddSource={() => { setChatMode('source'); setChatOpen(true); }}
              onUpdateBattery={handleUpdateBattery}
              onReorder={() => {}} onSort={() => {}}
            />
          </section>

          <section>
            <h2 className="app-header-font text-sm text-slate-400 mb-6 uppercase">System Mgmt</h2>
            <EnergyTable 
              items={items} systemVoltage={battery.voltage}
              highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              visibleCategories={[LoadCategory.SYSTEM_MGMT]}
              onReorder={() => {}} onSort={() => {}}
            />
          </section>

          <section>
            <h2 className="app-header-font text-sm text-slate-400 mb-6 uppercase">Consumption (Loads)</h2>
            <EnergyTable 
              items={items} systemVoltage={battery.voltage}
              highlightedId={highlightedRow?.kind === 'load' ? highlightedRow.id : null}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onAIAddItem={() => { setChatMode('load'); setChatOpen(true); }}
              visibleCategories={[LoadCategory.AC_LOADS, LoadCategory.DC_LOADS]}
              onReorder={() => {}} onSort={() => {}}
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
        items={items} totals={totals} isOpen={chatOpen} modeProp={chatMode} 
        onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)}
        onAddLoadItem={handleAIAddLoad} onAddChargingSource={handleAIAddSource}
      />
    </div>
  );
};

export default App;