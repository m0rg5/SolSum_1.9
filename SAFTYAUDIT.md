# SAFTYAUDIT.md
Snapshot: 2024-05-22

## 1. Current Logic Status
- **File:** `services/powerLogic.ts`
- **Function:** `getEffectiveSolarHours`
- **Displayed Auto Hrs/Day currently uses:** 
  ```typescript
  if (calculated < 0.1 || calculated > 14.0) {
    return manualHours > 0 ? manualHours : 4.0;
  }
  ```
- **File:** `components/ChargingTable.tsx`
- **"AUTO ERR" currently triggers when:**
  ```typescript
  if (source.autoSolar && battery.forecast && !battery.forecast.loading) {
    const forecastVal = battery.forecastMode === 'now' ? battery.forecast.nowHours : battery.forecast.sunnyHours;
    if (forecastVal !== undefined && (forecastVal < 0.1 || forecastVal > 14.0)) isAutoErr = true;
  }
  ```

## 2. Root Cause
1. **Split-brain validation:** Both the display logic and the badge logic have hardcoded thresholds (`0.1h`) that reject valid low-sun scenarios (e.g., a stormy winter day with 0.05h of sun).
2. **Boundary Mismatch:** The threshold should be `0.0h` (inclusive) to allow for real, valid low-light states.
3. **Implicit State Error:** `nodata` (undefined/null) is sometimes treated as `0`, triggering the `< 0.1` error before the API fetch completes or if the API returns a null field.

## 3. Plan
- Centralize normalization into `normalizeAutoSolarHours` in `services/powerLogic.ts`.
- Treat `>= 0.0` as "ok".
- Mask "AUTO ERR" during `loading` state.