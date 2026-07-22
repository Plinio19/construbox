import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Select, Row, Col, Typography,
  Popconfirm, message, Tag, Tooltip, Card, Statistic,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CheckOutlined } from '@ant-design/icons';
import type { Lancamento, TipoLancamento, StatusLancamento } from '../../types';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { formatarMoeda, formatarData, hoje } from '../../utils';
import LancamentoForm from './LancamentoForm';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<StatusLancamento, string> = {
  pendente:  'gold',
  pago:      'green',
  vencido:   'red',
  cancelado: 'default',
};

const STATUS_LABEL: Record<StatusLancamento, string> = {
  pendente:  'Pendente',
  pago:      'Pago',
  vencido:   'Vencido',
  cancelado: 'Cancelado',
};

interface Props { tipo: TipoLancamento; }

export default function FinanceiroPage({ tipo }: Props) {
  const { lancamentos, loading, fetch, upsert, remove } = useLancamentosStore();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusLancamento | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lancEdit, setLancEdit] = useState<Lancamento | null>(null);

  const isReceita = tipo === 'receita';
  const titulo = isReceita ? 'Contas a Receber' : 'Contas a Pagar';

  useEffect(() => { fetch(); }, []);

  // Auto-marcar como vencido
  const lista = lancamentos
    .filter(l => l.tipo === tipo)
    .map(l => {
      if (l.status === 'pendente' && l.vencimento < hoje()) return { ...l, status: 'vencido' as StatusLancamento };
      return l;
    });

  const filtrado = lista.filter(l => {
    const matchBusca = !busca || l.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      (l.obraNome || '').toLowerCase().includes(busca.toLowerCase());
    const matchStatus = !filtroStatus || l.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  async function marcarPago(l: Lancamento) {
    await upsert({ ...l, status: 'pago', pagamento: hoje() });
    message.success('Marcado como pago!');
  }

  // ── Totais ─────────────────────────────────────────────────────────────────
  const totalPendente = lista.filter(l => l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
  const totalVencido  = lista.filter(l => l.status === 'vencido').reduce((s, l) => s + l.valor, 0);
  const totalPago     = lista.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor, 0);
  const totalGeral    = lista.filter(l => l.status !== 'cancelado').reduce((s, l) => s + l.valor, 0);

  const columns: ColumnsType<Lancamento> = [
    { title: 'Descrição', dataIndex: 'descricao',
      render: (desc: string, r) => (
        <div>
          <Text strong>{desc}</Text>
          {r.obraNome && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.obraNome}</Text></div>}
          {r.categoria && <Tag style={{ marginTop: 2, fontSize: 11 }}>{r.categoria}</Tag>}
        </div>
      ),
    },
    { title: 'Valor', dataIndex: 'valor', width: 130,
      sorter: (a, b) => a.valor - b.valor,
      render: (v: number) => <Text strong>{formatarMoeda(v)}</Text> },
    { title: 'Vencimento', dataIndex: 'vencimento', width: 120,
      sorter: (a, b) => a.vencimento.localeCompare(b.vencimento),
      render: (d: string) => formatarData(d) },
    { title: 'Pagamento', dataIndex: 'pagamento', width: 120,
      render: (d: string) => d ? formatarData(d) : <Text type="secondary">—</Text> },
    { title: 'Status', dataIndex: 'status', width: 110,
      render: (s: StatusLancamento) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
    { title: 'Ações', key: 'acoes', width: 120,
      render: (_, r) => (
        <Space size={4}>
          {r.status !== 'pago' && (
            <Tooltip title={isReceita ? 'Marcar como recebido' : 'Marcar como pago'}>
              <Button type="text" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => marcarPago(r)} />
            </Tooltip>
          )}
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} onClick={() => { setLancEdit(r); setDrawerOpen(true); }} />
          </Tooltip>
          <Popconfirm title="Excluir lançamento?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
            <Tooltip title="Excluir">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>{titulo}</Title></Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setLancEdit(null); setDrawerOpen(true); }}>
            {isReceita ? 'Nova receita' : 'Nova despesa'}
          </Button>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Pendente" value={formatarMoeda(totalPendente)}
              valueStyle={{ color: '#faad14', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Vencido" value={formatarMoeda(totalVencido)}
              valueStyle={{ color: '#ff4d4f', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={isReceita ? 'Recebido' : 'Pago'} value={formatarMoeda(totalPago)}
              valueStyle={{ color: '#52c41a', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total geral" value={formatarMoeda(totalGeral)}
              valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por descrição ou obra..." value={busca}
            onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
        <Col xs={24} sm={10}>
          <Select style={{ width: '100%' }} placeholder="Filtrar por status" allowClear
            options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            value={filtroStatus || undefined} onChange={v => setFiltroStatus((v || '') as StatusLancamento | '')} />
        </Col>
      </Row>

      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        rowClassName={r => r.status === 'vencido' ? 'row-vencido' : ''}
        pagination={{ pageSize: 25, showTotal: t => `${t} lançamento(s)` }}
        locale={{ emptyText: `Nenhum lançamento encontrado.` }} />

      <LancamentoForm tipo={tipo} lancamento={lancEdit} open={drawerOpen}
        onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
