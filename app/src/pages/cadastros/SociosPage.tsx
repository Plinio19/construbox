import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, InputNumber,
  Row, Col, Typography, Popconfirm, message, Tooltip, Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Socio } from '../../types';
import { useSociosStore } from '../../stores/useSociosStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;

export default function SociosPage() {
  const { socios, loading, fetch, upsert, remove } = useSociosStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() { setEditId(null); form.resetFields(); setOpen(true); }
  function abrirEditar(s: Socio) { setEditId(s.id); form.setFieldsValue(s); setOpen(true); }

  async function salvar() {
    let v: Partial<Socio>;
    try { v = await form.validateFields(); }
    catch { return; }
    setSaving(true);
    try {
      await upsert({ id: editId || uid(), criadoEm: hoje(), ...v } as Socio);
      message.success(`Sócio ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = socios.filter(s =>
    !busca || s.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const totalPercentual = socios.reduce((t, s) => t + (s.percentual || 0), 0);

  const columns: ColumnsType<Socio> = [
    {
      title: 'Nome', dataIndex: 'nome',
      sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string) => <Text strong>{nome}</Text>,
    },
    {
      title: 'Participação', dataIndex: 'percentual', width: 140,
      render: (v: number) => v != null
        ? <Tag color="blue">{v.toFixed(1).replace('.', ',')}%</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm title="Excluir sócio?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
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
        <Col>
          <Title level={4} style={{ margin: 0 }}>Sócios</Title>
          {socios.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total de participações: {totalPercentual.toFixed(1).replace('.', ',')}%
              {Math.abs(totalPercentual - 100) > 0.1 && (
                <Text type="warning"> (diferente de 100%)</Text>
              )}
            </Text>
          )}
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>
            Novo Sócio
          </Button>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>

      <Table
        dataSource={filtrado}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} sócio(s)` }}
        locale={{ emptyText: 'Nenhum sócio cadastrado.' }}
      />

      <Drawer
        title={editId ? 'Editar Sócio' : 'Novo Sócio'}
        open={open}
        onClose={() => setOpen(false)}
        width={400}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="primary" loading={saving} onClick={salvar}>
              {editId ? 'Salvar' : 'Cadastrar'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nome" label="Nome" rules={[{ required: true, message: 'Informe o nome' }]}>
            <Input placeholder="Nome completo do sócio" />
          </Form.Item>
          <Form.Item name="percentual" label="Participação (%)">
            <InputNumber
              style={{ width: '100%' }}
              min={0} max={100} precision={2} step={0.5}
              suffix="%"
              placeholder="Ex: 50"
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
