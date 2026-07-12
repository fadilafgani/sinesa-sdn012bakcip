import { create } from 'zustand';

export interface SettingsState {
  systemSettings: any[];

  setSystemSettings: (systemSettings: any[]) => void;
  resetSettingsStore: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  systemSettings: [],

  setSystemSettings: (systemSettings) => set({ systemSettings }),
  resetSettingsStore: () => set({
    systemSettings: []
  })
}));
export const settingsStore = useSettingsStore;
