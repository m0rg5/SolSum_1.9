# DOMAIN SPECIFICATION

## 1. Energy Math Invariants
- **Watts-Only Rule**: All table inputs (Loads and Sources) are in Watts. Amps are computed values, never inputs.
- **Net Energy**: `Daily Gen (Wh) - Daily Load (Wh)`.
- **Autonomy (Days)**:
  - IF `Net Energy >= 0`: Autonomy is `Infinity` (Display: "∞").
  - IF `Net Energy < 0`: Autonomy is `Battery Capacity (Wh) / Net Deficit (Wh)`.
  - **Constraint**: Projections for "Cloud" and "0%" scenarios assume a full battery (100%) to show system buffer capacity. "Realistic" uses current State of Charge (SoC).

## 2. Weather & Geocoding
- **PSH Calculation**: `MJ/m² / 3.6 = kWh/m²`.
- **Smoothing**: "Now" mode calculates the mean PSH of the next 3 days to avoid volatility.
- **Geocoding Bias**: Numeric 4-digit strings are treated as Australian Postcodes.
- **Coordinate Persistence**: The `geo` object in state prevents re-searching locations on reload.

## 3. Spec Assistant Workflow
- **State**: `IDLE` -> `ACTIVE` (Purple UI) -> `TOOL_CALL` -> `CONFIRMATION`.
- **Protocol**: Tool calls intercept the stream. No item is added to `App.tsx` without explicit user confirmation of the extracted parameters.