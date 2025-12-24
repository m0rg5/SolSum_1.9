# Sol Sum Spec Asst (SA) v1.4 Export

## 1. TL;DR Contract
Spec Asst (SA) is a **modal interception layer** within the ChatBot.
*   **Invariant 1 (Mode):** SA is active when `chatMode` is `'load'` or `'source'`. It uses specialized system prompts and tools.
*   **Invariant 2 (Interception):** When Gemini returns a `functionCall`, SA **pauses** the conversation loop. It **does not** auto-execute.
*   **Invariant 3 (UI State):** It renders a distinct "ACTION REQUIRED" block (purple/neon) at the bottom of the chat history.
*   **Invariant 4 (Resolution):** The loop only resumes when the user interacts:
    *   **Confirm:** Executes the tool -> Sends `functionResponse` (Success).
    *   **Cancel:** Sends `functionResponse` (Cancelled).
    *   **Type Text:** Wraps text in `functionResponse` (User correction).

## 2. State Machine

| State | Trigger | Render / Behavior | Transition To |
| :--- | :--- | :--- | :--- |
| **Idle / Chatting** | User opens Chat with `mode='load'` | Standard Chat UI. Purple badge/accents. | `Thinking` |
| **Thinking** | User sends message | Typing indicator. | `Review` or `Idle` |
| **Review (Gate)** | Model returns `functionCall` | **Purple "Action Required" Block**. Input field remains active for corrections. | `Executing` |
| **Executing (Confirm)** | User clicks "Confirm" | Updates `App.tsx` state. Sends success to Model. | `Idle` |
| **Cancelling** | User clicks "Cancel" | No state change. Sends cancel to Model. | `Idle` |
| **Correcting** | User types text while in `Review` | Sends text *inside* a `functionResponse`. | `Thinking` |

## 3. Data Flow

1.  **User Action:** Click "✨ Spec Asst." in `EnergyTable` or `ChargingTable`.
2.  **Initialization:** `App.tsx` sets `chatMode` -> `ChatBot.tsx` calls `createChatSession(mode)`.
3.  **Prompt:** User: "Add a Ninja Oven".
4.  **Model:** Returns `toolCall: addLoadItem(name="Ninja Oven", watts=1700...)`.
5.  **SA Intercept:** `ChatBot.tsx` sees `response.functionCalls`. Sets `pendingToolCall` state. **Stops stream.**
6.  **Render:** `<div className="...border-purple-500...">` displays args.
7.  **User Confirm:**
    *   Callback: `onAddLoadItem(args)` updates `items` array in `App.tsx`.
    *   Sync: `sendMessage({ message: [{ functionResponse: ... }] })`.
8.  **Model:** Receives confirmation, generates text "✅ Added Ninja Oven".

## 4. File Map

### `App.tsx`
**Role:** State container & Entry point routing.
*   **State:** `chatMode`, `chatOpen`.
*   **Handlers:** `handleAIAddLoad`, `handleAIAddSource` (Actual state mutators).
*   **Wiring:**
    ```typescript
    <ChatBot 
      // ...
      modeProp={chatMode} 
      onAddLoadItem={handleAIAddLoad} 
      onAddChargingSource={handleAIAddSource}
    />
    ```

### `components/ChatBot.tsx`
**Role:** The Runtime & UI.
*   **State:** `const [pendingToolCall, setPendingToolCall] = useState<FunctionCall | null>(null);`
*   **Tool Detection (Stream Loop):**
    ```typescript
    if (c.functionCalls && c.functionCalls.length > 0) {
        setPendingToolCall(c.functionCalls[0]); // <--- THE INTERCEPT
        functionCallDetected = true;
        break; // <--- STOP STREAMING
    }
    ```
*   **Resolution (Confirm):**
    ```typescript
    // 1. Execute Local State Change
    if (pendingToolCall.name === 'addLoadItem' && onAddLoadItem) onAddLoadItem(pendingToolCall.args as any);
    
    // 2. Resume Model Loop (Protocol Compliance)
    const responsePart: Part = { functionResponse: { ... } };
    await chatSessionRef.current.sendMessage({ message: [responsePart] });
    ```
