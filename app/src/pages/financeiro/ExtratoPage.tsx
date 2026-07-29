import { useEffect, useState } from 'react';
import {
  Table, Row, Col, Card, Statistic, Typography, Input,
  DatePicker, Tag, Select, Divider, Progress,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Lancamento, StatusLancamento } from '../../types';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { formatarMoeda, formatarData, titleCase } from '../../utils';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<StatusLancamento, string> = {
  pendente: 'gold', pago: 'green', parcial: 'cyan', vencido: 'red', cancelado: 'default',
};
const STATUS_LABEL: Record<StatusLancamento, string> = {
  pendente: 'Pendente', pago: 'Pago', parcial: 'Parcial', vencido: 'Vencido', cancelado: 'Cancelado',
};

const CAT_LABEL: Record<string, string> = {
  'mao-de-obra': 'Mão de Obra', 'material': 'Material', 'ferramenta': 'Ferramenta',
  'combustivel': 'Combustível', 'comissao': 'Comissão', 'hospedagem': 'Hospedagem',
  'imposto': 'Imposto', 'reembolso': 'Reembolso', 'adiantamento': 'Adiantamento',
  'distribuicao': 'Dist. Lucro', 'outros': 'Outros', 'alimentacao': 'Alimentação',
};

function catLabel(cat?: string) {
  return cat ? (CAT_LABEL[cat] ?? cat) : '—';
}

