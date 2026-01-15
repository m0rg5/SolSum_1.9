# SAFTYAUDIT.md
Snapshot: 2024-05-23

## 1. Resolved: The 1.4H Seasonal Bug
- **Issue**: "2048" was resolving to a US Zip code, returning Northern Hemisphere (Winter) PSH values (~1.4h) instead of Southern Hemisphere (Summer) values (~8.0h).
- **Resolution**: Implemented `searchLocations` with a 4-digit regex that appends ", Australia" to queries. Added `geo` caching in `BatteryConfig` to lock specific coordinates.

## 2. Resolved: Forecast Volatility
- **Issue**: A single rainy day forecast would crash the "Realistic" autonomy projection.
- **Resolution**: `fetchNowSolarPSH` now requests `forecast_days=3` and returns the arithmetic mean.

## 3. Input Validation
- **Logic**: `normalizeAutoSolarHours` now strictly rejects empty strings and non-finite numbers.
- **Fallback**: System defaults to 4.0h PSH only if the API response is null/invalid. 0.0h is allowed if it is a valid numeric return (e.g., total darkness).