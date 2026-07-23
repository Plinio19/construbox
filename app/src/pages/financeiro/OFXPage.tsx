import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Button, Select, Input, Typography,
  message, Tooltip, Popconfirm, Badge, Space, Alert,
} from 'antd';
import {
  UploadOutlined, CheckOutlined, StopOutlined, UndoOutlined, InboxOutlined,
} from '@ant-design/icons';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { usePrestadoresStore } from '../../stores/usePrestadoresStore';
import { useSociosStore } from '../../stores/useSociosStore';
import { formatarMoeda, uid, hoje } from '../../utils';
import type { Lancamento } from '../../types';

const { Title, Text } = Typography;

/* ── Tipos ── */
interface OFXTransacao {
  id: string;       // FITID
  data: string;     // YYYY-MM-DD
  valor: number;
  tipo: 'credito' | 'debito';
  memo: string;
}

type CatOFX = 'recebimento' | 'mao-de-obra' | 'distribuicao' | 'reembolso' | 'outros' | 'ignorar' | '';

interface EstadoClass {
  status: 'pendente' | 'lancado' | 'ignorado';
  cat: CatOFX;
  obra: string;
  descricao: string;
  clienteId: string;
  socioId: string;
  prestadorId: string;
}

const LS_EXTRATO = 'cbx_extrato';
const LS_ESTADO  = 'cbx_extrato_estado_v2';

const CAT_OPTS: { value: CatOFX; label: string; color: string }[] = [
  { value: 'recebimento',  label: 'Recebimento',      color: 'green'  },
  { value: 'mao-de-obra',  label: 'Mão de Obra',      color: 'orange' },
  { value: 'distribuicao', label: 'Dist. de Lucro',   color: 'purple' },
  { value: 'reembolso',    label: 'Reembolso',        color: 'cyan'   },
  { value: 'outros',       label: 'Outros',           color: 'default'},
  { value: 'ignorar',      label: 'Ignorar',          color: 'error'  },
];

/* ── Parser OFX ── */
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

/* ── Sugestão automática de categoria ── */
function sugerirCategoria(t: OFXTransacao): CatOFX {
  const m = (t.memo || '').toUpperCase();
  if (t.tipo === 'credito') {
    if (m.includes('HOTEL IN BOX') || m.includes('HOTEL INBOX') || m.includes('CONSTRUBOX')) return 'recebimento';
    if (m.includes('RDB') || m.includes('RENDIMENTO')) return 'ignorar';
    return 'recebimento';
  }
  if (m.includes('RDB') || m.includes('RENDIMENTO')) return 'ignorar';
  if (m.includes('SALARIO') || m.includes('SALÁRIO') || m.includes('FOLHA')) return 'mao-de-obra';
  if (m.includes('PIX ENVIADO')) return 'outros';
  return 'outros';
}

/* Extrai a data mais relevante de um lançamento, suportando campos do sistema
   antigo (data, dataPagamento, dataVencimento) e do React (vencimento, pagamento) */
function dataDoLancamento(l: Lancamento): string {
  const la = l as unknown as Record<string, string>;
  return l.pagamento || la['dataPagamento'] || la['data'] || l.vencimento || la['dataVencimento'] || '';
}

/* Busca lançamento correspondente.
   Retorna { lanc, fuzzy: false } para match exato (ofxId) ou { lanc, fuzzy: true }
   para match aproximado por data+valor+tipo (fallback para sistema antigo). */
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
    // match exato → lancado; match fuzzy → ignorado (já existe no sistema antigo)
    status: fuzzy ? 'ignorado' : 'lancado',
    cat: lanc.tipo === 'receita' ? 'recebimento' : lanc.categoria === 'mao-de-obra' ? 'mao-de-obra' : 'outros',
    obra: lanc.obraId || '',
    descricao: lanc.descricao,
    clienteId: lanc.clienteId || '',
    socioId: lanc.socioId || '',
    prestadorId: lanc.prestadorId || '',
  };
}

function estadoInicial(t: OFXTransacao, lancamentos: Lancamento[]): EstadoClass {
  const resultado = findLancByTransacao(t, lancamentos);
  if (resultado) return estadoDeMatch(resultado.lanc, resultado.fuzzy);
  const catSug = sugerirCategoria(t);
  return { status: 'pendente', cat: catSug, obra: '', descricao: '', clienteId: '', socioId: '', prestadorId: '' };
}

