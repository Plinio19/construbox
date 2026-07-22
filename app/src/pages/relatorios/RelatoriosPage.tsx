import { useEffect } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Progress,
  Space, Tag,
} from 'antd';
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

export default function RelatoriosPage() {
  const { obras, fetch: fetchObras } = useObrasStore();
  const { etapas, fetch: fetchEtapas } = useEtapasStore();
  const { lancamentos, fetch: fetchLanc } = useLancamentosStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();

  useEffect(() => {
    fetchObras(); fetchEtapas(); fetchLanc(); fetchClientes();
  }, []);

  const obrasAtivas = obras.filter(o => o.status !== 'cancelada');
  const totalContrato = obrasAtivas.reduce((s, o) => s + (o.valorContrato || 0), 0);
  const totalRecebido = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const totalPago = lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const saldo = totalRecebido - totalPago;
  const emAndamento = obras.filter(o => o.status === 'andamento').length;
  const concluidas = obras.filter(o => o.status === 'concluida').length;

  // Materiais pendentes de compra
  const matsPendentes = etapas.flatMap(e => (e.materiais || [])
    .filter(m => m.qtdComprada < m.qtdPrevista && m.qtdPrevista > 0)
  ).length;

  // Receitas a vencer nos próximos 30 dias
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const receitasPendentes = lancamentos.filter(l =>
    l.tipo === 'receita' && l.status === 'pendente' && l.vencimento >= hoje && l.vencimento <= em30
  ).reduce((s, l) => s + l.valor, 0);

  // Tabela resumo por obra
  const obrasCols: ColumnsType<Obra> = [
    { title: 'Obra', dataIndex: 'nome', render: (n: string, r) => (
      <div><Text strong>{n}</Text>
        {r.clienteNome && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.clienteNome}</Text></div>}
      </div>
    )},
    { title: 'Status', dataIndex: 'status', width: 130, render: s => <ObraStatusTag status={s} /> },
    { title: 'Progresso', key: 'prog', width: 150,
      render: (_, r) => {
        const pct = progressoObra(r.id, etapas);
        return <Progress percent={pct} size="small" status={pct === 100 ? 'success' : 'active'} />;
      },
    },
    { title: 'Etapas', key: 'etapas', width: 90,
      render: (_, r) => {
        const et = etapas.filter(e => e.obraId === r.id);
        const conc = et.filter(e => e.status === 'concluida').length;
        return <Text style={{ fontSize: 12 }}>{conc}/{et.length}</Text>;
      },
    },
    { title: 'Contrato', dataIndex: 'valorContrato', width: 130,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Início', dataIndex: 'dataInicio', width: 110, render: (d: string) => formatarData(d) },
    { title: 'Previsão', dataIndex: 'dataPrevisaoFim', width: 110, render: (d: string) => formatarData(d) },
  ];

  // Top clientes por volume
  const porCliente = clientes.map(c => ({
    ...c,
    totalObras: obras.filter(o => o.clienteId === c.id).length,
    totalContrato: obras.filter(o => o.clienteId === c.id).reduce((s, o) => s + (o.valorContrato || 0), 0),
  })).filter(c => c.totalObras > 0).sort((a, b) => b.totalContrato - a.totalContrato);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Relatórios</Title>

      {/* KPIs principais */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { title: 'Volume total contratado', value: formatarMoeda(totalContrato), color: undefined },
          { title: 'Total recebido', value: formatarMoeda(totalRecebido), color: '#52c41a' },
          { title: 'Total pago (despesas)', value: formatarMoeda(totalPago), color: '#ff4d4f' },
          { title: 'Saldo (recebido - pago)', value: formatarMoeda(saldo), color: saldo >= 0 ? '#52c41a' : '#ff4d4f' },
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

      {/* Tabela obras */}
      <Card title="Resumo por obra" style={{ marginBottom: 20 }}>
        <Table
          dataSource={obrasAtivas}
          columns={obrasCols}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: 'Nenhuma obra.' }}
        />
      </Card>

      {/* Top clientes */}
      {porCliente.length > 0 && (
        <Card title="Clientes por volume">
          <Table
            dataSource={porCliente}
            rowKey="id"
            size="small"
            pagination={false}
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
  );
}
