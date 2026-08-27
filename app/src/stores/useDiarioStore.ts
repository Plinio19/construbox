import { create } from 'zustand';
import type { DiarioEntrada } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/diario.json';

interface DiarioState {
  entradas: DiarioEntrada[];
  sha: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetch: (force?: boolean) => Promise<void>;
  save: (entradas: DiarioEntrada[], msg?: string) => Promise<void>;
  upsert: (entrada: DiarioEntrada) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDiarioStore = create<DiarioState>((set, get) => ({
  entradas: [],
  sha: null,
  loading: false,
  loaded: false,
  error: null,

  fetch: async (force = false) => {
    if (!force && get().loaded) return;
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<DiarioEntrada>(PATH);
      set({ entradas: lista, sha, loading: false, loaded: true });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (entradas, msg) => {
    const newSha = await dataService.saveCollection(PATH, entradas, get().sha, msg);
    set({ entradas, sha: newSha });
  },

  upsert: async (entrada) => {
    const entradas = get().entradas;
    const idx = entradas.findIndex(e => e.id === entrada.id);
    const next = idx >= 0
      ? entradas.map(e => e.id === entrada.id ? entrada : e)
      : [...entradas, entrada];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Nova'} entrada diário: ${entrada.data}`);
  },

  remove: async (id) => {
    const next = get().entradas.filter(e => e.id !== id);
    await get().save(next, 'Remover entrada diário');
  },
}));