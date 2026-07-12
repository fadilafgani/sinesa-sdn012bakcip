import { create } from 'zustand';
import type { Participant } from '@/types';

export interface ParticipantState {
  participants: Participant[];
  participant: Participant | null;
  lives: number;

  setParticipants: (participants: Participant[]) => void;
  setParticipant: (participant: Participant | null) => void;
  setLives: (lives: number) => void;
  resetParticipantStore: () => void;
}

export const useParticipantStore = create<ParticipantState>((set) => ({
  participants: [],
  participant: null,
  lives: 3,

  setParticipants: (participants) => set({ participants }),
  setParticipant: (participant) => set({ participant }),
  setLives: (lives) => set({ lives }),
  resetParticipantStore: () => set({
    participants: [],
    participant: null,
    lives: 3
  })
}));
export const participantStore = useParticipantStore;
