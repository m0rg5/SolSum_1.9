# SAFTYAUDIT.md
Snapshot: 2024-05-22

## 1. Current Logic Status
- **File:** `services/powerLogic.ts`
- **Function:** `getEffectiveSolarHours`
- **"AUTO ERR" Badge Condition:** `(norm.status === 'invalid' || norm.status === 'nodata')`
- **Hours Displayed:** `norm.status === 'ok' ? norm.value : (manualHours > 0 ? manualHours : 4.0)`

## 2. Root Cause Identification
1. **Empty String Coercion:** `Number("")` evaluates to `0`. If the API returns an empty value, the system interprets it as "Zero Sun" (Valid OK) rather than "No Data" (Error).
2. **Missing Metadata Guard:** The badge logic correctly masks errors during loading, but the displayed value depends on a shared normalization result that requires strict type checking.

## 3. Fix Logic
- Explicitly reject empty strings in `normalizeAutoSolarHours`.
- Ensure `nodata` status is returned for all non-numeric/missing inputs.
- Maintain `0.0` as valid ONLY if it is a strictly numeric result.