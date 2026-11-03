import { create } from 'zustand';
import { AdminService } from '../services/admin.service';
import type { AdminStatsResponse } from '../services/admin.service';

export interface AdminStoreState {
  stats: AdminStatsResponse | null;
  loadingStats: boolean;
  statsError: string | null;
  lastUpdated: number | null;

  // Actions
  fetchStats: (force?: boolean) => Promise<AdminStatsResponse | null>;
  setStats: (stats: AdminStatsResponse | null) => void;
  setStatsError: (error: string | null) => void;
  resetStore: () => void;
}

// Request synchronization counters to guard against stale race conditions (RT-07)
let latestRequestId = 0;
let inFlightPromise: Promise<AdminStatsResponse | null> | null = null;

export const useAdminStore = create<AdminStoreState>((set) => ({
  stats: null,
  loadingStats: false,
  statsError: null,
  lastUpdated: null,

  fetchStats: async (force = false) => {
    // Return existing in-flight promise if not forced to avoid duplicate concurrent fetches
    if (inFlightPromise && !force) {
      return inFlightPromise;
    }

    const currentRequestId = ++latestRequestId;
    set({ loadingStats: true, statsError: null });

    inFlightPromise = (async () => {
      try {
        const res = await AdminService.getStats();

        // Stale response check: discard if a newer request was dispatched while this was in-flight
        if (currentRequestId < latestRequestId) {
          return null;
        }

        if (res.success && res.data) {
          set({
            stats: res.data,
            loadingStats: false,
            statsError: null,
            lastUpdated: Date.now()
          });
          return res.data;
        } else {
          const errorMsg = typeof res.error === 'string' 
            ? res.error 
            : (res.error?.message || 'Gagal memuat telemetri statistik sistem.');
          set({
            loadingStats: false,
            statsError: errorMsg
          });
          return null;
        }
      } catch (err: any) {
        if (currentRequestId < latestRequestId) {
          return null;
        }
        set({
          loadingStats: false,
          statsError: err?.message || 'Terjadi gangguan jaringan saat memuat statistik.'
        });
        return null;
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  },

  setStats: (stats) => set({ 
    stats, 
    statsError: null, 
    lastUpdated: Date.now() 
  }),

  setStatsError: (statsError) => set({ 
    statsError, 
    loadingStats: false 
  }),

  resetStore: () => {
    latestRequestId++;
    inFlightPromise = null;
    set({
      stats: null,
      loadingStats: false,
      statsError: null,
      lastUpdated: null
    });
  }
}));

// Granular selectors for maximum render efficiency
export const useAdminStats = () => useAdminStore((s) => s.stats);
export const useAdminLoadingStats = () => useAdminStore((s) => s.loadingStats);
export const useAdminStatsError = () => useAdminStore((s) => s.statsError);