/* ── Componente principal ── */
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchObras(); fetchClientes(); fetchPrest(); fetchSocios(); }, []);

  // Carrega transações do localStorage
  useEffect(() => {
    try {
      const raw: OFXTransacao[] = JSON.parse(localStorage.getItem(LS_EXTRATO) || '[]');
      setTransacoes(raw);
    } catch { setTransacoes([]); }
  }, []);

  // Reconstrói estado: verifica lançamento real antes do estado salvo
  useEffect(() => {
    if (!transacoes.length) return;
    const salvo: Record<string, EstadoClass> = (() => {
      try { return JSON.parse(localStorage.getItem(LS_ESTADO) || '{}'); } catch { return {}; }
    })();
    const novo: Record<string, EstadoClass> = {};
    transacoes.forEach(t => {
      const resultado = findLancByTransacao(t, lancamentos);
      if (resultado) {
        // Lançamento real encontrado (exato ou fuzzy) → determina status pelo tipo de match
        novo[t.id] = estadoDeMatch(resultado.lanc, resultado.fuzzy);
      } else if (salvo[t.id]) {
        // Sem lançamento mas tem estado salvo → usa o salvo
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

  /* ── Importar OFX ── */
  function carregarArquivo(file: File) {
    if (!file.name.toLowerCase().endsWith('.ofx')) {
      message.error('Selecione um arquivo .ofx'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      const novas = parseOFX(content);
      if (!novas.length) { message.warning('Nenhuma transação encontrada no arquivo.'); return; }

      // Mescla com existentes (sem duplicatas por id/fitid)
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
    reader.readAsText(file, 'ISO-8859-1'); // bancos brasileiros usam ISO-8859-1
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) carregarArquivo(file);
  }

  /* ── Atualizar estado de uma transação ── */
  function upd(id: string, patch: Partial<EstadoClass>) {
    const prox = { ...estados, [id]: { ...estados[id], ...patch } };
    salvarEstados(prox);
  }

  /* ── Lançar como lançamento ── */
  async function lancar(t: OFXTransacao) {
    const est = estados[t.id];
    if (!est || !est.cat || est.cat === 'ignorar') return;
    setSalvando(t.id);
    try {
      const tipo: Lancamento['tipo'] = est.cat === 'recebimento' ? 'receita' : 'despesa';
      const obra = obras.find(o => o.id === est.obra);
      const cliente = clientes.find(c => c.id === est.clienteId);
      const prest = prestadores.find(p => p.id === est.prestadorId);
      const socio = socios.find(s => s.id === est.socioId);
      const catMap: Record<string, string> = {
        recebimento: 'adiantamento', 'mao-de-obra': 'mao-de-obra',
        distribuicao: 'distribuicao', reembolso: 'reembolso', outros: 'outros',
      };
      const descFinal = est.descricao || (t.memo || '').replace(/Transferência (recebida|enviada) pelo Pix - /i, '').slice(0, 80);
      const lanc: Lancamento = {
        id: uid(),
        tipo,
        descricao: descFinal,
        valor: t.valor,
        vencimento: t.data,
        pagamento: t.data,
        status: 'pago',
        obraId:       obra?.id        || undefined,
        obraNome:     obra?.nome      || undefined,
        clienteId:    cliente?.id     || undefined,
        clienteNome:  cliente?.nome   || undefined,
        prestadorId:  prest?.id       || undefined,
        prestadorNome: prest?.nome    || undefined,
        socioId:      socio?.id       || undefined,
        socioNome:    socio?.nome     || undefined,
        categoria:    catMap[est.cat] || 'outros',
        ofxId:        t.id,
        conciliado:   true,
        obs:          t.memo,
        criadoEm:     hoje(),
      };
      await upsertLanc(lanc);
      upd(t.id, { status: 'lancado' });
      message.success('Lançado com sucesso!');
    } catch { message.error('Erro ao lançar.'); }
    setSalvando(null);
  }

  async function ignorar(t: OFXTransacao) {
    upd(t.id, { status: 'ignorado' });
  }

  async function desfazer(t: OFXTransacao) {
    const lanc = lancamentos.find(l => l.ofxId === t.id);
    if (lanc) {
      try { await removeLanc(lanc.id); } catch { message.error('Erro ao remover lançamento.'); return; }
    }
    upd(t.id, { status: 'pendente' });
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
    message.success(`${count} transação(ões) marcada(s) como ignorada.`);
  }

  /* ── Filtro e stats ── */
  const total     = transacoes.length;
  const lancados  = transacoes.filter(t => estados[t.id]?.status === 'lancado').length;
  const ignorados = transacoes.filter(t => estados[t.id]?.status === 'ignorado').length;
  const pendentes = total - lancados - ignorados;

  const visíveis = transacoes.filter(t => {
    const st = estados[t.id]?.status || 'pendente';
    if (filtro === 'todos') return true;
    return st === filtro;
  });

  /* ── Render campo dinâmico (cliente/sócio/prestador) ── */
  function renderTerceiroSelect(t: OFXTransacao) {
    const est = estados[t.id];
    if (!est) return null;
    if (est.cat === 'recebimento') return (
      <Select placeholder="Cliente" value={est.clienteId || undefined} size="small" allowClear
        style={{ width: 160 }} onChange={v => upd(t.id, { clienteId: v || '' })}
        options={clientes.map(c => ({ value: c.id, label: c.nome }))} />
    );
    if (est.cat === 'mao-de-obra') return (
      <Select placeholder="Prestador" value={est.prestadorId || undefined} size="small" allowClear
        style={{ width: 160 }} onChange={v => upd(t.id, { prestadorId: v || '' })}
        options={prestadores.map(p => ({ value: p.id, label: p.nome }))} />
    );
    if (est.cat === 'distribuicao') return (
      <Select placeholder="Sócio" value={est.socioId || undefined} size="small" allowClear
        style={{ width: 160 }} onChange={v => upd(t.id, { socioId: v || '' })}
        options={socios.map(s => ({ value: s.id, label: s.nome }))} />
    );
    return null;
  }

  /* ── Cor da linha por status ── */
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

      {/* ── Drop zone ── */}
      <Card style={{ marginBottom: 20 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${drag ? '#1677ff' : '#d9d9d9'}`,
            borderRadius: 10, padding: '28px 20px', textAlign: 'center',
            background: drag ? '#e6f4ff' : '#fafafa', cursor: 'pointer',
            transition: 'all .2s',
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
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Compatível com Nubank, Inter, Bradesco, BB, Itaú e demais (ISO-8859-1 e UTF-8)
            </Text>
          </div>
        </div>
      </Card>

      {/* ── Stats ── */}
      {total > 0 && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Total importado" value={total} valueStyle={{ fontSize: 22 }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Pendentes" value={pendentes}
                  valueStyle={{ color: pendentes > 0 ? '#faad14' : undefined, fontSize: 22 }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Lançados" value={lancados} valueStyle={{ color: '#52c41a', fontSize: 22 }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="Ignorados" value={ignorados} valueStyle={{ color: '#8c8c8c', fontSize: 22 }} />
              </Card>
            </Col>
          </Row>

          {pendentes === 0 && lancados + ignorados === total && (
            <Alert type="success" showIcon message="Todas as transações foram classificadas!" style={{ marginBottom: 16 }} />
          )}

          {/* Filtros */}
          <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
            <Col>
              <Space>
                {(['todos','pendente','lancado','ignorado'] as const).map(f => (
                  <Button key={f} size="small" type={filtro === f ? 'primary' : 'default'}
                    onClick={() => setFiltro(f)}>
                    {f === 'todos' ? `Todos (${total})` : f === 'pendente' ? `Pendentes (${pendentes})` :
                     f === 'lancado' ? `Lançados (${lancados})` : `Ignorados (${ignorados})`}
                  </Button>
                ))}
              </Space>
            </Col>
            <Col>
              <Space>
                {pendentes > 0 && (
                  <Popconfirm
                    title={`Marcar ${pendentes} transação(ões) pendente(s) como Ignorar?`}
                    description="Use para transações já lançadas no sistema antigo."
                    onConfirm={ignorarTodosPendentes}
                  >
                    <Button size="small">Ignorar todos os pendentes</Button>
                  </Popconfirm>
                )}
                <Popconfirm title="Limpar todo o extrato importado?" onConfirm={limparTudo}>
                  <Button size="small" danger>Limpar extrato</Button>
                </Popconfirm>
              </Space>
            </Col>
          </Row>

          {/* ── Linhas de transação ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visíveis.map(t => {
              const est = estados[t.id] || { status: 'pendente', cat: '', obra: '', descricao: '', clienteId: '', socioId: '', prestadorId: '' };
              const catInfo = CAT_OPTS.find(c => c.value === est.cat);
              const lancado = est.status === 'lancado';
              const ignorado = est.status === 'ignorado';

              return (
                <Card key={t.id} size="small" style={{ ...corLinha(t), transition: 'all .15s' }}
                  bodyStyle={{ padding: '10px 14px' }}>
                  <Row gutter={[10, 8]} align="middle" wrap>

                    {/* Data + tipo */}
                    <Col xs={12} sm={4} md={3} style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {t.data.split('-').reverse().join('/')}
                      </div>
                      <Tag color={t.tipo === 'credito' ? 'blue' : 'red'} style={{ fontSize: 10, marginTop: 2 }}>
                        {t.tipo === 'credito' ? '↑ Crédito' : '↓ Débito'}
                      </Tag>
                    </Col>

                    {/* Valor */}
                    <Col xs={12} sm={3} md={2} style={{ textAlign: 'right' }}>
                      <Text strong style={{ color: t.tipo === 'credito' ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>
                        {formatarMoeda(t.valor)}
                      </Text>
                    </Col>

                    {/* Memo */}
                    <Col xs={24} sm={8} md={6}>
                      <Tooltip title={t.memo}>
                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                          {t.memo}
                        </Text>
                      </Tooltip>
                    </Col>

                    {/* Classificação (desabilitada se lancado/ignorado) */}
                    {!lancado && !ignorado ? (
                      <>
                        {/* Categoria */}
                        <Col xs={12} sm={6} md={4}>
                          <Select
                            placeholder="Categoria"
                            value={est.cat || undefined}
                            size="small"
                            style={{ width: '100%' }}
                            onChange={v => upd(t.id, { cat: v as CatOFX })}
                            options={CAT_OPTS.map(c => ({ value: c.value, label: c.label }))}
                          />
                        </Col>

                        {/* Obra */}
                        {est.cat && est.cat !== 'ignorar' && est.cat !== 'distribuicao' && (
                          <Col xs={12} sm={6} md={4}>
                            <Select placeholder="Obra" value={est.obra || undefined} size="small"
                              style={{ width: '100%' }} allowClear onChange={v => upd(t.id, { obra: v || '' })}
                              options={obras.filter(o => o.status !== 'cancelada')
                                .map(o => ({ value: o.id, label: o.nome }))} />
                          </Col>
                        )}

                        {/* Terceiro */}
                        {est.cat && est.cat !== 'ignorar' && (
                          <Col xs={12} sm={6} md={4}>
                            {renderTerceiroSelect(t)}
                          </Col>
                        )}

                        {/* Descrição */}
                        {est.cat && est.cat !== 'ignorar' && (
                          <Col xs={24} sm={8} md={5}>
                            <Input size="small" placeholder="Descrição (opcional)"
                              value={est.descricao}
                              onChange={e => upd(t.id, { descricao: e.target.value })} />
                          </Col>
                        )}

                        {/* Ações */}
                        <Col xs={24} sm={6} md={3} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {est.cat === 'ignorar' ? (
                            <Button size="small" icon={<StopOutlined />} onClick={() => ignorar(t)}>
                              Ignorar
                            </Button>
                          ) : est.cat ? (
                            <Button size="small" type="primary" icon={<CheckOutlined />}
                              loading={salvando === t.id} onClick={() => lancar(t)}>
                              Lançar
                            </Button>
                          ) : (
                            <Button size="small" disabled>Lançar</Button>
                          )}
                        </Col>
                      </>
                    ) : (
                      <>
                        {/* Status badge */}
                        <Col flex="auto">
                          {lancado ? (
                            <Space>
                              <Badge status="success" />
                              <Text style={{ color: '#52c41a', fontSize: 12 }}>
                                Lançado{catInfo ? ` como ${catInfo.label}` : ''}
                                {est.obra && obras.find(o => o.id === est.obra) ? ` — ${obras.find(o => o.id === est.obra)!.nome}` : ''}
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
    </div>
  );
}
