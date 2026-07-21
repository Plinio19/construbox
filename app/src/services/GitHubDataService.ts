import type { IDataService } from './IDataService';
import type { DataResult, GitHubConfig } from '../types';

const LS_CONFIG = 'cbx_config';

function getConfig(): GitHubConfig | null {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    return raw ? JSON.parse(raw) : null;
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
    if (!cfg) throw new Error('GitHub não configurado.');

    // Tenta cache local primeiro
    const cacheKey = `cbx_${path.replace(/[^a-z0-9]/gi, '_')}`;
    const cached = localStorage.getItem(cacheKey);

    const res = await fetch(apiBase(cfg, path), { headers: headers(cfg) });

    if (res.status === 404) {
      // Arquivo ainda não existe no repo
      return { lista: [], sha: null };
    }

    if (!res.ok) {
      // Fallback para cache local se GitHub indisponível
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error(`GitHub ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const sha: string = json.sha;
    const lista: T[] = JSON.parse(atob(json.content.replace(/\n/g, '')));

    // Atualiza cache
    localStorage.setItem(cacheKey, JSON.stringify(lista));

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
      if (check.ok) {
        const j = await check.json();
        freshSha = j.sha;
      }
    } catch {
      // usa o sha que temos
    }

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

    const result = await res.json();
    const newSha: string = result.content.sha;

    // Atualiza cache
    const cacheKey = `cbx_${path.replace(/[^a-z0-9]/gi, '_')}`;
    localStorage.setItem(cacheKey, JSON.stringify(data));

    return newSha;
  }
}

/** Instância singleton — use em toda a aplicação via este export. */
export const dataService: IDataService = new GitHubDataService();
