import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Progress,
  Space, Tag, Tabs, Divider, Select,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useObrasStore } from '../../stores/useObrasStore';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { ObraStatusTag } from '../../components/common/StatusTag';
import type { Obra } from '../../types';
import { formatarMoeda, formatarData } from '../../utils';

const { Title, Text } = Typography;

function progressoObra(obraId: string, etapas: ReturnType<typeof useEtapasStore.getState>['etapas']): number {
  const et = etapas.filter(e => e.obraId === obraId);
  if (!et.length) return 0;
  const total = et.reduce((s, e) => s + (e.peso || 1), 0);
  const feito = et.reduce((s, e) => {
    const p = e.status === 'concluida' ? (e.peso || 1) : ((e.percentualExecutado || 0) / 100) * (e.peso || 1);
    return s + p;
  }, 0);
  return Math.round((feito / total) * 100);
}

function DRELinha({
  label, valor, cor, destaque, indent, separador,
}: {
  label?: string; valor?: number; cor?: string; destaque?: boolean; indent?: boolean; separador?: boolean;
}) {
  if (separador) return <Divider style={{ margin: '6px 0' }} />;
  const v = valor ?? 0;
  return (
    <Row justify="space-between" align="middle" style={{
      padding: `${destaque ? 8 : 5}px ${indent ? 24 : 0}px`,
      background: destaque ? '#fafafa' : 'transparent',
      borderRadius: destaque ? 6 : 0,
      fontWeight: destaque ? 700 : 400,
    }}>
      <Col>
        <Text style={{ fontSize: destaque ? 14 : 13, color: indent ? '#595959' : undefined }}>
          {label}
        </Text>
      </Col>
      <Col>
        <Text style={{ fontSize: destaque ? 14 : 13, color: cor || (v < 0 ? '#ff4d4f' : undefined) }}>
          {formatarMoeda(v)}
        </Text>
      </Col>
    </Row>
  );
}

interface DRESection {
  titulo: string;
  sinal: '+' | '-' | '=';
  itens: { label: string; valor: number; cor?: string }[];
  total: number;
  corTotal?: string;
}

function SecaoDRE({ s }: { s: DRESection }) {
  const sinColor = s.sinal === '+' ? '#52c41a' : s.sinal === '-' ? '#ff4d4f' : '#1677ff';
  return (
    <div style={{ marginBottom: 16 }}>
      <Row align="middle" style={{ marginBottom: 6 }}>
        <Col>
          <Tag color={s.sinal === '+' ? 'green' : s.sinal === '-' ? 'red' : 'blue'}
            style={{ fontWeight: 700, fontSize: 11 }}>
            {s.sinal === '+' ? <ArrowUpOutlined /> : s.sinal === '-' ? <ArrowDownOutlined /> : <MinusOutlined />}
            {' '}{s.titulo}
          </Tag>
        </Col>
      </Row>
      {s.itens.map((item, i) => (
        <DRELinha key={i} label={item.label} valor={item.valor} indent cor={item.cor} />
      ))}
      <DRELinha label={`Total ${s.titulo}`} valor={s.total} destaque cor={s.corTotal || sinColor} />
    </div>
  );
}

const ANOS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - 2 + i;
  return { value: String(y), label: String(y) };
});

