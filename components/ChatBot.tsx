
import React, { useState, useRef, useEffect } from 'react';
import { Chat, GenerateContentResponse, FunctionCall, Part } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { createChatSession, getDynamicSuggestions } from '../services/geminiService';
import { calculateItemEnergy, getEffectiveSolarHours } from '../services/powerLogic';
import { ChatMessage, PowerItem, SystemTotals, ChargingSource, ChatMode, BatteryConfig } from '../types';

interface ChatBotProps {
  items: PowerItem[];
  totals: SystemTotals;
  battery: BatteryConfig;
  charging: ChargingSource[];
  isOpen: boolean;
  modeProp?: ChatMode;
  contextItem?: PowerItem | ChargingSource | null;
  onOpen: () => void;
  onClose: () => void;
  onAddLoadItem?: (item: Omit<PowerItem, 'id'>) => void;
  onAddChargingSource?: (source: Omit<ChargingSource, 'id'>) => void;
}

const QuickSuggestion: React.FC<{ label: string; onClick: () => any }> = ({ label, onClick }) => (
  <button 
    onClick={onClick}
    className="whitespace-nowrap px-3 py-1.5 border text-[9px] font-black uppercase rounded-full transition-all bg-slate-900/50 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-white shadow-sm tracking-[0.1em]"
  >
    {label}
  </button>
);

