import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Select, Typography, Row, Col,
  Card, Statistic, Popconfirm, message, Tooltip, Progress,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Obra, StatusObra } from '../../types';
import { useObrasStore } from '../../stores/useObrasStore';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { ObraStatusTag, OBRA_STATUS_OPTIONS } from '../../components/common/StatusTag';
import { formatarMoeda, formatarData } from '../../utils';
import ObraForm from './ObraForm';

const { Title, Text } = Typography;

export default function ObrasPage() {
  const navigate = useNavigate();
  const { obras, loading, fetch: fetchObras, remove } = useObrasStore();
  const { etapas, fetch: fetchEtapas } = useEtapasStore();

  const [busca, setBusca]           = useState('');
  const [filtroStatus, setFiltroStatus] = useState<StatusObra | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [obraEdit, setObraEdit]     = useState<Obra | null>(null);

  useEffect(() => {
    fetchObras();
    fetchEtapas();
  }, []);

  function abrirNova() {
    setObraEdit(null);
    setDrawerOpen(true);
  }

  function abrirEditar(obra: Obra) {
    setObraEdit(obra);
    setDrawerOpen(true);
  }

  async function excluir(id: string) {
    try {
      await remove(id);
      message.success('Obra removida.');
    } catch {
      message.error('Erro ao remover obra.');
    }
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  const obrasFiltradas = obras.filter(o => {
    const matchBusca = !busca ||
      o.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (o.clienteNome || '').toLowerCase().includes(busca.toLowerCase());
    const matchStatus = !filtroStatus || o.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  // ── Progresso da obra via etapas ──────────────────────────────────────────
  function progressoObra(obraId: string): number {
    const etapasObra = etapas.filter(e => e.obraId === obraId);
    if (!etapasObra.length) return 0;
    const total = etapasObra.reduce((s, e) => s + (e.peso || 1), 0);
    const feito = etapasObra.reduce((s, e) => {
      const p = e.status === 'concluida' ? (e.peso || 1) : ((e.percentualExecutado || 0) / 100) * (e.peso || 1);
      return s + p;
    }, 0);
    return Math.round((feito / total) * 100);
  }

  // ── Estatísticas ──────────────────────────────────────────────────────────
  const totalAndamento = obras.filter(o => o.status === 'andamento').length;
  const totalConcluidas = obras.filter(o => o.status === 'concluida').length;
  const valorTotal = obras
    .filter(o => o.status !== 'cancelada')
    .reduce((s, o) => s + (o.valorContrato || 0), 0);
  const totalOrcamento = obras.filter(o => o.status === 'orcamento').length;

  // ── Colunas ───────────────────────────────────────────────────────────────
  const columns: ColumnsType<Obra> = [
    {
      title: 'Obra',
      dataIndex: 'nome',
      sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, record) => (
        <div>
          <Text strong>{nome}</Text>
          {record.clienteNome && (
            <div><Text type="secondary" style={{ fontSize: 12 }}>{record.clienteNome}</Text></div>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (s: StatusObra) => <ObraStatusTag status={s} />,
    },
    {
      title: 'Progresso',
      key: 'progresso',
      width: 140,
      render: (_, record) => {
        const pct = progressoObra(record.id);
        return (
          <Progress
            percent={pct}
            size="small"
            status={pct === 100 ? 'success' : 'active'}
            strokeColor={pct === 100 ? '#52c41a' : '#1677ff'}
          />
        );
      },
    },
    {
      title: 'Valor',
      dataIndex: 'valorContrato',
      width: 140,
      sorter: (a, b) => (a.valorContrato || 0) - (b.valorContrato || 0),
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Início',
      dataIndex: 'dataInicio',
      width: 110,
      render: (d: string) => formatarData(d),
    },
    {
      title: 'Previsão',
      dataIndex: 'dataPrevisaoFim',
      width: 110,
      render: (d: string) => formatarData(d),
    },
    {
      title: 'Ações',
      key: 'acoes',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Cronograma">
            <Button
              type="text"
              icon={<ToolOutlined />}
              onClick={() => navigate(`/obras/${record.id}/cronograma`)}
            />
          </Tooltip>
          <Tooltip title="Editar">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => abrirEditar(record)}
            />
          </Tooltip>
          <Tooltip title="Ver detalhes">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/obras/${record.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Excluir obra?"
            description="Esta ação não pode ser desfeita."
            onConfirm={() => excluir(record.id)}
            okText="Excluir"
            okType="danger"
          >
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
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Obras</Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNova}>
            Nova Obra
          </Button>
        </Col>
      </Row>

      {/* Cards estatísticos */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Em andamento" value={totalAndamento} valueStyle={{ color: '#1677ff', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Orçamento" value={totalOrcamento} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Concluídas" value={totalConcluidas} valueStyle={{ color: '#52c41a', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Volume total" value={formatarMoeda(valorTotal)} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Buscar por nome ou cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            allowClear
          />
        </Col>
        <Col xs={24} sm={10}>
          <Select
            style={{ width: '100%' }}
            placeholder="Filtrar por status"
            options={[{ value: '', label: 'Todos os status' }, ...OBRA_STATUS_OPTIONS]}
            value={filtroStatus}
            onChange={v => setFiltroStatus(v as StatusObra | '')}
          />
        </Col>
      </Row>

      {/* Tabela */}
      <Table
        dataSource={obrasFiltradas}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, showTotal: (t) => `${t} obra(s)` }}
        locale={{ emptyText: 'Nenhuma obra encontrada.' }}
      />

      <ObraForm
        obra={obraEdit}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
