import type { DataResult } from '../types';

/**
 * Contrato que qualquer fonte de dados deve implementar.
 * Hoje: GitHubDataService. Amanhã: RestApiService, SupabaseService, etc.
 * As pages/stores nunca importam a implementação concreta — só esta interface.
 */
export interface IDataService {
  /** Lê uma coleção. Retorna lista + sha (necessário para write sem conflito). */
  getCollection<T>(path: string): Promise<DataResult<T>>;

  /** Salva uma coleção inteira. sha previne conflito 409. */
  saveCollection<T>(path: string, data: T[], sha: string | null, message?: string): Promise<string>;

  /** Verifica se o serviço está configurado (token, repo, etc.). */
  isConfigured(): boolean;
}
