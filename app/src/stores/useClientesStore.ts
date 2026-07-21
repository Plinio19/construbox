import { create } from 'zustand';
import type { Cliente } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/clientes.json';

interface ClientesState {
  clientes: Cliente[];
  sha: string | null;
  loading: boolean;
  fetch: () => Promise<void>;
  save: (clientes: Cliente[], msg?: string) => Promise<void>;
  upsert: (cliente: Cliente) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useClientesStore = create<ClientesState>((set, get) => ({
  clientes: [],
  sha: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Cliente>(PATH);
      set({ clientes: lista, sha, loading: false });
    } catch { set({ loading: false }); }
  },

  save: async (clientes, msg) => {
    const newSha = await dataService.saveCollection(PATH, clientes, get().sha, msg);
    set({ clientes, sha: newSha });
  },

  upsert: async (cliente) => {
    const all = get().clientes;
    const idx = all.findIndex(c => c.id === cliente.id);
    const next = idx >= 0 ? all.map(c => c.id === cliente.id ? cliente : c) : [...all, cliente];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Novo'} cliente: ${cliente.nome}`);
  },

  remove: async (id) => {
    await get().save(get().clientes.filter(c => c.id !== id), 'Remover cliente');
  },
}));
