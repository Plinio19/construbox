import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, InputNumber,
  Row, Col, Typography, Popconfirm, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Vendedor } from '../../types';
import { useVendedoresStore } from '../../stores/useVendedoresStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;

export default function VendedoresPage() {
  const { vendedores, loading, fetch, upsert, remove } = useVendedoresStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() {
    setEditId(null); form.resetFields(); setOpen(true);
  }

  function abrirEditar(v: Vendedor) {
    setEditId(v.id); form.setFieldsValue(v); setOpen(true);
  }

  async function salvar() {
    let v: Partial<Vendedor>;
    try { v = await form.validateFields(); }
    catch { return; }
    setSaving(true);
    try {
      await upsert({ id: editId || uid(), criadoEm: hoje(), ...v } as Vendedor);
      message.success(`Vendedor ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = vendedores.filter(v =>
    !busca || v.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (v.email || '').toLowerCase().includes(busca.toLowerCase()),
  );

  const columns: ColumnsType<Vendedor> = [
    {
      title: 'Nome', dataIndex: 'nome',
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.email && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text></div>}
        </div>
      ),
    },
    { title: 'Telefone', dataIndex: 'telefone', width: 150,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Comissão', dataIndex: 'comissaoPercentual', width: 100, align: 'center',
      render: (v: number) => v ? `${v}%` : <Text type="secondary">—</Text> },
    {
      title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm title="Excluir vendedor?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
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
        <Col><Title level={4} style={{ margin: 0 }}>Vendedores</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Vendedor</Button></Col>
      </Row>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome ou e-mail..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>
      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} vendedor(es)` }}
        locale={{ emptyText: 'Nenhum vendedor cadastrado.' }} />

      <Drawer title={editId ? 'Editar Vendedor' : 'Novo Vendedor'} open={open}
        onClose={() => setOpen(false)} width={460}
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
          <Form.Item name="nome" label="Nome completo" rules={[{ required: true, message: 'Informe o nome' }]}>
            <Input placeholder="Nome do vendedor" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cpfCnpj" label="CPF / CNPJ">
                <Input placeholder="000.000.000-00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="comissaoPercentual" label="Comissão (%)">
                <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.5} placeholder="0" addonAfter="%" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="telefone" label="Telefone / WhatsApp">
                <Input placeholder="(00) 90000-0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="E-mail">
                <Input type="email" placeholder="vendedor@email.com" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
}
