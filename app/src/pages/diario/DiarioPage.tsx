import { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, DatePicker, Typography,
  Space, Tag, Popconfirm, message, Row, Col, Card, InputNumber, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDiarioStore } from '../../stores/useDiarioStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { uid, hoje, formatarData, esc } from '../../utils';
import type { DiarioEntrada, Clima } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;

const CLIMAS: { value: Clima; label: string; emoji: string }[] = [
  { value: 'ensolarado',           label: 'Ensolarado',           emoji: 'Sol' },
  { value: 'parcialmente_nublado', label: 'Parcialmente Nublado',  emoji: 'Nublado' },
  { value: 'nublado',              label: 'Nublado',              emoji: 'Nuvem' },
  { value: 'chuvoso',              label: 'Chuvoso',              emoji: 'Chuva' },
];

function climaLabel(c?: Clima) {
  return CLIMAS.find(x => x.value === c)?.label ?? '';
}

function gerarRelatorio(entradas: DiarioEntrada[], obras: { id: string; nome: string }[], obraFiltro: string | null) {
  const filtradas = (obraFiltro ? entradas.filter(e => e.obraId === obraFiltro) : entradas)
    .sort((a, b) => b.data.localeCompare(a.data));
  const obraNome = obraFiltro ? (obras.find(o => o.id === obraFiltro)?.nome ?? 'Todas') : 'Todas as Obras';
  const w = window.open('', '_blank');
  if (!w) return;
  const linhas = filtradas.map(e => {
    const obra = obras.find(o => o.id === e.obraId);
    return `<div class="entrada">
<div class="hdr"><span>${formatarData(e.data)} | ${esc(e.responsavel)}</span><span>${esc(obra?.nome ?? '')}</span></div>
<div class="body">
${e.clima ? `<div class="tag">Clima: ${esc(climaLabel(e.clima))}</div>` : ''}
${e.efetivo != null ? `<div class="tag">Efetivo: ${e.efetivo} pessoas</div>` : ''}
<div class="blk"><b>Avancos:</b><p>${esc(e.avancos)}</p></div>
${e.problemas ? `<div class="blk"><b>Problemas:</b><p>${esc(e.problemas)}</p></div>` : ''}
${e.proximoDia ? `<div class="blk"><b>Proximo dia:</b><p>${esc(e.proximoDia)}</p></div>` : ''}
</div></div>`;
  }).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Diario - ${esc(obraNome)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font:11px Arial,sans-serif;color:#222;padding:20px}
h1{font-size:18px;margin-bottom:4px}.sub{color:#666;margin-bottom:20px}
.entrada{border:1px solid #ddd;border-radius:6px;margin-bottom:14px;overflow:hidden;page-break-inside:avoid}
.hdr{background:#1a3a5c;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;font-weight:bold}
.body{padding:10px 12px}.tag{display:inline-block;background:#f0f0f0;border-radius:4px;padding:2px 8px;margin:0 4px 6px 0;font-size:10px}
.blk{margin-bottom:8px}.blk b{color:#555}.blk p{margin-top:3px;white-space:pre-wrap}
@media print{body{padding:10px}}</style></head><body>
<h1>Diario de Obra</h1><div class="sub">Obra: ${esc(obraNome)} | Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
${linhas || '<p>Nenhum registro.</p>'}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

export default function DiarioPage() {
  const { entradas, loading, fetch, upsert, remove } = useDiarioStore();
  const { obras, fetch: fetchObras } = useObrasStore();
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<DiarioEntrada | null>(null);
  const [obraFiltro, setObraFiltro] = useState<string | null>(null);
  const [form] = Form.useForm();

  useEffect(() => { fetch(); fetchObras(); }, []);

  const filtradas = (obraFiltro ? entradas.filter(e => e.obraId === obraFiltro) : entradas)
    .sort((a, b) => b.data.localeCompare(a.data));

  function abrirNova() {
    setEditando(null);
    form.resetFields();
    form.setFieldsValue({ data: dayjs(), clima: 'ensolarado' });
    setOpen(true);
  }

  function abrirEditar(e: DiarioEntrada) {
    setEditando(e);
    form.setFieldsValue({ ...e, data: dayjs(e.data) });
    setOpen(true);
  }

  async function salvar() {
    try {
      const vals = await form.validateFields();
      const entrada: DiarioEntrada = {
        id: editando?.id ?? uid(),
        criadoEm: editando?.criadoEm ?? hoje(),
        ...editando,
        ...vals,
        data: (vals.data as dayjs.Dayjs).format('YYYY-MM-DD'),
      };
      await upsert(entrada);
      message.success('Entrada salva!');
      setOpen(false);
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error('Erro: ' + String(e));
    }
  }

  async function excluir(id: string) {
    try {
      await remove(id);
      message.success('Removido');
    } catch (e) {
      message.error('Erro: ' + String(e));
    }
  }

  const columns = [
    {
      title: 'Data', dataIndex: 'data', width: 100,
      render: (v: string) => <Text strong>{formatarData(v)}</Text>,
    },
    {
      title: 'Obra', dataIndex: 'obraId', width: 180,
      render: (id: string) => {
        const o = obras.find(x => x.id === id);
        return <Text style={{ fontSize: 12 }}>{o?.nome ?? id}</Text>;
      },
    },
    { title: 'Responsavel', dataIndex: 'responsavel', width: 140 },
    {
      title: 'Efetivo', dataIndex: 'efetivo', width: 80,
      render: (v?: number) => v != null ? `${v} pessoas` : '-',
    },
    {
      title: 'Clima', dataIndex: 'clima', width: 120,
      render: (v?: Clima) => v ? <Tag>{climaLabel(v)}</Tag> : '-',
    },
    {
      title: 'Avancos', dataIndex: 'avancos',
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>
          {v.length > 100 ? v.slice(0, 100) + '...' : v}
        </Text>
      ),
    },
    {
      title: 'Problemas', dataIndex: 'problemas', width: 140,
      render: (v?: string) => v
        ? <Tag color="orange" style={{ fontSize: 11, whiteSpace: 'normal' }}>{v.slice(0, 60)}{v.length > 60 ? '...' : ''}</Tag>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '', width: 80,
      render: (_: unknown, r: DiarioEntrada) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          <Popconfirm title="Remover?" onConfirm={() => excluir(r.id)} okText="Sim" cancelText="Nao">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Diario de Obra</Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<FilePdfOutlined />} onClick={() => gerarRelatorio(entradas, obras, obraFiltro)}>
              Relatorio
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNova}>
              Nova Entrada
            </Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
        <Row gutter={12} align="middle">
          <Col><Text type="secondary" style={{ fontSize: 12 }}>Filtrar por obra:</Text></Col>
          <Col flex="300px">
            <Select
              allowClear placeholder="Todas as obras" style={{ width: '100%' }}
              value={obraFiltro} onChange={v => setObraFiltro(v ?? null)}
              options={obras.map(o => ({ value: o.id, label: o.nome }))}
            />
          </Col>
          <Col><Text type="secondary" style={{ fontSize: 12 }}>{filtradas.length} registro(s)</Text></Col>
        </Row>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="Nenhuma entrada no diario" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNova}>Adicionar primeira entrada</Button>
        </Empty>
      ) : (
        <Table dataSource={filtradas} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} size="small" />
      )}

      <Drawer
        title={editando ? 'Editar Entrada' : 'Nova Entrada do Diario'}
        open={open} onClose={() => setOpen(false)} width={520}
        footer={
          <Space style={{ justifyContent: 'flex-end', display: 'flex' }}>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="primary" onClick={salvar}>Salvar</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="data" label="Data" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="clima" label="Clima">
                <Select options={CLIMAS.map(c => ({ value: c.value, label: `${c.emoji} ${c.label}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="obraId" label="Obra" rules={[{ required: true, message: 'Selecione a obra' }]}>
            <Select showSearch optionFilterProp="label" options={obras.map(o => ({ value: o.id, label: o.nome }))} placeholder="Selecione a obra" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="responsavel" label="Responsavel" rules={[{ required: true }]}>
                <Input placeholder="Nome do responsavel" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="efetivo" label="Efetivo (pessoas)">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="avancos" label="Avancos do dia" rules={[{ required: true, message: 'Descreva os avancos' }]}>
            <TextArea rows={4} placeholder="O que foi executado hoje..." />
          </Form.Item>
          <Form.Item name="problemas" label="Problemas / Ocorrencias">
            <TextArea rows={3} placeholder="Problemas encontrados..." />
          </Form.Item>
          <Form.Item name="proximoDia" label="Previsao Proximo Dia">
            <TextArea rows={2} placeholder="O que esta previsto para o proximo dia..." />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}