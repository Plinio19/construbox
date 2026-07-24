import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, Select,
  Row, Col, Typography, Popconfirm, message, Tag, Tooltip, Divider, Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, LoadingOutlined,
} from '@ant-design/icons';
import type { Cliente } from '../../types';
import { useClientesStore } from '../../stores/useClientesStore';
import { useVendedoresStore } from '../../stores/useVendedoresStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;

const ESTADOS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

function apenasDigitos(s: string) { return s.replace(/\D/g, ''); }

function formatarCNPJ(v: string) {
  const d = apenasDigitos(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
          .replace(/^(\d{2})(\d{4})(\d{4})(\d{4})/, '$1.$2.$3/$4')
          .replace(/^(\d{2})(\d{4})(\d{4})/, '$1.$2.$3')
          .replace(/^(\d{2})(\d{4})/, '$1.$2')
          .replace(/^(\d{2})/, '$1');
}

function formatarCPF(v: string) {
  const d = apenasDigitos(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
          .replace(/^(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
          .replace(/^(\d{3})(\d{3})/, '$1.$2')
          .replace(/^(\d{3})/, '$1');
}

function formatarCEP(v: string) {
  const d = apenasDigitos(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d{1,3})$/, '$1-$2');
}

// ── Form de cliente (reutilizado também no modal do ObraForm) ─────────────────
interface ClienteFormProps {
  form: ReturnType<typeof Form.useForm>[0];
  vendedores: { id: string; nome: string }[];
}

export function ClienteFormFields({ form, vendedores }: ClienteFormProps) {
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [buscandoCEP, setBuscandoCEP]   = useState(false);
  const tipo = Form.useWatch('tipo', form) || 'pf';

  async function buscarCNPJ(cnpj: string) {
    const digits = apenasDigitos(cnpj);
    if (digits.length !== 14) return;
    setBuscandoCNPJ(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) { message.warning('CNPJ não encontrado na Receita Federal.'); return; }
      const d = await res.json() as Record<string, string>;
      form.setFieldsValue({
        nome:         d['razao_social'] || '',
        nomeFantasia: d['nome_fantasia'] || '',
        email:        d['email'] || '',
        telefone:     d['ddd_telefone_1'] ? d['ddd_telefone_1'].replace(/\D/g,'').replace(/^(\d{2})(\d+)$/,'($1) $2') : '',
        cep:          d['cep'] ? formatarCEP(d['cep']) : '',
        logradouro:   d['logradouro'] || '',
        numero:       d['numero'] || '',
        complemento:  d['complemento'] || '',
        bairro:       d['bairro'] || '',
        cidade:       d['municipio'] || '',
        estado:       d['uf'] || '',
      });
      message.success('Dados preenchidos pela Receita Federal!');
    } catch {
      message.warning('Erro ao consultar CNPJ. Preencha manualmente.');
    } finally { setBuscandoCNPJ(false); }
  }

  async function buscarCEP(cep: string) {
    const digits = apenasDigitos(cep);
    if (digits.length !== 8) return;
    setBuscandoCEP(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await res.json() as Record<string, string>;
      if (d['erro']) { message.warning('CEP não encontrado.'); return; }
      form.setFieldsValue({
        logradouro: d['logradouro'] || '',
        complemento: d['complemento'] || '',
        bairro: d['bairro'] || '',
        cidade: d['localidade'] || '',
        estado: d['uf'] || '',
      });
    } catch {
      message.warning('Erro ao buscar CEP.');
    } finally { setBuscandoCEP(false); }
  }

  return (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[{ value: 'pf', label: 'Pessoa Física' }, { value: 'pj', label: 'Pessoa Jurídica' }]} />
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item
            name="cpfCnpj"
            label={tipo === 'pj' ? 'CNPJ (busca automática)' : 'CPF'}
            rules={[{ required: true, message: `Informe o ${tipo === 'pj' ? 'CNPJ' : 'CPF'}` }]}
          >
            <Input
              placeholder={tipo === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
              suffix={buscandoCNPJ ? <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} /> : undefined}
              onChange={e => {
                const raw = apenasDigitos(e.target.value);
                const fmt = tipo === 'pj' ? formatarCNPJ(raw) : formatarCPF(raw);
                form.setFieldValue('cpfCnpj', fmt);
                if (tipo === 'pj' && raw.length === 14) buscarCNPJ(raw);
              }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="nome" label={tipo === 'pj' ? 'Razão Social' : 'Nome completo'}
        rules={[{ required: true, message: 'Informe o nome' }]}>
        <Input placeholder={tipo === 'pj' ? 'Razão social conforme CNPJ' : 'Nome completo'} />
      </Form.Item>

      {tipo === 'pj' && (
        <Form.Item name="nomeFantasia" label="Nome Fantasia">
          <Input placeholder="Nome fantasia (opcional)" />
        </Form.Item>
      )}

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name={tipo === 'pj' ? 'ie' : 'ie'} label={tipo === 'pj' ? 'Inscrição Estadual (IE)' : 'RG'}>
            <Input placeholder={tipo === 'pj' ? 'IE ou ISENTO' : 'Número do RG'} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="email" label="E-mail">
            <Input type="email" placeholder="cliente@email.com" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="telefone" label="Telefone fixo">
            <Input placeholder="(00) 0000-0000" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="celular" label="Celular / WhatsApp">
            <Input placeholder="(00) 90000-0000" />
          </Form.Item>
        </Col>
      </Row>

      <Divider style={{ margin: '8px 0 16px' }}>Endereço</Divider>

      <Row gutter={16}>
        <Col span={10}>
          <Form.Item name="cep" label="CEP">
            <Input
              placeholder="00000-000"
              suffix={buscandoCEP ? <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} /> : undefined}
              onChange={e => {
                const raw = apenasDigitos(e.target.value);
                form.setFieldValue('cep', formatarCEP(raw));
                if (raw.length === 8) buscarCEP(raw);
              }}
            />
          </Form.Item>
        </Col>
        <Col span={14}>
          <Form.Item name="logradouro" label="Logradouro (Rua / Av.)">
            <Input placeholder="Nome da rua ou avenida" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={6}>
          <Form.Item name="numero" label="Número">
            <Input placeholder="Nº" />
          </Form.Item>
        </Col>
        <Col span={18}>
          <Form.Item name="complemento" label="Complemento">
            <Input placeholder="Apto, sala, bloco..." />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={10}>
          <Form.Item name="bairro" label="Bairro">
            <Input placeholder="Bairro" />
          </Form.Item>
        </Col>
        <Col span={9}>
          <Form.Item name="cidade" label="Cidade">
            <Input placeholder="Cidade" />
          </Form.Item>
        </Col>
        <Col span={5}>
          <Form.Item name="estado" label="UF">
            <Select showSearch placeholder="UF"
              options={ESTADOS.map(e => ({ value: e, label: e }))} />
          </Form.Item>
        </Col>
      </Row>

      <Divider style={{ margin: '8px 0 16px' }}>Comercial</Divider>

      <Form.Item name="vendedorId" label="Vendedor responsável">
        <Select
          showSearch allowClear placeholder="Selecione o vendedor"
          optionFilterProp="label"
          options={vendedores.map(v => ({ value: v.id, label: v.nome }))}
        />
      </Form.Item>

      <Form.Item name="observacoes" label="Observações">
        <Input.TextArea rows={2} />
      </Form.Item>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ClientesPage() {
  const { clientes, loading, fetch, upsert, remove } = useClientesStore();
  const { vendedores, fetch: fetchVend } = useVendedoresStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); fetchVend(); }, []);

  function abrirNovo() {
    setEditId(null); form.resetFields();
    form.setFieldValue('tipo', 'pj');
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
      const vend = vendedores.find(x => x.id === v.vendedorId);
      await upsert({
        id: editId || uid(),
        criadoEm: hoje(),
        ...v,
        vendedorNome: vend?.nome,
      } as Cliente);
      message.success(`Cliente ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) { message.error(String(e)); }
    finally { setSaving(false); }
  }

  const filtrado = clientes.filter(c =>
    !busca ||
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.cpfCnpj || '').includes(busca) ||
    (c.email || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.cidade || '').toLowerCase().includes(busca.toLowerCase()),
  );

  const columns: ColumnsType<Cliente> = [
    {
      title: 'Nome / Razão Social', dataIndex: 'nome',
      sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.nomeFantasia && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.nomeFantasia}</Text></div>}
          {r.email && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.email}</Text></div>}
        </div>
      ),
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 60,
      render: (t: string) => <Tag color={t === 'pj' ? 'blue' : 'default'}>{t === 'pj' ? 'PJ' : 'PF'}</Tag> },
    { title: 'CPF / CNPJ', dataIndex: 'cpfCnpj', width: 170,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Cidade / UF', key: 'local', width: 130,
      render: (_, r) => r.cidade ? `${r.cidade}${r.estado ? ` / ${r.estado}` : ''}` : <Text type="secondary">—</Text> },
    { title: 'Vendedor', dataIndex: 'vendedorNome', width: 130,
      render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm title="Excluir cliente?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
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
        <Col><Title level={4} style={{ margin: 0 }}>Clientes</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Cliente</Button></Col>
      </Row>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome, CPF/CNPJ, e-mail ou cidade..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>
      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} cliente(s)` }}
        locale={{ emptyText: 'Nenhum cliente cadastrado.' }} />

      <Drawer title={editId ? 'Editar Cliente' : 'Novo Cliente'} open={open}
        onClose={() => setOpen(false)} width={580}
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
          <ClienteFormFields form={form} vendedores={vendedores} />
        </Form>
      </Drawer>
    </div>
  );
}
