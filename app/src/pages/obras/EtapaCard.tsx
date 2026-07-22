import { useState } from 'react';
import {
  Card, Row, Col, Typography, Space, Button, Slider, Select,
  Table, Tag, Popconfirm, Tooltip, Checkbox, Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined, DeleteOutlined, PlusOutlined,
  PrinterOutlined, CheckOutlined,
} from '@ant-design/icons';
import type { Etapa, MaterialEtapa, StatusEtapa } from '../../types';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import { EtapaStatusTag, ETAPA_STATUS_OPTIONS } from '../../components/common/StatusTag';
import { formatarMoeda } from '../../utils';
import MaterialEtapaForm from './MaterialEtapaForm';

const { Text, Title } = Typography;

interface Props {
  etapa: Etapa;
  onUpdate: (etapa: Etapa) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (etapa: Etapa) => void;
  onPrintOS: (etapa: Etapa) => void;
}

function statusMaterial(m: MaterialEtapa): { label: string; color: string } {
  if (m.qtdUtilizada >= m.qtdPrevista && m.qtdPrevista > 0) return { label: 'Utilizado', color: 'green' };
  if (m.qtdEntregue >= m.qtdPrevista && m.qtdPrevista > 0) return { label: 'Entregue', color: 'blue' };
  if (m.qtdComprada >= m.qtdPrevista && m.qtdPrevista > 0) return { label: 'Comprado', color: 'cyan' };
  if (m.pedidoCompra) return { label: 'Pedido feito', color: 'gold' };
  return { label: 'Pendente', color: 'default' };
}

