import type { IDataService } from './IDataService';
import type { DataResult, GitHubConfig } from '../types';

const LS_CONFIG = 'construbox_config_v1';
const DEFAULTS: Partial<GitHubConfig> = {
  owner:  'Plinio19',
  repo:   'construbox',
  branch: 'main',
};

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
  'data/diario.json':            'cbx_diario',
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

function apiBase(cfg: GitHubConfig, path: string, bust = false): string {
  const ts = bust ? `&_t=${Date.now()}` : '';
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}${ts}`;
}

async function fetchFreshSha(cfg: GitHubConfig, path: string): Promise<string | null> {
  try {
    const res = await fetch(apiBase(cfg, path, true), {
      headers: { ...headers(cfg), 'Cache-Control': 'no-cache' },
    });
    if (res.ok) return (await res.json()).sha as string;
  } catch { /* ignora */ }
  return null;
}

function apiBaseNoRef(cfg: GitHubConfig, path: string): string {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

function headers(cfg: GitHubConfig): HeadersInit {
  return {
    Authorization: `token ${cfg.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// Encode string to base64 preserving UTF-8
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// Decode base64 back to string (UTF-8)
function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, '').replace(/\r/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// Fix strings that were double-encoded (legacy corruption: "Ã§" → "ç")
function fixLegacyStr(s: string): string {
  const hasHigh = s.split('').some(c => c.charCodeAt(0) > 127);
  if (!hasHigh) return s;
  try {
    const bytes = Uint8Array.from(s, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

function fixLegacy(val: unknown): unknown {
  if (typeof val === 'string') return fixLegacyStr(val);
  if (Array.isArray(val)) return val.map(fixLegacy);
  if (val && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, fixLegacy(v)])
    );
  }
  return val;
}

export class GitHubDataService implements IDataService {
  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg?.token && cfg?.owner && cfg?.repo);
  }

  async getCollection<T>(path: string): Promise<DataResult<T>> {
    const cfg = getConfig();
    const key = cacheKey(path);

    if (!cfg) {
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error('GitHub não configurado. Acesse Configurações.');
    }

    const res = await fetch(apiBase(cfg, path), { headers: headers(cfg) });

    if (res.status === 404) return { lista: [], sha: null };

    if (!res.ok) {
      const cached = localStorage.getItem(key);
      if (cached) return { lista: JSON.parse(cached), sha: null };
      throw new Error(`GitHub ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const sha: string = json.sha;
    const raw = fromBase64(json.content);
    const parsed = JSON.parse(raw);
    const lista = fixLegacy(parsed) as T[];

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

    const doPut = (currentSha: string | null) => fetch(apiBaseNoRef(cfg, path), {
      method: 'PUT',
      headers: headers(cfg),
      body: JSON.stringify({
        message,
        content: toBase64(JSON.stringify(data, null, 2)),
        branch: cfg.branch,
        ...(currentSha ? { sha: currentSha } : {}),
      }),
    });

    // Sempre busca SHA fresco com cache-busting para evitar SHA desatualizado do CDN
    const freshSha = (await fetchFreshSha(cfg, path)) ?? sha;

    let res = await doPut(freshSha);

    if (res.status === 409 || res.status === 422) {
      const retrySha = (await fetchFreshSha(cfg, path)) ?? freshSha;
      res = await doPut(retrySha);
    }

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