import { useEffect, useState } from 'react';
import {
  Drawer, Form, Input, Select, DatePicker, InputNumber, Tabs,
  Button, Space, Divider, Table, Popconfirm, message, Row, Col, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Obra, ObraFuncionario, Parcela, DespesaObra, StatusObra, CategoriaDespesa } from '../../types';
import { useObrasStore } from '../../stores/useObrasStore';
import { useClientesStore } from '../../stores/useClientesStore';
import { useModelosStore } from '../../stores/useModelosStore';
import { useFuncionariosStore } from '../../stores/useFuncionariosStore';
import { usePrestadoresStore } from '../../stores/usePrestadoresStore';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { OBRA_STATUS_OPTIONS } from '../../components/common/StatusTag';
import { uid, hoje, formatarMoeda } from '../../utils';

const { Text } = Typography;

interface Props {
  obra: Obra | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTS = OBRA_STATUS_OPTIONS;

const CAT_DESPESA_OPTS: { value: CategoriaDespesa; label: string }[] = [
  { value: 'mao-de-obra',  label: 'Mão de Obra' },
  { value: 'material',     label: 'Material' },
  { value: 'ferramenta',   label: 'Ferramenta' },
  { value: 'combustivel',  label: 'Combustível' },
  { value: 'comissao',     label: 'Comissão' },
  { value: 'hospedagem',   label: 'Hospedagem' },
  { value: 'imposto',      label: 'Imposto / Taxa' },
  { value: 'reembolso',    label: 'Reembolso' },
  { value: 'outros',       label: 'Outros' },
];

function gerarParcelasPreset(tipo: string, valorTotal: number, dataInicio: string): Parcela[] {
  const base = dayjs(dataInicio || hoje());
  if (tipo === 'entrada50') {
    return [
      { id: uid(), descricao: 'Entrada (50%)', valor: valorTotal * 0.5, vencimento: base.format('YYYY-MM-DD') },
      { id: uid(), descricao: 'Final (50%)', valor: valorTotal * 0.5, vencimento: base.add(30, 'day').format('YYYY-MM-DD') },
    ];
  }
  if (tipo === 'trechos') {
    return [
      { id: uid(), descricao: 'Início (30%)',  valor: valorTotal * 0.3, vencimento: base.format('YYYY-MM-DD') },
      { id: uid(), descricao: 'Meio (40%)',    valor: valorTotal * 0.4, vencimento: base.add(15, 'day').format('YYYY-MM-DD') },
      { id: uid(), descricao: 'Final (30%)',   valor: valorTotal * 0.3, vencimento: base.add(30, 'day').format('YYYY-MM-DD') },
    ];
  }
  if (tipo === 'mensal3') {
    return [1, 2, 3].map((i) => ({
      id: uid(),
      descricao: `Parcela ${i}/3`,
      valor: Math.round((valorTotal / 3) * 100) / 100,
      vencimento: base.add(i - 1, 'month').format('YYYY-MM-DD'),
    }));
  }
  return [];
}

export default function ObraForm({ obra, open, onClose }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [funcs, setFuncs] = useState<ObraFuncionario[]>([]);
  const [despesas, setDespesas] = useState<DespesaObra[]>([]);

  const { upsert: upsertObra } = useObrasStore();
  const { clientes, fetch: fetchClientes } = useClientesStore();
  const { modelos, fetch: fetchModelos } = useModelosStore();
  const { funcionarios, fetch: fetchFuncs } = useFuncionariosStore();
  const { prestadores, fetch: fetchPrest } = usePrestadoresStore();
  const { etapas, fetch: fetchEtapas, save: saveEtapas } = useEtapasStore();
  const { lancamentos, fetch: fetchLanc, save: saveLanc } = useLancamentosStore();

  useEffect(() => {
    if (open) {
      fetchClientes();
      fetchModelos();
      fetchFuncs();
      fetchPrest();
      fetchEtapas();
      fetchLanc();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (obra) {
      form.setFieldsValue({
        ...obra,
        dataInicio:       obra.dataInicio       ? dayjs(obra.dataInicio)       : null,
        dataPrevisaoFim:  obra.dataPrevisaoFim  ? dayjs(obra.dataPrevisaoFim)  : null,
      });
      setParcelas(obra.parcelas || []);
      setFuncs(obra.funcionarios || []);
      setDespesas(obra.despesas || []);
    } else {
      form.resetFields();
      form.setFieldValue('status', 'orcamento');
      setParcelas([]);
      setFuncs([]);
      setDespesas([]);
    }
  }, [obra, open]);

  async function salvar() {
    let values: Record<string, unknown>;
    try { values = await form.validateFields(); }
    catch { return; }

    setSaving(true);
    try {
      const isNew = !obra;
      const id = obra?.id || uid();

      const novaObra: Obra = {
        id,
        nome:           String(values.nome || ''),
        clienteId:      values.clienteId as string | undefined,
        clienteNome:    clientes.find(c => c.id === values.clienteId)?.nome,
        modeloId:       values.modeloId as string | undefined,
        qtdBoxes:       Number(values.qtdBoxes) || 1,
        status:         (values.status as StatusObra) || 'orcamento',
        endereco:       values.endereco as string | undefined,
        valorContrato:  Number(values.valorContrato) || 0,
        dataInicio:     values.dataInicio ? (values.dataInicio as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        dataPrevisaoFim: values.dataPrevisaoFim ? (values.dataPrevisaoFim as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        observacoes:    values.observacoes as string | undefined,
        funcionarios:   funcs,
        parcelas,
        despesas,
        criadoEm:       obra?.criadoEm || hoje(),
      };

      await upsertObra(novaObra);

      // Gerar etapas do modelo (apenas em criação nova com modelo)
      if (isNew && novaObra.modeloId) {
        const modelo = modelos.find(m => m.id === novaObra.modeloId);
        if (modelo) {
          const qtdBoxes = novaObra.qtdBoxes || 1;
          const novasEtapas = (modelo.etapas || []).map((et, idx) => ({
            id: uid(),
            obraId: id,
            modeloEtapaId: et.id,
            geradoDeModelo: modelo.id,
            nome: et.nome,
            codigo: et.codigo || String(idx + 1).padStart(2, '0'),
            ordem: et.ordem || idx + 1,
            categoria: et.categoria || 'outros',
            responsavel: et.responsavel || '',
            descricao: et.descricao || '',
            observacoes: '',
            memorial: et.memorial || '',
            status: 'planejada' as const,
            peso: et.peso || 0,
            percentualExecutado: 0,
            checklist: (et.checklist || []).map(cl => ({ ...cl, id: uid(), concluida: false })),
            materiais: (et.materiais || []).map(mat => ({
              id: uid(),
              nome: mat.nome,
              catalogoId: mat.catalogoId || undefined,
              modeloRef: mat.id,
              unidade: mat.unidade || 'un',
              classificacao: mat.classificacao || 'obrigatorio_iniciar' as const,
              qtdPrevista:   Math.round((mat.qtdPorBox || 0) * qtdBoxes * 100) / 100,
              qtdMinIniciar: Math.round(((mat.qtdMinPorBox || mat.qtdPorBox) || 0) * qtdBoxes * 100) / 100,
              qtdComprada: 0, qtdEntregue: 0, qtdReservada: 0, qtdUtilizada: 0,
              fornecedor: mat.fornecedor || '',
              valorPrevisto: Math.round((mat.valorUnitario || 0) * (mat.qtdPorBox || 0) * qtdBoxes * 100) / 100,
              valorComprado: 0, pedidoCompra: false,
            })),
            criadoEm: hoje(),
          }));
          await saveEtapas([...etapas, ...novasEtapas], `Etapas de ${novaObra.nome}`);
        }
      }

      // Sincroniza lancamentos: parcelas (receitas) + despesas
      const lancSemObraForm = lancamentos.filter(l =>
        // Mantém tudo que NÃO é gerado por este formulário desta obra
        !(l.obraId === id && !l.conciliado && !l.ofxId),
      );

      const novosLancReceita = parcelas.map(p => ({
        id: p.id,
        tipo: 'receita' as const,
        descricao: `${novaObra.nome} — ${p.descricao}`,
        valor: p.valor,
        vencimento: p.vencimento,
        status: 'pendente' as const,
        categoria: 'parcela' as string,
        obraId: id,
        obraNome: novaObra.nome,
        clienteId: novaObra.clienteId,
        clienteNome: novaObra.clienteNome,
        criadoEm: hoje(),
      }));

      const novosLancDespesa = despesas.map(d => {
        const prest = prestadores.find(p => p.id === d.prestadorId);
        return {
          id: d.id,
          tipo: 'despesa' as const,
          descricao: d.descricao || `Despesa — ${novaObra.nome}`,
          valor: d.valor,
          vencimento: d.vencimento,
          status: 'pendente' as const,
          categoria: d.categoria,
          obraId: id,
          obraNome: novaObra.nome,
          prestadorId: d.prestadorId || undefined,
          prestadorNome: prest?.nome || d.prestadorNome || undefined,
          criadoEm: hoje(),
        };
      });

      if (novosLancReceita.length > 0 || novosLancDespesa.length > 0) {
        await saveLanc(
          [...lancSemObraForm, ...novosLancReceita, ...novosLancDespesa],
          `Lançamentos de ${novaObra.nome}`,
        );
      }

      message.success(`Obra ${isNew ? 'criada' : 'atualizada'} com sucesso!`);
      onClose();
    } catch (e) {
      message.error('Erro ao salvar: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Parcelas ──────────────────────────────────────────────────────────────
  function addParcela() {
    setParcelas(prev => [...prev, { id: uid(), descricao: '', valor: 0, vencimento: hoje() }]);
  }

  function updateParcela(id: string, field: keyof Parcela, value: unknown) {
    setParcelas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function presetParcelas(tipo: string) {
    const valor = form.getFieldValue('valorContrato') || 0;
    const data  = form.getFieldValue('dataInicio');
    const dataStr = data ? data.format('YYYY-MM-DD') : hoje();
    setParcelas(gerarParcelasPreset(tipo, valor, dataStr));
  }

  const totalParcelas = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
  const valorContrato = Form.useWatch('valorContrato', form) || 0;

  // ── Despesas ──────────────────────────────────────────────────────────────
  function addDespesa() {
    setDespesas(prev => [...prev, {
      id: uid(), descricao: '', valor: 0, vencimento: hoje(), categoria: 'mao-de-obra',
    }]);
  }

  function updateDespesa(id: string, field: keyof DespesaObra, value: unknown) {
    setDespesas(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  }

  function gerarMOdeFuncionarios() {
    const data = form.getFieldValue('dataInicio');
    const venc = data ? data.format('YYYY-MM-DD') : hoje();
    const novasDespesas: DespesaObra[] = funcs
      .filter(f => (f.salario || 0) > 0)
      .map(f => ({
        id: uid(),
        descricao: `MO: ${f.nome}${f.funcao ? ` (${f.funcao})` : ''}`,
        valor: f.salario || 0,
        vencimento: venc,
        categoria: 'mao-de-obra' as CategoriaDespesa,
      }));
    if (!novasDespesas.length) {
      message.warning('Nenhum funcionário com salário cadastrado na aba Equipe.');
      return;
    }
    setDespesas(prev => [...prev, ...novasDespesas]);
    message.success(`${novasDespesas.length} lançamento(s) de MO adicionado(s).`);
  }

  const totalDespesas = despesas.reduce((s, d) => s + (d.valor || 0), 0);

  // ── Funcionários ──────────────────────────────────────────────────────────
  function addFunc(funcId: string) {
    if (!funcId) return;
    const f = funcionarios.find(x => x.id === funcId);
    if (!f || funcs.find(x => x.funcionarioId === funcId)) return;
    setFuncs(prev => [...prev, {
      funcionarioId: f.id,
      nome: f.nome,
      funcao: f.cargo || '',
      salario: f.salario || 0,
    }]);
  }

  // ── Colunas tabelas ────────────────────────────────────────────────────────
  const colsParcelas = [
    { title: 'Descrição', dataIndex: 'descricao', render: (_: string, r: Parcela) => (
      <Input size="small" value={r.descricao} onChange={e => updateParcela(r.id, 'descricao', e.target.value)} />
    )},
    { title: 'Valor', dataIndex: 'valor', width: 140, render: (_: number, r: Parcela) => (
      <InputNumber size="small" style={{ width: '100%' }} prefix="R$" value={r.valor}
        onChange={v => updateParcela(r.id, 'valor', v || 0)} />
    )},
    { title: 'Vencimento', dataIndex: 'vencimento', width: 150, render: (_: string, r: Parcela) => (
      <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
        value={r.vencimento ? dayjs(r.vencimento) : null}
        onChange={d => updateParcela(r.id, 'vencimento', d ? d.format('YYYY-MM-DD') : hoje())} />
    )},
    { title: '', width: 40, render: (_: unknown, r: Parcela) => (
      <Popconfirm title="Remover?" onConfirm={() => setParcelas(prev => prev.filter(p => p.id !== r.id))}>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
      </Popconfirm>
    )},
  ];

  const colsFuncs = [
    { title: 'Nome',    dataIndex: 'nome' },
    { title: 'Função',  dataIndex: 'funcao', render: (_: string, r: ObraFuncionario) => (
      <Input size="small" value={r.funcao}
        onChange={e => setFuncs(prev => prev.map(f => f.funcionarioId === r.funcionarioId ? { ...f, funcao: e.target.value } : f))} />
    )},
    { title: 'Salário/mês', dataIndex: 'salario', width: 140, render: (_: number, r: ObraFuncionario) => (
      <InputNumber size="small" prefix="R$" style={{ width: '100%' }} value={r.salario}
        onChange={v => setFuncs(prev => prev.map(f => f.funcionarioId === r.funcionarioId ? { ...f, salario: v || 0 } : f))} />
    )},
    { title: '', width: 40, render: (_: unknown, r: ObraFuncionario) => (
      <Button type="text" danger size="small" icon={<DeleteOutlined />}
        onClick={() => setFuncs(prev => prev.filter(f => f.funcionarioId !== r.funcionarioId))} />
    )},
  ];

  const colsDespesas = [
    { title: 'Descrição', dataIndex: 'descricao', render: (_: string, r: DespesaObra) => (
      <Input size="small" value={r.descricao} placeholder="Ex: Mão de obra — fundação"
        onChange={e => updateDespesa(r.id, 'descricao', e.target.value)} />
    )},
    { title: 'Categoria', dataIndex: 'categoria', width: 150, render: (_: string, r: DespesaObra) => (
      <Select size="small" style={{ width: '100%' }} value={r.categoria}
        onChange={v => updateDespesa(r.id, 'categoria', v)}
        options={CAT_DESPESA_OPTS} />
    )},
    { title: 'Prestador', dataIndex: 'prestadorId', width: 160, render: (_: string, r: DespesaObra) => (
      <Select size="small" style={{ width: '100%' }} value={r.prestadorId || undefined}
        allowClear placeholder="Opcional"
        onChange={v => {
          const p = prestadores.find(x => x.id === v);
          updateDespesa(r.id, 'prestadorId', v || '');
          if (p) updateDespesa(r.id, 'prestadorNome', p.nome);
        }}
        options={prestadores.map(p => ({ value: p.id, label: p.nome }))} />
    )},
    { title: 'Valor', dataIndex: 'valor', width: 130, render: (_: number, r: DespesaObra) => (
      <InputNumber size="small" style={{ width: '100%' }} prefix="R$" value={r.valor}
        onChange={v => updateDespesa(r.id, 'valor', v || 0)} />
    )},
    { title: 'Vencimento', dataIndex: 'vencimento', width: 145, render: (_: string, r: DespesaObra) => (
      <DatePicker size="small" style={{ width: '100%' }} format="DD/MM/YYYY"
        value={r.vencimento ? dayjs(r.vencimento) : null}
        onChange={d => updateDespesa(r.id, 'vencimento', d ? d.format('YYYY-MM-DD') : hoje())} />
    )},
    { title: '', width: 40, render: (_: unknown, r: DespesaObra) => (
      <Popconfirm title="Remover?" onConfirm={() => setDespesas(prev => prev.filter(d => d.id !== r.id))}>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
      </Popconfirm>
    )},
  ];

  return (
    <Drawer
      title={obra ? `Editar: ${obra.nome}` : 'Nova Obra'}
      open={open}
      onClose={onClose}
      width={820}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>
            {obra ? 'Salvar alterações' : 'Criar obra'}
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'geral',
            label: 'Dados Gerais',
            children: (
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={16}>
                    <Form.Item name="nome" label="Nome da obra" rules={[{ required: true, message: 'Informe o nome' }]}>
                      <Input placeholder="Ex: Residência João Silva" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="status" label="Status">
                      <Select options={STATUS_OPTS} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="clienteId" label="Cliente">
                      <Select
                        showSearch
                        placeholder="Selecione o cliente"
                        optionFilterProp="label"
                        options={clientes.map(c => ({ value: c.id, label: c.nome }))}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="endereco" label="Endereço">
                      <Input placeholder="Rua, número, bairro" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={14}>
                    <Form.Item name="modeloId" label="Modelo de referência">
                      <Select
                        showSearch
                        placeholder="Selecione um modelo (opcional)"
                        optionFilterProp="label"
                        options={modelos.map(m => ({ value: m.id, label: m.nome }))}
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item name="qtdBoxes" label="Quantidade de unidades">
                      <InputNumber style={{ width: '100%' }} min={1} placeholder="1" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="valorContrato" label="Valor do contrato">
                      <InputNumber style={{ width: '100%' }} prefix="R$" min={0} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="dataInicio" label="Data de início">
                      <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="dataPrevisaoFim" label="Previsão de conclusão">
                      <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="observacoes" label="Observações">
                  <Input.TextArea rows={3} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'parcelas',
            label: `Parcelas / A Receber ${parcelas.length > 0 ? `(${parcelas.length})` : ''}`,
            children: (
              <div>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Text type="secondary">Preset:</Text>
                  <Button size="small" onClick={() => presetParcelas('entrada50')}>Entrada 50% + Final</Button>
                  <Button size="small" onClick={() => presetParcelas('trechos')}>30/40/30</Button>
                  <Button size="small" onClick={() => presetParcelas('mensal3')}>3x mensal</Button>
                </Space>

                <Table
                  dataSource={parcelas}
                  columns={colsParcelas}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  footer={() => (
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Button size="small" icon={<PlusOutlined />} onClick={addParcela}>
                          Adicionar parcela
                        </Button>
                      </Col>
                      <Col>
                        <Space>
                          <Text type="secondary">Total a receber:</Text>
                          <Text strong style={{ color: totalParcelas !== valorContrato && valorContrato > 0 ? '#ff4d4f' : '#52c41a' }}>
                            {formatarMoeda(totalParcelas)}
                          </Text>
                          {valorContrato > 0 && totalParcelas !== valorContrato && (
                            <Text type="danger" style={{ fontSize: 12 }}>
                              (contrato: {formatarMoeda(valorContrato)})
                            </Text>
                          )}
                        </Space>
                      </Col>
                    </Row>
                  )}
                />
              </div>
            ),
          },
          {
            key: 'despesas',
            label: `Despesas / A Pagar ${despesas.length > 0 ? `(${despesas.length})` : ''}`,
            children: (
              <div>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Button size="small" icon={<PlusOutlined />} onClick={addDespesa}>
                    Adicionar despesa
                  </Button>
                  {funcs.length > 0 && (
                    <Button size="small" onClick={gerarMOdeFuncionarios}>
                      Gerar MO da Equipe
                    </Button>
                  )}
                </Space>

                <Table
                  dataSource={despesas}
                  columns={colsDespesas}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 700 }}
                  footer={() => (
                    <Row justify="end">
                      <Space>
                        <Text type="secondary">Total a pagar:</Text>
                        <Text strong style={{ color: '#ff4d4f' }}>{formatarMoeda(totalDespesas)}</Text>
                      </Space>
                    </Row>
                  )}
                />

                {despesas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#8c8c8c' }}>
                    Nenhuma despesa cadastrada. Clique em "Adicionar despesa" ou "Gerar MO da Equipe".
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'equipe',
            label: `Equipe ${funcs.length > 0 ? `(${funcs.length})` : ''}`,
            children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Select
                    showSearch
                    placeholder="Adicionar funcionário..."
                    optionFilterProp="label"
                    style={{ width: 280 }}
                    options={funcionarios
                      .filter(f => !funcs.find(x => x.funcionarioId === f.id))
                      .map(f => ({ value: f.id, label: f.nome }))}
                    onSelect={(v: string | null) => v && addFunc(v)}
                    value={null}
                  />
                </Space>
                <Divider style={{ margin: '8px 0' }} />
                <Table
                  dataSource={funcs}
                  columns={colsFuncs}
                  rowKey="funcionarioId"
                  size="small"
                  pagination={false}
                />
                {funcs.length > 0 && (
                  <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
                    💡 Use "Gerar MO da Equipe" na aba <b>Despesas</b> para criar lançamentos de Contas a Pagar para cada funcionário.
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
