import { useSessionStore } from '@/features/session/stores/session-store';
import { RealtimeManager } from '@/core/realtime/realtime-manager';

export const useRealtime = () => {
  const realtimeStatus = useSessionStore(state => state.realtimeStatus);

  return {
    realtimeStatus,
    onStatusChange: RealtimeManager.onStatusChange.bind(RealtimeManager),
    disconnect: RealtimeManager.disconnect.bind(RealtimeManager),
  };
};
export default useRealtime;
