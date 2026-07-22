import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, InputNumber,
  Row, Col, Typography, Popconfirm, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Prestador } from '../../types';
import { usePrestadoresStore } from '../../stores/usePrestadoresStore';
import { uid, hoje, formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

export default function PrestadoresPage() {
  const { prestadores, loading, fetch, upsert, remove } = usePrestadoresStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() { setEditId(null); form.resetFields(); setOpen(true); }
  function abrirEditar(p: Prestador) { setEditId(p.id); form.setFieldsValue(p); setOpen(true); }

  async function salvar() {
    let v: Partial<Prestador>;
    try { v = await form.validateFields(); }
    catch { return; }
    setSaving(true);
    try {
      await upsert({ id: editId || uid(), criadoEm: hoje(), ...v } as Prestador);
      message.success(`Prestador ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = prestadores.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.especialidade || '').toLowerCase().includes(busca.toLowerCase())
  );

  const columns: ColumnsType<Prestador> = [
    { title: 'Nome', dataIndex: 'nome', sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.especialidade && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.especialidade}</Text></div>}
        </div>
      ),
    },
    { title: 'CPF/CNPJ', dataIndex: 'cpfCnpj', width: 160,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Telefone', dataIndex: 'telefone', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Valor/hora', dataIndex: 'valorHora', width: 120,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} /></Tooltip>
          <Popconfirm title="Excluir prestador?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
            <Tooltip title="Excluir"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Prestadores de Serviço</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Prestador</Button></Col>
      </Row>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome ou especialidade..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>
      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} prestador(es)` }}
        locale={{ emptyText: 'Nenhum prestador cadastrado.' }} />

      <Drawer title={editId ? 'Editar Prestador' : 'Novo Prestador'} open={open} onClose={() => setOpen(false)} width={500}
        footer={<Space style={{ float: 'right' }}><Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>{editId ? 'Salvar' : 'Cadastrar'}</Button></Space>}>
        <Form form={form} layout="vertical">
          <Form.Item name="nome" label="Nome / Razão Social" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="especialidade" label="Especialidade">
            <Input placeholder="Ex: Eletricista, Mestre de obras, Pedreiro..." />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="cpfCnpj" label="CPF / CNPJ"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="telefone" label="Telefone"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="email" label="E-mail"><Input type="email" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="valorHora" label="Valor por hora">
                <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
}
