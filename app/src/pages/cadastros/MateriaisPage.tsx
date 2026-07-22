import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Select, Drawer, Form, InputNumber,
  Row, Col, Typography, Popconfirm, message, Tag, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { MaterialCatalogo, CategoriaMateria, UnidadeMedida } from '../../types';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import { uid, hoje, gerarCodigo, formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

const CATEGORIAS: { value: CategoriaMateria; label: string }[] = [
  { value: 'estrutura',          label: 'Estrutura' },
  { value: 'alvenaria',          label: 'Alvenaria' },
  { value: 'cobertura',          label: 'Cobertura' },
  { value: 'hidraulica',         label: 'Hidráulica' },
  { value: 'eletrica',           label: 'Elétrica' },
  { value: 'acabamento',         label: 'Acabamento' },
  { value: 'impermeabilizacao',  label: 'Impermeabilização' },
  { value: 'esquadria',          label: 'Esquadria' },
  { value: 'revestimento',       label: 'Revestimento' },
  { value: 'instalacoes',        label: 'Instalações' },
  { value: 'equipamento',        label: 'Equipamento' },
  { value: 'outros',             label: 'Outros' },
];

const UNIDADES: { value: UnidadeMedida; label: string }[] = [
  { value: 'un',    label: 'un — Unidade' },
  { value: 'sc',    label: 'sc — Saco' },
  { value: 'm²',    label: 'm² — Metro quadrado' },
  { value: 'm³',    label: 'm³ — Metro cúbico' },
  { value: 'm',     label: 'm — Metro linear' },
  { value: 'kg',    label: 'kg — Quilograma' },
  { value: 't',     label: 't — Tonelada' },
  { value: 'l',     label: 'l — Litro' },
  { value: 'gl',    label: 'gl — Galão' },
  { value: 'cx',    label: 'cx — Caixa' },
  { value: 'pc',    label: 'pc — Peça' },
  { value: 'barra', label: 'barra — Barra' },
];

const CAT_COLORS: Record<CategoriaMateria, string> = {
  estrutura: 'blue', alvenaria: 'orange', cobertura: 'cyan', hidraulica: 'geekblue',
  eletrica: 'gold', acabamento: 'purple', impermeabilizacao: 'volcano',
  esquadria: 'lime', revestimento: 'magenta', instalacoes: 'green',
  equipamento: 'red', outros: 'default',
};

export default function MateriaisPage() {
  const { catalogo, loading, fetch, upsert, remove } = useCatalogoStore();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaMateria | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, []);

  function abrirNovo() {
    setEditId(null);
    form.resetFields();
    form.setFieldValue('codigo', gerarCodigo('MAT', catalogo));
    form.setFieldValue('unidade', 'un');
    form.setFieldValue('categoria', 'outros');
    setOpen(true);
  }

  function abrirEditar(m: MaterialCatalogo) {
    setEditId(m.id);
    form.setFieldsValue(m);
    setOpen(true);
  }

  async function salvar() {
    let values: Partial<MaterialCatalogo>;
    try { values = await form.validateFields(); }
    catch { return; }

    setSaving(true);
    try {
      const material: MaterialCatalogo = {
        id: editId || uid(),
        codigo:        values.codigo || gerarCodigo('MAT', catalogo),
        nome:          values.nome!,
        especificacao: values.especificacao,
        categoria:     values.categoria || 'outros',
        unidade:       values.unidade || 'un',
        ncm:           values.ncm,
        marca:         values.marca,
        fornecedorRef: values.fornecedorRef,
        valorRef:      values.valorRef,
        estoqueMinimo: values.estoqueMinimo,
        prazoPedido:   values.prazoPedido,
        observacoes:   values.observacoes,
        criadoEm:      catalogo.find(x => x.id === editId)?.criadoEm || hoje(),
      };
      await upsert(material);
      message.success(`Material ${editId ? 'atualizado' : 'cadastrado'}!`);
      setOpen(false);
    } catch (e) {
      message.error('Erro: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  const filtrado = catalogo.filter(m => {
    const matchBusca = !busca ||
      m.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (m.codigo || '').toLowerCase().includes(busca.toLowerCase()) ||
      (m.marca || '').toLowerCase().includes(busca.toLowerCase());
    const matchCat = !filtroCategoria || m.categoria === filtroCategoria;
    return matchBusca && matchCat;
  });

  const columns: ColumnsType<MaterialCatalogo> = [
    { title: 'Código', dataIndex: 'codigo', width: 110,
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Material', dataIndex: 'nome',
      sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.especificacao && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.especificacao}</Text></div>}
          {r.marca && <Text type="secondary" style={{ fontSize: 11 }}>Marca: {r.marca}</Text>}
        </div>
      ),
    },
    { title: 'Categoria', dataIndex: 'categoria', width: 150,
      render: (c: CategoriaMateria) => (
        <Tag color={CAT_COLORS[c]}>{CATEGORIAS.find(x => x.value === c)?.label || c}</Tag>
      ),
    },
    { title: 'Unidade', dataIndex: 'unidade', width: 80,
      render: (u: string) => <Tag>{u}</Tag> },
    { title: 'Preço ref.', dataIndex: 'valorRef', width: 120,
      sorter: (a, b) => (a.valorRef || 0) - (b.valorRef || 0),
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Fornecedor', dataIndex: 'fornecedorRef', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Editar">
            <Button type="text" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm title="Excluir material?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
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
        <Col><Title level={4} style={{ margin: 0 }}>Catálogo de Materiais</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovo}>Novo Material</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome, código ou marca..." value={busca}
            onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
        <Col xs={24} sm={10}>
          <Select style={{ width: '100%' }} placeholder="Filtrar por categoria"
            options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORIAS]}
            value={filtroCategoria} onChange={v => setFiltroCategoria(v as CategoriaMateria | '')} />
        </Col>
      </Row>

      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 25, showTotal: t => `${t} material(is)` }}
        locale={{ emptyText: 'Nenhum material cadastrado.' }} />

      <Drawer
        title={editId ? 'Editar Material' : 'Novo Material'}
        open={open} onClose={() => setOpen(false)} width={680}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="primary" loading={saving} onClick={salvar}>
              {editId ? 'Salvar alterações' : 'Cadastrar material'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="codigo" label="Código interno">
                <Input placeholder="MAT-0001" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="nome" label="Nome / Descrição" rules={[{ required: true, message: 'Obrigatório' }]}>
                <Input placeholder="Ex: Cimento Portland CP-II 50kg" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="especificacao" label="Especificação técnica">
            <Input.TextArea rows={2} placeholder="Detalhes técnicos, normas, características..." />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="categoria" label="Categoria" rules={[{ required: true }]}>
                <Select options={CATEGORIAS} placeholder="Selecione" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unidade" label="Unidade de medida" rules={[{ required: true }]}>
                <Select options={UNIDADES} placeholder="Selecione" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="ncm" label="NCM">
                <Input placeholder="0000.00.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="marca" label="Marca">
                <Input placeholder="Ex: Votoran" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fornecedorRef" label="Fornecedor referência">
                <Input placeholder="Ex: Depósito ABC" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="valorRef" label="Preço de referência">
                <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="estoqueMinimo" label="Estoque mínimo">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="prazoPedido" label="Prazo de pedido (dias)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="observacoes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
