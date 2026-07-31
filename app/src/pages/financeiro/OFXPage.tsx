import { useState, useEffect, useRef } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Button, Select, Input, InputNumber, Typography,
  message, Tooltip, Popconfirm, Badge, Space, Alert,
} from 'antd';
import {
  UploadOutlined, CheckOutlined, StopOutlined, UndoOutlined, InboxOutlined,
  LinkOutlined, WarningOutlined, CheckCircleOutlined, PlusOutlined,
  ScissorOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { usePrestadoresStore } from '../../stores/usePrestadoresStore';
import { useSociosStore } from '../../stores/useSociosStore';
import { formatarMoeda, uid, hoje, titleCase } from '../../utils';
import type { Lancamento } from '../../types';

const { Title, Text } = Typography;

interface OFXTransacao {
  id: string;
  data: string;
  valor: number;
  tipo: 'credito' | 'debito';
  memo: string;
}

type CatOFX = 'recebimento' | 'mao-de-obra' | 'distribuicao' | 'reembolso' | 'outros' | 'ignorar' | '';

interface Split {
  id: string;
  cat: CatOFX;
  obra: string;
  valor: number;
  descricao: string;
  clienteId: string;
  socioId: string;
  prestadorId: string;
  lancamentoId?: string;  // vínculo opcional com parcela existente
}

interface EstadoClass {
  status: 'pendente' | 'lancado' | 'ignorado';
  cat: CatOFX;
  obra: string;
  lancamentoIds: string[];
  descricao: string;
  clienteId: string;
  socioId: string;
  prestadorId: string;
  splits?: Split[];
  saldoRestanteIds?: string[]; // IDs de parcelas de saldo criadas na baixa parcial
}

const LS_EXTRATO = 'cbx_extrato';
const LS_ESTADO  = 'cbx_extrato_estado_v2';

const CAT_OPTS: { value: CatOFX; label: string }[] = [
  { value: 'recebimento',  label: 'Recebimento'    },
  { value: 'mao-de-obra',  label: 'Mão de Obra'    },
  { value: 'distribuicao', label: 'Dist. de Lucro' },
  { value: 'reembolso',    label: 'Reembolso'      },
  { value: 'outros',       label: 'Outros'         },
  { value: 'ignorar',      label: 'Ignorar'        },
];

function parseOFX(content: string): OFXTransacao[] {
  const txns: OFXTransacao[] = [];
  const re = /<STMTTRN[^>]*>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([^\n<\r]+)`, 'i').exec(block);
      return r ? r[1].trim() : '';
    };
    const fitid = get('FITID');
    const dt    = get('DTPOSTED').replace(/\[.*\]/, '').trim();
    const amt   = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const memo  = (get('MEMO') || get('NAME') || '').replace(/&amp;/g, '&');
    if (!fitid || !dt || !amt) continue;
    const data = dt.length >= 8 ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}` : hoje();
    txns.push({ id: fitid, data, valor: Math.abs(amt), tipo: amt >= 0 ? 'credito' : 'debito', memo });
  }
  return txns.sort((a, b) => a.data.localeCompare(b.data));
}

function sugerirCategoria(t: OFXTransacao): CatOFX {
  const m = (t.memo || '').toUpperCase();
  if (t.tipo === 'credito') {
    if (m.includes('RDB') || m.includes('RENDIMENTO')) return 'ignorar';
    return 'recebimento';
  }
  if (m.includes('RDB') || m.includes('RENDIMENTO')) return 'ignorar';
  if (m.includes('SALARIO') || m.includes('SALÁRIO') || m.includes('FOLHA')) return 'mao-de-obra';
  return 'outros';
}

function dataDoLancamento(l: Lancamento): string {
  const la = l as unknown as Record<string, string>;
  return l.pagamento || la['dataPagamento'] || la['data'] || l.vencimento || la['dataVencimento'] || '';
}

function findLancByTransacao(
  t: OFXTransacao,
  lancamentos: Lancamento[],
  claimed: Set<string> = new Set(),
): { lanc: Lancamento; fuzzy: boolean } | null {
  const byId = lancamentos.find(l => l.ofxId === t.id);
  if (byId) return { lanc: byId, fuzzy: false };
  const fuzzy = lancamentos.find(l => {
    if (l.ofxId) return false;        // já conciliado com outro OFX
    if (claimed.has(l.id)) return false; // já reivindicado por outra transação nesta passagem
    const dataStr = dataDoLancamento(l);
    if (!dataStr) return false;
    const diffDias = Math.abs(new Date(dataStr).getTime() - new Date(t.data).getTime()) / 86400000;
    const sameValor = Math.abs(l.valor - t.valor) < 0.01;
    const sameTipo  = t.tipo === 'credito' ? l.tipo === 'receita' : l.tipo === 'despesa';
    return diffDias <= 3 && sameValor && sameTipo;
  });
  return fuzzy ? { lanc: fuzzy, fuzzy: true } : null;
}

function estadoDeMatch(lanc: Lancamento, fuzzy: boolean): EstadoClass {
  return {
    // fuzzy: pendente (pré-selecionado, aguarda confirmação do usuário) — não 'ignorado'
    status: fuzzy ? 'pendente' : 'lancado',
    cat: lanc.tipo === 'receita' ? 'recebimento' : lanc.categoria === 'mao-de-obra' ? 'mao-de-obra' : 'outros',
    obra: lanc.obraId || '',
    lancamentoIds: [lanc.id],
    descricao: lanc.descricao,
    clienteId: lanc.clienteId || '',
    socioId: lanc.socioId || '',
    prestadorId: lanc.prestadorId || '',
  };
}