export default function EtapaCard({ etapa, onUpdate, onDelete, onEdit, onPrintOS }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [matDrawer, setMatDrawer] = useState(false);
  const [matEdit, setMatEdit] = useState<MaterialEtapa | null>(null);
  const { resolve } = useCatalogoStore();

  async function updateStatus(status: StatusEtapa) {
    const updated = { ...etapa, status };
    if (status === 'em_andamento' && !etapa.dataRealInicio) {
      updated.dataRealInicio = new Date().toISOString().slice(0, 10);
    }
    if (status === 'concluida') {
      updated.percentualExecutado = 100;
      if (!etapa.dataRealFim) updated.dataRealFim = new Date().toISOString().slice(0, 10);
    }
    await onUpdate(updated);
  }

  async function updateProgresso(pct: number) {
    await onUpdate({ ...etapa, percentualExecutado: pct });
  }

  async function toggleChecklist(itemId: string) {
    const checklist = (etapa.checklist || []).map(c =>
      c.id === itemId ? { ...c, concluida: !c.concluida } : c
    );
    await onUpdate({ ...etapa, checklist });
  }

  async function saveMat(m: MaterialEtapa) {
    const mats = etapa.materiais || [];
    const idx = mats.findIndex(x => x.id === m.id);
    const next = idx >= 0 ? mats.map(x => x.id === m.id ? m : x) : [...mats, m];
    await onUpdate({ ...etapa, materiais: next });
  }

  async function removeMat(id: string) {
    await onUpdate({ ...etapa, materiais: (etapa.materiais || []).filter(m => m.id !== id) });
  }

  async function marcarPedido(matId: string, val: boolean) {
    const next = (etapa.materiais || []).map(m => m.id === matId ? { ...m, pedidoCompra: val } : m);
    await onUpdate({ ...etapa, materiais: next });
  }

  const mats = etapa.materiais || [];
  const totalPrevisto = mats.reduce((s, m) => s + (m.valorPrevisto || 0), 0);
  const totalComprado = mats.reduce((s, m) => s + (m.valorComprado || 0), 0);
  const pct = etapa.percentualExecutado || 0;

  const matColumns: ColumnsType<MaterialEtapa> = [
    {
      title: 'Material', dataIndex: 'nome',
      render: (_, m) => {
        const info = resolve(m.catalogoId, m.nome, m.unidade);
        return (
          <div>
            <Text>{info.nome}</Text>
            {!info.temCat && <Tag color="warning" style={{ marginLeft: 6, fontSize: 10 }}>sem catálogo</Tag>}
            {m.fornecedor && <div><Text type="secondary" style={{ fontSize: 11 }}>{m.fornecedor}</Text></div>}
          </div>
        );
      },
    },
    { title: 'Un', key: 'un', width: 55,
      render: (_, m) => <Tag style={{ fontSize: 11 }}>{resolve(m.catalogoId, m.nome, m.unidade).unidade}</Tag> },
    { title: 'Prev.', dataIndex: 'qtdPrevista', width: 70,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Comp.', dataIndex: 'qtdComprada', width: 70,
      render: (v: number, m) => (
        <Text style={{ fontSize: 12, color: v >= m.qtdPrevista && m.qtdPrevista > 0 ? '#52c41a' : undefined }}>{v}</Text>
      ),
    },
    { title: 'Entregue', dataIndex: 'qtdEntregue', width: 75,
      render: (v: number, m) => (
        <Text style={{ fontSize: 12, color: v >= m.qtdPrevista && m.qtdPrevista > 0 ? '#52c41a' : undefined }}>{v}</Text>
      ),
    },
    { title: 'Status', key: 'status', width: 105,
      render: (_, m) => { const s = statusMaterial(m); return <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag>; },
    },
    { title: 'Pedido', key: 'pedido', width: 70,
      render: (_, m) => (
        <Checkbox checked={m.pedidoCompra} onChange={e => marcarPedido(m.id, e.target.checked)} />
      ),
    },
    { title: 'V. Prev.', dataIndex: 'valorPrevisto', width: 95,
      render: (v: number) => v ? <Text style={{ fontSize: 11 }}>{formatarMoeda(v)}</Text> : <Text type="secondary">—</Text> },
    { title: '', key: 'acoes', width: 70,
      render: (_, m) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setMatEdit(m); setMatDrawer(true); }} />
          <Popconfirm title="Remover?" onConfirm={() => removeMat(m.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statusColor = etapa.status === 'concluida' ? '#52c41a' : etapa.status === 'em_andamento' ? '#1677ff' : undefined;

  return (
    <>
      <Card
        style={{ marginBottom: 12, borderLeft: `4px solid ${statusColor || '#d9d9d9'}` }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        {/* ── Cabeçalho ── */}
        <Row justify="space-between" align="middle" wrap={false}>
          <Col flex="auto" style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => setExpanded(e => !e)}>
            <Space align="center" wrap>
              <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                {etapa.codigo && <Text type="secondary" style={{ marginRight: 6, fontSize: 12 }}>{etapa.codigo}.</Text>}
                {etapa.nome}
              </Title>
              <EtapaStatusTag status={etapa.status} />
              {etapa.categoria && <Tag style={{ fontSize: 11 }}>{etapa.categoria}</Tag>}
              {(etapa.peso || 0) > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{etapa.peso}%</Text>}
            </Space>
          </Col>
          <Col flex="none">
            <Space size={4}>
              <Tooltip title="Imprimir OS">
                <Button type="text" size="small" icon={<PrinterOutlined />} onClick={() => onPrintOS(etapa)} />
              </Tooltip>
              <Tooltip title="Editar etapa">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(etapa)} />
              </Tooltip>
              <Popconfirm title="Excluir etapa?" onConfirm={() => onDelete(etapa.id)}>
                <Tooltip title="Excluir">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          </Col>
        </Row>

        {/* ── Controles rápidos ── */}
        <Row gutter={16} align="middle" style={{ marginTop: 10 }}>
          <Col xs={24} sm={10}>
            <Space>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Status:</Text>
              <Select
                size="small" style={{ width: 160 }}
                value={etapa.status}
                options={ETAPA_STATUS_OPTIONS}
                onChange={v => updateStatus(v as StatusEtapa)}
              />
            </Space>
          </Col>
          <Col xs={24} sm={14}>
            <Row align="middle" gutter={8}>
              <Col flex="auto">
                <Slider
                  value={pct} min={0} max={100} step={5}
                  onChange={updateProgresso}
                  tooltip={{ formatter: v => `${v}%` }}
                  styles={{ track: { backgroundColor: statusColor } }}
                />
              </Col>
              <Col flex="none">
                <Text style={{ fontSize: 13, fontWeight: 600 }}>{pct}%</Text>
              </Col>
            </Row>
          </Col>
        </Row>

        {/* ── Sumário materiais (sempre visível) ── */}
        {mats.length > 0 && (
          <Row gutter={16} style={{ marginTop: 4 }}>
            <Col>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {mats.length} material(is) · Previsto: {formatarMoeda(totalPrevisto)}
                {totalComprado > 0 && ` · Comprado: ${formatarMoeda(totalComprado)}`}
              </Text>
            </Col>
          </Row>
        )}

        {/* ── Conteúdo expandido ── */}
        {expanded && (
          <div style={{ marginTop: 12 }}>
            {/* Memorial */}
            {etapa.memorial && (
              <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f', marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Memorial Técnico</Text>
                <Text style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{etapa.memorial}</Text>
              </Card>
            )}

            {/* Checklist */}
            {(etapa.checklist || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>Checklist</Text>
                {(etapa.checklist || []).map(item => (
                  <div key={item.id} style={{ marginBottom: 4 }}>
                    <Checkbox
                      checked={item.concluida}
                      onChange={() => toggleChecklist(item.id)}
                    >
                      <Text delete={item.concluida} type={item.concluida ? 'secondary' : undefined}>
                        {item.texto}
                      </Text>
                    </Checkbox>
                  </div>
                ))}
                <Divider style={{ margin: '8px 0' }} />
              </div>
            )}

            {/* Materiais */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
              <Col><Text strong>Materiais</Text></Col>
              <Col>
                <Button
                  size="small" icon={<PlusOutlined />}
                  onClick={() => { setMatEdit(null); setMatDrawer(true); }}
                >
                  Adicionar material
                </Button>
              </Col>
            </Row>

            {mats.length > 0 ? (
              <Table
                dataSource={mats}
                columns={matColumns}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
                footer={() => (
                  <Row justify="end">
                    <Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>Total previsto: <Text strong>{formatarMoeda(totalPrevisto)}</Text></Text>
                      {totalComprado > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}>Comprado: <Text strong>{formatarMoeda(totalComprado)}</Text></Text>
                      )}
                    </Space>
                  </Row>
                )}
              />
            ) : (
              <Button
                type="dashed" block icon={<PlusOutlined />}
                onClick={() => { setMatEdit(null); setMatDrawer(true); }}
              >
                Adicionar primeiro material
              </Button>
            )}

            {/* Concluir rápido */}
            {etapa.status !== 'concluida' && (
              <Button
                type="primary" icon={<CheckOutlined />}
                style={{ marginTop: 12, background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => updateStatus('concluida')}
              >
                Marcar como concluída
              </Button>
            )}
          </div>
        )}

        {!expanded && (
          <Button type="link" size="small" style={{ padding: 0, marginTop: 4, fontSize: 12 }}
            onClick={() => setExpanded(true)}>
            {mats.length > 0 ? `Ver materiais e detalhes ↓` : 'Expandir ↓'}
          </Button>
        )}
        {expanded && (
          <Button type="link" size="small" style={{ padding: 0, marginTop: 8, fontSize: 12 }}
            onClick={() => setExpanded(false)}>
            Recolher ↑
          </Button>
        )}
      </Card>

      <MaterialEtapaForm
        material={matEdit}
        open={matDrawer}
        onClose={() => setMatDrawer(false)}
        onSave={saveMat}
      />
    </>
  );
}
