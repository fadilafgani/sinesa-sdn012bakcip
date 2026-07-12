import { useLeaderboardStore } from '@/features/leaderboard/stores/leaderboard-store';

export const useLeaderboard = () => {
  const leaderboard = useLeaderboardStore(state => state.leaderboard);
  return {
    leaderboard,
  };
};
export default useLeaderboard;