*   **Render Branch (The Purple Block):**
    Search for `{pendingToolCall && (`.
    Critical styling: `bg-[rgb(48,10,84)] border-purple-500 animate-fade-in-up`.

### `services/geminiService.ts`
**Role:** Protocol Definition.
*   **Tools:** `loadTools` (addLoadItem), `sourceTools` (addChargingSource).
*   **Schema:** Uses `@google/genai` types (`Type.OBJECT`, `Type.NUMBER`).
*   **Model:** `gemini-3-flash-preview`.

## 5. Integration Notes

**Gemini SDK Protocol:**
Spec Asst strictly follows the `@google/genai` turn-taking rules. You cannot send text while the model expects a tool response.
*   **Correct Response:**
    ```typescript
    chatSession.sendMessage({ 
      message: [{ functionResponse: { name, id, response: { result: "..." } } }] 
    });
    ```
*   **Handling User Interruptions:**
    If the user types text while `pendingToolCall` is active, you **must** wrap that text in a `functionResponse` to clear the model's stack:
    ```typescript
    response: { result: `User ignored confirmation and said: ${textToSend}` }
    ```

## 6. "Do NOT break" List

1.  **The Object Wrapper:** `sendMessage({ message: [...] })`. Sending a raw array or string during a function turn causes 400 errors.
2.  **The State Reset:** `setPendingToolCall(null)` must happen *before* or *simultaneously* with the API call to prevent UI flickering.
3.  **Mode Switching:** `useEffect(() => { setMode(modeProp); ... }, [modeProp])` in `ChatBot.tsx` ensures the session is reset when switching between Load and Source modes.
4.  **Local State Mutation:** `App.tsx` handlers (`handleAIAddLoad`) utilize `setItems(prev => ...)` to ensure atomic updates.

## 7. v1.8 Patch Plan (Non-Destructive)

To restore SA in v1.8 without touching existing logic:

1.  **Inspect `types.ts`:** Ensure `PowerItem` and `ChargingSource` match v1.4 structure (specifically `watts`, `hours`, `dutyCycle`).
2.  **Update `services/geminiService.ts`:** Copy `createChatSession` exactly. It is self-contained.
3.  **Patch `ChatBot.tsx` (The 3-Step Patch):**
    *   **Step A (State):** Add `pendingToolCall` useState.
    *   **Step B (Logic):** Copy `handleConfirmAction`, `handleCancelAction`, and the `if (pendingToolCall)` branch inside `handleSubmit`.
    *   **Step C (Render):** Insert the `{pendingToolCall && (...)}` JSX block immediately after the message list map and before the typing indicator.
4.  **Connect `App.tsx`:** Ensure the `onAddLoadItem` and `onAddChargingSource` props are passed to `ChatBot`.

## 8. Acceptance Tests

1.  **Mode Check:** Open App -> Click "Manual Add" -> Chat opens blue (General). Close. Click "✨ Spec Asst" -> Chat opens Purple (SA).
2.  **Parsing:** In SA mode, paste: "I have a Dometic CFX3 45 fridge".
3.  **Interception:** UI must show "ACTION REQUIRED" block with:
    *   Name: "Dometic CFX3 45" (or similar)
    *   Watts: ~50
    *   Duty Cycle: < 100
4.  **Execution:** Click "CONFIRM ADD".
    *   Block disappears.
    *   Chat adds: "✅ Added...".
    *   Table updates with new row.
5.  **Interruption:** Trigger a tool call. Instead of clicking confirm, type "Actually it's 100 watts".
    *   Block disappears.
    *   Model replies acknowledging the correction.

## DIFF CHECKLIST (v1.4 reference → v1.8 target)

### A) REQUIRED FILES
*   `App.tsx` - Root state and ChatBot wiring.
*   `components/ChatBot.tsx` - The Chat UI, streaming logic, and confirmation modal.
*   `services/geminiService.ts` - AI configuration, tool definitions, and session creation.
*   `types.ts` - Data contracts (`PowerItem`, `ChatMode`, `ChatMessage`).
*   `components/EnergyTable.tsx` & `components/ChargingTable.tsx` - Trigger buttons for SA mode.

