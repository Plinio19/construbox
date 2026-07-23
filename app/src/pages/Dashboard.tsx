import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Progress,
  Tag, Divider, Modal, InputNumber, Button, Form, Popconfirm, message, Space,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BuildOutlined, CheckCircleOutlined, DollarOutlined, ClockCircleOutlined,
  PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useObrasStore } from '../stores/useObrasStore';
import { useLancamentosStore } from '../stores/useLancamentosStore';
import { useEtapasStore } from '../stores/useEtapasStore';
import { useSociosStore } from '../stores/useSociosStore';
import { formatarMoeda, uid, hoje } from '../utils';
import type { Obra } from '../types';

const { Title, Text } = Typography;

/* ─── helpers ─── */
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

const STATUS_COLOR: Record<string, string> = {
  orcamento: 'default', aprovado: 'processing', andamento: 'blue',
  pausada: 'warning', concluida: 'success', cancelada: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  orcamento: 'Orçamento', aprovado: 'Aprovado', andamento: 'Em Andamento',
  pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
};

/* ─── Resultado por Obra row ─── */
interface ObraResultado extends Obra {
  recebido: number;
  aReceber: number;
  maoObraPaga: number;
  maoObraAhPagar: number;
  outrasDespesas: number;
  totalDespesas: number;
  lucro: number;
  progresso: number;
}

