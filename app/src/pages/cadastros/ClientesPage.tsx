import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, Select,
  Row, Col, Typography, Popconfirm, message, Tag, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Cliente } from '../../types';
import { useClientesStore } from '../../stores/useClientesStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;

export default function ClientesPage() {
  const { clientes, loading, fetch, upsert, remove } = useClientesStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() {
    setEditId(null); form.resetFields();
    form.setFieldValue('tipo', 'pf');
    setOpen(true);
  }

  function abrirEditar(c: Cliente) {
    setEditId(c.id); form.setFieldsValue(c); setOpen(true);
  }

  async function salvar() {
    let v: Partial<Cliente>;
    try { v = await form.validateFields(); }
    catch { return; }
    setSaving(true);
    try {
      await upsert({ id: editId || uid(), criadoEm: hoje(), ...v } as Cliente);
      message.success(`Cliente ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = clientes.filter(c =>
    !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.cpfCnpj || '').includes(busca) || (c.email || '').toLowerCase().includes(busca.toLowerCase())
  );

  const columns: ColumnsType<Cliente> = [
    { title: 'Nome', dataIndex: 'nome', sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.email && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text></div>}
        </div>
      ),
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 80,
      render: (t: string) => <Tag color={t === 'pj' ? 'blue' : 'default'}>{t === 'pj' ? 'PJ' : 'PF'}</Tag> },
    { title: 'CPF / CNPJ', dataIndex: 'cpfCnpj', width: 160,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Telefone', dataIndex: 'telefone', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} /></Tooltip>
          <Popconfirm title="Excluir cliente?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
            <Tooltip title="Excluir"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Clientes</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Cliente</Button></Col>
      </Row>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>
      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} cliente(s)` }}
        locale={{ emptyText: 'Nenhum cliente cadastrado.' }} />

      <Drawer title={editId ? 'Editar Cliente' : 'Novo Cliente'} open={open} onClose={() => setOpen(false)} width={500}
        footer={<Space style={{ float: 'right' }}><Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>{editId ? 'Salvar' : 'Cadastrar'}</Button></Space>}>
        <Form form={form} layout="vertical">
          <Form.Item name="tipo" label="Tipo de pessoa">
            <Select options={[{ value: 'pf', label: 'Pessoa Física (PF)' }, { value: 'pj', label: 'Pessoa Jurídica (PJ)' }]} />
          </Form.Item>
          <Form.Item name="nome" label="Nome / Razão Social" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cpfCnpj" label="CPF / CNPJ"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telefone" label="Telefone"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="E-mail">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="endereco" label="Endereço">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
