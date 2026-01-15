# LLM PROJECT CONTEXT: SOL SUM

## 1. Project Purpose
Sol Sum is a **Deterministic Energy Planner** for off-grid 24V DC systems. It bridges the gap between raw hardware specs and real-world autonomy projections. It is designed for high-density information display and mobile engineering.

## 2. Technical Architecture
- **Framework**: React 19 (ESM) + Tailwind CSS.
- **State**: Centralized in `App.tsx`, persisted via versioned `localStorage`.
- **Power Logic**: `services/powerLogic.ts` is the CPU. It handles Inverter efficiency curves, PSH normalization, and SoC integration.
- **External API (Weather)**: Open-Meteo (Geocoding & Forecast).
- **External API (Intelligence)**: Gemini 2.0/3.0 via `@google/genai`.

## 3. AI Protocol (Spec Assistant)
The Spec Assistant is not a generic chatbot; it is a **Structured Data Extractor**.
- **Mode**: Triggered by `chatMode = 'load' | 'source'`.
- **Mechanism**: Tool-use (Function Calling). The AI maps natural language specs (e.g., "I have a 1700W Ninja Oven") to JSON schema.
- **Interception**: `ChatBot.tsx` stops the AI stream if a `functionCall` is detected and displays a confirmation modal.
- **Compliance**: Responding to the AI requires a `functionResponse` block. Standard text turns are forbidden during an active tool turn.

## 4. Domain Constraints
- **Bus Voltage**: Default 24V.
- **Measurement**: All inputs are **Watts**. Amps are derived (`W / V`).
- **PSH**: Peak Sun Hours are the gold standard for solar generation math.
- **Autonomy**: Calculated as a duration of energy depletion until 0% SoC is reached.