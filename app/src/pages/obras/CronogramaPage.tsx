import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Row, Col, Card, Typography, Space, Button, Progress,
  Statistic, Spin, message, Select, Divider,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, PrinterOutlined,
} from '@ant-design/icons';
import type { Obra, Etapa, StatusObra } from '../../types';
import { useObrasStore } from '../../stores/useObrasStore';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import { ObraStatusTag, OBRA_STATUS_OPTIONS } from '../../components/common/StatusTag';
import { formatarMoeda, formatarData } from '../../utils';
import EtapaCard from './EtapaCard';
import EtapaForm from './EtapaForm';

const { Title, Text } = Typography;

function imprimirOS(obra: Obra, etapa: Etapa, resolve: (catId: string | undefined, nome: string, unidade?: string) => { nome: string; unidade: string; fornecedor: string }) {
  const mats = etapa.materiais || [];
  const linhasMat = mats.map(m => {
    const info = resolve(m.catalogoId, m.nome, m.unidade);
    return `
      <tr>
        <td>${info.nome}</td>
        <td style="text-align:center">${info.unidade}</td>
        <td style="text-align:center">${m.qtdPrevista}</td>
        <td>${m.fornecedor || info.fornecedor || '—'}</td>
        <td style="text-align:center">${m.classificacao === 'obrigatorio_iniciar' ? 'Iniciar' : m.classificacao === 'obrigatorio_concluir' ? 'Concluir' : 'Opcional'}</td>
      </tr>`;
  }).join('');

  const html = `
    <html><head><title>OS — ${etapa.nome}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 24px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 15px; color: #444; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; }
      th { background: #f0f0f0; font-weight: bold; }
      .campo { margin-bottom: 10px; }
      .label { font-weight: bold; font-size: 12px; color: #666; }
      .memorial { background: #fffbe6; border: 1px solid #ffe58f; padding: 12px; border-radius: 6px; margin-top: 12px; white-space: pre-wrap; }
      @media print { button { display: none; } }
    </style></head>
    <body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer">🖨️ Imprimir</button>
    <h1>Ordem de Serviço</h1>
    <h2>${obra.nome} — Etapa: ${etapa.nome}</h2>
    <div class="campo"><span class="label">Status:</span> ${etapa.status}</div>
    <div class="campo"><span class="label">Responsável:</span> ${etapa.responsavel || '—'}</div>
    <div class="campo"><span class="label">Previsão de início:</span> ${formatarData(etapa.dataPrevistoInicio)} &nbsp;&nbsp; <span class="label">Previsão de conclusão:</span> ${formatarData(etapa.dataPrevistoFim)}</div>
    ${etapa.descricao ? `<div class="campo"><span class="label">Descrição:</span> ${etapa.descricao}</div>` : ''}
    ${etapa.memorial ? `<div class="memorial"><strong>Memorial Técnico / Instruções de Execução</strong><br/><br/>${etapa.memorial}</div>` : ''}
    ${mats.length > 0 ? `
      <table>
        <thead><tr><th>Material</th><th>Unidade</th><th>Qtd. Prevista</th><th>Fornecedor</th><th>Necessário p/</th></tr></thead>
        <tbody>${linhasMat}</tbody>
      </table>` : ''}
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function imprimirCronograma(obra: Obra, etapas: Etapa[]) {
  const progresso = calcProgressoObra(etapas);
  const linhas = etapas
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map(e => `
      <tr>
        <td>${e.codigo || '—'}</td>
        <td>${e.nome}</td>
        <td style="text-align:center">${e.categoria || '—'}</td>
        <td style="text-align:center">${e.responsavel || '—'}</td>
        <td style="text-align:center">${e.status}</td>
        <td style="text-align:center">${e.percentualExecutado || 0}%</td>
        <td style="text-align:center">${formatarData(e.dataPrevistoInicio)}</td>
        <td style="text-align:center">${formatarData(e.dataPrevistoFim)}</td>
      </tr>`).join('');

  const html = `
    <html><head><title>Cronograma — ${obra.nome}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
      h1 { font-size: 18px; } h2 { color: #444; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; }
      th { background: #f0f0f0; }
      @media print { button { display: none; } }
    </style></head>
    <body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer">🖨️ Imprimir</button>
    <h1>Cronograma — ${obra.nome}</h1>
    <p>Cliente: ${obra.clienteNome || '—'} &nbsp;|&nbsp; Progresso geral: ${progresso}% &nbsp;|&nbsp; Status: ${obra.status}</p>
    <table>
      <thead><tr><th>Cód.</th><th>Etapa</th><th>Categoria</th><th>Responsável</th><th>Status</th><th>% Exec.</th><th>Início Prev.</th><th>Fim Prev.</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function calcProgressoObra(etapas: Etapa[]): number {
  if (!etapas.length) return 0;
  const total = etapas.reduce((s, e) => s + (e.peso || 1), 0);
  const feito = etapas.reduce((s, e) => {
    const p = e.status === 'concluida' ? (e.peso || 1) : ((e.percentualExecutado || 0) / 100) * (e.peso || 1);
    return s + p;
  }, 0);
  return Math.round((feito / total) * 100);
}

export default function CronogramaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { obras, fetch: fetchObras, upsert: upsertObra } = useObrasStore();
  const { etapas, loading, fetch: fetchEtapas, upsert: upsertEtapa, remove: removeEtapa } = useEtapasStore();
  const { fetch: fetchCatalogo, resolve } = useCatalogoStore();

  const [etapaForm, setEtapaForm] = useState<{ open: boolean; etapa: Etapa | null }>({ open: false, etapa: null });

  useEffect(() => {
    fetchObras();
    fetchEtapas();
    fetchCatalogo();
  }, []);

  const obra = obras.find(o => o.id === id);
  const etapasObra = etapas
    .filter(e => e.obraId === id)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  if (!obra && !loading) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/obras')}>Voltar</Button>
        <Text type="danger" style={{ marginLeft: 12 }}>Obra não encontrada.</Text>
      </div>
    );
  }

  if (!obra) return <Spin size="large" style={{ display: 'block', marginTop: 80 }} />;

  const progresso = calcProgressoObra(etapasObra);
  const concluidas = etapasObra.filter(e => e.status === 'concluida').length;
  const emAndamento = etapasObra.filter(e => e.status === 'em_andamento').length;
  const totalMatPrevisto = etapasObra.flatMap(e => e.materiais || []).reduce((s, m) => s + (m.valorPrevisto || 0), 0);
  const totalMatComprado = etapasObra.flatMap(e => e.materiais || []).reduce((s, m) => s + (m.valorComprado || 0), 0);

  async function handleUpdate(etapa: Etapa) {
    try { await upsertEtapa(etapa); }
    catch { message.error('Erro ao salvar etapa.'); }
  }

  async function handleDelete(etapaId: string) {
    try { await removeEtapa(etapaId); message.success('Etapa removida.'); }
    catch { message.error('Erro ao remover.'); }
  }

  async function handleSaveEtapa(etapa: Etapa) {
    try {
      await upsertEtapa(etapa);
      message.success(`Etapa ${etapaForm.etapa ? 'atualizada' : 'criada'}!`);
    } catch { message.error('Erro ao salvar.'); }
  }

  async function atualizarStatusObra(status: StatusObra) {
    await upsertObra({ ...obra, status } as Obra);
  }

  return (
    <div>
      {/* ── Header ── */}
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/obras')}>Obras</Button>
            <Title level={4} style={{ margin: 0 }}>{obra.nome}</Title>
            <ObraStatusTag status={obra.status} />
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => imprimirCronograma(obra, etapasObra)}>
              Imprimir Cronograma
            </Button>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => setEtapaForm({ open: true, etapa: null })}>
              Nova Etapa
            </Button>
          </Space>
        </Col>
      </Row>

      {/* ── Info da obra ── */}
      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={[16, 8]} align="middle">
          <Col xs={24} md={8}>
            <Space direction="vertical" size={2}>
              {obra.clienteNome && <Text type="secondary">{obra.clienteNome}</Text>}
              {obra.endereco && <Text type="secondary" style={{ fontSize: 12 }}>{obra.endereco}</Text>}
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>Status:</Text>
                <Select
                  size="small" value={obra.status}
                  options={OBRA_STATUS_OPTIONS}
                  onChange={v => atualizarStatusObra(v as StatusObra)}
                  style={{ width: 160 }}
                />
              </Space>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Space direction="vertical" size={2}>
              {obra.dataInicio && <Text style={{ fontSize: 12 }}>Início: {formatarData(obra.dataInicio)}</Text>}
              {obra.dataPrevisaoFim && <Text style={{ fontSize: 12 }}>Previsão: {formatarData(obra.dataPrevisaoFim)}</Text>}
              {obra.valorContrato ? <Text style={{ fontSize: 12 }}>Contrato: {formatarMoeda(obra.valorContrato)}</Text> : null}
            </Space>
          </Col>
          <Col xs={24} md={10}>
            <Row align="middle" gutter={8}>
              <Col flex="auto">
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Progresso geral</Text>
                <Progress percent={progresso} status={progresso === 100 ? 'success' : 'active'} strokeColor={progresso === 100 ? '#52c41a' : '#1677ff'} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* ── Estatísticas ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total etapas" value={etapasObra.length} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Em andamento" value={emAndamento} valueStyle={{ fontSize: 20, color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Concluídas" value={concluidas} valueStyle={{ fontSize: 20, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Mat. previsto" value={formatarMoeda(totalMatPrevisto)} valueStyle={{ fontSize: 16 }} />
            {totalMatComprado > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>Comprado: {formatarMoeda(totalMatComprado)}</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '8px 0 16px' }} />

      {/* ── Etapas ── */}
      {loading ? (
        <Spin />
      ) : etapasObra.length === 0 ? (
        <Card>
          <Space direction="vertical" align="center" style={{ width: '100%', padding: '24px 0' }}>
            <Text type="secondary">Nenhuma etapa cadastrada para esta obra.</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEtapaForm({ open: true, etapa: null })}>
              Adicionar primeira etapa
            </Button>
          </Space>
        </Card>
      ) : (
        etapasObra.map(etapa => (
          <EtapaCard
            key={etapa.id}
            etapa={etapa}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onEdit={e => setEtapaForm({ open: true, etapa: e })}
            onPrintOS={e => imprimirOS(obra, e, resolve)}
          />
        ))
      )}

      <EtapaForm
        obraId={id!}
        etapa={etapaForm.etapa}
        open={etapaForm.open}
        onClose={() => setEtapaForm({ open: false, etapa: null })}
        onSave={handleSaveEtapa}
      />
    </div>
  );
}