function migrarEstado(s: Record<string, unknown>): EstadoClass {
  // Migra formato antigo (lancamentoId: string) para novo (lancamentoIds: string[])
  const e = s as unknown as EstadoClass & { lancamentoId?: string };
  if (!Array.isArray(e.lancamentoIds)) {
    e.lancamentoIds = e.lancamentoId ? [e.lancamentoId] : [];
  }
  return e;
}

function estadoInicial(t: OFXTransacao, lancamentos: Lancamento[], claimed: Set<string> = new Set()): EstadoClass {
  const resultado = findLancByTransacao(t, lancamentos, claimed);
  if (resultado) return estadoDeMatch(resultado.lanc, resultado.fuzzy);
  return {
    status: 'pendente', cat: sugerirCategoria(t),
    obra: '', lancamentoIds: [], descricao: '', clienteId: '', socioId: '', prestadorId: '',
  };
}

export default function OFXPage() {
  const { lancamentos, upsert: upsertLanc, remove: removeLanc, fetch: fetchLancs } = useLancamentosStore();
  const { obras, fetch: fetchObras }       = useObrasStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();
  const { prestadores, fetch: fetchPrest } = usePrestadoresStore();
  const { socios, fetch: fetchSocios }     = useSociosStore();

  const [transacoes, setTransacoes] = useState<OFXTransacao[]>([]);
  const [estados, setEstados]       = useState<Record<string, EstadoClass>>({});
  const [drag, setDrag]             = useState(false);
  const [filtro, setFiltro]         = useState<'todos' | 'pendente' | 'lancado' | 'ignorado'>('todos');
  const [salvando, setSalvando]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchObras(); fetchClientes(); fetchPrest(); fetchSocios(); fetchLancs(); }, []);

  useEffect(() => {
    try {
      const raw: OFXTransacao[] = JSON.parse(localStorage.getItem(LS_EXTRATO) || '[]');
      setTransacoes(raw);
    } catch { setTransacoes([]); }
  }, []);

  useEffect(() => {
    if (!transacoes.length) return;
    setEstados(prev => {
      const salvo: Record<string, Record<string, unknown>> = (() => {
        try { return JSON.parse(localStorage.getItem(LS_ESTADO) || '{}'); } catch { return {}; }
      })();
      const novo: Record<string, EstadoClass> = {};
      // Rastreia lançamentos já reivindicados para evitar que dois OFX de mesmo valor/data
      // apontem para o mesmo lançamento (ex: distribuição 2k para dois sócios)
      const claimed = new Set<string>();
      transacoes.forEach(t => {
        const prevEst = prev[t.id];
        // Não sobrescrever estados finalizados
        if (prevEst?.status === 'lancado' || prevEst?.status === 'ignorado') {
          // Marcar os lançamentos já usados como claimed
          (prevEst.lancamentoIds || []).forEach(id => claimed.add(id));
          novo[t.id] = prevEst;
          return;
        }
        const resultado = findLancByTransacao(t, lancamentos, claimed);
        if (resultado) {
          claimed.add(resultado.lanc.id);
          novo[t.id] = estadoDeMatch(resultado.lanc, resultado.fuzzy);
        } else if (prevEst?.cat) {
          // Usuário já começou a classificar — preservar o trabalho em andamento
          (prevEst.lancamentoIds || []).forEach(id => claimed.add(id));
          novo[t.id] = prevEst;
        } else if (salvo[t.id]) {
          novo[t.id] = migrarEstado(salvo[t.id]);
        } else {
          novo[t.id] = estadoInicial(t, lancamentos, claimed);
        }
      });
      return novo;
    });
  }, [transacoes, lancamentos]);

  function salvarLS(prox: Record<string, EstadoClass>) {
    localStorage.setItem(LS_ESTADO, JSON.stringify(prox));
  }

  function carregarArquivo(file: File) {
    if (!file.name.toLowerCase().endsWith('.ofx')) {
      message.error('Selecione um arquivo .ofx'); return;
    }

    function processar(content: string) {
      const novas = parseOFX(content);
      if (!novas.length) { message.warning('Nenhuma transação encontrada no arquivo.'); return; }
      const existentes: OFXTransacao[] = (() => {
        try { return JSON.parse(localStorage.getItem(LS_EXTRATO) || '[]'); } catch { return []; }
      })();
      const mapa = new Map(existentes.map(t => [t.id, t]));
      novas.forEach(t => mapa.set(t.id, t));
      const merged = [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
      localStorage.setItem(LS_EXTRATO, JSON.stringify(merged));
      setTransacoes(merged);
      message.success(`${novas.length} transação(ões) importada(s). ${merged.length} no total.`);
    }

    function lerCom(enc: string) {
      const r = new FileReader();
      r.onload = e => processar(e.target?.result as string);
      r.readAsText(file, enc);
    }

    // Detecta o encoding pelo cabeçalho antes de ler o arquivo completo
    const sniff = new FileReader();
    sniff.onload = ev => {
      const header = ev.target?.result as string;
      // OFX 2.0 XML
      if (header.trimStart().startsWith('<?xml')) {
        const m = /encoding="([^"]+)"/i.exec(header);
        return lerCom(m ? m[1] : 'UTF-8');
      }
      // OFX 1.x SGML — procura campo CHARSET
      const m = /CHARSET[:\s]*(\S+)/i.exec(header);
      if (m) {
        const cs = m[1].toUpperCase();
        if (cs.includes('UTF') || cs === 'UNICODE') return lerCom('UTF-8');
        if (cs === '1252') return lerCom('windows-1252');
        return lerCom('ISO-8859-1');
      }
      // Sem declaração: tenta UTF-8; se inválido, cai para ISO-8859-1
      const r = new FileReader();
      r.onload = e => {
        const content = e.target?.result as string;
        if (content.includes('�')) {
          lerCom('ISO-8859-1'); // bytes inválidos em UTF-8 → era Latin-1
        } else {
          processar(content);
        }
      };
      r.readAsText(file, 'UTF-8');
    };
    sniff.readAsText(file.slice(0, 500), 'ISO-8859-1');
  }

  function upd(id: string, patch: Partial<EstadoClass>) {
    setEstados(prev => {
      const prox = { ...prev, [id]: { ...prev[id], ...patch } };
      salvarLS(prox);
      return prox;
    });
  }

  function updSplit(txnId: string, splitId: string, patch: Partial<Split>) {
    setEstados(prev => {
      const est = prev[txnId];
      if (!est?.splits) return prev;
      const splits = est.splits.map(s => s.id === splitId ? { ...s, ...patch } : s);
      const prox = { ...prev, [txnId]: { ...est, splits } };
      salvarLS(prox);
      return prox;
    });
  }

  function addSplit(txnId: string, txnValor: number) {
    setEstados(prev => {
      const est = prev[txnId];
      const usado = (est?.splits || []).reduce((s, sp) => s + sp.valor, 0);
      const resto = Math.max(0, Math.round((txnValor - usado) * 100) / 100);
      const novo: Split = { id: uid(), cat: '' as CatOFX, obra: '', valor: resto, descricao: '', clienteId: '', socioId: '', prestadorId: '' };
      const splits = [...(est?.splits || []), novo];
      const prox = { ...prev, [txnId]: { ...est, splits } };
      salvarLS(prox);
      return prox;
    });
  }

  function removeSplit(txnId: string, splitId: string) {
    setEstados(prev => {
      const est = prev[txnId];
      if (!est?.splits) return prev;
      const splits = est.splits.filter(s => s.id !== splitId);
      const prox = { ...prev, [txnId]: { ...est, splits: splits.length ? splits : undefined } };
      salvarLS(prox);
      return prox;
    });
  }

  function iniciarDivisao(t: OFXTransacao) {
    setEstados(prev => {
      const est = prev[t.id];
      const inicial: Split = {
        id: uid(), cat: est?.cat || '' as CatOFX, obra: est?.obra || '',
        valor: t.valor, descricao: est?.descricao || '',
        clienteId: est?.clienteId || '', socioId: est?.socioId || '', prestadorId: est?.prestadorId || '',
      };
      const prox = { ...prev, [t.id]: { ...est, splits: [inicial] } };
      salvarLS(prox);
      return prox;
    });
  }

  function cancelarDivisao(txnId: string) {
    setEstados(prev => {
      const est = prev[txnId];
      const prox = { ...prev, [txnId]: { ...est, splits: undefined } };
      salvarLS(prox);
      return prox;
    });
  }

  /* ── Lançamentos pendentes da obra ──────────────────────────────────────── */
  function lancamentosPendentesObra(obraId: string, tipo: 'receita' | 'despesa') {
    return lancamentos.filter(l =>
      l.obraId === obraId &&
      l.tipo === tipo &&
      (l.status === 'pendente' || l.status === 'parcial' || l.status === 'vencido'),
    );
  }

  /* ── Lançar / Dar baixa ─────────────────────────────────────────────────── */
  async function lancar(t: OFXTransacao) {
    const est = estados[t.id];
    if (!est || !est.cat || est.cat === 'ignorar') return;
    setSalvando(t.id);
    try {
      const catMap: Record<string, string> = {
        recebimento: 'adiantamento', 'mao-de-obra': 'mao-de-obra',
        distribuicao: 'distribuicao', reembolso: 'reembolso', outros: 'outros',
      };

      // ── Modo Dividir: múltiplos lançamentos de um mesmo pagamento ──────────
      const splits = est.splits;
      if (splits && splits.length > 0) {
        for (const sp of splits) {
          if (!sp.cat || sp.cat === 'ignorar' || sp.valor <= 0) continue;

          if (sp.lancamentoId) {
            // Dar baixa em parcela existente (total ou parcial)
            const lanc = lancamentos.find(l => l.id === sp.lancamentoId);
            if (lanc) {
              if (sp.valor >= lanc.valor - 0.01) {
                await upsertLanc({ ...lanc, status: 'pago', pagamento: t.data, ofxId: t.id, conciliado: true, obs: t.memo });
              } else {
                const saldo = lanc.valor - sp.valor;
                await upsertLanc({ ...lanc, status: 'pago', pagamento: t.data, valor: sp.valor, ofxId: t.id, conciliado: true, obs: t.memo });
                await upsertLanc({
                  id: uid(), tipo: lanc.tipo,
                  descricao: `${lanc.descricao} — saldo restante`,
                  valor: saldo, vencimento: lanc.vencimento, status: 'pendente',
                  obraId: lanc.obraId, obraNome: lanc.obraNome,
                  clienteId: lanc.clienteId, clienteNome: lanc.clienteNome,
                  prestadorId: lanc.prestadorId, prestadorNome: lanc.prestadorNome,
                  categoria: lanc.categoria, criadoEm: hoje(),
                });
              }
            }
          } else {
            // Criar lançamento novo
            const tipo: Lancamento['tipo'] = sp.cat === 'recebimento' ? 'receita' : 'despesa';
            const obra   = obras.find(o => o.id === sp.obra);
            const cliente = clientes.find(c => c.id === sp.clienteId);
            const prest  = prestadores.find(p => p.id === sp.prestadorId);
            const socio  = socios.find(s => s.id === sp.socioId);
            await upsertLanc({
              id: uid(), tipo,
              descricao: titleCase(sp.descricao || (t.memo || '').slice(0, 80)),
              valor: sp.valor, vencimento: t.data, pagamento: t.data, status: 'pago',
              obraId: obra?.id, obraNome: obra?.nome,
              clienteId: cliente?.id, clienteNome: cliente?.nome,
              prestadorId: prest?.id, prestadorNome: prest?.nome,
              socioId: socio?.id, socioNome: socio?.nome,
              categoria: catMap[sp.cat] || 'outros',
              ofxId: t.id, conciliado: true, obs: t.memo, criadoEm: hoje(),
            });
          }
        }
        upd(t.id, { status: 'lancado' });
        message.success(`${splits.length} parte(s) lançadas!`);
        setSalvando(null);
        return;
      }

      const ids = est.lancamentoIds || [];

      if (ids.length > 0) {
        // Distribui o valor do banco pelas parcelas selecionadas, em ordem de vencimento
        const selecionadas = lancamentos
          .filter(l => ids.includes(l.id))
          .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

        let valorRestante = t.valor;
        const saldoRestanteIds: string[] = [];
        let totalSaldoCriado = 0;

        for (const lanc of selecionadas) {
          if (valorRestante <= 0) break;

          const obsLanc = est.descricao ? `${est.descricao} · ${t.memo}` : t.memo;
          if (valorRestante >= lanc.valor - 0.01) {
            // Baixa completa nesta parcela
            await upsertLanc({
              ...lanc,
              status: 'pago',
              pagamento: t.data,
              ofxId: t.id,
              conciliado: true,
              obs: obsLanc,
            });
            valorRestante -= lanc.valor;
          } else {
            // Baixa parcial nesta parcela — gera saldo residual
            const saldo = lanc.valor - valorRestante;
            await upsertLanc({
              ...lanc,
              status: 'pago',
              pagamento: t.data,
              valor: valorRestante,
              ofxId: t.id,
              conciliado: true,
              obs: obsLanc,
            });
            const saldoId = uid();
            await upsertLanc({
              ...lanc,                              // herda TODOS os campos (socioId, socioNome, etc.)
              id: saldoId,
              descricao: titleCase(`${lanc.descricao} — saldo restante`),
              valor: saldo,
              status: 'pendente',
              pagamento: undefined,
              ofxId: undefined,
              conciliado: false,
              obs: undefined,
              criadoEm: hoje(),
            });
            saldoRestanteIds.push(saldoId);
            totalSaldoCriado += saldo;
            valorRestante = 0;
          }
        }

        // Se sobrou valor após pagar todas as parcelas → adiantamento
        if (valorRestante > 0.01) {
          const ref = selecionadas[0];
          await upsertLanc({
            id: uid(), tipo: ref.tipo,
            descricao: `Adiantamento — ${ref.obraNome || 'sem obra'}`,
            valor: valorRestante, vencimento: t.data, pagamento: t.data, status: 'pago',
            obraId: ref.obraId, obraNome: ref.obraNome,
            clienteId: ref.clienteId, clienteNome: ref.clienteNome,
            categoria: 'adiantamento', ofxId: t.id, conciliado: true,
            obs: `Excedente do pagamento de ${formatarMoeda(t.valor)}`, criadoEm: hoje(),
          });
          message.success(`Baixa dada! Excedente de ${formatarMoeda(valorRestante)} lançado como adiantamento.`);
        } else if (totalSaldoCriado > 0) {
          message.warning(
            `Baixa parcial! Saldo restante de ${formatarMoeda(totalSaldoCriado)} criado como nova parcela pendente em Contas a Receber.`,
            6,
          );
        } else {
          message.success(selecionadas.length > 1
            ? `Baixa dada em ${selecionadas.length} parcelas!`
            : 'Baixa dada na parcela!'
          );
        }
        upd(t.id, { status: 'lancado', saldoRestanteIds });
        setSalvando(null);
        return;
      }

      // Criar lançamento novo (sem vínculo com parcela)
      const tipo: Lancamento['tipo'] = est.cat === 'recebimento' ? 'receita' : 'despesa';
      const obra    = obras.find(o => o.id === est.obra);
      const cliente = clientes.find(c => c.id === est.clienteId);
      const prest   = prestadores.find(p => p.id === est.prestadorId);
      const socio   = socios.find(s => s.id === est.socioId);
      const descFinal = titleCase(est.descricao || (t.memo || '').replace(/Transferência (recebida|enviada) pelo Pix - /i, '').slice(0, 80));
      await upsertLanc({
        id: uid(), tipo, descricao: descFinal,
        valor: t.valor, vencimento: t.data, pagamento: t.data, status: 'pago',
        obraId: obra?.id, obraNome: obra?.nome,
        clienteId: cliente?.id, clienteNome: cliente?.nome,
        prestadorId: prest?.id, prestadorNome: prest?.nome,
        socioId: socio?.id, socioNome: socio?.nome,
        categoria: catMap[est.cat] || 'outros',
        ofxId: t.id, conciliado: true, obs: t.memo, criadoEm: hoje(),
      });
      upd(t.id, { status: 'lancado' });
      message.success('Lançado com sucesso!');
    } catch { message.error('Erro ao lançar.'); }
    setSalvando(null);
  }

  async function ignorar(t: OFXTransacao) { upd(t.id, { status: 'ignorado' }); }

  async function desfazer(t: OFXTransacao) {
    // Remove todos os lançamentos com este ofxId (pode ser mais de um após multi-baixa)
    const lancs = lancamentos.filter(l => l.ofxId === t.id);
    for (const lanc of lancs) {
      try { await removeLanc(lanc.id); } catch { message.error('Erro ao remover lançamento.'); return; }
    }
    upd(t.id, { status: 'pendente', lancamentoIds: [] });
  }

  function limparTudo() {
    localStorage.removeItem(LS_EXTRATO);
    localStorage.removeItem(LS_ESTADO);
    setTransacoes([]);
    setEstados({});
    message.success('Extrato limpo.');
  }

  function ignorarTodosPendentes() {
    let count = 0;
    setEstados(prev => {
      const prox = { ...prev };
      transacoes.forEach(t => {
        if ((prox[t.id]?.status || 'pendente') === 'pendente') {
          prox[t.id] = { ...prox[t.id] ?? estadoInicial(t, lancamentos), status: 'ignorado' };
          count++;
        }
      });
      salvarLS(prox);
      return prox;
    });
    message.success(`Transações ignoradas.`);
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function renderTerceiroSelect(t: OFXTransacao) {
    const est = estados[t.id];
    if (!est) return null;
    if (est.cat === 'recebimento') return (
      <Select placeholder="Cliente" value={est.clienteId || undefined} size="small" allowClear
        style={{ width: 150 }} onChange={v => upd(t.id, { clienteId: v || '' })}
        options={clientes.map(c => ({ value: c.id, label: c.nome }))} />
    );
    if (est.cat === 'mao-de-obra') return (
      <Select placeholder="Prestador" value={est.prestadorId || undefined} size="small" allowClear
        style={{ width: 150 }} onChange={v => upd(t.id, { prestadorId: v || '' })}
        options={prestadores.map(p => ({ value: p.id, label: p.nome }))} />
    );
    if (est.cat === 'distribuicao') return (
      <Select placeholder="Sócio" value={est.socioId || undefined} size="small" allowClear
        showSearch optionFilterProp="label"
        style={{ width: 180 }} onChange={v => upd(t.id, { socioId: v || '' })}
        options={socios.map(s => ({ value: s.id, label: s.nome }))} />
    );
    return null;
  }

  function corLinha(t: OFXTransacao) {
    const st = estados[t.id]?.status;
    if (st === 'lancado') return { background: '#f6ffed', borderLeft: '3px solid #52c41a' };
    if (st === 'ignorado') return { background: '#f5f5f5', borderLeft: '3px solid #d9d9d9', opacity: 0.6 };
    if (t.tipo === 'credito') return { borderLeft: '3px solid #1677ff' };
    return { borderLeft: '3px solid #ff4d4f' };
  }

  // Resumo de distribuição para o multi-select de parcelas
  function resumoDistribuicao(t: OFXTransacao, ids: string[]) {
    if (!ids.length) return null;
    const selecionadas = lancamentos.filter(l => ids.includes(l.id));
    const totalSel = selecionadas.reduce((s, l) => s + l.valor, 0);
    const diff = t.valor - totalSel;
    if (Math.abs(diff) < 0.01) return (
      <div style={{ fontSize: 10, color: '#52c41a', marginTop: 2 }}>
        <CheckCircleOutlined /> Valor exato — baixa completa em {ids.length} parcela(s)
      </div>
    );
    if (diff > 0) return (
      <div style={{ fontSize: 10, color: '#fa8c16', marginTop: 2 }}>
        <WarningOutlined /> Banco: {formatarMoeda(t.valor)} · Parcelas: {formatarMoeda(totalSel)} · Excedente {formatarMoeda(diff)} → adiantamento
      </div>
    );
    // diff < 0: banco < total parcelas → baixa parcial na última
    return (
      <div style={{ fontSize: 10, color: '#fa8c16', marginTop: 2 }}>
        <WarningOutlined /> Banco: {formatarMoeda(t.valor)} · Parcelas: {formatarMoeda(totalSel)} · Última parcela receberá baixa parcial
      </div>
    );
  }

  const total     = transacoes.length;
  const lancados  = transacoes.filter(t => estados[t.id]?.status === 'lancado').length;
  const ignorados = transacoes.filter(t => estados[t.id]?.status === 'ignorado').length;
  const pendentes = total - lancados - ignorados;

  const visíveis = transacoes.filter(t => {
    const st = estados[t.id]?.status || 'pendente';
    if (filtro === 'todos') return true;
    return st === filtro;
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>OFX / Extrato Bancário</Title>

      {/* Drop zone */}
      <Card style={{ marginBottom: 20 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) carregarArquivo(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${drag ? '#1677ff' : '#d9d9d9'}`,
            borderRadius: 10, padding: '28px 20px', textAlign: 'center',
            background: drag ? '#e6f4ff' : '#fafafa', cursor: 'pointer',
          }}
        >
          <input ref={fileRef} type="file" accept=".ofx,.OFX" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) carregarArquivo(e.target.files[0]); }} />
          <InboxOutlined style={{ fontSize: 36, color: drag ? '#1677ff' : '#8c8c8c', marginBottom: 8 }} />
          <div><Text strong>Arraste o arquivo .OFX aqui</Text></div>
          <div><Text type="secondary" style={{ fontSize: 12 }}>ou clique para selecionar</Text></div>
          <div style={{ marginTop: 8 }}>
            <Button icon={<UploadOutlined />} size="small">Selecionar arquivo .OFX</Button>
          </div>
        </div>
      </Card>

      {total > 0 && (
        <>
          {/* Stats */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: 'Total importado', val: total, color: undefined },
              { label: 'Pendentes', val: pendentes, color: pendentes > 0 ? '#faad14' : undefined },
              { label: 'Lançados / Baixados', val: lancados, color: '#52c41a' },
              { label: 'Ignorados', val: ignorados, color: '#8c8c8c' },
            ].map(s => (
              <Col xs={12} sm={6} key={s.label}>
                <Card size="small">
                  <Statistic title={s.label} value={s.val}
                    valueStyle={{ color: s.color, fontSize: 22 }} />
                </Card>
              </Col>
            ))}
          </Row>

          {pendentes === 0 && (
            <Alert type="success" showIcon message="Todas as transações foram classificadas!" style={{ marginBottom: 16 }} />
          )}

          {/* Filtros */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
            <Col>
              <Space>
                {(['todos','pendente','lancado','ignorado'] as const).map(f => (
                  <Button key={f} size="small" type={filtro === f ? 'primary' : 'default'} onClick={() => setFiltro(f)}>
                    {f === 'todos' ? `Todos (${total})` : f === 'pendente' ? `Pendentes (${pendentes})` :
                     f === 'lancado' ? `Baixados (${lancados})` : `Ignorados (${ignorados})`}
                  </Button>
                ))}
              </Space>
            </Col>
            <Col>
              <Space>
                {pendentes > 0 && (
                  <Popconfirm title={`Ignorar ${pendentes} pendente(s)?`} onConfirm={ignorarTodosPendentes}>
                    <Button size="small">Ignorar todos os pendentes</Button>
                  </Popconfirm>
                )}
                <Popconfirm title="Limpar todo o extrato?" onConfirm={limparTudo}>
                  <Button size="small" danger>Limpar extrato</Button>
                </Popconfirm>
              </Space>
            </Col>
          </Row>

          {/* Transações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visíveis.map(t => {
              const est = estados[t.id] || {
                status: 'pendente', cat: '', obra: '', lancamentoIds: [],
                descricao: '', clienteId: '', socioId: '', prestadorId: '',
              };
              const lancado  = est.status === 'lancado';
              const ignorado = est.status === 'ignorado';
              const ids = est.lancamentoIds || [];

              const tipoEsp: 'receita' | 'despesa' = est.cat === 'recebimento' ? 'receita' : 'despesa';
              const pendentesObra = est.obra
                ? lancamentosPendentesObra(est.obra, tipoEsp)
                : [];

              const temParcelas = ids.length > 0;
              const lancsFeitos = lancado ? lancamentos.filter(l => l.ofxId === t.id) : [];
              const saldoIds = est.saldoRestanteIds || [];
              const saldosRestantes = lancado && saldoIds.length > 0
                ? lancamentos.filter(l => saldoIds.includes(l.id))
                : [];

              return (
                <Card key={t.id} size="small" style={{ ...corLinha(t), transition: 'all .15s' }}
                  bodyStyle={{ padding: '10px 14px' }}>
                  <Row gutter={[10, 8]} align="middle" wrap>

                    {/* Data + tipo */}
                    <Col xs={12} sm={3} style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {t.data.split('-').reverse().join('/')}
                      </div>
                      <Tag color={t.tipo === 'credito' ? 'blue' : 'red'} style={{ fontSize: 10, marginTop: 2 }}>
                        {t.tipo === 'credito' ? '↑ Crédito' : '↓ Débito'}
                      </Tag>
                    </Col>

                    {/* Valor */}
                    <Col xs={12} sm={2} style={{ textAlign: 'right' }}>
                      <Text strong style={{ color: t.tipo === 'credito' ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>
                        {formatarMoeda(t.valor)}
                      </Text>
                    </Col>

                    {/* Memo */}
                    <Col xs={24} sm={5}>
                      <Tooltip title={titleCase(t.memo)}>
                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                          {titleCase(t.memo)}
                        </Text>
                      </Tooltip>
                    </Col>

                    {!lancado && !ignorado ? (
                      <>
                        {/* ── Modo Dividir ────────────────────────────────── */}
                        {est.splits && est.splits.length > 0 ? (
                          <Col xs={24}>
                            <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '8px 10px' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#874d00', marginBottom: 6 }}>
                                <ScissorOutlined /> Dividir pagamento em {est.splits.length} parte(s)
                              </div>
                              {est.splits.map((sp, idx) => {
                                const obrasOpts = obras.filter(o => o.status !== 'cancelada').map(o => ({ value: o.id, label: o.nome }));
                                const tipoEspSplit: 'receita' | 'despesa' = sp.cat === 'recebimento' ? 'receita' : 'despesa';
                                const parcelasSplit = sp.obra
                                  ? lancamentosPendentesObra(sp.obra, tipoEspSplit)
                                  : [];
                                return (
                                  <div key={sp.id} style={{ display: 'flex', gap: 5, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, color: '#8c8c8c', width: 14 }}>{idx + 1}.</span>
                                    <Select size="small" style={{ width: 130 }} placeholder="Categoria"
                                      value={sp.cat || undefined}
                                      onChange={v => updSplit(t.id, sp.id, { cat: v as CatOFX, lancamentoId: undefined })}
                                      options={CAT_OPTS.filter(c => c.value !== 'ignorar')} />
                                    {sp.cat && sp.cat !== 'distribuicao' && (
                                      <Select size="small" style={{ width: 130 }} placeholder="Obra" allowClear
                                        value={sp.obra || undefined}
                                        onChange={v => updSplit(t.id, sp.id, { obra: v || '', lancamentoId: undefined })}
                                        options={obrasOpts} />
                                    )}
                                    {/* Vincular parcela — quando obra selecionada e categoria compatível */}
                                    {sp.obra && (sp.cat === 'recebimento' || sp.cat === 'mao-de-obra' || sp.cat === 'outros') && (
                                      <Select size="small" style={{ width: 160 }} allowClear
                                        placeholder={<><LinkOutlined /> Parcela (opcional)</>}
                                        value={sp.lancamentoId || undefined}
                                        onChange={v => {
                                          const lanc = lancamentos.find(l => l.id === v);
                                          updSplit(t.id, sp.id, { lancamentoId: v || undefined, valor: lanc ? lanc.valor : sp.valor });
                                        }}
                                        options={parcelasSplit.map(l => ({ value: l.id, label: `${l.descricao} — ${formatarMoeda(l.valor)}` }))}
                                        notFoundContent="Nenhuma parcela pendente"
                                      />
                                    )}
                                    <InputNumber size="small" style={{ width: 110 }} min={0} step={100} precision={2}
                                      prefix="R$" value={sp.valor}
                                      onChange={v => updSplit(t.id, sp.id, { valor: v ?? 0 })} />
                                    {sp.cat === 'recebimento' && !sp.lancamentoId && (
                                      <Select size="small" style={{ width: 120 }} placeholder="Cliente" allowClear
                                        value={sp.clienteId || undefined}
                                        onChange={v => updSplit(t.id, sp.id, { clienteId: v || '' })}
                                        options={clientes.map(c => ({ value: c.id, label: c.nome }))} />
                                    )}
                                    {sp.cat === 'mao-de-obra' && !sp.lancamentoId && (
                                      <Select size="small" style={{ width: 120 }} placeholder="Prestador" allowClear
                                        value={sp.prestadorId || undefined}
                                        onChange={v => updSplit(t.id, sp.id, { prestadorId: v || '' })}
                                        options={prestadores.map(p => ({ value: p.id, label: p.nome }))} />
                                    )}
                                    {sp.cat === 'distribuicao' && (
                                      <Select size="small" style={{ width: 180 }} placeholder="Sócio" allowClear
                                        showSearch optionFilterProp="label"
                                        value={sp.socioId || undefined}
                                        onChange={v => updSplit(t.id, sp.id, { socioId: v || '' })}
                                        options={socios.map(s => ({ value: s.id, label: s.nome }))} />
                                    )}
                                    {!sp.lancamentoId && (
                                      <Input size="small" style={{ flex: 1, minWidth: 100 }} placeholder="Descrição"
                                        value={sp.descricao}
                                        onChange={e => updSplit(t.id, sp.id, { descricao: e.target.value })} />
                                    )}
                                    {est.splits!.length > 1 && (
                                      <Button size="small" danger icon={<DeleteOutlined />}
                                        onClick={() => removeSplit(t.id, sp.id)} />
                                    )}
                                  </div>
                                );
                              })}
                              {/* Resto */}
                              {(() => {
                                const soma = est.splits.reduce((s, sp) => s + sp.valor, 0);
                                const diff = Math.round((t.valor - soma) * 100) / 100;
                                const ok = Math.abs(diff) < 0.01;
                                return (
                                  <div style={{ fontSize: 10, color: ok ? '#52c41a' : '#fa8c16', marginTop: 2, marginBottom: 6 }}>
                                    {ok
                                      ? <><CheckCircleOutlined /> Soma correta — {formatarMoeda(soma)}</>
                                      : diff > 0
                                        ? <><WarningOutlined /> Resta {formatarMoeda(diff)} a distribuir</>
                                        : <><WarningOutlined /> Soma ({formatarMoeda(soma)}) excede o valor OFX ({formatarMoeda(t.valor)})</>
                                    }
                                  </div>
                                );
                              })()}
                              <Space size={6}>
                                <Button size="small" icon={<PlusOutlined />} onClick={() => addSplit(t.id, t.valor)}>
                                  + Parte
                                </Button>
                                <Button size="small" type="primary" icon={<CheckOutlined />}
                                  loading={salvando === t.id} onClick={() => lancar(t)}
                                  style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                                  Lançar {est.splits.length} parte(s)
                                </Button>
                                <Button size="small" onClick={() => cancelarDivisao(t.id)}>
                                  Cancelar divisão
                                </Button>
                              </Space>
                            </div>
                          </Col>
                        ) : (
                          <>
                            {/* Categoria */}
                            <Col xs={12} sm={3}>
                              <Select placeholder="Categoria" value={est.cat || undefined} size="small"
                                style={{ width: '100%' }}
                                onChange={v => upd(t.id, { cat: v as CatOFX, lancamentoIds: [], obra: '' })}
                                options={CAT_OPTS.map(c => ({ value: c.value, label: c.label }))} />
                            </Col>

                            {/* Obra */}
                            {est.cat && est.cat !== 'ignorar' && est.cat !== 'distribuicao' && (
                              <Col xs={12} sm={3}>
                                <Select placeholder="Obra" value={est.obra || undefined} size="small"
                                  style={{ width: '100%' }} allowClear
                                  onChange={v => upd(t.id, { obra: v || '', lancamentoIds: [] })}
                                  options={obras.filter(o => o.status !== 'cancelada')
                                    .map(o => ({ value: o.id, label: o.nome }))} />
                              </Col>
                            )}

                            {/* Vincular parcela(s) — multi-select */}
                            {est.obra && (est.cat === 'recebimento' || est.cat === 'mao-de-obra' || est.cat === 'outros') && (
                              <Col xs={24} sm={6}>
                                <Select
                                  mode="multiple"
                                  size="small"
                                  style={{ width: '100%' }}
                                  placeholder={<><LinkOutlined /> Vincular parcela(s) (opcional)</>}
                                  value={ids}
                                  maxTagCount={2}
                                  onChange={(v) => upd(t.id, { lancamentoIds: v as string[] })}
                                  options={pendentesObra.map(l => ({
                                    value: l.id,
                                    label: `${l.descricao} — ${formatarMoeda(l.valor)}`,
                                  }))}
                                  notFoundContent="Nenhuma parcela pendente"
                                />
                                {resumoDistribuicao(t, ids)}
                              </Col>
                            )}

                            {/* Terceiro (cliente / prestador / sócio) — só sem parcela vinculada */}
                            {est.cat && est.cat !== 'ignorar' && !temParcelas && (
                              <Col xs={12} sm={3}>
                                {renderTerceiroSelect(t)}
                              </Col>
                            )}

                            {/* Descrição livre — sempre visível */}
                            {est.cat && est.cat !== 'ignorar' && (
                              <Col xs={24} sm={4}>
                                <Input size="small"
                                  placeholder={temParcelas ? 'Observação (opcional)' : 'Descrição (opcional)'}
                                  value={est.descricao}
                                  onChange={e => upd(t.id, { descricao: e.target.value })} />
                              </Col>
                            )}

                            {/* Ações */}
                            <Col xs={24} sm={2} style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                              {est.cat === 'ignorar' ? (
                                <Button size="small" icon={<StopOutlined />} onClick={() => ignorar(t)}>
                                  Ignorar
                                </Button>
                              ) : est.cat ? (
                                <>
                                  <Button
                                    size="small" type="primary"
                                    icon={<CheckOutlined />}
                                    loading={salvando === t.id}
                                    onClick={() => lancar(t)}
                                    style={temParcelas ? { background: '#52c41a', borderColor: '#52c41a' } : {}}
                                  >
                                    {temParcelas ? 'Dar baixa' : 'Lançar'}
                                  </Button>
                                  {!temParcelas && (
                                    <Tooltip title="Dividir este pagamento em múltiplos lançamentos">
                                      <Button size="small" icon={<ScissorOutlined />}
                                        onClick={() => iniciarDivisao(t)}>
                                        Dividir
                                      </Button>
                                    </Tooltip>
                                  )}
                                </>
                              ) : (
                                <Button size="small" disabled>Lançar</Button>
                              )}
                            </Col>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <Col flex="auto">
                          {lancado ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: lancsFeitos.length ? 5 : 0 }}>
                                <Badge status="success" />
                                <Text style={{ color: '#52c41a', fontSize: 12, fontWeight: 600 }}>
                                  {lancsFeitos.length > 0
                                    ? `${lancsFeitos.length} lançamento(s) criado(s)`
                                    : 'Lançado'}
                                </Text>
                              </div>
                              {[...lancsFeitos, ...saldosRestantes].map(l => (
                                <div key={l.id} style={{
                                  display: 'flex', gap: 5, alignItems: 'center',
                                  marginBottom: 3, paddingLeft: 16, flexWrap: 'wrap',
                                }}>
                                  <Tag
                                    color={l.tipo === 'receita' ? 'blue' : 'volcano'}
                                    style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}
                                  >
                                    {l.tipo === 'receita' ? 'REC' : 'DESP'}
                                  </Tag>
                                  <Text style={{
                                    fontSize: 11, fontWeight: 700,
                                    color: l.tipo === 'receita' ? '#1677ff' : '#d4380d',
                                  }}>
                                    {formatarMoeda(l.valor)}
                                  </Text>
                                  {l.obraNome && (
                                    <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                      {l.obraNome}
                                    </Tag>
                                  )}
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {titleCase(l.descricao)}
                                    {l.prestadorNome ? ` · ${l.prestadorNome}` : ''}
                                    {l.clienteNome ? ` · ${l.clienteNome}` : ''}
                                    {l.socioNome ? ` · ${l.socioNome}` : ''}
                                  </Text>
                                  {l.status === 'pendente' && (
                                    <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                      saldo pendente
                                    </Tag>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Space>
                              <Badge status="default" />
                              <Text type="secondary" style={{ fontSize: 12 }}>Ignorado</Text>
                            </Space>
                          )}
                        </Col>
                        <Col style={{ flexShrink: 0 }}>
                          <Tooltip title="Desfazer">
                            <Button size="small" icon={<UndoOutlined />} onClick={() => desfazer(t)}>
                              Desfazer
                            </Button>
                          </Tooltip>
                        </Col>
                      </>
                    )}
                  </Row>
                </Card>
              );
            })}

            {visíveis.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
                Nenhuma transação {filtro !== 'todos' ? `com status "${filtro}"` : ''}.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
