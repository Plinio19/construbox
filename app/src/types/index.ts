// ─── Entidades base ─────────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  tipo: 'pf' | 'pj';
  criadoEm: string;
}

export interface Prestador {
  id: string;
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  email?: string;
  especialidade?: string;
  valorHora?: number;
  criadoEm: string;
}

export interface Funcionario {
  id: string;
  nome: string;
  cargo?: string;
  cpf?: string;
  telefone?: string;
  salario?: number;
  dataAdmissao?: string;
  criadoEm: string;
}

export interface Socio {
  id: string;
  nome: string;
  percentual: number;
  criadoEm: string;
}

// ─── Catálogo de Materiais ───────────────────────────────────────────────────

export type CategoriaMateria =
  | 'estrutura' | 'alvenaria' | 'cobertura' | 'hidraulica'
  | 'eletrica' | 'acabamento' | 'impermeabilizacao' | 'esquadria'
  | 'revestimento' | 'instalacoes' | 'equipamento' | 'outros';

export type UnidadeMedida =
  | 'un' | 'sc' | 'm²' | 'm³' | 'm' | 'kg' | 't' | 'l' | 'gl' | 'cx' | 'pc' | 'barra';

export interface MaterialCatalogo {
  id: string;
  codigo: string;
  nome: string;
  especificacao?: string;
  categoria: CategoriaMateria;
  unidade: UnidadeMedida;
  ncm?: string;
  marca?: string;
  fornecedorRef?: string;
  valorRef?: number;
  estoqueMinimo?: number;
  prazoPedido?: number;
  observacoes?: string;
  criadoEm: string;
}

// ─── Modelos ─────────────────────────────────────────────────────────────────

export type ClassificacaoMaterial =
  | 'obrigatorio_iniciar'
  | 'obrigatorio_concluir'
  | 'opcional';

export interface MaterialTemplate {
  id: string;
  nome: string;
  catalogoId?: string;
  unidade: UnidadeMedida | string;
  qtdPorBox: number;
  qtdMinPorBox?: number;
  valorUnitario?: number;
  fornecedor?: string;
  classificacao: ClassificacaoMaterial;
}

export interface EtapaTemplate {
  id: string;
  nome: string;
  codigo?: string;
  ordem: number;
  categoria?: string;
  peso?: number;
  responsavel?: string;
  descricao?: string;
  memorial?: string;
  checklist?: ChecklistItem[];
  materiais: MaterialTemplate[];
}

export interface Modelo {
  id: string;
  nome: string;
  descricao?: string;
  tipo?: string;
  etapas: EtapaTemplate[];
  criadoEm: string;
  atualizadoEm?: string;
}

// ─── Obras ───────────────────────────────────────────────────────────────────

export type StatusObra =
  | 'orcamento' | 'aprovado' | 'andamento' | 'pausada' | 'concluida' | 'cancelada';

export interface ObraFuncionario {
  funcionarioId: string;
  nome: string;
  funcao?: string;
  salario?: number;
  dataInicio?: string;
  dataFim?: string;
}

export interface Parcela {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  pago?: boolean;
}

export interface Obra {
  id: string;
  nome: string;
  clienteId?: string;
  clienteNome?: string;
  modeloId?: string;
  qtdBoxes?: number;
  status: StatusObra;
  endereco?: string;
  valorContrato?: number;
  valorOrcado?: number;
  dataInicio?: string;
  dataPrevisaoFim?: string;
  dataFim?: string;
  observacoes?: string;
  funcionarios?: ObraFuncionario[];
  parcelas?: Parcela[];
  prestadorId?: string;
  prestadorNome?: string;
  criadoEm: string;
}

// ─── Etapas ──────────────────────────────────────────────────────────────────

export type StatusEtapa =
  | 'planejada' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada';

export interface ChecklistItem {
  id: string;
  texto: string;
  concluida: boolean;
}

export interface MaterialEtapa {
  id: string;
  nome: string;
  catalogoId?: string;
  modeloRef?: string;
  unidade: UnidadeMedida | string;
  classificacao: ClassificacaoMaterial;
  qtdPrevista: number;
  qtdMinIniciar?: number;
  qtdComprada: number;
  qtdEntregue: number;
  qtdReservada: number;
  qtdUtilizada: number;
  fornecedor?: string;
  valorPrevisto?: number;
  valorComprado?: number;
  pedidoCompra?: boolean;
  solicitacaoData?: string;
  obs?: string;
}

export interface Etapa {
  id: string;
  obraId: string;
  modeloEtapaId?: string;
  geradoDeModelo?: string;
  nome: string;
  codigo?: string;
  ordem?: number;
  categoria?: string;
  responsavel?: string;
  descricao?: string;
  observacoes?: string;
  memorial?: string;
  status: StatusEtapa;
  peso?: number;
  percentualExecutado?: number;
  dataPrevistoInicio?: string;
  dataPrevistoFim?: string;
  dataRealInicio?: string;
  dataRealFim?: string;
  dependencias?: string[];
  checklist?: ChecklistItem[];
  materiais: MaterialEtapa[];
  criadoEm?: string;
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

export type TipoLancamento = 'receita' | 'despesa';
export type StatusLancamento = 'pendente' | 'pago' | 'vencido' | 'cancelado';

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  vencimento: string;
  pagamento?: string;
  status: StatusLancamento;
  obraId?: string;
  obraNome?: string;
  clienteId?: string;
  clienteNome?: string;
  prestadorId?: string;
  prestadorNome?: string;
  funcionarioId?: string;
  funcionarioNome?: string;
  socioId?: string;
  socioNome?: string;
  categoria?: string;
  observacoes?: string;
  // OFX / conciliação bancária
  ofxId?: string;
  conciliado?: boolean;
  obs?: string;
  criadoEm: string;
}

// ─── Configuração / GitHub ────────────────────────────────────────────────────

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

// ─── Resposta do serviço de dados ─────────────────────────────────────────────

export interface DataResult<T> {
  lista: T[];
  sha: string | null;
}