export default function Dashboard() {
  const { obras, fetch: fetchObras } = useObrasStore();
  const { lancamentos, fetch: fetchLanc } = useLancamentosStore();
  const { etapas, fetch: fetchEtapas } = useEtapasStore();
  const { socios, fetch: fetchSocios, upsert: upsertSocio, remove: removeSocio } = useSociosStore();

  const [modalSocios, setModalSocios] = useState(false);
  const [novoNome, setNovoNome]       = useState('');
  const [novoPerc, setNovoPerc]       = useState<number>(0);
  const [salvando, setSalvando]       = useState(false);

  useEffect(() => {
    fetchObras();
    fetchLanc();
    fetchEtapas();
    fetchSocios();
  }, []);

  /* ── KPIs globais ── */
  const emAndamento  = obras.filter(o => o.status === 'andamento').length;
  const concluidas   = obras.filter(o => o.status === 'concluida').length;
  const totalRecebido = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago')
    .reduce((s, l) => s + l.valor, 0);
  const pendentes = lancamentos.filter(l => l.status === 'pendente').length;

  /* ── Resultado por obra ── */
  const obrasAtivas = obras.filter(o => !['cancelada'].includes(o.status));

  const resultados: ObraResultado[] = obrasAtivas.map(obra => {
    const lancs = lancamentos.filter(l => l.obraId === obra.id);

    const recebido   = lancs.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
    const aReceber   = lancs.filter(l => l.tipo === 'receita' && l.status !== 'pago' && l.status !== 'cancelado').reduce((s, l) => s + l.valor, 0);

    // Mão de obra = despesas vinculadas a funcionário/prestador ou com categoria mão de obra
    const isMaoObra = (l: typeof lancs[0]) =>
      l.funcionarioId || l.prestadorId ||
      (l.categoria || '').toLowerCase().includes('mão') ||
      (l.categoria || '').toLowerCase().includes('mao') ||
      (l.descricao || '').toLowerCase().includes('mão de obra') ||
      (l.descricao || '').toLowerCase().includes('salário') ||
      (l.descricao || '').toLowerCase().includes('prestador');

    const maoObraPaga    = lancs.filter(l => l.tipo === 'despesa' && l.status === 'pago' && isMaoObra(l)).reduce((s, l) => s + l.valor, 0);
    const maoObraAhPagar = lancs.filter(l => l.tipo === 'despesa' && l.status !== 'pago' && l.status !== 'cancelado' && isMaoObra(l)).reduce((s, l) => s + l.valor, 0);
    const outrasDespesas = lancs.filter(l => l.tipo === 'despesa' && l.status === 'pago' && !isMaoObra(l)).reduce((s, l) => s + l.valor, 0);

    const totalDespesas = maoObraPaga + maoObraAhPagar + outrasDespesas;
    const lucro = recebido - (maoObraPaga + outrasDespesas);

    return {
      ...obra,
      recebido, aReceber, maoObraPaga, maoObraAhPagar, outrasDespesas, totalDespesas, lucro,
      progresso: progressoObra(obra.id, etapas),
    };
  });

  /* ── Totais consolidados ── */
  const totalContratoGeral = obrasAtivas.reduce((s, o) => s + (o.valorContrato || 0), 0);
  const totalRecebidoGeral = resultados.reduce((s, r) => s + r.recebido, 0);
  const totalAReceberGeral = resultados.reduce((s, r) => s + r.aReceber, 0);
  const totalDespesasGeral = resultados.reduce((s, r) => s + r.totalDespesas, 0);
  const lucroTotal         = totalRecebidoGeral - resultados.reduce((s, r) => s + r.maoObraPaga + r.outrasDespesas, 0);

  /* ── Distribuição de lucro ── */
  const totalPerc = socios.reduce((s, c) => s + c.percentual, 0);
  const distribuicao = socios.map(c => ({
    ...c,
    valor: (lucroTotal * c.percentual) / 100,
  }));

  async function adicionarSocio() {
    if (!novoNome.trim() || !novoPerc) { message.warning('Preencha nome e percentual.'); return; }
    setSalvando(true);
    try {
      await upsertSocio({ id: uid(), nome: novoNome.trim(), percentual: novoPerc, criadoEm: hoje() });
      setNovoNome(''); setNovoPerc(0);
      message.success('Sócio adicionado!');
    } catch { message.error('Erro ao salvar.'); }
    setSalvando(false);
  }

  async function removerSocio(id: string) {
    try { await removeSocio(id); message.success('Removido.'); }
    catch { message.error('Erro.'); }
  }

  /* ── Colunas da tabela de resultado ── */
  const cols: ColumnsType<ObraResultado> = [
    {
      title: 'Obra', dataIndex: 'nome', fixed: 'left' as const,
      render: (n: string, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{n}</Text>
          <div>
            <Tag color={STATUS_COLOR[r.status]} style={{ fontSize: 10, marginTop: 2 }}>
              {STATUS_LABEL[r.status]}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Progresso', key: 'prog', width: 130,
      render: (_, r) => (
        <div>
          <Progress percent={r.progresso} size="small" status={r.progresso === 100 ? 'success' : 'active'} />
        </div>
      ),
    },
    {
      title: 'Contrato', dataIndex: 'valorContrato', width: 130, align: 'right' as const,
      render: (v: number) => <Text>{v ? formatarMoeda(v) : '—'}</Text>,
    },
    {
      title: '✅ Recebido', dataIndex: 'recebido', width: 130, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: '#52c41a' }}>{formatarMoeda(v)}</Text>,
    },
    {
      title: '⏳ A Receber', dataIndex: 'aReceber', width: 130, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#faad14' : '#8c8c8c' }}>{formatarMoeda(v)}</Text>
      ),
    },
    {
      title: '👷 M.O. Paga', dataIndex: 'maoObraPaga', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#ff4d4f' }}>{formatarMoeda(v)}</Text>,
    },
    {
      title: '👷 M.O. A Pagar', dataIndex: 'maoObraAhPagar', width: 130, align: 'right' as const,
      render: (v: number) => (
        <Text style={{ color: v > 0 ? '#fa8c16' : '#8c8c8c' }}>{formatarMoeda(v)}</Text>
      ),
    },
    {
      title: '💰 Outras Desp.', dataIndex: 'outrasDespesas', width: 130, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#ff4d4f' }}>{formatarMoeda(v)}</Text>,
    },
    {
      title: '📊 Lucro Parcial', dataIndex: 'lucro', width: 140, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>
          {formatarMoeda(v)}
        </Text>
      ),
    },
  ];

  /* ── Colunas da tabela consolidada (relatório) ── */
  const colsRelatorio: ColumnsType<ObraResultado> = [
    { title: 'Obra', dataIndex: 'nome', render: (n: string, r) => (
      <div>
        <Text strong>{n}</Text>
        {r.clienteNome && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.clienteNome}</Text></div>}
      </div>
    )},
    { title: 'Status', dataIndex: 'status', width: 120, render: (s: string) =>
      <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
    { title: 'Contrato', dataIndex: 'valorContrato', width: 120, align: 'right' as const,
      render: (v: number) => v ? formatarMoeda(v) : '—' },
    { title: 'Recebido', dataIndex: 'recebido', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#52c41a' }}>{formatarMoeda(v)}</Text> },
    { title: 'A Receber', dataIndex: 'aReceber', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v > 0 ? '#faad14' : '#8c8c8c' }}>{formatarMoeda(v)}</Text> },
    { title: 'Despesas', dataIndex: 'totalDespesas', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#ff4d4f' }}>{formatarMoeda(v)}</Text> },
    { title: 'Lucro', dataIndex: 'lucro', width: 120, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatarMoeda(v)}</Text> },
    { title: '%', key: 'pct', width: 100,
      render: (_, r) => {
        const pct = r.valorContrato ? Math.round((r.lucro / r.valorContrato) * 100) : 0;
        return <Tag color={pct >= 20 ? 'success' : pct >= 0 ? 'warning' : 'error'}>{pct}%</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Dashboard</Title>

      {/* ── KPIs ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Obras em andamento" value={emAndamento}
              prefix={<BuildOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Obras concluídas" value={concluidas}
              prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Total recebido" value={formatarMoeda(totalRecebido)}
              prefix={<DollarOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card size="small">
            <Statistic title="Lançamentos pendentes" value={pendentes}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: pendentes > 0 ? '#faad14' : undefined }} />
          </Card>
        </Col>
      </Row>

      {/* ── Resultado por obra ── */}
      <Card
        title="💼 Resultado por Obra"
        style={{ marginBottom: 20 }}
        extra={
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total contrato: <strong>{formatarMoeda(totalContratoGeral)}</strong>
              {' · '}A receber: <strong style={{ color: '#faad14' }}>{formatarMoeda(totalAReceberGeral)}</strong>
            </Text>
          </Space>
        }
      >
        <Table
          dataSource={resultados}
          columns={cols}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{ emptyText: 'Nenhuma obra ativa.' }}
          summary={() => resultados.length > 1 ? (
            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
              <Table.Summary.Cell index={0}><Text strong>TOTAL</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2} align="right"><Text strong>{formatarMoeda(totalContratoGeral)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#52c41a' }}>{formatarMoeda(totalRecebidoGeral)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#faad14' }}>{formatarMoeda(totalAReceberGeral)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: '#ff4d4f' }}>{formatarMoeda(resultados.reduce((s, r) => s + r.maoObraPaga, 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: '#fa8c16' }}>{formatarMoeda(resultados.reduce((s, r) => s + r.maoObraAhPagar, 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><Text strong style={{ color: '#ff4d4f' }}>{formatarMoeda(resultados.reduce((s, r) => s + r.outrasDespesas, 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right"><Text strong style={{ color: lucroTotal >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>{formatarMoeda(lucroTotal)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      </Card>

      {/* ── Relatório consolidado + Distribuição ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="📋 Relatório Consolidado — Todas as Obras">
            <Table
              dataSource={resultados}
              columns={colsRelatorio}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
              locale={{ emptyText: 'Nenhuma obra.' }}
              summary={() => resultados.length > 1 ? (
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                  <Table.Summary.Cell index={0}><Text strong>TOTAL</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right"><Text strong>{formatarMoeda(totalContratoGeral)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#52c41a' }}>{formatarMoeda(totalRecebidoGeral)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#faad14' }}>{formatarMoeda(totalAReceberGeral)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: '#ff4d4f' }}>{formatarMoeda(totalDespesasGeral)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: lucroTotal >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatarMoeda(lucroTotal)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} />
                </Table.Summary.Row>
              ) : null}
            />
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card
            title="💸 Cálculo de Distribuição de Lucro"
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setModalSocios(true)}>Sócios</Button>}
          >
            {/* Lucro disponível */}
            <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 16,
              background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Lucro disponível para distribuição</Text>
              <div style={{ fontSize: 24, fontWeight: 700, color: lucroTotal >= 0 ? '#52c41a' : '#ff4d4f' }}>
                {formatarMoeda(lucroTotal)}
              </div>
            </div>

            {socios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#8c8c8c' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
                <Text type="secondary">Nenhum sócio cadastrado.</Text>
                <br />
                <Button size="small" type="link" onClick={() => setModalSocios(true)}>Adicionar sócios</Button>
              </div>
            ) : (
              <>
                {totalPerc !== 100 && (
                  <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6,
                    padding: '6px 12px', marginBottom: 12, fontSize: 12, color: '#d46b08' }}>
                    ⚠️ Total dos percentuais: <strong>{totalPerc}%</strong> (ideal: 100%)
                  </div>
                )}
                {distribuicao.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <Text strong>{s.nome}</Text>
                      <div><Tag color="blue" style={{ fontSize: 11 }}>{s.percentual}%</Tag></div>
                    </div>
                    <Text strong style={{ color: '#52c41a', fontSize: 16 }}>
                      {formatarMoeda(s.valor)}
                    </Text>
                  </div>
                ))}
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Modal sócios ── */}
      <Modal
        title="👥 Gerenciar Sócios"
        open={modalSocios}
        onCancel={() => setModalSocios(false)}
        footer={null}
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {socios.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: '#fafafa', padding: '8px 12px', borderRadius: 8, border: '1px solid #f0f0f0' }}>
              <Text style={{ flex: 1 }}>{s.nome}</Text>
              <Tag color="blue">{s.percentual}%</Tag>
              <Popconfirm title="Remover sócio?" onConfirm={() => removerSocio(s.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))}

          <Divider style={{ margin: '8px 0' }} />

          <Form layout="inline" onFinish={adicionarSocio} style={{ gap: 8 }}>
            <Form.Item style={{ flex: 1, margin: 0 }}>
              <input
                className="ant-input"
                placeholder="Nome do sócio"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                style={{ width: '100%', padding: '4px 11px', borderRadius: 6,
                  border: '1px solid #d9d9d9', fontSize: 14 }}
              />
            </Form.Item>
            <Form.Item style={{ margin: 0 }}>
              <InputNumber
                min={0} max={100} step={0.1}
                value={novoPerc}
                onChange={v => setNovoPerc(v || 0)}
                addonAfter="%"
                style={{ width: 120 }}
                placeholder="0"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={salvando} icon={<PlusOutlined />}>
              Adicionar
            </Button>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