const parseBotMessage = (text: string) => {
  try {
    const cleanText = text.replace(/```json\n?|```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    const target = jsonMatch ? jsonMatch[0] : cleanText;
    const data = JSON.parse(target);
    if (data.summary && data.expanded) return { isJson: true, ...data };
  } catch (e) { }
  return { isJson: false, text };
};

const ChatBot: React.FC<ChatBotProps> = ({ 
  items, totals, battery, charging, modeProp = 'general', isOpen, onOpen, onClose, contextItem, onAddLoadItem, onAddChargingSource 
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [mode, setMode] = useState<ChatMode>('general');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('solsum_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<FunctionCall | null>(null);
  const [dynamicQs, setDynamicQs] = useState<string[]>([]);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const lastProcessedContextRef = useRef<string | null>(null);

  const chatSessionRef = useRef<Chat | null>(null);
  const chatSessionModeRef = useRef<ChatMode>('general');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('solsum_chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (modeProp && modeProp !== mode) {
      setMode(modeProp);
      setMessages([]);
      setInput('');
      setIsTyping(false);
      chatSessionRef.current = null;
      setPendingToolCall(null);
    }
  }, [modeProp]);

  useEffect(() => {
    if (isOpen) {
        if (!chatSessionRef.current || chatSessionModeRef.current !== mode) {
          chatSessionRef.current = createChatSession(mode);
          chatSessionModeRef.current = mode;
          setPendingToolCall(null);
        }
        if (messages.length === 0) {
            let greetingText = "";
            if (mode === 'general') {
                greetingText = "### SOL SUM AI\nI'm your off-grid power engineer. Ask me about system audits, cable sizing, or hardware specs.";
            } else if (mode === 'load') {
                greetingText = "### SPEC ASST: LOADS\nReady for **Load Entry**. Paste product datasheets or raw model numbers to add new items.";
            } else {
                greetingText = "### SPEC ASST: SOURCES\nReady for **Generation Entry**. Paste solar panel or charger specs to add sources.";
            }
            setMessages([{ role: 'model', text: greetingText, timestamp: new Date(), category: mode }]);
        }
    }
  }, [isOpen, mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingToolCall, isTyping]);

  const handleConfirmAction = async () => {
    if (!pendingToolCall || !chatSessionRef.current) return;
    
    if (pendingToolCall.name === 'addLoadItem' && onAddLoadItem) onAddLoadItem(pendingToolCall.args as any);
    else if (pendingToolCall.name === 'addChargingSource' && onAddChargingSource) onAddChargingSource(pendingToolCall.args as any);

    const toolName = pendingToolCall.name;
    const toolId = pendingToolCall.id;
    const itemName = String(pendingToolCall.args?.['name'] || 'Item');
    
    setMessages(prev => [...prev, {
        role: 'model', text: `✅ Added **${itemName}** to system.`,
        timestamp: new Date(), category: mode
    }]);

    setPendingToolCall(null);
    try {
      const responsePart: Part = { 
        functionResponse: { 
          name: toolName, 
          id: toolId, 
          response: { result: `Success: ${itemName} added.` } 
        } 
      };
      await chatSessionRef.current.sendMessage({ message: [responsePart] });
    } catch (e) { console.error("Sync error", e); }
  };

  const handleCancelAction = async () => {
     if (!pendingToolCall || !chatSessionRef.current) return;
     const toolName = pendingToolCall.name;
     const toolId = pendingToolCall.id;
     setMessages(prev => [...prev, { role: 'user', text: "Cancel operation.", timestamp: new Date() }]);
     setPendingToolCall(null);
     try {
       const responsePart: Part = { 
         functionResponse: { 
           name: toolName, id: toolId, response: { result: "User cancelled." } 
         } 
       };
       await chatSessionRef.current.sendMessage({ message: [responsePart] });
     } catch (e) { }
  };

  const handleSubmit = async (e: React.FormEvent | null, overrideInput?: string) => {
    if (e) e.preventDefault();
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || !chatSessionRef.current) return;

    if (pendingToolCall) {
       handleCancelAction();
    }

    setMessages(prev => [...prev, { role: 'user', text: textToSend, timestamp: new Date() }]);
    setInput('');
    setIsTyping(true);

    try {
        const result = await chatSessionRef.current.sendMessageStream({ message: textToSend });
        let fullRawText = '';
        let toolCall: FunctionCall | null = null;
        setMessages(prev => [...prev, { role: 'model', text: '', timestamp: new Date(), category: mode }]);
        for await (const chunk of result) {
            const c = chunk as GenerateContentResponse;
            if (c.functionCalls?.length) {
                toolCall = c.functionCalls[0];
                break;
            }
            if (c.text) {
                fullRawText += c.text;
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const last = newMsgs[newMsgs.length - 1];
                    if (last && last.role === 'model') last.text = fullRawText;
                    return newMsgs;
                });
            }
        }
        if (toolCall) {
            setPendingToolCall(toolCall);
            setMessages(prev => prev.filter(m => m.text !== ''));
        }
    } catch (error: any) {
        setMessages(prev => [...prev, { role: 'model', text: "Session error. Please reset.", isError: true, timestamp: new Date() }]);
        chatSessionRef.current = null;
    } finally { 
        setIsTyping(false); 
    }
  };

  const isSpecMode = mode !== 'general';
  const containerClasses = isMaximized
    ? `fixed inset-4 z-[200] rounded-2xl shadow-2xl flex flex-col overflow-hidden border transition-all duration-300 ${isSpecMode ? 'border-purple-500 bg-purple-950' : 'border-slate-800 bg-slate-900'}`
    : `fixed bottom-6 right-6 w-[30vw] min-w-[420px] h-[85vh] z-[200] rounded-2xl shadow-2xl flex flex-col overflow-hidden border transition-all duration-300 ${isSpecMode ? 'border-2 border-purple-500 bg-purple-950 shadow-purple-500/20' : 'border-slate-800 bg-slate-900'}`;

  return (
    <>
      {!isOpen && (
        <button 
          onClick={onOpen} 
          className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 z-[200] flex items-center justify-center text-white p-0 group overflow-hidden"
          aria-label="Open Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 group-hover:animate-bounce"><path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.413 1.861 3.413 3.703v6.113c0 1.842-1.491 3.453-3.413 3.703-2.075.27-4.19.408-6.337.408-2.147 0-4.262-.139-6.337-.408-1.922-.25-3.413-1.861-3.413-3.703V6.361c0-1.842 1.491-3.453 3.413-3.703Z" /><path d="M10.243 19.912a22.626 22.626 0 0 0 3.014 0 3.37 3.37 0 0 1 2.042 1.135 1.977 1.977 0 0 1-.513 3.227 10.125 10.125 0 0 1-5.072 0 1.977 1.977 0 0 1-.513-3.227 3.37 3.37 0 0 1 2.042-1.135Z" /></svg>
        </button>
      )}

      {isOpen && (
        <div className={containerClasses}>
          <div className={`p-4 flex justify-between items-center border-b shrink-0 relative z-[210] ${isSpecMode ? 'bg-purple-950 border-purple-500/30' : 'bg-slate-950 border-slate-800'}`}>
            <h3 className="app-header-font flex items-center gap-2.5 text-[10px] text-slate-300">
              <span className={`w-2.5 h-2.5 rounded-full ${isSpecMode ? 'bg-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.8)]' : 'bg-blue-500'}`}></span>
              {isSpecMode ? 'SPEC ASST.' : 'SOL SUM AI'}
            </h3>
            <div className="flex items-center gap-3">
                <button onClick={() => setMessages([])} className="text-[9px] text-slate-600 hover:text-rose-400 font-black uppercase transition-colors tracking-widest">Clear</button>
                <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-5 pb-32 no-scrollbar">
            {messages.map((msg, i) => {
                const parsed = msg.role === 'model' ? parseBotMessage(msg.text) : { isJson: false, text: msg.text };
                return (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                     <div className={`max-w-[85%] px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-950 border border-slate-800 text-slate-300 rounded-tl-none'}`}>
                        {parsed.isJson ? (
                          <div className="flex flex-col gap-2">
                            <div className="prose prose-invert prose-sm text-slate-200 leading-relaxed text-[13px]"><ReactMarkdown>{parsed.summary}</ReactMarkdown></div>
                            <details className="group">
                              <summary className="cursor-pointer text-[9px] text-blue-400 font-black uppercase tracking-widest list-none mt-2">More Details</summary>
                              <div className="mt-4 pt-4 border-t border-slate-800 prose prose-invert prose-sm text-slate-400 text-[12px]"><ReactMarkdown>{parsed.expanded}</ReactMarkdown></div>
                            </details>
                          </div>
                        ) : (
                          <div className="prose prose-invert prose-sm text-slate-200 text-[13px] leading-relaxed"><ReactMarkdown>{parsed.text}</ReactMarkdown></div>
                        )}
                     </div>
                  </div>
                );
            })}
            
            {pendingToolCall && (
                <div className="mx-1 mt-4 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.3)] overflow-hidden border bg-purple-900/10 border-purple-500 animate-fade-in-up action-required-block">
                    <div className="px-4 py-2.5 bg-purple-600/20 border-b border-purple-500/30 flex items-center justify-between">
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Action Required</span>
                        <span className="text-purple-400 font-mono text-[9px] uppercase tracking-tighter">{pendingToolCall.name}</span>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="text-[14px] font-black text-white uppercase tracking-wider">{String(pendingToolCall.args?.['name'] || 'Unknown Item')}</div>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(pendingToolCall.args || {}).map(([k, v]) => k !== 'name' && (
                                <div key={k} className="bg-slate-950/50 p-2 rounded-lg border border-white/5">
                                    <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">{k}</div>
                                    <div className="text-purple-300 font-mono text-[11px] font-bold">{String(v)}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleCancelAction} className="flex-1 py-2.5 text-[10px] font-black uppercase text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-all tracking-widest">Cancel</button>
                            <button onClick={handleConfirmAction} className="flex-1 py-2.5 text-[10px] font-black uppercase bg-purple-600 hover:bg-purple-500 text-white rounded-lg shadow-xl shadow-purple-900/50 transition-all active:scale-95 tracking-widest">Confirm Add</button>
                        </div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="bg-slate-950 border-t border-slate-800 p-4 shrink-0">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
                    <QuickSuggestion label="System Audit" onClick={() => handleSubmit(null, "Run a technical audit on my current setup.")} />
                    <QuickSuggestion label="Cable Guide" onClick={() => handleSubmit(null, "Give me a cable sizing guide for these loads.")} />
                    <QuickSuggestion label="Expand Battery" onClick={() => handleSubmit(null, "What happens if I double my battery capacity?")} />
                </div>
                <form onSubmit={(e) => handleSubmit(e)} className="flex gap-2.5">
                  <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type model number or ask a question..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[13px] text-white focus:outline-none focus:border-blue-500 transition-all font-medium" />
                  <button type="submit" disabled={!input.trim() || isTyping} className="p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white shadow-lg active:scale-90 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" /></svg>
                  </button>
                </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
