
# DOMAIN SPECIFICATION

## 1. Energy Math Invariants
- **Net Energy**: `Daily Gen (Wh) - Daily Load (Wh)`.
- **Autonomy (Days)**:
  - IF `Net Energy >= 0`: Autonomy is `Infinity` (Display: "∞").
  - IF `Net Energy < 0`: Autonomy is `Battery Capacity (Wh) / Net Deficit (Wh)`.
  - **Constraint**: Never show finite days (e.g., "10.9 d") if the system is Net Positive.

## 2. Spec Assistant Workflow
- **State**: `IDLE` -> `ACTIVE` (Purple UI) -> `TOOL_CALL` -> `CONFIRMATION`.
- **Protocol**: When in `ACTIVE` mode, user input implies a Spec. The model MUST call a tool, not describe the item.
