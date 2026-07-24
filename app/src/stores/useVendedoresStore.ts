import { create } from 'zustand';
import type { Vendedor } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/vendedores.json';

interface VendedoresState {
  vendedores: Vendedor[];
  sha: string | null;
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (v: Vendedor) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useVendedoresStore = create<VendedoresState>((set, get) => ({
  vendedores: [],
  sha: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Vendedor>(PATH);
      set({ vendedores: lista, sha, loading: false });
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
