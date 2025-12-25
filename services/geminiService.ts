// Use FunctionCallingConfigMode enum to satisfy the type requirement for tool configuration.
import { GoogleGenAI, Type, Chat, FunctionCallingConfigMode } from "@google/genai";
import { ChatMode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LOAD_TOOLS = [{
  functionDeclarations: [{
    name: 'addLoadItem',
    description: 'Add a new electrical load. Use this for devices, appliances, electronics, and lighting.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Model/Name of the device' },
        quantity: { type: Type.NUMBER, description: 'Number of these items. Default 1' },
        category: { type: Type.STRING, description: 'Category: "AC Loads (Inverter)", "DC Loads (Native/DCDC)", or "System Mgmt"' },
        watts: { type: Type.NUMBER, description: 'Power consumption in Watts PER UNIT' },
        hours: { type: Type.NUMBER, description: 'Estimated hours used per day' },
        dutyCycle: { type: Type.NUMBER, description: 'Duty cycle percentage (1-100)' },
        notes: { type: Type.STRING, description: 'Brief technical spec note' }
      },
      required: ['name']
    }
  }]
}];

const SOURCE_TOOLS = [{
  functionDeclarations: [{
    name: 'addChargingSource',
    description: 'Add a new charging source. Use this for Solar Panels, Alternators, and Chargers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Model/Name of the panel or source' },
        quantity: { type: Type.NUMBER, description: 'Number of panels or sources. Default 1' },
        input: { type: Type.NUMBER, description: 'Input value (Watts or Amps) PER UNIT' },
        unit: { type: Type.STRING, enum: ['W', 'A'] },
        hours: { type: Type.NUMBER, description: 'Generation hours per day' },
        efficiency: { type: Type.NUMBER, description: 'Efficiency decimal (0.1 to 1.0). For Solar, default to 0.85 (system derating).' },
        type: { type: Type.STRING, enum: ['solar', 'alternator', 'generator', 'mppt', 'charger', 'wind', 'other'] }
      },
      required: ['name', 'input', 'unit', 'type']
    }
  }]
}];

export const createChatSession = (mode: ChatMode): Chat => {
  if (mode === 'load' || mode === 'source') {
    return ai.chats.create({
      model: 'gemini-3-flash-preview', 
      config: {
        systemInstruction: `You are a dedicated DATA EXTRACTION API for an off-grid energy planner.
        Your ONLY allowed behavior is to call the provided tools.
        1. Analyze user input for technical specifications.
        2. When estimating AC items, you MUST explicitly consider the total system overhead.
        3. For AC Loads (Inverter), focus on the item's plate wattage. The system automatically calculates conversion losses (efficiency curve).
        4. If a user asks for an inverter itself, suggest placing it in "System Mgmt" as a standby load.
        5. For solar panels, assume an efficiency (derating) of 0.85. NEVER use 0.20 as that is panel conversion efficiency, which is already reflected in the rated Watts.
        6. Even if some data is missing, make a technical estimate and put assumptions in 'notes'.
        7. If the user mentions multiple items (e.g., "2 solar panels"), set 'quantity' accordingly.
        8. NEVER respond with text or JSON. ONLY call tools.`,
        tools: mode === 'load' ? LOAD_TOOLS : SOURCE_TOOLS,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY 
          }
        }
      }
    });
  }

  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are Sol Sum AI, an expert 24V off-grid power engineer. 
      You MUST respond in JSON format for the UI to parse correctly.
      Structure your response exactly like this:
      {
        "summary": "A very brief 1-2 sentence direct answer.",
        "expanded": "A detailed, technical Markdown explanation with calculations if relevant."
      }
      When discussing AC loads, explain that the system automatically calculates inverter efficiency losses (overhead) on top of the plate wattage.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          expanded: { type: Type.STRING }
        },
        required: ["summary", "expanded"]
      }
    }
  });
};

export const getSolarForecast = async (location: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a solar engineering database. Return the average daily Peak Sun Hours (PSH) for '${location}' for the CURRENT MONTH. 
      If the location is in the Southern Hemisphere (e.g. Sydney, Australia), ensure you reflect summer values (typically 7.0-8.5 PSH in Dec/Jan).
      Return ONLY valid JSON in this format: { "sunnyHours": number, "cloudyHours": number }.`,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{}');
  } catch { return null; }
};

export const getDynamicSuggestions = async (systemSummary: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on: ${systemSummary}. Generate 3 brief, technical diagnostic questions.`,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '[]');
  } catch { return ["System Health?", "Load Audit?", "Cable Check?"]; }
};