import { useEffect, useState } from 'react';
import {
  Table, Row, Col, Typography, Input, Card, Tag, Button,
  Space, Statistic, Popconfirm, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, CheckOutlined } from '@ant-design/icons';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import type { MaterialEtapa } from '../../types';
import { formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

interface MatPendente extends MaterialEtapa {
  obraId: string;
  obraNome: string;
  etapaId: string;
  etapaNome: string;
  nomeResolvido: string;
  unidadeResolvida: string;
  qtdFaltante: number;
}

export default function ComprasPage() {
  const { etapas, fetch: fetchEtapas, upsert: upsertEtapa } = useEtapasStore();
  const { obras, fetch: fetchObras } = useObrasStore();
  const { fetch: fetchCatalogo, resolve } = useCatalogoStore();
  const [busca, setBusca] = useState('');

  useEffect(() => { fetchEtapas(); fetchObras(); fetchCatalogo(); }, []);

  // Agregar todos os materiais pendentes de compra de todas as obras
  const pendentes: MatPendente[] = etapas.flatMap(etapa => {
    const obra = obras.find(o => o.id === etapa.obraId);
    return (etapa.materiais || [])
      .filter(m => (m.qtdComprada || 0) < (m.qtdPrevista || 0) && m.qtdPrevista > 0)
      .map(m => {
        const info = resolve(m.catalogoId, m.nome, m.unidade);
        return {
          ...m,
          obraId: etapa.obraId,
          obraNome: obra?.nome || 'Obra desconhecida',
          etapaId: etapa.id,
          etapaNome: etapa.nome,
          nomeResolvido: info.nome,
          unidadeResolvida: info.unidade,
          qtdFaltante: (m.qtdPrevista || 0) - (m.qtdComprada || 0),
        };
      });
  });

  const filtrado = pendentes.filter(m =>
    !busca ||
    m.nomeResolvido.toLowerCase().includes(busca.toLowerCase()) ||
    m.obraNome.toLowerCase().includes(busca.toLowerCase()) ||
    m.etapaNome.toLowerCase().includes(busca.toLowerCase()) ||
    (m.fornecedor || '').toLowerCase().includes(busca.toLowerCase())
  );

  const totalPrevisto = filtrado.reduce((s, m) => s + (m.valorPrevisto || 0), 0);
  const totalItens = filtrado.length;
  const obrasAfetadas = new Set(filtrado.map(m => m.obraId)).size;

  async function marcarPedido(mat: MatPendente, pedido: boolean) {
    const etapa = etapas.find(e => e.id === mat.etapaId);
    if (!etapa) return;
    const mats = etapa.materiais.map(m => m.id === mat.id ? { ...m, pedidoCompra: pedido } : m);
    try {
      await upsertEtapa({ ...etapa, materiais: mats });
      message.success(pedido ? 'Marcado como pedido feito!' : 'Desmarcado.');
    } catch { message.error('Erro ao atualizar.'); }
  }

  async function marcarComprado(mat: MatPendente) {
    const etapa = etapas.find(e => e.id === mat.etapaId);
    if (!etapa) return;
    const mats = etapa.materiais.map(m => m.id === mat.id ? {
      ...m, qtdComprada: m.qtdPrevista, pedidoCompra: true,
    } : m);
    try {
      await upsertEtapa({ ...etapa, materiais: mats });
      message.success('Material marcado como comprado!');
    } catch { message.error('Erro ao atualizar.'); }
  }

  const columns: ColumnsType<MatPendente> = [
    { title: 'Material', dataIndex: 'nomeResolvido',
      sorter: (a, b) => a.nomeResolvido.localeCompare(b.nomeResolvido),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.fornecedor && <div><Text type="secondary" style={{ fontSize: 12 }}>Fornecedor: {r.fornecedor}</Text></div>}
          {r.pedidoCompra && <Tag color="gold" style={{ fontSize: 10 }}>Pedido feito</Tag>}
        </div>
      ),
    },
    { title: 'Un', dataIndex: 'unidadeResolvida', width: 60, render: (u: string) => <Tag>{u}</Tag> },
    { title: 'Qtd. Prev.', dataIndex: 'qtdPrevista', width: 90, align: 'center' as const },
    { title: 'Comprado', dataIndex: 'qtdComprada', width: 90, align: 'center' as const,
      render: (v: number) => <Text type={v > 0 ? 'success' : 'secondary'}>{v}</Text> },
    { title: 'Faltante', dataIndex: 'qtdFaltante', width: 90, align: 'center' as const,
      render: (v: number) => <Text strong style={{ color: '#ff4d4f' }}>{v}</Text> },
    { title: 'Obra / Etapa', key: 'ref',
      render: (_, r) => (
        <div>
          <Text>{r.obraNome}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.etapaNome}</Text></div>
        </div>
      ),
    },
    { title: 'V. Prev.', dataIndex: 'valorPrevisto', width: 120,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 110,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={r.pedidoCompra ? 'Desmarcar pedido' : 'Marcar pedido feito'}>
            <Button
              size="small"
              type={r.pedidoCompra ? 'primary' : 'default'}
              ghost={r.pedidoCompra}
              onClick={() => marcarPedido(r, !r.pedidoCompra)}
            >
              Pedido
            </Button>
          </Tooltip>
          <Popconfirm title="Marcar como totalmente comprado?" onConfirm={() => marcarComprado(r)}>
            <Tooltip title="Marcar como comprado">
              <Button size="small" type="primary" icon={<CheckOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Lista de Compras</Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Itens p/ comprar" value={totalItens}
              valueStyle={{ color: totalItens > 0 ? '#faad14' : undefined, fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Obras afetadas" value={obrasAfetadas} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Valor previsto total" value={formatarMoeda(totalPrevisto)} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por material, obra, etapa ou fornecedor..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>

      <Table
        dataSource={filtrado}
        columns={columns}
        rowKey={r => `${r.etapaId}-${r.id}`}
        size="middle"
        pagination={{ pageSize: 30, showTotal: t => `${t} item(ns)` }}
        locale={{ emptyText: 'Nenhum material pendente de compra.' }}
        rowClassName={r => r.classificacao === 'obrigatorio_iniciar' ? 'row-urgente' : ''}
      />
    </div>
  );
}