export default function RelatoriosPage() {
  const { obras, fetch: fetchObras } = useObrasStore();
  const { etapas, fetch: fetchEtapas } = useEtapasStore();
  const { lancamentos, fetch: fetchLanc } = useLancamentosStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();

  const [anoFiltro, setAnoFiltro] = useState<string>('todos');

  useEffect(() => {
    fetchObras(); fetchEtapas(); fetchLanc(); fetchClientes();
  }, []);

  // ── Filtro período ──
  const lancFiltrados = anoFiltro === 'todos'
    ? lancamentos
    : lancamentos.filter(l => (l.vencimento || l.criadoEm || '').startsWith(anoFiltro));

  // ── KPIs gerais ──
  const obrasAtivas = obras.filter(o => o.status !== 'cancelada');
  const totalContrato = obrasAtivas.reduce((s, o) => s + (o.valorContrato || 0), 0);
  const totalRecebido = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const totalPago = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const saldo = totalRecebido - totalPago;
  const emAndamento = obras.filter(o => o.status === 'andamento').length;
  const concluidas = obras.filter(o => o.status === 'concluida').length;

  const matsPendentes = etapas.flatMap(e => (e.materiais || [])
    .filter(m => m.qtdComprada < m.qtdPrevista && m.qtdPrevista > 0)
  ).length;

  const hojeStr = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const receitasPendentes = lancamentos.filter(l =>
    l.tipo === 'receita' && l.status === 'pendente' && l.vencimento >= hojeStr && l.vencimento <= em30
  ).reduce((s, l) => s + l.valor, 0);

  // ── DRE ──
  // Receitas realizadas (pagas) por categoria
  const receitasPagas   = lancFiltrados.filter(l => l.tipo === 'receita' && l.status === 'pago');
  const receitasAReceber = lancFiltrados.filter(l => l.tipo === 'receita' && l.status === 'pendente');

  const totalRecPago    = receitasPagas.reduce((s, l) => s + l.valor, 0);
  const totalRecPend    = receitasAReceber.reduce((s, l) => s + l.valor, 0);

  // Despesas pagas por categoria
  const despPagas  = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pago' && !l.socioId);
  const despPend   = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && !l.socioId);
  const distPagas  = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pago' && !!l.socioId);
  const distPend   = lancFiltrados.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && !!l.socioId);

  function somarCat(lista: typeof lancamentos, cat: string) {
    return lista.filter(l => l.categoria === cat).reduce((s, l) => s + l.valor, 0);
  }

  const totalDespPagas = despPagas.reduce((s, l) => s + l.valor, 0);
  const totalDespPend  = despPend.reduce((s, l) => s + l.valor, 0);
  const totalDistPago  = distPagas.reduce((s, l) => s + l.valor, 0);
  const totalDistPend  = distPend.reduce((s, l) => s + l.valor, 0);

  // Categorias de despesa com valores
  const categoriasDespPagas = [
    { label: 'Mão de Obra',  valor: somarCat(despPagas, 'mao-de-obra') },
    { label: 'Material',     valor: somarCat(despPagas, 'material') },
    { label: 'Ferramenta',   valor: somarCat(despPagas, 'ferramenta') },
    { label: 'Combustível',  valor: somarCat(despPagas, 'combustivel') },
    { label: 'Comissão',     valor: somarCat(despPagas, 'comissao') },
    { label: 'Imposto',      valor: somarCat(despPagas, 'imposto') },
    { label: 'Reembolso',    valor: somarCat(despPagas, 'reembolso') },
    { label: 'Outros',       valor: despPagas.filter(l => !l.categoria || l.categoria === 'outros').reduce((s, l) => s + l.valor, 0) },
  ].filter(c => c.valor > 0);

  const categoriasDespPend = [
    { label: 'Mão de Obra a pagar',  valor: somarCat(despPend, 'mao-de-obra') },
    { label: 'Material a pagar',     valor: somarCat(despPend, 'material') },
    { label: 'Outros a pagar',       valor: despPend.filter(l => !['mao-de-obra','material'].includes(l.categoria || '')).reduce((s, l) => s + l.valor, 0) },
  ].filter(c => c.valor > 0);

  // Resultados chave
  const resultadoBruto    = totalRecPago - totalDespPagas;
  const resultadoLiquido  = resultadoBruto - totalDistPago;
  const saldoProjetado    = (totalRecPago + totalRecPend) - (totalDespPagas + totalDespPend);

  // ── Tabela obras ──
  const obrasCols: ColumnsType<Obra> = [
    { title: 'Obra', dataIndex: 'nome', render: (n: string, r) => (
      <div><Text strong>{n}</Text>
        {r.clienteNome && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.clienteNome}</Text></div>}
      </div>
    )},
    { title: 'Status', dataIndex: 'status', width: 130, render: s => <ObraStatusTag status={s} /> },
    { title: 'Progresso', key: 'prog', width: 150, render: (_, r) => {
      const pct = progressoObra(r.id, etapas);
      return <Progress percent={pct} size="small" status={pct === 100 ? 'success' : 'active'} />;
    }},
    { title: 'Etapas', key: 'etapas', width: 90, render: (_, r) => {
      const et = etapas.filter(e => e.obraId === r.id);
      const conc = et.filter(e => e.status === 'concluida').length;
      return <Text style={{ fontSize: 12 }}>{conc}/{et.length}</Text>;
    }},
    { title: 'Contrato', dataIndex: 'valorContrato', width: 130,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Início', dataIndex: 'dataInicio', width: 110, render: (d: string) => formatarData(d) },
    { title: 'Previsão', dataIndex: 'dataPrevisaoFim', width: 110, render: (d: string) => formatarData(d) },
  ];

  const porCliente = clientes.map(c => ({
    ...c,
    totalObras: obras.filter(o => o.clienteId === c.id).length,
    totalContrato: obras.filter(o => o.clienteId === c.id).reduce((s, o) => s + (o.valorContrato || 0), 0),
  })).filter(c => c.totalObras > 0).sort((a, b) => b.totalContrato - a.totalContrato);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Relatórios</Title>

      <Tabs
        defaultActiveKey="geral"
        items={[
          // ── TAB 1: GERAL ─────────────────────────────────────────────────
          {
            key: 'geral',
            label: 'Visão Geral',
            children: (
              <div>
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  {[
                    { title: 'Volume total contratado', value: formatarMoeda(totalContrato) },
                    { title: 'Total recebido', value: formatarMoeda(totalRecebido), color: '#52c41a' },
                    { title: 'Total pago (despesas)', value: formatarMoeda(totalPago), color: '#ff4d4f' },
                    { title: 'Saldo (recebido − pago)', value: formatarMoeda(saldo), color: saldo >= 0 ? '#52c41a' : '#ff4d4f' },
                  ].map((k, i) => (
                    <Col xs={12} sm={6} key={i}>
                      <Card size="small">
                        <Statistic title={k.title} value={k.value} valueStyle={{ color: k.color, fontSize: 16 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  {[
                    { title: 'Obras em andamento', value: emAndamento, color: '#1677ff' },
                    { title: 'Obras concluídas', value: concluidas, color: '#52c41a' },
                    { title: 'Materiais p/ comprar', value: matsPendentes, color: matsPendentes > 0 ? '#faad14' : undefined },
                    { title: 'Receitas a receber (30d)', value: formatarMoeda(receitasPendentes), color: '#faad14' },
                  ].map((k, i) => (
                    <Col xs={12} sm={6} key={i}>
                      <Card size="small">
                        <Statistic title={k.title} value={k.value} valueStyle={{ color: k.color, fontSize: 20 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Card title="Resumo por obra" style={{ marginBottom: 20 }}>
                  <Table dataSource={obrasAtivas} columns={obrasCols} rowKey="id" size="small"
                    pagination={false} locale={{ emptyText: 'Nenhuma obra.' }} />
                </Card>

                {porCliente.length > 0 && (
                  <Card title="Clientes por volume">
                    <Table dataSource={porCliente} rowKey="id" size="small" pagination={false}
                      columns={[
                        { title: 'Cliente', dataIndex: 'nome', render: (n: string, r) => (
                          <Space><Text strong>{n}</Text><Tag>{r.tipo.toUpperCase()}</Tag></Space>
                        )},
                        { title: 'Obras', dataIndex: 'totalObras', width: 80, align: 'center' as const },
                        { title: 'Volume total', dataIndex: 'totalContrato', width: 160,
                          render: (v: number) => <Text strong>{formatarMoeda(v)}</Text> },
                      ]}
                    />
                  </Card>
                )}
              </div>
            ),
          },

          // ── TAB 2: DRE ───────────────────────────────────────────────────
          {
            key: 'dre',
            label: 'DRE — Resultado',
            children: (
              <div>
                <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
                  <Col>
                    <Title level={5} style={{ margin: 0 }}>Demonstrativo de Resultados</Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Baseado nos lançamentos cadastrados em Contas a Receber e Contas a Pagar
                    </Text>
                  </Col>
                  <Col>
                    <Space>
                      <Text type="secondary">Período:</Text>
                      <Select
                        value={anoFiltro}
                        onChange={setAnoFiltro}
                        style={{ width: 120 }}
                        options={[
                          { value: 'todos', label: 'Todos' },
                          ...ANOS,
                        ]}
                      />
                    </Space>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  {/* Coluna principal DRE */}
                  <Col xs={24} lg={14}>
                    <Card size="small" style={{ marginBottom: 16 }}>
                      {/* RECEITAS REALIZADAS */}
                      <SecaoDRE s={{
                        titulo: 'RECEITAS REALIZADAS (pagas)',
                        sinal: '+',
                        itens: receitasPagas.length > 0
                          ? [
                              { label: 'Receitas de Obras', valor: receitasPagas.filter(l => !!l.obraId).reduce((s, l) => s + l.valor, 0) },
                              { label: 'Outras Receitas', valor: receitasPagas.filter(l => !l.obraId).reduce((s, l) => s + l.valor, 0) },
                            ].filter(i => i.valor > 0)
                          : [{ label: 'Sem receitas realizadas', valor: 0 }],
                        total: totalRecPago,
                        corTotal: '#52c41a',
                      }} />

                      <DRELinha separador />

                      {/* A RECEBER */}
                      <SecaoDRE s={{
                        titulo: 'A RECEBER (pendentes)',
                        sinal: '+',
                        itens: receitasAReceber.length > 0
                          ? [
                              { label: 'Parcelas / Medições pendentes', valor: totalRecPend },
                            ]
                          : [{ label: 'Sem receitas pendentes', valor: 0 }],
                        total: totalRecPend,
                        corTotal: '#1677ff',
                      }} />

                      <DRELinha separador />

                      {/* DESPESAS PAGAS */}
                      <SecaoDRE s={{
                        titulo: 'DESPESAS PAGAS',
                        sinal: '-',
                        itens: categoriasDespPagas.length > 0
                          ? categoriasDespPagas
                          : [{ label: 'Sem despesas pagas', valor: 0 }],
                        total: totalDespPagas,
                        corTotal: '#ff4d4f',
                      }} />

                      <DRELinha separador />

                      {/* DESPESAS PENDENTES */}
                      <SecaoDRE s={{
                        titulo: 'DESPESAS A PAGAR (pendentes)',
                        sinal: '-',
                        itens: categoriasDespPend.length > 0
                          ? categoriasDespPend
                          : [{ label: 'Sem despesas pendentes', valor: 0 }],
                        total: totalDespPend,
                        corTotal: '#fa8c16',
                      }} />

                      {(totalDistPago > 0 || totalDistPend > 0) && (
                        <>
                          <DRELinha separador />
                          <SecaoDRE s={{
                            titulo: 'DISTRIBUIÇÃO DE LUCRO',
                            sinal: '-',
                            itens: [
                              { label: 'Já distribuído', valor: totalDistPago },
                              ...(totalDistPend > 0 ? [{ label: 'Pendente de distribuição', valor: totalDistPend }] : []),
                            ].filter(i => i.valor > 0),
                            total: totalDistPago + totalDistPend,
                          }} />
                        </>
                      )}
                    </Card>
                  </Col>

                  {/* Coluna resultado final */}
                  <Col xs={24} lg={10}>
                    <Card title="Resultado" size="small" style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <DRELinha label="Receitas realizadas" valor={totalRecPago} cor="#52c41a" />
                        <DRELinha label="(−) Despesas pagas" valor={totalDespPagas} cor="#ff4d4f" />
                        <DRELinha separador />
                        <DRELinha label="= Resultado Bruto" valor={resultadoBruto}
                          cor={resultadoBruto >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                        {totalDistPago > 0 && (
                          <>
                            <DRELinha label="(−) Distribuições realizadas" valor={totalDistPago} cor="#ff4d4f" />
                            <DRELinha label="= Resultado Líquido" valor={resultadoLiquido}
                              cor={resultadoLiquido >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                          </>
                        )}

                        <DRELinha separador />
                        <div style={{ padding: '8px 0 4px', fontSize: 12, color: '#8c8c8c', fontWeight: 600 }}>
                          PROJEÇÃO (realizado + pendente)
                        </div>
                        <DRELinha label="Total a receber" valor={totalRecPago + totalRecPend} cor="#1677ff" />
                        <DRELinha label="(−) Total a pagar" valor={totalDespPagas + totalDespPend} cor="#fa8c16" />
                        <DRELinha separador />
                        <DRELinha label="= Saldo Projetado" valor={saldoProjetado}
                          cor={saldoProjetado >= 0 ? '#52c41a' : '#ff4d4f'} destaque />
                      </div>
                    </Card>

                    {/* Mini KPIs */}
                    <Row gutter={[8, 8]}>
                      {[
                        { label: 'Recebido', v: totalRecPago, c: '#52c41a' },
                        { label: 'A Receber', v: totalRecPend, c: '#1677ff' },
                        { label: 'Despesas pagas', v: totalDespPagas, c: '#ff4d4f' },
                        { label: 'A Pagar', v: totalDespPend, c: '#fa8c16' },
                      ].map((k, i) => (
                        <Col xs={12} key={i}>
                          <Card size="small">
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{k.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: k.c }}>{formatarMoeda(k.v)}</div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </Col>
                </Row>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
