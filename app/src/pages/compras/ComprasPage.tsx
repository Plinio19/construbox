import { useEffect, useState } from 'react';
import {
  Table, Row, Col, Typography, Input, Card, Tag, Button,
  Space, Statistic, Popconfirm, message, Tabs, Tooltip, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, CheckOutlined, PrinterOutlined } from '@ant-design/icons';
import { useEtapasStore } from '../../stores/useEtapasStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import type { MaterialEtapa } from '../../types';
import { formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

interface MatPendente extends MaterialEtapa {
  obraId: string;
  obraNome: string;
  etapaId: string;
  etapaNome: string;
  nomeResolvido: string;
  unidadeResolvida: string;
  qtdFaltante: number;
}

interface MatConsolidado {
  nomeResolvido: string;
  unidadeResolvida: string;
  catalogoId?: string;
  qtdTotal: number;
  valorTotal: number;
  obras: string[];
  itens: MatPendente[];
  urgente: boolean;
}

export default function ComprasPage() {
  const { etapas, fetch: fetchEtapas, upsert: upsertEtapa } = useEtapasStore();
  const { obras, fetch: fetchObras } = useObrasStore();
  const { fetch: fetchCatalogo, resolve } = useCatalogoStore();
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState('necessidade');

  useEffect(() => { fetchEtapas(); fetchObras(); fetchCatalogo(); }, []);

  /* ── Materiais pendentes (todas as obras ativas) ── */
  const obrasAtivas = obras.filter(o => o.status === 'andamento' || o.status === 'aprovado');

  const pendentes: MatPendente[] = etapas.flatMap(etapa => {
    const obra = obrasAtivas.find(o => o.id === etapa.obraId);
    if (!obra) return [];
    return (etapa.materiais || [])
      .filter(m => (m.qtdComprada || 0) < (m.qtdPrevista || 0) && (m.qtdPrevista || 0) > 0)
      .map(m => {
        const info = resolve(m.catalogoId, m.nome, m.unidade);
        return {
          ...m,
          obraId: etapa.obraId,
          obraNome: obra.nome,
          etapaId: etapa.id,
          etapaNome: etapa.nome,
          nomeResolvido: info.nome,
          unidadeResolvida: info.unidade,
          qtdFaltante: (m.qtdPrevista || 0) - (m.qtdComprada || 0),
        };
      });
  });

  /* ── Consolidado por material ── */
  const consolidado: MatConsolidado[] = (() => {
    const map = new Map<string, MatConsolidado>();
    pendentes.forEach(m => {
      const key = m.nomeResolvido.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          nomeResolvido: m.nomeResolvido,
          unidadeResolvida: m.unidadeResolvida,
          catalogoId: m.catalogoId,
          qtdTotal: 0,
          valorTotal: 0,
          obras: [],
          itens: [],
          urgente: false,
        });
      }
      const c = map.get(key)!;
      c.qtdTotal += m.qtdFaltante;
      c.valorTotal += m.valorPrevisto || 0;
      if (!c.obras.includes(m.obraNome)) c.obras.push(m.obraNome);
      c.itens.push(m);
      if (m.classificacao === 'obrigatorio_iniciar') c.urgente = true;
    });
    return [...map.values()].sort((a, b) => {
      if (a.urgente && !b.urgente) return -1;
      if (!a.urgente && b.urgente) return 1;
      return a.nomeResolvido.localeCompare(b.nomeResolvido);
    });
  })();

  /* ── Filtro ── */
  const filtradoPend = pendentes.filter(m =>
    !busca ||
    m.nomeResolvido.toLowerCase().includes(busca.toLowerCase()) ||
    m.obraNome.toLowerCase().includes(busca.toLowerCase()) ||
    m.etapaNome.toLowerCase().includes(busca.toLowerCase()) ||
    (m.fornecedor || '').toLowerCase().includes(busca.toLowerCase())
  );

  const filtradoCons = consolidado.filter(m =>
    !busca || m.nomeResolvido.toLowerCase().includes(busca.toLowerCase())
  );

  /* ── Stats ── */
  const totalItens    = pendentes.length;
  const totalValor    = pendentes.reduce((s, m) => s + (m.valorPrevisto || 0), 0);
  const obrasAfetadas = new Set(pendentes.map(m => m.obraId)).size;
  const urgentes      = pendentes.filter(m => m.classificacao === 'obrigatorio_iniciar').length;

  /* ── Ações ── */
  async function marcarPedido(mat: MatPendente, pedido: boolean) {
    const etapa = etapas.find(e => e.id === mat.etapaId);
    if (!etapa) return;
    const mats = etapa.materiais.map(m => m.id === mat.id ? { ...m, pedidoCompra: pedido } : m);
    try {
      await upsertEtapa({ ...etapa, materiais: mats });
      message.success(pedido ? 'Pedido registrado!' : 'Desmarcado.');
    } catch { message.error('Erro ao atualizar.'); }
  }

  async function marcarComprado(mat: MatPendente) {
    const etapa = etapas.find(e => e.id === mat.etapaId);
    if (!etapa) return;
    const mats = etapa.materiais.map(m => m.id === mat.id ? {
      ...m, qtdComprada: m.qtdPrevista, pedidoCompra: true,
    } : m);
    try {
      await upsertEtapa({ ...etapa, materiais: mats });
      message.success('Material marcado como comprado!');
    } catch { message.error('Erro ao atualizar.'); }
  }

  function imprimirNecessidade() {
    const linhas = filtradoCons.map(m =>
      `<tr style="border-bottom:1px solid #eee">
        <td style="padding:6px 8px">${m.urgente ? '🔴 ' : ''}${m.nomeResolvido}</td>
        <td style="padding:6px 8px;text-align:center">${m.unidadeResolvida}</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700">${m.qtdTotal}</td>
        <td style="padding:6px 8px;text-align:right">${m.valorTotal ? formatarMoeda(m.valorTotal) : '—'}</td>
        <td style="padding:6px 8px;font-size:11px;color:#666">${m.obras.join(', ')}</td>
        <td style="padding:6px 8px;width:100px;border:1px solid #ccc"></td>
      </tr>`
    ).join('');

    const w = window.open('', '_blank')!;
    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/><title>Necessidade de Compra</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px}
      h2{margin-bottom:4px}p{margin-bottom:12px;color:#666}
      table{width:100%;border-collapse:collapse}
      th{background:#1e429f;color:#fff;padding:8px;text-align:left;font-size:12px}
      @media print{@page{margin:15mm}}</style>
      </head><body>
      <h2>📋 Necessidade de Compra</h2>
      <p>${new Date().toLocaleDateString('pt-BR')} · ${filtradoCons.length} itens · ${obrasAfetadas} obras</p>
      <table>
        <thead><tr>
          <th>Material</th><th>Un</th><th>Qtd</th><th>Valor Prev.</th><th>Obras</th><th>Fornecedor / Obs.</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  /* ── Colunas — por item ── */
  const colsItem: ColumnsType<MatPendente> = [
    { title: 'Material', dataIndex: 'nomeResolvido',
      sorter: (a, b) => a.nomeResolvido.localeCompare(b.nomeResolvido),
      render: (nome: string, r) => (
        <div>
          <Space>
            <Text strong>{nome}</Text>
            {r.classificacao === 'obrigatorio_iniciar' && <Tag color="red" style={{ fontSize: 10 }}>URGENTE</Tag>}
            {r.pedidoCompra && <Tag color="gold" style={{ fontSize: 10 }}>Pedido feito</Tag>}
          </Space>
          {r.fornecedor && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.fornecedor}</Text></div>}
        </div>
      ),
    },
    { title: 'Un', dataIndex: 'unidadeResolvida', width: 55, render: (u: string) => <Tag>{u}</Tag> },
    { title: 'Previsto', dataIndex: 'qtdPrevista', width: 80, align: 'center' as const },
    { title: 'Comprado', dataIndex: 'qtdComprada', width: 80, align: 'center' as const,
      render: (v: number) => <Text type={v > 0 ? 'success' : 'secondary'}>{v || 0}</Text> },
    { title: 'Falta', dataIndex: 'qtdFaltante', width: 70, align: 'center' as const,
      render: (v: number) => <Text strong style={{ color: '#ff4d4f' }}>{v}</Text> },
    { title: 'Obra / Etapa', key: 'ref',
      render: (_, r) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.obraNome}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.etapaNome}</Text></div>
        </div>
      ),
    },
    { title: 'V. Prev.', dataIndex: 'valorPrevisto', width: 110,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Ações', key: 'acoes', width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={r.pedidoCompra ? 'Desmarcar pedido' : 'Marcar pedido feito'}>
            <Button size="small" type={r.pedidoCompra ? 'primary' : 'default'} ghost={r.pedidoCompra}
              onClick={() => marcarPedido(r, !r.pedidoCompra)}>
              Pedido
            </Button>
          </Tooltip>
          <Popconfirm title="Marcar como comprado?" onConfirm={() => marcarComprado(r)}>
            <Tooltip title="Marcar como totalmente comprado">
              <Button size="small" type="primary" icon={<CheckOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ── Colunas — consolidado ── */
  const colsCons: ColumnsType<MatConsolidado> = [
    { title: 'Material', dataIndex: 'nomeResolvido',
      render: (n: string, r) => (
        <div>
          <Space>
            <Text strong>{n}</Text>
            {r.urgente && <Tag color="red" style={{ fontSize: 10 }}>URGENTE</Tag>}
          </Space>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.obras.join(' · ')}</Text></div>
        </div>
      ),
    },
    { title: 'Un', dataIndex: 'unidadeResolvida', width: 55, render: (u: string) => <Tag>{u}</Tag> },
    { title: 'Qtd Total', dataIndex: 'qtdTotal', width: 90, align: 'center' as const,
      render: (v: number) => <Text strong style={{ color: '#1677ff', fontSize: 15 }}>{v}</Text> },
    { title: 'Obras', key: 'obras', width: 60, align: 'center' as const,
      render: (_, r) => <Badge count={r.obras.length} color="#1677ff" /> },
    { title: 'Valor Prev.', dataIndex: 'valorTotal', width: 130,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Necessidade de Compra</Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Itens p/ comprar" value={totalItens}
              valueStyle={{ color: totalItens > 0 ? '#faad14' : undefined, fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Urgentes" value={urgentes}
              valueStyle={{ color: urgentes > 0 ? '#ff4d4f' : undefined, fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Obras afetadas" value={obrasAfetadas} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Valor previsto total" value={formatarMoeda(totalValor)} valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={14}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar material, obra, etapa ou fornecedor..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
        <Col xs={24} sm={10} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button icon={<PrinterOutlined />} onClick={imprimirNecessidade}>
            Imprimir lista consolidada
          </Button>
        </Col>
      </Row>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'necessidade',
            label: `📋 Consolidado por Material (${filtradoCons.length})`,
            children: (
              <Table
                dataSource={filtradoCons}
                columns={colsCons}
                rowKey="nomeResolvido"
                size="middle"
                pagination={{ pageSize: 30, showTotal: t => `${t} material(is)` }}
                locale={{ emptyText: 'Nenhum material pendente de compra.' }}
                rowClassName={r => r.urgente ? 'row-urgente' : ''}
                expandable={{
                  expandedRowRender: r => (
                    <Table
                      dataSource={r.itens}
                      columns={[
                        { title: 'Obra', dataIndex: 'obraNome', render: (n: string, m) => (
                          <div><Text>{n}</Text><div><Text type="secondary" style={{ fontSize: 11 }}>{m.etapaNome}</Text></div></div>
                        )},
                        { title: 'Previsto', dataIndex: 'qtdPrevista', width: 80, align: 'center' as const },
                        { title: 'Comprado', dataIndex: 'qtdComprada', width: 80, align: 'center' as const },
                        { title: 'Falta', dataIndex: 'qtdFaltante', width: 70, align: 'center' as const,
                          render: (v: number) => <Text strong style={{ color: '#ff4d4f' }}>{v}</Text> },
                        { title: 'Ações', key: 'a', width: 100,
                          render: (_, m) => (
                            <Space size={4}>
                              <Button size="small" type={m.pedidoCompra ? 'primary' : 'default'}
                                ghost={m.pedidoCompra} onClick={() => marcarPedido(m, !m.pedidoCompra)}>
                                Pedido
                              </Button>
                              <Popconfirm title="Marcar como comprado?" onConfirm={() => marcarComprado(m)}>
                                <Button size="small" type="primary" icon={<CheckOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                      rowKey={m => `${m.etapaId}-${m.id}`}
                      size="small"
                      pagination={false}
                    />
                  ),
                }}
              />
            ),
          },
          {
            key: 'porobra',
            label: `📦 Por Obra/Etapa (${filtradoPend.length})`,
            children: (
              <Table
                dataSource={filtradoPend}
                columns={colsItem}
                rowKey={r => `${r.etapaId}-${r.id}`}
                size="middle"
                pagination={{ pageSize: 30, showTotal: t => `${t} item(ns)` }}
                locale={{ emptyText: 'Nenhum material pendente.' }}
                rowClassName={r => r.classificacao === 'obrigatorio_iniciar' ? 'row-urgente' : ''}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
