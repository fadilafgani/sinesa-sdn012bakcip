import { create } from 'zustand';
import type { Participant } from '@/types';

export interface LeaderboardState {
  leaderboard: Participant[];
  ranking: number;

  setLeaderboard: (leaderboard: Participant[]) => void;
  setRanking: (ranking: number) => void;
  resetLeaderboardStore: () => void;
}

export const useLeaderboardStore = create<LeaderboardState>((set) => ({
  leaderboard: [],
  ranking: 0,

  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setRanking: (ranking) => set({ ranking }),
  resetLeaderboardStore: () => set({
    leaderboard: [],
    ranking: 0
  })
}));
export const leaderboardStore = useLeaderboardStore;
