# PARITY AUDIT LEDGER

| Feature | Status | Evidence | Location |
| :--- | :--- | :--- | :--- |
| **Persistence** | OK | Items & EXACT Coordinates survive reload | `App.tsx` (useEffect) |
| **Chat Rendering** | OK | Restored V2 Rendering + Spec Asst Modal | `ChatBot.tsx` |
| **JSON Protocol** | OK | Verified in ChatBot parser | `ChatBot.tsx` |
| **Autonomy Math** | OK | Projections use Final SoC for "Realistic" | `services/powerLogic.ts` |
| **Location Logic** | FIXED | Autocomplete + Exact Lat/Lon Caching | `weatherService.ts` / `App.tsx` |
| **1.4H Bug Fix** | FIXED | 3-day Average + AU Geocoding Bias | `weatherService.ts` |
| **Toggle UI** | FIXED | Date inputs grey out when "NOW" active | `App.tsx` |
| **Spec Asst UX** | OK | Purple Modal Active with confirmation loop | `ChatBot.tsx` |
| **Category Rename** | OK | System Overhead -> System Mgmt | `types.ts` / `App.tsx` |