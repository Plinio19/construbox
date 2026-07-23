import { useEffect, useState } from 'react';
import {
  Table, Row, Col, Card, Statistic, Typography, Input,
  DatePicker, Tag, Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Lancamento, StatusLancamento } from '../../types';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { formatarMoeda, formatarData } from '../../utils';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<StatusLancamento, string> = {
  pendente: 'gold', pago: 'green', vencido: 'red', cancelado: 'default',
};
const STATUS_LABEL: Record<StatusLancamento, string> = {
  pendente: 'Pendente', pago: 'Pago', vencido: 'Vencido', cancelado: 'Cancelado',
};

export default function ExtratoPage() {
  const { lancamentos, loading, fetch } = useLancamentosStore();
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos');

  useEffect(() => { fetch(); }, []);

  const ativos = lancamentos.filter(l => l.status !== 'cancelado');

  const filtrado = ativos
    .filter(l => {
      const matchBusca = !busca || l.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        (l.obraNome || '').toLowerCase().includes(busca.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || l.tipo === filtroTipo;
      const matchPeriodo = !periodo || (l.vencimento >= periodo[0].format('YYYY-MM-DD') && l.vencimento <= periodo[1].format('YYYY-MM-DD'));
      return matchBusca && matchTipo && matchPeriodo;
    })
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));

  // Saldo corrente acumulado
  let saldoAcum = 0;
  const comSaldo = filtrado.map(l => {
    const val = l.tipo === 'receita' ? l.valor : -l.valor;
    saldoAcum += val;
    return { ...l, saldoAcumulado: saldoAcum };
  });

  const totalReceitas = filtrado.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0);
  const totalDespesas = filtrado.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0);
  const saldo = totalReceitas - totalDespesas;

  const columns: ColumnsType<Lancamento & { saldoAcumulado: number }> = [
    { title: 'Data', dataIndex: 'vencimento', width: 110, render: (d: string) => formatarData(d) },
    { title: 'Descrição', dataIndex: 'descricao',
      render: (desc: string, r) => (
        <div>
          <Text>{desc}</Text>
          {r.obraNome && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.obraNome}</Text></div>}
        </div>
      ),
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 100,
      render: (t: string) => <Tag color={t === 'receita' ? 'green' : 'red'}>{t === 'receita' ? 'Receita' : 'Despesa'}</Tag> },
    { title: 'Status', dataIndex: 'status', width: 100,
      render: (s: StatusLancamento) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag> },
    { title: 'Valor', dataIndex: 'valor', width: 130, align: 'right' as const,
      render: (v: number, r) => (
        <Text strong style={{ color: r.tipo === 'receita' ? '#52c41a' : '#ff4d4f' }}>
          {r.tipo === 'receita' ? '+' : '-'}{formatarMoeda(v)}
        </Text>
      ),
    },
    { title: 'Saldo', dataIndex: 'saldoAcumulado', width: 130, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatarMoeda(v)}</Text>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Extrato Financeiro</Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total Receitas" value={formatarMoeda(totalReceitas)} valueStyle={{ color: '#52c41a', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total Despesas" value={formatarMoeda(totalDespesas)} valueStyle={{ color: '#ff4d4f', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderColor: saldo >= 0 ? '#52c41a' : '#ff4d4f' }}>
            <Statistic title="Saldo" value={formatarMoeda(saldo)} valueStyle={{ color: saldo >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }} wrap>
        <Col xs={24} sm={8}>
          <Input prefix={<SearchOutlined />} placeholder="Buscar..." value={busca}
            onChange={e => setBusca(e.target.value)} allowClear />
        </Col>
        <Col xs={24} sm={8}>
          <Select style={{ width: '100%' }} value={filtroTipo}
            onChange={v => setFiltroTipo(v as typeof filtroTipo)}
            options={[{ value: 'todos', label: 'Todos' }, { value: 'receita', label: 'Receitas' }, { value: 'despesa', label: 'Despesas' }]} />
        </Col>
        <Col xs={24} sm={8}>
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
        rowClassName={r => r.tipo === 'receita' ? 'row-receita' : 'row-despesa'}
        locale={{ emptyText: 'Nenhum lançamento no período.' }}
      />
    </div>
  );
}
