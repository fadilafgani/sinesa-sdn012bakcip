import { create } from 'zustand';

export interface UiState {
  loading: boolean;
  error: string | null;
  modal: Record<string, boolean>;
  dialog: any | null;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setModal: (modalName: string, isOpen: boolean) => void;
  setDialog: (dialog: any | null) => void;
  resetUiStore: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  loading: false,
  error: null,
  modal: {},
  dialog: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setModal: (modalName, isOpen) => set((state) => ({
    modal: { ...state.modal, [modalName]: isOpen }
  })),
  setDialog: (dialog) => set({ dialog }),
  resetUiStore: () => set({
    loading: false,
    error: null,
    modal: {},
    dialog: null
  })
}));
export const uiStore = useUiStore;
