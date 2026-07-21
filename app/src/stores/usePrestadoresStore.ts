import { create } from 'zustand';
import type { Prestador } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/prestadores.json';

interface PrestadoresState {
  prestadores: Prestador[];
  sha: string | null;
  loading: boolean;
  fetch: () => Promise<void>;
  save: (prestadores: Prestador[], msg?: string) => Promise<void>;
  upsert: (p: Prestador) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePrestadoresStore = create<PrestadoresState>((set, get) => ({
  prestadores: [],
  sha: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Prestador>(PATH);
      set({ prestadores: lista, sha, loading: false });
    } catch { set({ loading: false }); }
  },

  save: async (prestadores, msg) => {
    const newSha = await dataService.saveCollection(PATH, prestadores, get().sha, msg);
    set({ prestadores, sha: newSha });
  },

  upsert: async (p) => {
    const all = get().prestadores;
    const idx = all.findIndex(x => x.id === p.id);
    const next = idx >= 0 ? all.map(x => x.id === p.id ? p : x) : [...all, p];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Novo'} prestador: ${p.nome}`);
  },

  remove: async (id) => {
    await get().save(get().prestadores.filter(p => p.id !== id), 'Remover prestador');
  },
}));
