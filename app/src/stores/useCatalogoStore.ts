import { create } from 'zustand';
import type { MaterialCatalogo } from '../types';
import { dataService } from '../services/GitHubDataService';
import { useEtapasStore } from './useEtapasStore';
import { useModelosStore } from './useModelosStore';

const PATH = 'data/materiais_catalogo.json';

interface CatalogoState {
  catalogo: MaterialCatalogo[];
  sha: string | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  save: (catalogo: MaterialCatalogo[], msg?: string) => Promise<void>;
  upsert: (material: MaterialCatalogo) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Resolve nome/unidade de um material pelo catalogoId, com fallback */
  resolve: (catalogoId: string | undefined, fallbackNome: string, fallbackUnidade?: string) => {
    nome: string; unidade: string; valorRef: number; marca: string; fornecedor: string; temCat: boolean;
  };
  /** Propaga mudanças de nome/unidade para etapas e modelos */
  cascade: (id: string, oldNome: string, newNome: string, newUnidade: string) => Promise<void>;
}

export const useCatalogoStore = create<CatalogoState>((set, get) => ({
  catalogo: [],
  sha: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const { lista, sha } = await dataService.getCollection<MaterialCatalogo>(PATH);
      set({ catalogo: lista, sha, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (catalogo, msg) => {
    const newSha = await dataService.saveCollection(PATH, catalogo, get().sha, msg);
    set({ catalogo, sha: newSha });
  },

  upsert: async (material) => {
    const all = get().catalogo;
    const existing = all.find(m => m.id === material.id);
    const next = existing
      ? all.map(m => m.id === material.id ? material : m)
      : [...all, material];

    if (existing && (existing.nome !== material.nome || existing.unidade !== material.unidade)) {
      await get().save(next, `Atualizar material: ${material.nome}`);
      await get().cascade(material.id, existing.nome, material.nome, material.unidade);
    } else {
      await get().save(next, `${existing ? 'Atualizar' : 'Novo'} material: ${material.nome}`);
    }
  },

  remove: async (id) => {
    const next = get().catalogo.filter(m => m.id !== id);
    await get().save(next, 'Remover material do catálogo');
  },

  resolve: (catalogoId, fallbackNome, fallbackUnidade = '') => {
    const cat = catalogoId
      ? get().catalogo.find(x => x.id === catalogoId)
      : null;
    return {
      nome:       cat?.nome       ?? fallbackNome,
      unidade:    cat?.unidade    ?? fallbackUnidade,
      valorRef:   cat?.valorRef   ?? 0,
      marca:      cat?.marca      ?? '',
      fornecedor: cat?.fornecedorRef ?? '',
      temCat:     !!cat,
    };
  },

  cascade: async (id, oldNome, newNome, newUnidade) => {
    const etapasStore  = useEtapasStore.getState();
    const modelosStore = useModelosStore.getState();

    // Atualiza materiais nas etapas
    const etapasAtualizadas = etapasStore.etapas.map(e => ({
      ...e,
      materiais: e.materiais.map(m =>
        (m.catalogoId === id || m.nome === oldNome)
          ? { ...m, nome: newNome, unidade: newUnidade, catalogoId: id }
          : m,
      ),
    }));

    // Atualiza materiais nos modelos
    const modelosAtualizados = modelosStore.modelos.map(mo => ({
      ...mo,
      etapas: mo.etapas.map(et => ({
        ...et,
        materiais: et.materiais.map(m =>
          (m.catalogoId === id || m.nome === oldNome)
            ? { ...m, nome: newNome, unidade: newUnidade, catalogoId: id }
            : m,
        ),
      })),
    }));

    await Promise.all([
      etapasStore.save(etapasAtualizadas, `Cascade material: ${newNome}`),
      modelosStore.save(modelosAtualizados, `Cascade material: ${newNome}`),
    ]);
  },
}));
