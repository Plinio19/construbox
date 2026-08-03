import { create } from 'zustand';
import type { Funcionario } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/funcionarios.json';

interface FuncionariosState {
  funcionarios: Funcionario[];
  sha: string | null;
  loading: boolean;
  loaded: boolean;
  fetch: (force?: boolean) => Promise<void>;
  save: (funcionarios: Funcionario[], msg?: string) => Promise<void>;
  upsert: (f: Funcionario) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useFuncionariosStore = create<FuncionariosState>((set, get) => ({
  funcionarios: [],
  sha: null,
  loading: false,
  loaded: false,

  fetch: async (force = false) => {
    if (!force && get().loaded) return;
    set({ loading: true });
    try {
      const { lista, sha } = await dataService.getCollection<Funcionario>(PATH);
      set({ funcionarios: lista, sha, loading: false, loaded: true });
    } catch { set({ loading: false }); }
  },

  save: async (funcionarios, msg) => {
    const newSha = await dataService.saveCollection(PATH, funcionarios, get().sha, msg);
    set({ funcionarios, sha: newSha });
  },

  upsert: async (f) => {
    const all = get().funcionarios;
    const idx = all.findIndex(x => x.id === f.id);
    const next = idx >= 0 ? all.map(x => x.id === f.id ? f : x) : [...all, f];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Novo'} funcionário: ${f.nome}`);
  },

  remove: async (id) => {
    await get().save(get().funcionarios.filter(f => f.id !== id), 'Remover funcionário');
  },
}));
