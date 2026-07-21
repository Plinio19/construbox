import { create } from 'zustand';
import type { Modelo } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/modelos.json';

interface ModelosState {
  modelos: Modelo[];
  sha: string | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  save: (modelos: Modelo[], msg?: string) => Promise<void>;
  upsert: (modelo: Modelo) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useModelosStore = create<ModelosState>((set, get) => ({
  modelos: [],
  sha: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<Modelo>(PATH);
      set({ modelos: lista, sha, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (modelos, msg) => {
    const newSha = await dataService.saveCollection(PATH, modelos, get().sha, msg);
    set({ modelos, sha: newSha });
  },

  upsert: async (modelo) => {
    const all = get().modelos;
    const idx = all.findIndex(m => m.id === modelo.id);
    const next = idx >= 0
      ? all.map(m => m.id === modelo.id ? modelo : m)
      : [...all, modelo];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Novo'} modelo: ${modelo.nome}`);
  },

  remove: async (id) => {
    const next = get().modelos.filter(m => m.id !== id);
    await get().save(next, 'Remover modelo');
  },
}));
