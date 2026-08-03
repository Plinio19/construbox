import { create } from 'zustand';
import type { Vendedor } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/vendedores.json';

interface VendedoresState {
  vendedores: Vendedor[];
  sha: string | null;
  loading: boolean;
  loaded: boolean;
  fetch: (force?: boolean) => Promise<void>;
  upsert: (v: Vendedor) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useVendedoresStore = create<VendedoresState>((set, get) => ({
  vendedores: [],
  sha: null,
  loading: false,
  loaded: false,

  fetch: async (force = false) => {
    if (!force && get().loaded) return;
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Vendedor>(PATH);
      set({ vendedores: lista, sha, loading: false, loaded: true });
    } catch { set({ loading: false }); }
  },

  upsert: async (v) => {
    const all = get().vendedores;
    const idx = all.findIndex(x => x.id === v.id);
    const next = idx >= 0 ? all.map(x => x.id === v.id ? v : x) : [...all, v];
    const newSha = await dataService.saveCollection(PATH, next, get().sha, `${idx >= 0 ? 'Atualizar' : 'Novo'} vendedor: ${v.nome}`);
    set({ vendedores: next, sha: newSha });
  },

  remove: async (id) => {
    const next = get().vendedores.filter(v => v.id !== id);
    const newSha = await dataService.saveCollection(PATH, next, get().sha, 'Remover vendedor');
    set({ vendedores: next, sha: newSha });
  },
}));
