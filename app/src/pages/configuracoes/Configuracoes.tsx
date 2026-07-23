import { useState, useEffect } from 'react';
import {
  Card, Form, Input, Button, Alert, Typography, Space, Divider,
  Table, Tag, message, Statistic, Row, Col,
} from 'antd';
import {
  SaveOutlined, CheckCircleOutlined, SyncOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import type { GitHubConfig, Lancamento } from '../../types';
import { useObrasStore } from '../../stores/useObrasStore';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;
const LS = 'construbox_config_v1';
const DEFAULTS = { owner: 'Plinio19', repo: 'construbox', branch: 'main' };

interface AnaliseObra {
  obraId: string;
  obraNome: string;
  receitasNovos: number;
  despesasNovas: number;
  total: number;
}

export default function Configuracoes() {
  const [form] = Form.useForm();
  const [saved, setSaved] = useState(false);

  const { obras, fetch: fetchObras }         = useObrasStore();
  const { lancamentos, fetch: fetchLanc, save: saveLanc } = useLancamentosStore();

  const [analise, setAnalise]   = useState<AnaliseObra[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [migrando, setMigrando] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS) || '{}');
      form.setFieldsValue({ ...DEFAULTS, ...stored });
    } catch {}
  }, []);

  function salvar(values: GitHubConfig) {
    localStorage.setItem(LS, JSON.stringify(values));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // ── Análise ──────────────────────────────────────────────────────────────
  async function analisar() {
    setAnalisando(true);
    try {
      await fetchObras();
      await fetchLanc();
    } catch {}

    const resultado: AnaliseObra[] = [];

    for (const obra of obras.filter(o => o.status !== 'cancelada')) {
      const obraAny = obra as unknown as Record<string, unknown>;
      let rec = 0;
      let des = 0;

      // Parcelas sem lançamento correspondente (verifica por ID)
      for (const p of obra.parcelas || []) {
        if (!lancamentos.some(l => l.id === p.id)) rec++;
      }

      // funcionariosObra do sistema antigo
      type FuncOld = { nome?: string; valor?: number; prestadorId?: string };
      const funcsOld = (obraAny['funcionariosObra'] as FuncOld[] | undefined) || [];
      for (const f of funcsOld) {
        if ((f.valor || 0) <= 0) continue;
        // Verifica se já existe despesa para essa obra com esse valor e nome
        const existe = lancamentos.some(l =>
          l.obraId === obra.id &&
          l.tipo === 'despesa' &&
          Math.abs(l.valor - (f.valor || 0)) < 0.01 &&
          (l.descricao || '').includes(f.nome || '__nao_existe__'),
        );
        if (!existe) des++;
      }

      // obra.despesas (novo campo) sem lançamento correspondente
      for (const d of obra.despesas || []) {
        if (!lancamentos.some(l => l.id === d.id)) des++;
      }

      if (rec > 0 || des > 0) {
        resultado.push({ obraId: obra.id, obraNome: obra.nome, receitasNovos: rec, despesasNovas: des, total: rec + des });
      }
    }

    setAnalise(resultado);
    setAnalisando(false);

    if (resultado.length === 0) {
      message.success('Todas as obras já estão com lançamentos gerados!');
    }
  }

  // ── Migração ─────────────────────────────────────────────────────────────
  async function migrar() {
    setMigrando(true);
    try {
      await fetchObras();
      await fetchLanc();

      const novos: Lancamento[] = [];

      for (const obra of obras.filter(o => o.status !== 'cancelada')) {
        const obraAny = obra as unknown as Record<string, unknown>;

        // 1. Parcelas → Contas a Receber
        for (const p of obra.parcelas || []) {
          if (lancamentos.some(l => l.id === p.id)) continue;
          novos.push({
            id: p.id,
            tipo: 'receita',
            descricao: `${obra.nome} — ${p.descricao || 'Parcela'}`,
            valor: p.valor || 0,
            vencimento: p.vencimento || hoje(),
            status: p.pago ? 'pago' : 'pendente',
            categoria: 'parcela',
            obraId: obra.id,
            obraNome: obra.nome,
            clienteId: obra.clienteId || undefined,
            clienteNome: obra.clienteNome || undefined,
            criadoEm: hoje(),
          });
        }

        // 2. funcionariosObra (sistema antigo) → Contas a Pagar MO
        type FuncOld = { nome?: string; funcao?: string; valor?: number; vencimento?: string; prestadorId?: string };
        const funcsOld = (obraAny['funcionariosObra'] as FuncOld[] | undefined) || [];
        for (const f of funcsOld) {
          if ((f.valor || 0) <= 0) continue;
          const existe = lancamentos.some(l =>
            l.obraId === obra.id &&
            l.tipo === 'despesa' &&
            Math.abs(l.valor - (f.valor || 0)) < 0.01 &&
            (l.descricao || '').includes(f.nome || '__nao_existe__'),
          );
          if (existe) continue;
          novos.push({
            id: uid(),
            tipo: 'despesa',
            descricao: `MO: ${f.nome || 'Prestador'}${f.funcao ? ` (${f.funcao})` : ''} — ${obra.nome}`,
            valor: f.valor || 0,
            vencimento: f.vencimento || obra.dataPrevisaoFim || hoje(),
            status: 'pendente',
            categoria: 'mao-de-obra',
            obraId: obra.id,
            obraNome: obra.nome,
            prestadorId: f.prestadorId || undefined,
            prestadorNome: f.nome || undefined,
            criadoEm: hoje(),
          });
        }

        // 3. obra.despesas (novo campo) → Contas a Pagar
        for (const d of obra.despesas || []) {
          if (lancamentos.some(l => l.id === d.id)) continue;
          novos.push({
            id: d.id,
            tipo: 'despesa',
            descricao: d.descricao || `Despesa — ${obra.nome}`,
            valor: d.valor || 0,
            vencimento: d.vencimento || hoje(),
            status: 'pendente',
            categoria: d.categoria || 'outros',
            obraId: obra.id,
            obraNome: obra.nome,
            prestadorId: d.prestadorId || undefined,
            prestadorNome: d.prestadorNome || undefined,
            criadoEm: hoje(),
          });
        }
      }

      if (novos.length === 0) {
        message.info('Nenhum lançamento novo encontrado. Tudo já está sincronizado.');
        setMigrando(false);
        return;
      }

      await saveLanc(
        [...lancamentos, ...novos],
        `Migração: ${novos.length} lançamentos gerados das obras`,
      );

      message.success(`✅ ${novos.length} lançamento(s) criado(s) com sucesso!`);
      setAnalise(null); // limpa análise para reflectir o novo estado
    } catch (e) {
      message.error('Erro na migração: ' + String(e));
    }
    setMigrando(false);
  }

  const totalPendentes = (analise || []).reduce((s, a) => s + a.total, 0);

  return (
    <div style={{ maxWidth: 700 }}>
      <Title level={4}>Configurações</Title>

      {/* ── GitHub ── */}
      <Card title="Conexão GitHub (banco de dados)" style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          O sistema usa um repositório GitHub como banco de dados. Crie um token em{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
            github.com/settings/tokens
          </a>{' '}
          com permissão <code>repo</code>.
        </Text>

        {saved && (
          <Alert type="success" icon={<CheckCircleOutlined />}
            message="Configuração salva!" style={{ marginBottom: 16 }} showIcon />
        )}

        <Form form={form} layout="vertical" onFinish={salvar}>
          <Form.Item name="token" label="Personal Access Token" rules={[{ required: true }]}>
            <Input.Password placeholder="ghp_..." />
          </Form.Item>
          <Form.Item name="owner" label="Usuário / Organização" rules={[{ required: true }]}>
            <Input placeholder="Plinio19" />
          </Form.Item>
          <Form.Item name="repo" label="Repositório" rules={[{ required: true }]}>
            <Input placeholder="construbox" />
          </Form.Item>
          <Form.Item name="branch" label="Branch" rules={[{ required: true }]}>
            <Input placeholder="main" />
          </Form.Item>
          <Divider />
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
            Salvar configuração
          </Button>
        </Form>
      </Card>

      {/* ── Migração de lançamentos ── */}
      <Card
        title="🔄 Gerar Lançamentos das Obras"
        extra={
          <Space>
            <Button icon={<SyncOutlined />} loading={analisando} onClick={analisar}>
              Analisar
            </Button>
            {analise && analise.length > 0 && (
              <Button type="primary" icon={<ThunderboltOutlined />}
                loading={migrando} onClick={migrar} danger>
                Gerar {totalPendentes} lançamento(s)
              </Button>
            )}
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Cria os lançamentos de <b>Contas a Receber</b> (parcelas de cada obra) e{' '}
          <b>Contas a Pagar</b> (mão de obra e despesas) no sistema financeiro,
          vinculados a cada obra. Necessário para que o Dashboard, DRE e Extrato
          mostrem os valores corretos.
        </Text>

        {analise === null && (
          <Alert type="info" showIcon
            message="Clique em Analisar para verificar quais obras precisam ter lançamentos gerados." />
        )}

        {analise !== null && analise.length === 0 && (
          <Alert type="success" showIcon
            message="Todas as obras já têm lançamentos gerados. Nenhuma ação necessária." />
        )}

        {analise !== null && analise.length > 0 && (
          <>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={8}>
                <Card size="small">
                  <Statistic title="Obras sem lançamentos" value={analise.length}
                    valueStyle={{ color: '#fa8c16' }} />
                </Card>
              </Col>
              <Col xs={12} sm={8}>
                <Card size="small">
                  <Statistic title="Receitas a criar" value={analise.reduce((s, a) => s + a.receitasNovos, 0)}
                    valueStyle={{ color: '#52c41a' }} />
                </Card>
              </Col>
              <Col xs={12} sm={8}>
                <Card size="small">
                  <Statistic title="Despesas a criar" value={analise.reduce((s, a) => s + a.despesasNovas, 0)}
                    valueStyle={{ color: '#ff4d4f' }} />
                </Card>
              </Col>
            </Row>

            <Table
              dataSource={analise}
              rowKey="obraId"
              size="small"
              pagination={false}
              columns={[
                { title: 'Obra', dataIndex: 'obraNome', render: (n: string) => <Text strong>{n}</Text> },
                { title: 'Receitas (A Receber)', dataIndex: 'receitasNovos', width: 180, align: 'center' as const,
                  render: (v: number) => v > 0
                    ? <Tag color="green">+{v} lançamento(s)</Tag>
                    : <Text type="secondary">—</Text> },
                { title: 'Despesas (A Pagar)', dataIndex: 'despesasNovas', width: 170, align: 'center' as const,
                  render: (v: number) => v > 0
                    ? <Tag color="red">+{v} lançamento(s)</Tag>
                    : <Text type="secondary">—</Text> },
              ]}
            />
          </>
        )}
      </Card>
    </div>
  );
}
