import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, InputNumber, DatePicker,
  Row, Col, Typography, Popconfirm, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Funcionario } from '../../types';
import { useFuncionariosStore } from '../../stores/useFuncionariosStore';
import { uid, hoje, formatarMoeda, formatarData } from '../../utils';

const { Title, Text } = Typography;

export default function FuncionariosPage() {
  const { funcionarios, loading, fetch, upsert, remove } = useFuncionariosStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() { setEditId(null); form.resetFields(); setOpen(true); }
  function abrirEditar(f: Funcionario) {
    setEditId(f.id);
    form.setFieldsValue({
      ...f,
      dataAdmissao: f.dataAdmissao ? dayjs(f.dataAdmissao) : null,
    });
    setOpen(true);
  }

  async function salvar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); }
    catch { return; }
    setSaving(true);
    try {
      const func: Funcionario = {
        id: editId || uid(),
        nome: String(v.nome || ''),
        cargo: v.cargo as string | undefined,
        cpf: v.cpf as string | undefined,
        telefone: v.telefone as string | undefined,
        salario: Number(v.salario) || undefined,
        dataAdmissao: v.dataAdmissao ? (v.dataAdmissao as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        criadoEm: funcionarios.find(f => f.id === editId)?.criadoEm || hoje(),
      };
      await upsert(func);
      message.success(`Funcionário ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = funcionarios.filter(f =>
    !busca || f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.cargo || '').toLowerCase().includes(busca.toLowerCase())
  );

  const columns: ColumnsType<Funcionario> = [
    { title: 'Nome', dataIndex: 'nome', sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.cargo && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.cargo}</Text></div>}
        </div>
      ),
    },
    { title: 'CPF', dataIndex: 'cpf', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Telefone', dataIndex: 'telefone', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Salário', dataIndex: 'salario', width: 130,
      sorter: (a, b) => (a.salario || 0) - (b.salario || 0),
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Admissão', dataIndex: 'dataAdmissao', width: 120,
      render: (d: string) => formatarData(d) },
    { title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} /></Tooltip>
          <Popconfirm title="Excluir funcionário?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
            <Tooltip title="Excluir"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Funcionários</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Funcionário</Button></Col>
      </Row>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome ou cargo..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>
      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} funcionário(s)` }}
        locale={{ emptyText: 'Nenhum funcionário cadastrado.' }} />

      <Drawer title={editId ? 'Editar Funcionário' : 'Novo Funcionário'} open={open} onClose={() => setOpen(false)} width={500}
        footer={<Space style={{ float: 'right' }}><Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>{editId ? 'Salvar' : 'Cadastrar'}</Button></Space>}>
        <Form form={form} layout="vertical">
          <Form.Item name="nome" label="Nome completo" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="cargo" label="Cargo / Função"><Input placeholder="Ex: Mestre de obras" /></Form.Item></Col>
            <Col span={12}><Form.Item name="cpf" label="CPF"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="telefone" label="Telefone"><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="salario" label="Salário mensal">
                <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="dataAdmissao" label="Data de admissão">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
