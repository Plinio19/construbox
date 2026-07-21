import { create } from 'zustand';
import type { Etapa } from '../types';
import { dataService } from '../services/GitHubDataService';

const PATH = 'data/etapas.json';

interface EtapasState {
  etapas: Etapa[];
  sha: string | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  save: (etapas: Etapa[], msg?: string) => Promise<void>;
  upsert: (etapa: Etapa) => Promise<void>;
  remove: (id: string) => Promise<void>;
  byObra: (obraId: string) => Etapa[];
}

export const useEtapasStore = create<EtapasState>((set, get) => ({
  etapas: [],
  sha: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<Etapa>(PATH);
      set({ etapas: lista, sha, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (etapas, msg) => {
    const newSha = await dataService.saveCollection(PATH, etapas, get().sha, msg);
    set({ etapas, sha: newSha });
  },

  upsert: async (etapa) => {
    const all = get().etapas;
    const idx = all.findIndex(e => e.id === etapa.id);
    const next = idx >= 0
      ? all.map(e => e.id === etapa.id ? etapa : e)
      : [...all, etapa];
    await get().save(next, `${idx >= 0 ? 'Atualizar' : 'Nova'} etapa: ${etapa.nome}`);
  },

  remove: async (id) => {
    const next = get().etapas.filter(e => e.id !== id);
    await get().save(next, 'Remover etapa');
  },

  byObra: (obraId) => get().etapas.filter(e => e.obraId === obraId),
}));