export default function ExtratoPage() {
  const { lancamentos, loading, fetch } = useLancamentosStore();
  const { obras, fetch: fetchObras } = useObrasStore();
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [filtroObra, setFiltroObra] = useState<string>('todas');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');

  useEffect(() => { fetch(); fetchObras(); }, []);

  const ativos = lancamentos.filter(l => l.status !== 'cancelado');
  const obraAtual = obras.find(o => o.id === filtroObra);

  const filtrado = ativos
    .filter(l => {
      const matchBusca = !busca ||
        l.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        (l.obraNome || '').toLowerCase().includes(busca.toLowerCase()) ||
        (l.categoria || '').toLowerCase().includes(busca.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || l.tipo === filtroTipo;
      const matchPeriodo = !periodo ||
        (l.vencimento >= periodo[0].format('YYYY-MM-DD') &&
         l.vencimento <= periodo[1].format('YYYY-MM-DD'));
      const matchObra = filtroObra === 'todas' || l.obraId === filtroObra;
      const matchCat = !filtroCategoria || l.categoria === filtroCategoria;
      return matchBusca && matchTipo && matchPeriodo && matchObra && matchCat;
    })
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));

  // Saldo acumulado (reseta por obra quando filtrado)
  let saldoAcum = 0;
  const comSaldo = filtrado.map(l => {
    saldoAcum += l.tipo === 'receita' ? l.valor : -l.valor;
    return { ...l, saldoAcumulado: saldoAcum };
  });

  const totalReceitas = filtrado.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
  const totalDespesas = filtrado.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);
  const resultado = totalReceitas - totalDespesas;

  // Agrupamento por categoria (só para obra selecionada)
  const despPorCat = filtrado
    .filter(l => l.tipo === 'despesa')
    .reduce<Record<string, number>>((acc, l) => {
      const k = l.categoria || 'outros';
      acc[k] = (acc[k] || 0) + l.valor;
      return acc;
    }, {});
  const recPorCat = filtrado
    .filter(l => l.tipo === 'receita')
    .reduce<Record<string, number>>((acc, l) => {
      const k = l.categoria || 'outros';
      acc[k] = (acc[k] || 0) + l.valor;
      return acc;
    }, {});

  const columns: ColumnsType<Lancamento & { saldoAcumulado: number }> = [
    {
      title: 'Data', dataIndex: 'vencimento', width: 100,
      render: (d: string) => formatarData(d),
    },
    {
      title: 'Descrição', dataIndex: 'descricao',
      render: (desc: string, r) => (
        <div>
          <Text>{titleCase(desc)}</Text>
          {filtroObra === 'todas' && r.obraNome && (
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.obraNome}</Text></div>
          )}
          {r.prestadorNome && (
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.prestadorNome}</Text></div>
          )}
          {r.clienteNome && (
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.clienteNome}</Text></div>
          )}
        </div>
      ),
    },
    {
      title: 'Categoria', dataIndex: 'categoria', width: 130,
      render: (c: string) => c ? <Tag style={{ fontSize: 11 }}>{catLabel(c)}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tipo', dataIndex: 'tipo', width: 90,
      render: (t: string) => (
        <Tag color={t === 'receita' ? 'green' : 'red'}>
          {t === 'receita' ? 'Receita' : 'Despesa'}
        </Tag>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', width: 90,
      render: (s: StatusLancamento) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
    },
    {
      title: 'Valor', dataIndex: 'valor', width: 130, align: 'right' as const,
      render: (v: number, r) => (
        <Text strong style={{ color: r.tipo === 'receita' ? '#52c41a' : '#ff4d4f' }}>
          {r.tipo === 'receita' ? '+' : '–'}{formatarMoeda(v)}
        </Text>
      ),
    },
    {
      title: 'Saldo', dataIndex: 'saldoAcumulado', width: 130, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatarMoeda(v)}</Text>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Extrato Financeiro
        {obraAtual && (
          <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 12 }}>
            — {obraAtual.nome}
          </Text>
        )}
      </Title>

      {/* Filtro de obra — destaque */}
      <Card size="small" style={{ marginBottom: 16, background: '#f0f7ff', border: '1px solid #bae0ff' }}>
        <Row align="middle" gutter={12}>
          <Col style={{ color: '#0958d9', fontWeight: 600, fontSize: 13 }}>
            <FilterOutlined /> Filtrar por Obra:
          </Col>
          <Col flex="auto">
            <Select
              style={{ width: '100%', maxWidth: 400 }}
              value={filtroObra}
              onChange={v => setFiltroObra(v)}
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'todas', label: 'Todas as obras (extrato geral)' },
                ...obras
                  .filter(o => o.status !== 'cancelada')
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map(o => ({ value: o.id, label: o.nome })),
              ]}
            />
          </Col>
          {filtroObra !== 'todas' && (
            <Col>
              <Text
                style={{ fontSize: 12, color: '#0958d9', cursor: 'pointer' }}
                onClick={() => setFiltroObra('todas')}
              >
                Ver todas
              </Text>
            </Col>
          )}
        </Row>
      </Card>

      {/* Cards de resumo */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total Receitas" value={formatarMoeda(totalReceitas)}
              valueStyle={{ color: '#52c41a', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total Despesas" value={formatarMoeda(totalDespesas)}
              valueStyle={{ color: '#ff4d4f', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderColor: resultado >= 0 ? '#52c41a' : '#ff4d4f' }}>
            <Statistic
              title={resultado >= 0 ? 'Resultado (lucro)' : 'Resultado (prejuízo)'}
              value={formatarMoeda(Math.abs(resultado))}
              valueStyle={{ color: resultado >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 18 }}
              prefix={resultado >= 0 ? '+' : '–'}
            />
          </Card>
        </Col>
      </Row>

      {/* DRE por categoria — só quando obra selecionada */}
      {filtroObra !== 'todas' && (Object.keys(recPorCat).length > 0 || Object.keys(despPorCat).length > 0) && (
        <Card size="small" style={{ marginBottom: 16 }} title="Composição por Categoria">
          <Row gutter={24}>
            {/* Receitas por categoria */}
            {Object.keys(recPorCat).length > 0 && (
              <Col xs={24} sm={12}>
                <Text strong style={{ color: '#52c41a', display: 'block', marginBottom: 8 }}>
                  Receitas
                </Text>
                {Object.entries(recPorCat)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 6 }}>
                      <Row justify="space-between" style={{ marginBottom: 2 }}>
                        <Text style={{ fontSize: 12 }}>{catLabel(cat)}</Text>
                        <Text style={{ fontSize: 12, fontWeight: 600 }}>{formatarMoeda(val)}</Text>
                      </Row>
                      <Progress
                        percent={Math.round((val / totalReceitas) * 100)}
                        showInfo={false} size="small"
                        strokeColor="#52c41a"
                      />
                    </div>
                  ))}
              </Col>
            )}
            {/* Despesas por categoria */}
            {Object.keys(despPorCat).length > 0 && (
              <Col xs={24} sm={12}>
                {Object.keys(recPorCat).length > 0 && (
                  <Divider style={{ display: 'block' }} className="sm-hidden" />
                )}
                <Text strong style={{ color: '#ff4d4f', display: 'block', marginBottom: 8 }}>
                  Despesas
                </Text>
                {Object.entries(despPorCat)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 6 }}>
                      <Row justify="space-between" style={{ marginBottom: 2 }}>
                        <Text style={{ fontSize: 12 }}>{catLabel(cat)}</Text>
                        <Text style={{ fontSize: 12, fontWeight: 600 }}>{formatarMoeda(val)}</Text>
                      </Row>
                      <Progress
                        percent={Math.round((val / totalDespesas) * 100)}
                        showInfo={false} size="small"
                        strokeColor="#ff4d4f"
                      />
                    </div>
                  ))}
              </Col>
            )}
          </Row>
        </Card>
      )}

      {/* Filtros adicionais */}
      <Row gutter={[12, 8]} style={{ marginBottom: 16 }} wrap>
        <Col xs={24} sm={8}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar descrição..."
            value={busca} onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
        <Col xs={12} sm={5}>
          <Select style={{ width: '100%' }} value={filtroTipo}
            onChange={v => setFiltroTipo(v as typeof filtroTipo)}
            options={[
              { value: 'todos', label: 'Rec. e Desp.' },
              { value: 'receita', label: 'Só Receitas' },
              { value: 'despesa', label: 'Só Despesas' },
            ]} />
        </Col>
        <Col xs={12} sm={6}>
          <Select style={{ width: '100%' }} value={filtroCategoria || undefined}
            placeholder="Todas as categorias" allowClear
            onChange={v => setFiltroCategoria(v || '')}
            options={Object.entries(CAT_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
        </Col>
        <Col xs={24} sm={5}>
          <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY"
            onChange={v => setPeriodo(v as [dayjs.Dayjs, dayjs.Dayjs] | null)} />
        </Col>
      </Row>

      <Table
        dataSource={comSaldo}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 30, showTotal: t => `${t} lançamento(s)` }}
        locale={{ emptyText: filtroObra !== 'todas' ? 'Nenhum lançamento nesta obra.' : 'Nenhum lançamento no período.' }}
      />
    </div>
  );
}
