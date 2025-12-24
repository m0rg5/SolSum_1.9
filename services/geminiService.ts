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
        // Removed strict enum to allow model flexibility. Normalized in App.tsx.
        category: { type: Type.STRING, description: 'Category: "AC Loads", "DC Loads", or "System Mgmt"' },
        watts: { type: Type.NUMBER, description: 'Power consumption in Watts' },
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
        input: { type: Type.NUMBER, description: 'Input value (Watts or Amps)' },
        unit: { type: Type.STRING, enum: ['W', 'A'] },
        hours: { type: Type.NUMBER, description: 'Generation hours per day' },
        efficiency: { type: Type.NUMBER, description: 'Efficiency decimal (0.1 to 1.0)' },
        type: { type: Type.STRING, enum: ['solar', 'alternator', 'generator', 'mppt', 'charger', 'wind', 'other'] }
      },
      required: ['name', 'input', 'unit', 'type']
    }
  }]
}];

export const createChatSession = (mode: ChatMode): Chat => {
  // STRICTLY gemini-3-flash-preview
  if (mode === 'load' || mode === 'source') {
    return ai.chats.create({
      model: 'gemini-3-flash-preview', 
      config: {
        systemInstruction: `You are a dedicated DATA EXTRACTION API.
        Your ONLY allowed behavior is to call the provided tools.
        1. Analyze user input for technical specifications of electrical components.
        2. If you find a component, IMMEDIATELY call the corresponding tool (addLoadItem or addChargingSource).
        3. Even if some data is missing, make a technical estimate and put assumptions in 'notes'.
        4. NEVER respond with text or JSON. 
        5. NEVER explain what you are doing. 
        6. If the input is not a technical specification, call the tool with your best guess from context or ask for clarification implicitly by providing a partial tool call.`,
        tools: mode === 'load' ? LOAD_TOOLS : SOURCE_TOOLS,
        toolConfig: {
          functionCallingConfig: {
            // Use FunctionCallingConfigMode.ANY enum value instead of string literal to fix TS error
            mode: FunctionCallingConfigMode.ANY // Forces the model to use a tool call.
          }
        }
      }
    });
  }

  // General Chat
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
      Do not use markdown code blocks for the JSON itself.`,
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
      contents: `Solar forecast for ${location}. Return JSON.`,
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