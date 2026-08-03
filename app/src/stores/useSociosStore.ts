import { create } from 'zustand';
import type { Socio } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/socios.json';

interface SociosState {
  socios: Socio[];
  sha: string | null;
  loading: boolean;
  loaded: boolean;

  fetch: (force?: boolean) => Promise<void>;
  upsert: (socio: Socio) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useSociosStore = create<SociosState>((set, get) => ({
  socios: [],
  sha: null,
  loading: false,
  loaded: false,

  fetch: async (force = false) => {
    if (!force && get().loaded) return;
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Socio>(PATH);
      set({ socios: lista, sha, loading: false, loaded: true });
    } catch {
      set({ loading: false });
    }
  },

  upsert: async (socio) => {
    const all = get().socios;
    const idx = all.findIndex(s => s.id === socio.id);
    const next = idx >= 0 ? all.map(s => s.id === socio.id ? socio : s) : [...all, socio];
    const sha = await dataService.saveCollection(PATH, next, get().sha, 'Atualizar sócios');
    set({ socios: next, sha });
  },

  remove: async (id) => {
    const next = get().socios.filter(s => s.id !== id);
    const sha = await dataService.saveCollection(PATH, next, get().sha, 'Remover sócio');
    set({ socios: next, sha });
  },
}));
