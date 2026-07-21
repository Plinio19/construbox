import { create } from 'zustand';
import type { Obra } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/obras.json';

interface ObrasState {
  obras: Obra[];
  sha: string | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  save: (obras: Obra[], msg?: string) => Promise<void>;
  upsert: (obra: Obra) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useObrasStore = create<ObrasState>((set, get) => ({
  obras: [],
  sha: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<Obra>(PATH);
      set({ obras: lista, sha, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (obras, msg) => {
    const newSha = await dataService.saveCollection(PATH, obras, get().sha, msg);
    set({ obras, sha: newSha });
  },

  upsert: async (obra) => {
    const obras = get().obras;
    const idx = obras.findIndex(o => o.id === obra.id);
    const next = idx >= 0
      ? obras.map(o => o.id === obra.id ? obra : o)
      : [...obras, obra];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Nova'} obra: ${obra.nome}`);
  },

  remove: async (id) => {
    const next = get().obras.filter(o => o.id !== id);
    await get().save(next, 'Remover obra');
  },
}));
