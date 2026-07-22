import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Input, Drawer, Form, InputNumber, Select,
  Row, Col, Typography, Popconfirm, message, Tag, Divider,
  Card, Progress, Tooltip, Collapse, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  AppstoreOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { Modelo, EtapaTemplate, MaterialTemplate, UnidadeMedida, ClassificacaoMaterial } from '../../types';
import { useModelosStore } from '../../stores/useModelosStore';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import { uid, hoje, formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

const UNIDADES: UnidadeMedida[] = ['un','sc','m²','m³','m','kg','t','l','gl','cx','pc','barra'];

// ── Editor de materiais de uma etapa ────────────────────────────────────────
function MateriaisEtapa({
  materiais, onChange, catalogo,
}: {
  materiais: MaterialTemplate[];
  onChange: (mats: MaterialTemplate[]) => void;
  catalogo: ReturnType<typeof useCatalogoStore.getState>['catalogo'];
}) {
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState<UnidadeMedida>('un');
  const [qtd, setQtd] = useState(0);
  const [valor, setValor] = useState(0);
  const [class_] = useState<ClassificacaoMaterial>('obrigatorio_iniciar');
  const [catId, setCatId] = useState<string | undefined>();

  function autoFill(selectedNome: string) {
    const item = catalogo.find(c => c.nome === selectedNome);
    if (item) {
      setUnidade(item.unidade);
      setValor(item.valorRef || 0);
      setCatId(item.id);
    } else {
      setCatId(undefined);
    }
    setNome(selectedNome);
  }

  function add() {
    if (!nome.trim()) return;
    onChange([...materiais, {
      id: uid(), nome: nome.trim(), catalogoId: catId, unidade,
      qtdPorBox: qtd, valorUnitario: valor, classificacao: class_,
    }]);
    setNome(''); setQtd(0); setValor(0); setCatId(undefined); setUnidade('un');
  }

  return (
    <div style={{ marginTop: 8 }}>
      {materiais.map((m, i) => {
        const info = useCatalogoStore.getState().resolve(m.catalogoId, m.nome, m.unidade);
        return (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ flex: 1 }}>{info.nome}</Text>
            <Tag>{info.unidade}</Tag>
            <Text type="secondary" style={{ width: 60, textAlign: 'right' }}>
              {m.qtdPorBox} {info.unidade}
            </Text>
            {(m.valorUnitario || info.valorRef) > 0 && (
              <Text type="secondary" style={{ width: 80, textAlign: 'right', fontSize: 12 }}>
                {formatarMoeda((m.valorUnitario || info.valorRef) * m.qtdPorBox)}
              </Text>
            )}
            {!info.temCat && <Tag color="warning" style={{ fontSize: 10 }}>sem catálogo</Tag>}
            <Button type="text" danger size="small" icon={<DeleteOutlined />}
              onClick={() => onChange(materiais.filter((_, j) => j !== i))} />
          </div>
        );
      })}

      <Divider dashed style={{ margin: '8px 0' }} />

      <Row gutter={8} align="bottom">
        <Col flex="auto">
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Nome do material (busca no catálogo)"
            optionFilterProp="label"
            value={nome || undefined}
            onSearch={setNome}
            onChange={autoFill}
            options={catalogo.map(c => ({ value: c.nome, label: c.nome }))}
            notFoundContent={nome ? <Text type="secondary" style={{ fontSize: 12 }}>"{nome}" (não está no catálogo)</Text> : null}
            filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          />
        </Col>
        <Col style={{ width: 90 }}>
          <Select value={unidade} onChange={v => setUnidade(v as UnidadeMedida)}
            options={UNIDADES.map(u => ({ value: u, label: u }))} />
        </Col>
        <Col style={{ width: 90 }}>
          <InputNumber style={{ width: '100%' }} placeholder="Qtd/un" min={0} value={qtd}
            onChange={v => setQtd(v || 0)} />
        </Col>
        <Col style={{ width: 110 }}>
          <InputNumber style={{ width: '100%' }} placeholder="R$ unit." prefix="R$" min={0} value={valor}
            onChange={v => setValor(v || 0)} />
        </Col>
        <Col>
          <Button type="dashed" icon={<PlusOutlined />} onClick={add}>Add</Button>
        </Col>
      </Row>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function ModelosPage() {
  const { modelos, loading, fetch: fetchModelos, upsert, remove } = useModelosStore();
  const { catalogo, fetch: fetchCatalogo } = useCatalogoStore();

  const [busca, setBusca] = useState('');
  const [modoEditor, setModoEditor] = useState(false);
  const [modeloAtual, setModeloAtual] = useState<Modelo | null>(null);

  // Editor de etapa
  const [etapaForm] = Form.useForm();
  const [etapaDrawer, setEtapaDrawer] = useState(false);
  const [etapaEdit, setEtapaEdit] = useState<EtapaTemplate | null>(null);
  const [mats, setMats] = useState<MaterialTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  // Form do modelo
  const [modeloForm] = Form.useForm();
  const [modeloDrawer, setModeloDrawer] = useState(false);
  const [modeloEditId, setModeloEditId] = useState<string | null>(null);

  useEffect(() => { fetchModelos(); fetchCatalogo(); }, []);

  // ── Modelo CRUD ────────────────────────────────────────────────────────────
  function abrirNovoModelo() {
    setModeloEditId(null);
    modeloForm.resetFields();
    setModeloDrawer(true);
  }

  function abrirEditarModelo(m: Modelo) {
    setModeloEditId(m.id);
    modeloForm.setFieldsValue({ nome: m.nome, descricao: m.descricao, tipo: m.tipo });
    setModeloDrawer(true);
  }

  async function salvarModelo() {
    let v: Record<string, string>;
    try { v = await modeloForm.validateFields(); }
    catch { return; }

    setSaving(true);
    try {
      const existing = modelos.find(m => m.id === modeloEditId);
      const modelo: Modelo = {
        id: modeloEditId || uid(),
        nome: v.nome, descricao: v.descricao, tipo: v.tipo,
        etapas: existing?.etapas || [],
        criadoEm: existing?.criadoEm || hoje(),
        atualizadoEm: hoje(),
      };
      await upsert(modelo);
      message.success(`Modelo ${modeloEditId ? 'atualizado' : 'criado'}!`);
      setModeloDrawer(false);
      if (!modeloEditId) {
        setModeloAtual(modelo);
        setModoEditor(true);
      }
    } finally { setSaving(false); }
  }

  function entrarEditor(m: Modelo) {
    setModeloAtual({ ...m });
    setModoEditor(true);
  }

  async function salvarEtapasModelo(etapas: EtapaTemplate[]) {
    if (!modeloAtual) return;
    const atualizado = { ...modeloAtual, etapas, atualizadoEm: hoje() };
    setModeloAtual(atualizado);
    await upsert(atualizado);
    message.success('Modelo salvo!');
  }

  // ── Etapa CRUD ─────────────────────────────────────────────────────────────
  function abrirNovaEtapa() {
    setEtapaEdit(null);
    etapaForm.resetFields();
    setMats([]);
    setEtapaDrawer(true);
  }

  function abrirEditarEtapa(et: EtapaTemplate) {
    setEtapaEdit(et);
    etapaForm.setFieldsValue(et);
    setMats(et.materiais || []);
    setEtapaDrawer(true);
  }

  async function salvarEtapa() {
    let v: Record<string, unknown>;
    try { v = await etapaForm.validateFields(); }
    catch { return; }

    const etapas = modeloAtual?.etapas || [];
    const etapa: EtapaTemplate = {
      id: etapaEdit?.id || uid(),
      nome: String(v.nome || ''),
      ordem: Number(v.ordem) || etapas.length + 1,
      categoria: String(v.categoria || 'outros'),
      peso: Number(v.peso) || 0,
      responsavel: String(v.responsavel || ''),
      descricao: String(v.descricao || ''),
      memorial: String(v.memorial || ''),
      materiais: mats,
    };

    const novas = etapaEdit
      ? etapas.map(e => e.id === etapaEdit.id ? etapa : e)
      : [...etapas, etapa];

    await salvarEtapasModelo(novas);
    setEtapaDrawer(false);
  }

  async function removerEtapa(id: string) {
    const novas = (modeloAtual?.etapas || []).filter(e => e.id !== id);
    await salvarEtapasModelo(novas);
  }

  // ── Lista de modelos ───────────────────────────────────────────────────────
  const filtrado = modelos.filter(m =>
    !busca || m.nome.toLowerCase().includes(busca.toLowerCase()),
  );

  const columns: ColumnsType<Modelo> = [
    { title: 'Modelo', dataIndex: 'nome', sorter: (a, b) => a.nome.localeCompare(b.nome),
      render: (nome: string, r) => (
        <div>
          <Text strong>{nome}</Text>
          {r.descricao && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.descricao}</Text></div>}
        </div>
      ),
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 130,
      render: (t: string) => t ? <Tag>{t}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Etapas', key: 'etapas', width: 80,
      render: (_, r) => <Tag color="blue">{r.etapas?.length || 0}</Tag> },
    { title: 'Ações', key: 'acoes', width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Abrir editor"><Button type="text" icon={<AppstoreOutlined />} onClick={() => entrarEditor(r)} /></Tooltip>
          <Tooltip title="Editar dados"><Button type="text" icon={<EditOutlined />} onClick={() => abrirEditarModelo(r)} /></Tooltip>
          <Popconfirm title="Excluir modelo?" onConfirm={async () => { await remove(r.id); message.success('Removido.'); }}>
            <Tooltip title="Excluir"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── MODO EDITOR ────────────────────────────────────────────────────────────
  if (modoEditor && modeloAtual) {
    const etapas = modeloAtual.etapas || [];
    const totalPeso = etapas.reduce((s, e) => s + (e.peso || 0), 0);

    return (
      <div>
        <Row align="middle" style={{ marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setModoEditor(false)} style={{ marginRight: 12 }}>
            Voltar
          </Button>
          <Title level={4} style={{ margin: 0 }}>{modeloAtual.nome}</Title>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            {etapas.length === 0 ? (
              <Card>
                <Empty description="Nenhuma etapa ainda. Adicione a primeira etapa do modelo." />
              </Card>
            ) : (
              <Collapse
                items={etapas.map((et, i) => ({
                  key: et.id,
                  label: (
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Space>
                          <Text strong>{String(i + 1).padStart(2, '0')}. {et.nome}</Text>
                          {et.categoria && <Tag>{et.categoria}</Tag>}
                        </Space>
                      </Col>
                      <Col>
                        <Space size={4} onClick={e => e.stopPropagation()}>
                          {(et.peso || 0) > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{et.peso}%</Text>}
                          <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditarEtapa(et)}>Editar</Button>
                          <Popconfirm title="Remover etapa?" onConfirm={() => removerEtapa(et.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </Col>
                    </Row>
                  ),
                  children: (
                    <div>
                      {et.memorial && (
                        <Card size="small" style={{ marginBottom: 8, background: '#fffbe6', borderColor: '#ffe58f' }}>
                          <Text style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{et.memorial}</Text>
                        </Card>
                      )}
                      {et.materiais?.length > 0 ? (
                        et.materiais.map(m => {
                          const info = useCatalogoStore.getState().resolve(m.catalogoId, m.nome, m.unidade);
                          return (
                            <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0' }}>
                              <Text style={{ flex: 1 }}>{info.nome}</Text>
                              <Tag>{info.unidade}</Tag>
                              <Text type="secondary">{m.qtdPorBox} {info.unidade}/un</Text>
                              {!info.temCat && <Tag color="warning" style={{ fontSize: 10 }}>sem catálogo</Tag>}
                            </div>
                          );
                        })
                      ) : (
                        <Text type="secondary">Sem materiais.</Text>
                      )}
                    </div>
                  ),
                }))}
              />
            )}

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              block
              style={{ marginTop: 12 }}
              onClick={abrirNovaEtapa}
            >
              Adicionar etapa
            </Button>
          </Col>

          <Col xs={24} lg={8}>
            <Card title="Resumo do modelo" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">Total de etapas</Text>
                  <div><Text strong>{etapas.length}</Text></div>
                </div>
                <div>
                  <Text type="secondary">Peso total (deve somar 100%)</Text>
                  <Progress
                    percent={totalPeso}
                    status={totalPeso === 100 ? 'success' : totalPeso > 100 ? 'exception' : 'active'}
                    size="small"
                  />
                </div>
                <div>
                  <Text type="secondary">Total de materiais</Text>
                  <div><Text strong>{etapas.reduce((s, e) => s + (e.materiais?.length || 0), 0)}</Text></div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        {/* Drawer editor de etapa */}
        <Drawer
          title={etapaEdit ? `Editar: ${etapaEdit.nome}` : 'Nova Etapa'}
          open={etapaDrawer}
          onClose={() => setEtapaDrawer(false)}
          width={680}
          footer={
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setEtapaDrawer(false)}>Cancelar</Button>
              <Button type="primary" onClick={salvarEtapa}>Salvar etapa</Button>
            </Space>
          }
        >
          <Form form={etapaForm} layout="vertical">
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item name="nome" label="Nome da etapa" rules={[{ required: true }]}>
                  <Input placeholder="Ex: Fundação" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="peso" label="Peso (% da obra)">
                  <InputNumber style={{ width: '100%' }} min={0} max={100} suffix="%" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="categoria" label="Categoria">
                  <Select options={[
                    'estrutura','alvenaria','cobertura','hidraulica','eletrica',
                    'acabamento','revestimento','esquadria','instalacoes','outros',
                  ].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="responsavel" label="Responsável padrão">
                  <Input placeholder="Ex: Mestre de obras" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="descricao" label="Descrição">
              <Input.TextArea rows={2} />
            </Form.Item>

            <Form.Item name="memorial" label="Memorial Técnico / Instruções de Execução">
              <Input.TextArea rows={5}
                placeholder="Descreva os procedimentos, normas técnicas, cuidados especiais e sequência de execução desta etapa..." />
            </Form.Item>

            <Divider>Materiais desta etapa</Divider>
            <MateriaisEtapa materiais={mats} onChange={setMats} catalogo={catalogo} />
          </Form>
        </Drawer>
      </div>
    );
  }

  // ── LISTA DE MODELOS ───────────────────────────────────────────────────────
  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Modelos</Title></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={abrirNovoModelo}>Novo Modelo</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar por nome..." value={busca}
            onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
      </Row>

      <Table dataSource={filtrado} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ pageSize: 20, showTotal: t => `${t} modelo(s)` }}
        locale={{ emptyText: 'Nenhum modelo cadastrado.' }} />

      {/* Drawer novo/editar modelo */}
      <Drawer
        title={modeloEditId ? 'Editar Modelo' : 'Novo Modelo'}
        open={modeloDrawer} onClose={() => setModeloDrawer(false)} width={480}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setModeloDrawer(false)}>Cancelar</Button>
            <Button type="primary" loading={saving} onClick={salvarModelo}>
              {modeloEditId ? 'Salvar' : 'Criar e abrir editor'}
            </Button>
          </Space>
        }
      >
        <Form form={modeloForm} layout="vertical">
          <Form.Item name="nome" label="Nome do modelo" rules={[{ required: true }]}>
            <Input placeholder="Ex: Residência Padrão" />
          </Form.Item>
          <Form.Item name="tipo" label="Tipo">
            <Input placeholder="Ex: Residencial, Comercial, Hotel..." />
          </Form.Item>
          <Form.Item name="descricao" label="Descrição">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
