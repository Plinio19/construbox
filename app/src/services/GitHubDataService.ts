import type { IDataService } from './IDataService';
import type { DataResult, GitHubConfig } from '../types';

// Mesma chave e defaults do sistema HTML legado
const LS_CONFIG = 'construbox_config_v1';
const DEFAULTS: Partial<GitHubConfig> = {
  owner:  'Plinio19',
  repo:   'construbox',
  branch: 'main',
};

// Mapeamento path → chave localStorage (compatível com o sistema legado)
const CACHE_MAP: Record<string, string> = {
  'data/obras.json':             'cbx_obras',
  'data/lancamentos.json':       'cbx_lanc',
  'data/etapas.json':            'cbx_etapas',
  'data/modelos.json':           'cbx_modelos',
  'data/clientes.json':          'cbx_clientes',
  'data/prestadores.json':       'cbx_prestadores',
  'data/funcionarios.json':      'cbx_funcionarios',
  'data/materiais_catalogo.json':'cbx_materiais_cat',
  'data/socios.json':            'cbx_socios',
};

function cacheKey(path: string): string {
  return CACHE_MAP[path] ?? `cbx_${path.replace(/[^a-z0-9]/gi, '_')}`;
}

function getConfig(): GitHubConfig | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_CONFIG) || '{}');
    const cfg = { ...DEFAULTS, ...stored } as GitHubConfig;
    return cfg.token ? cfg : null;
  } catch {
    return null;
  }
}

function apiBase(cfg: GitHubConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;
}

function headers(cfg: GitHubConfig): HeadersInit {
  return {
    Authorization: `token ${cfg.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export class GitHubDataService implements IDataService {
  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg?.token && cfg?.owner && cfg?.repo);
  }

  async getCollection<T>(path: string): Promise<DataResult<T>> {
    const cfg = getConfig();
    const key = cacheKey(path);

    // Sem config: tenta cache local (compartilhado com sistema legado)
    if (!cfg) {
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error('GitHub não configurado. Acesse Configurações.');
    }

    const res = await fetch(apiBase(cfg, path), { headers: headers(cfg) });

    if (res.status === 404) return { lista: [], sha: null };

    if (!res.ok) {
      // Fallback para cache local
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error(`GitHub ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const sha: string = json.sha;
    const lista: T[] = JSON.parse(atob(json.content.replace(/\n/g, '')));

    localStorage.setItem(key, JSON.stringify(lista));
    return { lista, sha };
  }

  async saveCollection<T>(
    path: string,
    data: T[],
    sha: string | null,
    message = 'Atualização Construbox',
  ): Promise<string> {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub não configurado.');

    // Busca sha fresco para evitar 409
    let freshSha = sha;
    try {
      const check = await fetch(apiBase(cfg, path), { headers: headers(cfg) });
      if (check.ok) freshSha = (await check.json()).sha;
    } catch { /* usa sha atual */ }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body: Record<string, unknown> = { message, content, branch: cfg.branch };
    if (freshSha) body.sha = freshSha;

    const res = await fetch(apiBase(cfg, path), {
      method: 'PUT',
      headers: headers(cfg),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub ${res.status}`);
    }

    const newSha: string = (await res.json()).content.sha;
    localStorage.setItem(cacheKey(path), JSON.stringify(data));
    return newSha;
  }
}

export const dataService: IDataService = new GitHubDataService();
