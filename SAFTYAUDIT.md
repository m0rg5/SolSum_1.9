# SAFTYAUDIT.md
Snapshot: 2024-05-22

## 1. Current Logic Status
- **File:** `services/powerLogic.ts`
- **Function:** `getEffectiveSolarHours`
- **"AUTO ERR" Badge Condition:** `(norm.status === 'invalid' || norm.status === 'nodata')`
- **Hours Displayed:** `norm.status === 'ok' ? norm.value : (manualHours > 0 ? manualHours : 4.0)`

## 2. Root Cause Identification
1. **Empty String Coercion:** `Number("")` evaluates to `0`. If the API or state contains an empty string, the system interprets it as 'Zero Sun' (Valid OK) rather than 'No Data' (Error).
2. **Missing Metadata Guard:** The badge logic correctly masks errors during loading, but the displayed value depends on a shared normalization result that requires strict type checking.

## 3. Fix Logic
- Explicitly reject empty strings in `normalizeAutoSolarHours` using a runtime check.
- Use `isFinite` to ensure `NaN` or non-numeric values are treated as `invalid`.
- Maintain `0.0` as valid ONLY if it is a finite numeric result that is NOT an empty string.

## 4. Physics Invariants
- **INVARIANT:** `norm.status !== 'ok'` must never feed physics without an explicit fallback path. 
- **ENFORCEMENT:** `normalizeAutoSolarHours` returns `value: null` when not `'ok'`, forcing the consumption logic (`getEffectiveSolarHours`) to handle fallbacks (Manual > 0 or 4.0h).