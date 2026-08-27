import { useEffect, useState } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, DatePicker, Typography,
  Space, Tag, Popconfirm, message, Row, Col, Card, InputNumber, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FilePdfOutlined, PrinterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDiarioStore } from '../../stores/useDiarioStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { uid, hoje, formatarData, esc } from '../../utils';
import type { DiarioEntrada, Clima } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;

const CLIMAS: { value: Clima; label: string }[] = [
  { value: 'ensolarado',           label: 'Ensolarado' },
  { value: 'parcialmente_nublado', label: 'Parcialmente Nublado' },
  { value: 'nublado',              label: 'Nublado' },
  { value: 'chuvoso',              label: 'Chuvoso' },
];

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="34" fill="none" viewBox="0 0 48 46"><path fill="#863bff" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/></svg>`;

function climaLabel(c?: Clima) {
  return CLIMAS.find(x => x.value === c)?.label ?? '';
}

const REPORT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
.report-header{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.logo-wrap{display:flex;align-items:center;gap:8px}
.logo-title{font-size:20px;font-weight:900;color:#863bff;letter-spacing:-.5px}
.report-title{font-size:19px;font-weight:800;color:#111}
.sub{color:#666;font-size:11px;margin-bottom:20px;margin-top:2px}
.entrada{border:1px solid #ccc;border-radius:6px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid}
.hdr{background:#1a1a2e;color:#fff;padding:9px 14px;display:flex;justify-content:space-between;align-items:center}
.hdr-left{font-weight:800;font-size:13px}
.hdr-right{font-size:11px;opacity:.8}
.body{padding:12px 14px}
.meta-row{margin-bottom:10px}
.pill{display:inline-block;background:#f0f0f0;border-radius:4px;padding:2px 8px;margin-right:6px;font-size:10px;font-weight:600;color:#444}
.secao{margin-bottom:11px}
.secao-titulo{font-weight:900;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#111;border-left:4px solid #863bff;padding-left:8px;margin-bottom:5px;line-height:1.3}
.secao.problemas .secao-titulo{border-left-color:#cf1322;color:#cf1322}
.secao.proximo .secao-titulo{border-left-color:#096dd9;color:#096dd9}
.secao-corpo{white-space:pre-wrap;font-size:11px;line-height:1.55;color:#222;padding-left:12px}
@media print{body{padding:10px}.entrada{page-break-inside:avoid}}
`;

function buildEntradaHtml(e: DiarioEntrada, obraNome: string): string {
  return `<div class="entrada">
<div class="hdr">
  <span class="hdr-left">${esc(formatarData(e.data))}</span>
  <span class="hdr-right">${esc(obraNome)} &nbsp;|&nbsp; Resp.: ${esc(e.responsavel)}</span>
</div>
<div class="body">
${(e.clima || e.efetivo != null) ? `<div class="meta-row">${e.clima ? `<span class="pill">Clima: ${esc(climaLabel(e.clima))}</span>` : ''}${e.efetivo != null ? `<span class="pill">Efetivo: ${e.efetivo} pessoa(s)</span>` : ''}</div>` : ''}
<div class="secao">
  <div class="secao-titulo">Atividades Realizadas</div>
  <div class="secao-corpo">${esc(e.avancos)}</div>
</div>
${e.problemas ? `<div class="secao problemas"><div class="secao-titulo">Problemas / Ocorrencias</div><div class="secao-corpo">${esc(e.problemas)}</div></div>` : ''}
${e.proximoDia ? `<div class="secao proximo"><div class="secao-titulo">Previsao Proximo Dia</div><div class="secao-corpo">${esc(e.proximoDia)}</div></div>` : ''}
</div></div>`;
}

