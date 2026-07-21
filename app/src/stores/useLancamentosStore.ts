import { create } from 'zustand';
import type { Lancamento } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/lancamentos.json';

interface LancamentosState {
  lancamentos: Lancamento[];
  sha: string | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  save: (lancamentos: Lancamento[], msg?: string) => Promise<void>;
  upsert: (lancamento: Lancamento) => Promise<void>;
  remove: (id: string) => Promise<void>;
  receitas: () => Lancamento[];
  despesas: () => Lancamento[];
  byObra: (obraId: string) => Lancamento[];
}

export const useLancamentosStore = create<LancamentosState>((set, get) => ({
  lancamentos: [],
  sha: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<Lancamento>(PATH);
      set({ lancamentos: lista, sha, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (lancamentos, msg) => {
    const newSha = await dataService.saveCollection(PATH, lancamentos, get().sha, msg);
    set({ lancamentos, sha: newSha });
  },

  upsert: async (lancamento) => {
    const all = get().lancamentos;
    const idx = all.findIndex(l => l.id === lancamento.id);
    const next = idx >= 0
      ? all.map(l => l.id === lancamento.id ? lancamento : l)
      : [...all, lancamento];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Novo'} lançamento`);
  },

  remove: async (id) => {
    const next = get().lancamentos.filter(l => l.id !== id);
    await get().save(next, 'Remover lançamento');
  },

  receitas: () => get().lancamentos.filter(l => l.tipo === 'receita'),
  despesas: () => get().lancamentos.filter(l => l.tipo === 'despesa'),
  byObra: (obraId) => get().lancamentos.filter(l => l.obraId === obraId),
}));
