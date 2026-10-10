// Persists the profile and wardrobe in the browser (localStorage). Nothing leaves the device
// except photos sent to the model endpoint you configure.

import { DEFAULT_PROFILE } from "./sample";
import type { ClothingItem, Profile } from "./types";

const KEY = "wearly:v1";

export interface SavedState {
  profile: Profile;
  wardrobe: ClothingItem[];
}

export function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SavedState>;
      return {
        profile: { ...DEFAULT_PROFILE, ...s.profile, routine: { ...DEFAULT_PROFILE.routine, ...s.profile?.routine }, preferences: { ...DEFAULT_PROFILE.preferences, ...s.profile?.preferences } },
        wardrobe: Array.isArray(s.wardrobe) ? s.wardrobe : [],
      };
    }
  } catch {
    // Storage unavailable (private mode) or corrupt: start fresh.
  }
  return { profile: DEFAULT_PROFILE, wardrobe: [] };
}

export function saveState(state: SavedState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (large photos) or storage blocked; the app keeps working in memory.
  }
}