function buildReportHtml(entradas: DiarioEntrada[], obras: { id: string; nome: string }[], titulo: string): string {
  const linhas = entradas.map(e => {
    const obra = obras.find(o => o.id === e.obraId);
    return buildEntradaHtml(e, obra?.nome ?? e.obraId);
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Diario de Obra - ${esc(titulo)}</title>
<style>${REPORT_CSS}</style></head><body>
<div class="report-header">
  <div class="logo-wrap">${LOGO_SVG}<span class="logo-title">Construbox</span></div>
  <span class="report-title">Diario de Obra</span>
</div>
<div class="sub">Obra: ${esc(titulo)} &nbsp;|&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</div>
${linhas || '<p style="color:#888;text-align:center;padding:30px">Nenhum registro.</p>'}
</body></html>`;
}

function gerarRelatorio(entradas: DiarioEntrada[], obras: { id: string; nome: string }[], obraFiltro: string | null) {
  const filtradas = (obraFiltro ? entradas.filter(e => e.obraId === obraFiltro) : entradas)
    .sort((a, b) => b.data.localeCompare(a.data));
  const titulo = obraFiltro ? (obras.find(o => o.id === obraFiltro)?.nome ?? 'Todas') : 'Todas as Obras';
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(buildReportHtml(filtradas, obras, titulo));
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function imprimirEntrada(e: DiarioEntrada, obras: { id: string; nome: string }[]) {
  const obraNome = obras.find(o => o.id === e.obraId)?.nome ?? e.obraId;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(buildReportHtml([e], obras, obraNome));
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

  const filtradas = (Array.isArray(entradas) ? entradas : [])
    .filter(e => !obraFiltro || e.obraId === obraFiltro)
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

  const listaObras = Array.isArray(obras) ? obras : [];

  const columns = [
    {
      title: 'Data', dataIndex: 'data', width: 100,
      render: (v: string) => <Text strong>{formatarData(v)}</Text>,
    },
    {
      title: 'Obra', dataIndex: 'obraId', width: 180,
      render: (id: string) => {
        const o = listaObras.find(x => x.id === id);
        return <Text style={{ fontSize: 12 }}>{o?.nome ?? id}</Text>;
      },
    },
    { title: 'Responsavel', dataIndex: 'responsavel', width: 140 },
    {
      title: 'Clima', dataIndex: 'clima', width: 110,
      render: (v?: Clima) => v ? <Tag>{climaLabel(v)}</Tag> : '-',
    },
    {
      title: 'Atividades', dataIndex: 'avancos',
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>{v.length > 95 ? v.slice(0, 95) + '...' : v}</Text>
      ),
    },
    {
      title: 'Problemas', dataIndex: 'problemas', width: 140,
      render: (v?: string) => v
        ? <Tag color="orange" style={{ fontSize: 11, whiteSpace: 'normal', maxWidth: 130 }}>
            {v.slice(0, 55)}{v.length > 55 ? '...' : ''}
          </Tag>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '', width: 110,
      render: (_: unknown, r: DiarioEntrada) => (
        <Space>
          <Button
            size="small" icon={<PrinterOutlined />} title="Imprimir este dia"
            onClick={() => imprimirEntrada(r, listaObras)}
          />
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
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => gerarRelatorio(Array.isArray(entradas) ? entradas : [], listaObras, obraFiltro)}
            >
              Relatorio Geral
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
              options={listaObras.map(o => ({ value: o.id, label: o.nome }))}
            />
          </Col>
          <Col><Text type="secondary" style={{ fontSize: 12 }}>{filtradas.length} registro(s)</Text></Col>
        </Row>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="Nenhuma entrada no diario" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNova}>
            Adicionar primeira entrada
          </Button>
        </Empty>
      ) : (
        <Table
          dataSource={filtradas} columns={columns} rowKey="id"
          loading={loading} pagination={{ pageSize: 20 }} size="small"
        />
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
                <Select options={CLIMAS.map(c => ({ value: c.value, label: c.label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="obraId" label="Obra" rules={[{ required: true, message: 'Selecione a obra' }]}>
            <Select
              showSearch optionFilterProp="label"
              options={listaObras.map(o => ({ value: o.id, label: o.nome }))}
              placeholder="Selecione a obra"
            />
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
          <Form.Item name="avancos" label="Atividades Realizadas" rules={[{ required: true, message: 'Descreva as atividades' }]}>
            <TextArea rows={4} placeholder="O que foi executado hoje..." />
          </Form.Item>
          <Form.Item name="problemas" label="Problemas / Ocorrencias">
            <TextArea rows={3} placeholder="Problemas encontrados, ocorrencias..." />
          </Form.Item>
          <Form.Item name="proximoDia" label="Previsao Proximo Dia">
            <TextArea rows={2} placeholder="O que esta previsto para o proximo dia..." />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