### B) REQUIRED SYMBOLS / SEARCH STRINGS
*   `App.tsx`: MUST_HAVE: "handleAIAddLoad" // Logic to add items from tool calls
*   `App.tsx`: MUST_HAVE: "modeProp={chatMode}" // Passing context to chat
*   `ChatBot.tsx`: MUST_HAVE: "pendingToolCall" // Critical state for SA modal
*   `ChatBot.tsx`: MUST_HAVE: "functionResponse" // Required type for tool confirmation
*   `geminiService.ts`: MUST_HAVE: "addLoadItem" // Tool name definition
*   `geminiService.ts`: MUST_HAVE: "addChargingSource" // Tool name definition
*   `EnergyTable.tsx`: MUST_HAVE: "Spec Asst." // The trigger button label

### C) REQUIRED DECIDING BRANCHES

**BRANCH_ID: CHAT_STREAM_INTERCEPT**
*   FILE: `components/ChatBot.tsx`
*   LOCATOR: `handleSubmit` > `for await (const chunk of result)`
*   SNIPPET:
    ```typescript
    if (c.functionCalls && c.functionCalls.length > 0) {
        setPendingToolCall(c.functionCalls[0]);
        functionCallDetected = true;
        break;
    }
    ```

**BRANCH_ID: SA_MODAL_RENDER**
*   FILE: `components/ChatBot.tsx`
*   LOCATOR: JSX return (after message list)
*   SNIPPET:
    ```typescript
    {pendingToolCall && (
        <div className="mx-2 mt-4 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.3)] overflow-hidden border-2 bg-[rgb(48,10,84)] border-purple-500 animate-fade-in-up">
            {/* ... */}
            <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Action Required</span>
    ```

**BRANCH_ID: TOOL_CONFIRMATION_PROTOCOL**
*   FILE: `components/ChatBot.tsx`
*   LOCATOR: `handleConfirmAction`
*   SNIPPET:
    ```typescript
    const responsePart: Part = {
      functionResponse: {
        name: toolName,
        id: toolId,
        response: { result: `Success: ${itemName} added to persistent state.` }
      }
    };
    await chatSessionRef.current.sendMessage({ message: [responsePart] });
    ```

### D) REQUIRED BEHAVIORS
*   TEST: Click "✨ Spec Asst." on Load table → Chat opens with purple accent/badge.
*   TEST: Type "Add a toaster" in SA mode → Chat stops streaming and shows "ACTION REQUIRED" block.
*   TEST: Click "Confirm Add" → Item appears in `EnergyTable` instantly.
*   TEST: Click "Cancel" on a pending action → Block disappears, Chat shows "User cancelled".
*   TEST: Type text while "ACTION REQUIRED" is visible → Block disappears, Model acknowledges correction.
*   TEST: Click "System Audit" (General mode) → No "ACTION REQUIRED" block appears (standard chat).

### E) FORBIDDEN / REGRESSION PATTERNS
*   MUST_NOT_HAVE: `auto-execute` // Tools must never run without user confirmation
*   MUST_NOT_HAVE: `sendMessage(string)` // When resolving tools (must be object wrapper)
*   MUST_NOT_HAVE: `setPendingToolCall` missing // If this state is missing, SA is broken

### F) MINIMAL PORT STRATEGY
1.  **Scan:** Check v1.8 `ChatBot.tsx` for `pendingToolCall`. If missing, copy the `useState` line from v1.4.
2.  **Patch Logic:** Copy `handleConfirmAction`, `handleCancelAction`, and the `pendingToolCall` check in `handleSubmit` from v1.4 to v1.8 `ChatBot.tsx`.
3.  **Patch UI:** Copy the `{pendingToolCall && (...)}` JSX block from v1.4 and paste it above the typing indicator in v1.8 `ChatBot.tsx`.
4.  **Verify Service:** Ensure v1.8 `geminiService.ts` has `addLoadItem` tool definition. If not, append it to `createChatSession`.
5.  **Test:** Run the acceptance tests in section D.
