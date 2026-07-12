import { useParticipantStore } from '@/features/participant/stores/participant-store';
import { useShallow } from 'zustand/shallow';

export const useParticipants = () => {
  const participantState = useParticipantStore(
    useShallow(state => ({
      participants: state.participants,
      participant: state.participant,
      lives: state.lives,
    }))
  );

  return participantState;
};
export default useParticipants;
