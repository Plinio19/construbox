import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Button, Select, Input, Typography,
  message, Tooltip, Popconfirm, Badge, Space, Alert, Modal,
} from 'antd';
import {
  UploadOutlined, CheckOutlined, StopOutlined, UndoOutlined, InboxOutlined,
  LinkOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { usePrestadoresStore } from '../../stores/usePrestadoresStore';
import { useSociosStore } from '../../stores/useSociosStore';
import { formatarMoeda, uid, hoje } from '../../utils';
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

interface EstadoClass {
  status: 'pendente' | 'lancado' | 'ignorado';
  cat: CatOFX;
  obra: string;
  lancamentoId: string;  // ID do lançamento existente a dar baixa ('' = criar novo)
  descricao: string;
  clienteId: string;
  socioId: string;
  prestadorId: string;
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
): { lanc: Lancamento; fuzzy: boolean } | null {
  const byId = lancamentos.find(l => l.ofxId === t.id);
  if (byId) return { lanc: byId, fuzzy: false };
  const fuzzy = lancamentos.find(l => {
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
    status: fuzzy ? 'ignorado' : 'lancado',
    cat: lanc.tipo === 'receita' ? 'recebimento' : lanc.categoria === 'mao-de-obra' ? 'mao-de-obra' : 'outros',
    obra: lanc.obraId || '',
    lancamentoId: lanc.id,
    descricao: lanc.descricao,
    clienteId: lanc.clienteId || '',
    socioId: lanc.socioId || '',
    prestadorId: lanc.prestadorId || '',
  };
}

function estadoInicial(t: OFXTransacao, lancamentos: Lancamento[]): EstadoClass {
  const resultado = findLancByTransacao(t, lancamentos);
  if (resultado) return estadoDeMatch(resultado.lanc, resultado.fuzzy);
  return {
    status: 'pendente', cat: sugerirCategoria(t),
    obra: '', lancamentoId: '', descricao: '', clienteId: '', socioId: '', prestadorId: '',
  };
}

export default function OFXPage() {
  const { lancamentos, upsert: upsertLanc, remove: removeLanc } = useLancamentosStore();
  const { obras, fetch: fetchObras }       = useObrasStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();
  const { prestadores, fetch: fetchPrest } = usePrestadoresStore();
  const { socios, fetch: fetchSocios }     = useSociosStore();

  const [transacoes, setTransacoes] = useState<OFXTransacao[]>([]);
  const [estados, setEstados]       = useState<Record<string, EstadoClass>>({});
  const [drag, setDrag]             = useState(false);
  const [filtro, setFiltro]         = useState<'todos' | 'pendente' | 'lancado' | 'ignorado'>('todos');
  const [salvando, setSalvando]     = useState<string | null>(null);
  const [modalParcial, setModalParcial] = useState<{ t: OFXTransacao; lanc: Lancamento } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchObras(); fetchClientes(); fetchPrest(); fetchSocios(); }, []);

  useEffect(() => {
    try {
      const raw: OFXTransacao[] = JSON.parse(localStorage.getItem(LS_EXTRATO) || '[]');
      setTransacoes(raw);
    } catch { setTransacoes([]); }
  }, []);

  useEffect(() => {
    if (!transacoes.length) return;
    const salvo: Record<string, EstadoClass> = (() => {
      try { return JSON.parse(localStorage.getItem(LS_ESTADO) || '{}'); } catch { return {}; }
    })();
    const novo: Record<string, EstadoClass> = {};
    transacoes.forEach(t => {
      const resultado = findLancByTransacao(t, lancamentos);
      if (resultado) {
        novo[t.id] = estadoDeMatch(resultado.lanc, resultado.fuzzy);
      } else if (salvo[t.id]) {
        novo[t.id] = salvo[t.id];
      } else {
        novo[t.id] = estadoInicial(t, lancamentos);
      }
    });
    setEstados(novo);
  }, [transacoes, lancamentos]);

  const salvarEstados = useCallback((prox: Record<string, EstadoClass>) => {
    localStorage.setItem(LS_ESTADO, JSON.stringify(prox));
    setEstados(prox);
  }, []);

  function carregarArquivo(file: File) {
    if (!file.name.toLowerCase().endsWith('.ofx')) {
      message.error('Selecione um arquivo .ofx'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
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
    };
    reader.readAsText(file, 'ISO-8859-1');
  }

  function upd(id: string, patch: Partial<EstadoClass>) {
    const prox = { ...estados, [id]: { ...estados[id], ...patch } };
    salvarEstados(prox);
  }

  /* ── Dar baixa / Lançar ─────────────────────────────────────────────────── */
  async function lancar(t: OFXTransacao, forcarNovo = false) {
    const est = estados[t.id];
    if (!est || !est.cat || est.cat === 'ignorar') return;
    setSalvando(t.id);
    try {
      // Se tem lançamento vinculado e não é "criar novo" → dar baixa no existente
      if (est.lancamentoId && !forcarNovo) {
        const lancExistente = lancamentos.find(l => l.id === est.lancamentoId);
        if (lancExistente) {
          const diffValor = Math.abs(lancExistente.valor - t.valor);
          // Valor diverge mais de R$0,01 → perguntar antes
          if (diffValor > 0.01) {
            setModalParcial({ t, lanc: lancExistente });
            setSalvando(null);
            return;
          }
          // Baixa exata
          await darBaixaLancamento(lancExistente, t, t.valor);
          upd(t.id, { status: 'lancado' });
          message.success('Baixa dada! Parcela marcada como paga.');
          setSalvando(null);
          return;
        }
      }

      // Criar lançamento novo (sem vínculo com parcela ou forcarNovo)
      const tipo: Lancamento['tipo'] = est.cat === 'recebimento' ? 'receita' : 'despesa';
      const obra   = obras.find(o => o.id === est.obra);
      const cliente = clientes.find(c => c.id === est.clienteId);
      const prest   = prestadores.find(p => p.id === est.prestadorId);
      const socio   = socios.find(s => s.id === est.socioId);
      const catMap: Record<string, string> = {
        recebimento: 'adiantamento', 'mao-de-obra': 'mao-de-obra',
        distribuicao: 'distribuicao', reembolso: 'reembolso', outros: 'outros',
      };
      const descFinal = est.descricao || (t.memo || '').replace(/Transferência (recebida|enviada) pelo Pix - /i, '').slice(0, 80);
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

  async function darBaixaLancamento(lanc: Lancamento, t: OFXTransacao, valorPago: number) {
    await upsertLanc({
      ...lanc,
      status: 'pago',
      pagamento: t.data,
      valor: valorPago,  // usa valor real pago (pode ser parcial)
      ofxId: t.id,
      conciliado: true,
      obs: t.memo,
    });
  }

  // Confirmação de baixa parcial: paga o valor do banco, deixa saldo na parcela original
  async function confirmarBaixaParcial(t: OFXTransacao, lanc: Lancamento) {
    setSalvando(t.id);
    try {
      const saldo = lanc.valor - t.valor;
      // Atualiza lancamento original: paga valor do banco
      await upsertLanc({
        ...lanc, status: 'pago', pagamento: t.data,
        valor: t.valor, ofxId: t.id, conciliado: true, obs: t.memo,
      });
      // Cria lançamento residual com o saldo
      if (saldo > 0.01) {
        await upsertLanc({
          id: uid(), tipo: lanc.tipo,
          descricao: `${lanc.descricao} — saldo restante`,
          valor: saldo, vencimento: lanc.vencimento, status: 'pendente',
          obraId: lanc.obraId, obraNome: lanc.obraNome,
          clienteId: lanc.clienteId, clienteNome: lanc.clienteNome,
          prestadorId: lanc.prestadorId, prestadorNome: lanc.prestadorNome,
          categoria: lanc.categoria, criadoEm: hoje(),
        });
        message.success(`Baixa parcial de ${formatarMoeda(t.valor)}. Saldo de ${formatarMoeda(saldo)} mantido como pendente.`);
      } else {
        message.success('Baixa dada com sucesso!');
      }
      upd(t.id, { status: 'lancado' });
    } catch { message.error('Erro ao dar baixa parcial.'); }
    setSalvando(null);
    setModalParcial(null);
  }

  // Baixa excedente: valor do banco é maior que a parcela → paga a parcela e cria adiantamento
  async function confirmarBaixaExcedente(t: OFXTransacao, lanc: Lancamento) {
    setSalvando(t.id);
    try {
      const excedente = t.valor - lanc.valor;
      await upsertLanc({
        ...lanc, status: 'pago', pagamento: t.data, ofxId: t.id, conciliado: true, obs: t.memo,
      });
      if (excedente > 0.01) {
        await upsertLanc({
          id: uid(), tipo: lanc.tipo,
          descricao: `Adiantamento/excedente — ${lanc.obraNome || 'sem obra'}`,
          valor: excedente, vencimento: t.data, pagamento: t.data, status: 'pago',
          obraId: lanc.obraId, obraNome: lanc.obraNome,
          clienteId: lanc.clienteId, clienteNome: lanc.clienteNome,
          categoria: 'adiantamento', ofxId: t.id, conciliado: true,
          obs: `Excedente do pagamento de ${formatarMoeda(lanc.valor)}`, criadoEm: hoje(),
        });
        message.success(`Parcela paga. Excedente de ${formatarMoeda(excedente)} lançado como adiantamento.`);
      } else {
        message.success('Baixa dada!');
      }
      upd(t.id, { status: 'lancado' });
    } catch { message.error('Erro.'); }
    setSalvando(null);
    setModalParcial(null);
  }

  async function ignorar(t: OFXTransacao) { upd(t.id, { status: 'ignorado' }); }

  async function desfazer(t: OFXTransacao) {
    const lanc = lancamentos.find(l => l.ofxId === t.id);
    if (lanc) {
      try { await removeLanc(lanc.id); } catch { message.error('Erro ao remover lançamento.'); return; }
    }
    upd(t.id, { status: 'pendente', lancamentoId: '' });
  }

  function limparTudo() {
    localStorage.removeItem(LS_EXTRATO);
    localStorage.removeItem(LS_ESTADO);
    setTransacoes([]);
    setEstados({});
    message.success('Extrato limpo.');
  }

  function ignorarTodosPendentes() {
    const prox = { ...estados };
    let count = 0;
    transacoes.forEach(t => {
      if ((prox[t.id]?.status || 'pendente') === 'pendente') {
        prox[t.id] = { ...prox[t.id] ?? estadoInicial(t, lancamentos), status: 'ignorado' };
        count++;
      }
    });
    salvarEstados(prox);
    message.success(`${count} transação(ões) ignorada(s).`);
  }

  /* ── Helpers de seleção ───────────────────────────────────────────────────── */

  // Lançamentos pendentes da obra para vincular (parcelas a receber ou a pagar)
  function lancamentosPendentesObra(obraId: string, tipo: 'receita' | 'despesa') {
    return lancamentos.filter(l =>
      l.obraId === obraId &&
      l.tipo === tipo &&
      (l.status === 'pendente' || l.status === 'parcial'),
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
        style={{ width: 150 }} onChange={v => upd(t.id, { socioId: v || '' })}
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
              const est = estados[t.id] || { status: 'pendente', cat: '', obra: '', lancamentoId: '', descricao: '', clienteId: '', socioId: '', prestadorId: '' };
              const lancado  = est.status === 'lancado';
              const ignorado = est.status === 'ignorado';

              // Parcelas pendentes da obra selecionada
              const tipoEsp: 'receita' | 'despesa' = est.cat === 'recebimento' ? 'receita' : 'despesa';
              const pendentesObra = est.obra
                ? lancamentosPendentesObra(est.obra, tipoEsp)
                : [];

              // Detecta divergência de valor com lançamento vinculado
              const lancVinculado = est.lancamentoId
                ? lancamentos.find(l => l.id === est.lancamentoId)
                : null;
              const divergeValor = lancVinculado
                ? Math.abs(lancVinculado.valor - t.valor) > 0.01
                : false;

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
                      <Tooltip title={t.memo}>
                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                          {t.memo}
                        </Text>
                      </Tooltip>
                    </Col>

                    {!lancado && !ignorado ? (
                      <>
                        {/* Categoria */}
                        <Col xs={12} sm={4}>
                          <Select placeholder="Categoria" value={est.cat || undefined} size="small"
                            style={{ width: '100%' }}
                            onChange={v => upd(t.id, { cat: v as CatOFX, lancamentoId: '', obra: '' })}
                            options={CAT_OPTS.map(c => ({ value: c.value, label: c.label }))} />
                        </Col>

                        {/* Obra */}
                        {est.cat && est.cat !== 'ignorar' && est.cat !== 'distribuicao' && (
                          <Col xs={12} sm={4}>
                            <Select placeholder="Obra" value={est.obra || undefined} size="small"
                              style={{ width: '100%' }} allowClear
                              onChange={v => upd(t.id, { obra: v || '', lancamentoId: '' })}
                              options={obras.filter(o => o.status !== 'cancelada')
                                .map(o => ({ value: o.id, label: o.nome }))} />
                          </Col>
                        )}

                        {/* Vincular parcela / lançamento existente */}
                        {est.obra && (est.cat === 'recebimento' || est.cat === 'mao-de-obra' || est.cat === 'outros') && (
                          <Col xs={24} sm={5}>
                            <Select
                              size="small"
                              style={{ width: '100%' }}
                              placeholder={<><LinkOutlined /> Vincular parcela (opcional)</>}
                              value={est.lancamentoId || undefined}
                              allowClear
                              onChange={v => upd(t.id, { lancamentoId: v || '' })}
                              optionLabelProp="label"
                              options={[
                                ...pendentesObra.map(l => ({
                                  value: l.id,
                                  label: `${l.descricao} — ${formatarMoeda(l.valor)}`,
                                  title: `Venc: ${l.vencimento} | ${formatarMoeda(l.valor)}`,
                                })),
                                ...(pendentesObra.length === 0 ? [{ value: '_novo', label: 'Nenhuma parcela pendente', disabled: true, title: '' }] : []),
                              ]}
                            />
                            {divergeValor && lancVinculado && (
                              <div style={{ fontSize: 10, color: '#fa8c16', marginTop: 2 }}>
                                <WarningOutlined /> Parcela: {formatarMoeda(lancVinculado.valor)} · Banco: {formatarMoeda(t.valor)}
                              </div>
                            )}
                          </Col>
                        )}

                        {/* Terceiro (cliente / prestador / sócio) */}
                        {est.cat && est.cat !== 'ignorar' && !est.lancamentoId && (
                          <Col xs={12} sm={3}>
                            {renderTerceiroSelect(t)}
                          </Col>
                        )}

                        {/* Descrição livre (só se não vinculou parcela) */}
                        {est.cat && est.cat !== 'ignorar' && !est.lancamentoId && (
                          <Col xs={24} sm={4}>
                            <Input size="small" placeholder="Descrição (opcional)"
                              value={est.descricao}
                              onChange={e => upd(t.id, { descricao: e.target.value })} />
                          </Col>
                        )}

                        {/* Ação */}
                        <Col xs={24} sm={3} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {est.cat === 'ignorar' ? (
                            <Button size="small" icon={<StopOutlined />} onClick={() => ignorar(t)}>
                              Ignorar
                            </Button>
                          ) : est.cat ? (
                            <Button
                              size="small" type="primary"
                              icon={est.lancamentoId ? <CheckOutlined /> : <CheckOutlined />}
                              loading={salvando === t.id}
                              onClick={() => lancar(t)}
                              style={est.lancamentoId ? { background: '#52c41a', borderColor: '#52c41a' } : {}}
                            >
                              {est.lancamentoId ? 'Dar baixa' : 'Lançar'}
                            </Button>
                          ) : (
                            <Button size="small" disabled>Lançar</Button>
                          )}
                        </Col>
                      </>
                    ) : (
                      <>
                        <Col flex="auto">
                          {lancado ? (
                            <Space>
                              <Badge status="success" />
                              <Text style={{ color: '#52c41a', fontSize: 12 }}>
                                {est.lancamentoId ? 'Baixa dada' : 'Lançado'}
                                {est.obra && obras.find(o => o.id === est.obra)
                                  ? ` — ${obras.find(o => o.id === est.obra)!.nome}` : ''}
                              </Text>
                            </Space>
                          ) : (
                            <Space>
                              <Badge status="default" />
                              <Text type="secondary" style={{ fontSize: 12 }}>Ignorado</Text>
                            </Space>
                          )}
                        </Col>
                        <Col>
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

      {/* Modal baixa parcial / excedente */}
      {modalParcial && (() => {
        const { t, lanc } = modalParcial;
        const parcela = formatarMoeda(lanc.valor);
        const banco   = formatarMoeda(t.valor);
        const isParcial = t.valor < lanc.valor;
        return (
          <Modal
            open
            title={<><WarningOutlined style={{ color: '#fa8c16' }} /> Valor divergente</>}
            onCancel={() => setModalParcial(null)}
            footer={null}
            width={480}
          >
            <div style={{ padding: '12px 0' }}>
              <p>
                A <strong>parcela</strong> é de <strong>{parcela}</strong>, mas o banco registrou <strong>{banco}</strong>.
              </p>
              {isParcial ? (
                <>
                  <p>O pagamento foi <strong>parcial</strong>. O saldo de <strong>{formatarMoeda(lanc.valor - t.valor)}</strong> ficará como pendente.</p>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button type="primary" block loading={salvando === t.id}
                      onClick={() => confirmarBaixaParcial(t, lanc)}>
                      Dar baixa parcial ({banco}) e manter saldo pendente
                    </Button>
                    <Button block onClick={() => setModalParcial(null)}>Cancelar</Button>
                  </Space>
                </>
              ) : (
                <>
                  <p>O pagamento foi <strong>maior</strong> que a parcela. O excedente de <strong>{formatarMoeda(t.valor - lanc.valor)}</strong> será lançado como adiantamento.</p>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button type="primary" block loading={salvando === t.id}
                      onClick={() => confirmarBaixaExcedente(t, lanc)}>
                      Dar baixa na parcela + lançar adiantamento
                    </Button>
                    <Button block onClick={() => setModalParcial(null)}>Cancelar</Button>
                  </Space>
                </>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
