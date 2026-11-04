import { create } from 'zustand';
import { SettingsService } from '../services/settings.service';
import { AdminService } from '@/features/admin/services/admin.service';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export interface AppSettings {
  app_name: string;
  app_logo: string;
  theme_color: 'blue' | 'yellow' | 'emerald';
  school_name: string;
  school_npsn: string;
  school_address: string;
  app_title: string;
  registration_enabled: string;
  allow_student_registration: string;
  allow_guest_participants: string;
  default_anti_cheat_enabled: string;
  default_leaderboard_enabled: string;
  default_show_final_result: string;
  [key: string]: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  app_name: 'SINESA',
  app_logo: '/logo-sdn012.png',
  theme_color: 'blue',
  school_name: 'SDN 012 Babakan Ciparay',
  school_npsn: '20219584',
  school_address: 'Jl. Babakan Ciparay No. 12, Bandung',
  app_title: 'SINESA - Sistem Nilai Dan Evaluasi Siswa Aktif',
  registration_enabled: 'true',
  allow_student_registration: 'true',
  allow_guest_participants: 'true',
  default_anti_cheat_enabled: 'false',
  default_leaderboard_enabled: 'true',
  default_show_final_result: 'true',
};

const STORAGE_KEY = 'sinesa_app_settings';

export const applyAppTheme = (themeColor?: string) => {
  if (typeof document === 'undefined') return;
  const theme = themeColor && ['blue', 'yellow', 'emerald'].includes(themeColor) ? themeColor : 'blue';
  document.documentElement.setAttribute('data-theme', theme);

  // Update mobile browser theme-color meta tag
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const themeHex = theme === 'yellow' ? '#f59e0b' : theme === 'emerald' ? '#10b981' : '#2563eb';
    metaTheme.setAttribute('content', themeHex);
  }
};

const getInitialSettings = (): AppSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    const mockRaw = localStorage.getItem('mock_system_settings');
    if (mockRaw) {
      const parsed = JSON.parse(mockRaw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (_) {}
  return DEFAULT_SETTINGS;
};

// Initial theme application to prevent FOUC (Flash of Unstyled Content)
if (typeof window !== 'undefined') {
  const initial = getInitialSettings();
  applyAppTheme(initial.theme_color);
}

export interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  setSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  fetchSettings: (force?: boolean) => Promise<AppSettings>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<boolean>;
  resetSettingsStore: () => void;
}

let inFlightFetchPromise: Promise<AppSettings> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: getInitialSettings(),
  loading: false,
  error: null,
  lastFetchedAt: null,

  setSettings: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.settings) : updater;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (_) {}
      applyAppTheme(next.theme_color);
      return { settings: next };
    });
  },

  fetchSettings: async (force = false) => {
    const { lastFetchedAt, settings } = get();
    // Cache TTL of 10s unless forced
    if (!force && lastFetchedAt && Date.now() - lastFetchedAt < 10000) {
      return settings;
    }

    if (inFlightFetchPromise) {
      return inFlightFetchPromise;
    }

    inFlightFetchPromise = (async () => {
      set({ loading: true, error: null });
      try {
        const isMock = useAuthStore.getState().isMock;

        if (isMock) {
          const raw = localStorage.getItem('mock_system_settings');
          const parsed = raw ? JSON.parse(raw) : {};
          const merged: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };
          set({
            settings: merged,
            loading: false,
            lastFetchedAt: Date.now()
          });
          applyAppTheme(merged.theme_color);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          return merged;
        }

        const res = await SettingsService.getSystemSettings();
        if (res.success && res.data) {
          const remoteDict: Record<string, string> = {};
          res.data.forEach((item) => {
            remoteDict[item.key] = item.value;
          });

          const merged: AppSettings = { ...DEFAULT_SETTINGS, ...remoteDict };
          set({
            settings: merged,
            loading: false,
            error: null,
            lastFetchedAt: Date.now()
          });

          applyAppTheme(merged.theme_color);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch (_) {}

          // Update browser window title dynamically if desired
          if (typeof document !== 'undefined' && merged.app_name) {
            document.title = `${merged.app_name} - ${merged.app_title || merged.school_name}`;
          }

          return merged;
        } else {
          throw new Error(typeof res.error === 'string' ? res.error : 'Gagal memuat pengaturan sistem');
        }
      } catch (err: any) {
        console.warn('Failed to load system settings from backend, using fallback:', err.message);
        set({
          loading: false,
          error: err.message || 'Gagal memuat pengaturan sistem'
        });
        return get().settings;
      } finally {
        inFlightFetchPromise = null;
      }
    })();

    return inFlightFetchPromise;
  },

  updateSettings: async (newSettings) => {
    set({ loading: true, error: null });
    try {
      const current = get().settings;
      const merged: AppSettings = { ...current, ...(newSettings as any) };
      const isMock = useAuthStore.getState().isMock;

      if (isMock) {
        localStorage.setItem('mock_system_settings', JSON.stringify(merged));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        set({ settings: merged, loading: false });
        applyAppTheme(merged.theme_color);
        return true;
      }

      const res = await AdminService.updateSettings(merged);
      if (!res.success) {
        throw new Error(typeof res.error === 'string' ? res.error : (res.error as any)?.message || 'Gagal memperbarui pengaturan');
      }

      set({ settings: merged, loading: false, error: null, lastFetchedAt: Date.now() });
      applyAppTheme(merged.theme_color);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (_) {}

      if (typeof document !== 'undefined' && merged.app_name) {
        document.title = `${merged.app_name} - ${merged.app_title || merged.school_name}`;
      }

      return true;
    } catch (err: any) {
      set({ loading: false, error: err.message || 'Gagal menyimpan pengaturan' });
      throw err;
    }
  },

  resetSettingsStore: () => {
    set({
      settings: DEFAULT_SETTINGS,
      loading: false,
      error: null,
      lastFetchedAt: null
    });
    applyAppTheme(DEFAULT_SETTINGS.theme_color);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }
}));

export const settingsStore = useSettingsStore;
