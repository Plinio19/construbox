import { useState, useEffect } from 'react';
import {
  Card, Form, Input, Button, Alert, Typography, Space, Divider,
  Table, Tag, message, Statistic, Row, Col, Popconfirm,
} from 'antd';
import {
  SaveOutlined, CheckCircleOutlined, SyncOutlined, ThunderboltOutlined,
  DeleteOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { GitHubConfig, Lancamento } from '../../types';
import { dataService } from '../../services/GitHubDataService';
import { useObrasStore } from '../../stores/useObrasStore';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { uid, hoje } from '../../utils';

const { Title, Text } = Typography;
const LS_CONFIG = 'construbox_config_v1';
const DEFAULTS = { owner: 'Plinio19', repo: 'construbox', branch: 'main' };

function lerLocalStorage(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

interface RowDiag {
  obraId: string;
  nome: string;
  status: string;
  parcelas: number;
  receitasComObraId: number;
  receitasSemObraId: number;
  criar: number;
  atualizar: number;
}

interface PlanItem {
  tipo: 'criar' | 'atualizar';
  lancamento: Lancamento;
}

export default function Configuracoes() {
  const [form] = Form.useForm();
  const [saved, setSaved] = useState(false);

  const { fetch: fetchObras } = useObrasStore();
  const { fetch: fetchLanc, save: saveLanc } = useLancamentosStore();

  const [diagObras, setDiagObras]     = useState<RowDiag[] | null>(null);
  const [plano, setPlano]             = useState<PlanItem[] | null>(null);
  const [analisando, setAnalisando]   = useState(false);
  const [migrando, setMigrando]       = useState(false);
  const [erroFetch, setErroFetch]     = useState<string | null>(null);

  const [lsObrasCount, setLsObrasCount] = useState<number | null>(null);
  const [lsLancsCount, setLsLancsCount] = useState<number | null>(null);
  const [ghObrasCount, setGhObrasCount] = useState<number | null>(null);
  const [ghLancsCount, setGhLancsCount] = useState<number | null>(null);
  const [zerando, setZerando] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_CONFIG) || '{}');
      form.setFieldsValue({ ...DEFAULTS, ...stored });
    } catch {}
  }, []);

  function salvar(values: GitHubConfig) {
    localStorage.setItem(LS_CONFIG, JSON.stringify(values));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function analisar() {
    setAnalisando(true);
    setErroFetch(null);
    setDiagObras(null);
    setPlano(null);

    // Lê localStorage diretamente para diagnóstico
    const lsObras = lerLocalStorage('cbx_obras');
    const lsLancs = lerLocalStorage('cbx_lanc');
    setLsObrasCount(lsObras.length);
    setLsLancsCount(lsLancs.length);

    // Fetch via store (GitHub → fallback localStorage)
    let fetchErro = '';
    try { await fetchObras(); } catch (e) { fetchErro += 'Obras: ' + String(e) + ' | '; }
    try { await fetchLanc(); } catch (e) { fetchErro += 'Lancs: ' + String(e); }
    if (fetchErro) setErroFetch(fetchErro);

    const freshObras = useObrasStore.getState().obras;
    const freshLancs = useLancamentosStore.getState().lancamentos;
    setGhObrasCount(freshObras.length);
    setGhLancsCount(freshLancs.length);

    const rows: RowDiag[] = [];
    const planItems: PlanItem[] = [];

    for (const obra of freshObras.filter(o => o.status !== 'cancelada')) {
      const obraAny = obra as unknown as Record<string, unknown>;

      const recComId = freshLancs.filter(l => l.obraId === obra.id && l.tipo === 'receita');

      const parcelas = obra.parcelas || [];
      let criar = 0, atualizar = 0, recSemId = 0;

      for (const p of parcelas) {
        const porId = freshLancs.find(l => l.id === p.id);
        if (porId) {
          if (!porId.obraId) {
            recSemId++;
            atualizar++;
            planItems.push({
              tipo: 'atualizar',
              lancamento: {
                ...porId,
                obraId: obra.id,
                obraNome: obra.nome,
                clienteId: obra.clienteId,
                clienteNome: obra.clienteNome,
                tipo: 'receita',
                vencimento: porId.vencimento
                  || (porId as unknown as Record<string, string>)['dataVencimento']
                  || (porId as unknown as Record<string, string>)['data']
                  || p.vencimento,
              },
            });
          }
        } else {
          criar++;
          planItems.push({
            tipo: 'criar',
            lancamento: {
              id: p.id,
              tipo: 'receita',
              descricao: `${obra.nome} — ${p.descricao || 'Parcela'}`,
              valor: p.valor || 0,
              vencimento: p.vencimento || hoje(),
              status: p.pago ? 'pago' : 'pendente',
              categoria: 'parcela',
              obraId: obra.id,
              obraNome: obra.nome,
              clienteId: obra.clienteId,
              clienteNome: obra.clienteNome,
              criadoEm: hoje(),
            },
          });
        }
      }

      // Obra com valorContrato mas sem parcelas e sem lançamentos
      if (parcelas.length === 0 && recComId.length === 0) {
        const vc = obra.valorContrato || 0;
        if (vc > 0) {
          criar++;
          planItems.push({
            tipo: 'criar',
            lancamento: {
              id: uid(),
              tipo: 'receita',
              descricao: `${obra.nome} — Contrato`,
              valor: vc,
              vencimento: obra.dataPrevisaoFim || obra.dataFim || hoje(),
              status: 'pendente',
              categoria: 'parcela',
              obraId: obra.id,
              obraNome: obra.nome,
              clienteId: obra.clienteId,
              clienteNome: obra.clienteNome,
              criadoEm: hoje(),
            },
          });
        }
      }

      // MO do sistema legado (funcionariosObra)
      type FuncOld = { nome?: string; funcao?: string; valor?: number; vencimento?: string; prestadorId?: string };
      const funcsOld = (obraAny['funcionariosObra'] as FuncOld[] | undefined) || [];
      for (const f of funcsOld) {
        if ((f.valor || 0) <= 0) continue;
        const existe = freshLancs.some(l =>
          l.obraId === obra.id && l.tipo === 'despesa' && Math.abs(l.valor - (f.valor || 0)) < 0.01,
        );
        if (!existe) {
          criar++;
          planItems.push({
            tipo: 'criar',
            lancamento: {
              id: uid(),
              tipo: 'despesa',
              descricao: `MO: ${f.nome || 'Prestador'}${f.funcao ? ` (${f.funcao})` : ''} — ${obra.nome}`,
              valor: f.valor || 0,
              vencimento: f.vencimento || obra.dataPrevisaoFim || hoje(),
              status: 'pendente',
              categoria: 'mao-de-obra',
              obraId: obra.id,
              obraNome: obra.nome,
              prestadorId: f.prestadorId,
              prestadorNome: f.nome,
              criadoEm: hoje(),
            },
          });
        }
      }

      // despesas do ObraForm
      for (const d of obra.despesas || []) {
        const existe = freshLancs.some(l => l.id === d.id && l.obraId === obra.id);
        if (!existe) {
          criar++;
          planItems.push({
            tipo: 'criar',
            lancamento: {
              id: d.id,
              tipo: 'despesa',
              descricao: d.descricao,
              valor: d.valor,
              vencimento: d.vencimento || hoje(),
              status: 'pendente',
              categoria: d.categoria,
              obraId: obra.id,
              obraNome: obra.nome,
              prestadorId: d.prestadorId,
              prestadorNome: d.prestadorNome,
              criadoEm: hoje(),
            },
          });
        }
      }

      rows.push({
        obraId: obra.id,
        nome: obra.nome,
        status: obra.status,
        parcelas: parcelas.length,
        receitasComObraId: recComId.length,
        receitasSemObraId: recSemId,
        criar,
        atualizar,
      });
    }

    setDiagObras(rows);
    setPlano(planItems);
    setAnalisando(false);
  }

  async function migrar() {
    if (!plano || plano.length === 0) return;
    setMigrando(true);
    try {
      await fetchLanc();
      const freshLancs = [...useLancamentosStore.getState().lancamentos];

      const idsAtualizados = new Set<string>();
      const novos: Lancamento[] = [];
      const idsExistentes = new Set(freshLancs.map(l => l.id));

      for (const item of plano) {
        if (item.tipo === 'atualizar') {
          const idx = freshLancs.findIndex(l => l.id === item.lancamento.id);
          if (idx >= 0) {
            freshLancs[idx] = { ...freshLancs[idx], ...item.lancamento };
            idsAtualizados.add(item.lancamento.id);
          }
        } else {
          if (!idsExistentes.has(item.lancamento.id)) {
            novos.push(item.lancamento);
            idsExistentes.add(item.lancamento.id);
          } else {
            // ID existe mas sem obraId → atualiza em-place
            const idx = freshLancs.findIndex(l => l.id === item.lancamento.id);
            if (idx >= 0 && !freshLancs[idx].obraId) {
              freshLancs[idx] = { ...freshLancs[idx], obraId: item.lancamento.obraId, obraNome: item.lancamento.obraNome };
              idsAtualizados.add(item.lancamento.id);
            }
          }
        }
      }

      const total = idsAtualizados.size + novos.length;
      if (total === 0) {
        message.info('Nenhuma alteração necessária.');
        setMigrando(false);
        return;
      }

      await saveLanc(
        [...freshLancs, ...novos],
        `Migração: ${novos.length} criado(s), ${idsAtualizados.size} corrigido(s)`,
      );

      message.success(`✅ ${novos.length} criado(s) e ${idsAtualizados.size} corrigido(s) com obraId.`);
      setDiagObras(null);
      setPlano(null);
    } catch (e) {
      message.error('Erro: ' + String(e));
    }
    setMigrando(false);
  }

  const totalAcoes   = (plano || []).length;
  const totalCriar   = (plano || []).filter(p => p.tipo === 'criar').length;
  const totalAtualizar = (plano || []).filter(p => p.tipo === 'atualizar').length;
  const obrasComAcao = (diagObras || []).filter(r => r.criar > 0 || r.atualizar > 0);

  async function zerarDados() {
    setZerando(true);
    try {
      const colecoes: Array<[string, string]> = [
        ['data/obras.json',        'cbx_obras'],
        ['data/lancamentos.json',  'cbx_lanc'],
        ['data/clientes.json',     'cbx_clientes'],
        ['data/prestadores.json',  'cbx_prestadores'],
        ['data/funcionarios.json', 'cbx_funcionarios'],
        ['data/etapas.json',       'cbx_etapas'],
        ['data/socios.json',       'cbx_socios'],
      ];

      for (const [path, lsKey] of colecoes) {
        await dataService.saveCollection(path, [], null, `Zerar ${path}`);
        localStorage.setItem(lsKey, '[]');
      }

      localStorage.setItem('cbx_extrato', '[]');
      localStorage.setItem('cbx_extrato_estado_v2', '{}');

      message.success('✅ ERP zerado! Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      message.error('Erro ao zerar: ' + String(e));
      setZerando(false);
    }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <Title level={4}>Configurações</Title>

      <Card title="Conexão GitHub (banco de dados)" style={{ marginBottom: 20 }}>
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

      <Card
        title="🔄 Gerar / Corrigir Lançamentos das Obras"
        style={{ marginBottom: 20 }}
        extra={
          <Space>
            <Button icon={<SyncOutlined />} loading={analisando} onClick={analisar}>
              Analisar
            </Button>
            {diagObras !== null && totalAcoes > 0 && (
              <Button type="primary" danger icon={<ThunderboltOutlined />}
                loading={migrando} onClick={migrar}>
                Executar ({totalCriar} criar + {totalAtualizar} corrigir)
              </Button>
            )}
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Vincula lançamentos de Contas a Receber e Contas a Pagar a cada obra para o Dashboard.
        </Text>

        {erroFetch && (
          <Alert type="error" showIcon message={`Erro ao carregar: ${erroFetch}`}
            style={{ marginBottom: 12 }} />
        )}

        {/* 4 cards de contagem */}
        {lsObrasCount !== null && (
          <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
            {[
              { title: 'cbx_obras (localStorage)', value: lsObrasCount, color: lsObrasCount > 0 ? '#52c41a' : '#f5222d' },
              { title: 'cbx_lanc (localStorage)',  value: lsLancsCount ?? 0, color: undefined },
              { title: 'Obras carregadas (store)', value: ghObrasCount ?? 0, color: (ghObrasCount ?? 0) > 0 ? '#52c41a' : '#fa8c16' },
              { title: 'Lancs carregados (store)', value: ghLancsCount ?? 0, color: undefined },
            ].map(item => (
              <Col xs={6} key={item.title}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  <Statistic title={<span style={{ fontSize: 11 }}>{item.title}</span>}
                    value={item.value}
                    valueStyle={{ fontSize: 20, color: item.color }} />
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {diagObras === null && (
          <Alert type="info" showIcon message="Clique em Analisar para verificar." />
        )}

        {diagObras !== null && totalAcoes === 0 && (
          <Alert type="success" showIcon
            message={`✅ Todas as ${diagObras.length} obras já têm lançamentos vinculados por obraId.`} />
        )}

        {diagObras !== null && diagObras.length === 0 && (
          <Alert type="warning" showIcon
            message="Nenhuma obra foi carregada. Verifique os cards acima — se 'cbx_obras' = 0, as obras não estão no localStorage. Se 'Obras carregadas' = 0, o fetch falhou." />
        )}

        {diagObras !== null && diagObras.length > 0 && (
          <>
            {obrasComAcao.length > 0 && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                message={`${obrasComAcao.length} obra(s) com ação: ${totalCriar} a criar, ${totalAtualizar} a corrigir (adicionar obraId)`} />
            )}
            <Table
              dataSource={diagObras}
              rowKey="obraId"
              size="small"
              pagination={false}
              columns={[
                {
                  title: 'Obra', dataIndex: 'nome',
                  render: (n: string, r) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{n}</Text>
                      <Tag style={{ fontSize: 10 }}>{r.status}</Tag>
                    </Space>
                  ),
                },
                { title: 'Parcelas', dataIndex: 'parcelas', width: 80, align: 'center' as const },
                {
                  title: 'Rec c/ obraId', dataIndex: 'receitasComObraId', width: 110, align: 'center' as const,
                  render: (v: number, r) => (
                    <Tag color={v > 0 ? 'green' : (r.parcelas > 0 || r.criar > 0 ? 'red' : 'default')}>{v}</Tag>
                  ),
                },
                {
                  title: 'Corrigir', dataIndex: 'atualizar', width: 90, align: 'center' as const,
                  render: (v: number) => v > 0 ? <Tag color="blue">+{v}</Tag> : <Tag>0</Tag>,
                },
                {
                  title: 'Criar', dataIndex: 'criar', width: 80, align: 'center' as const,
                  render: (v: number) => v > 0 ? <Tag color="orange">+{v}</Tag> : <Tag>0</Tag>,
                },
              ]}
            />
          </>
        )}
      </Card>

      {/* ── Zerar Dados ── */}
      <Card
        title={<span style={{ color: '#ff4d4f' }}><WarningOutlined /> Zona de Perigo</span>}
        style={{ borderColor: '#ffccc7' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">
            Apaga <strong>obras, lançamentos, clientes, prestadores, funcionários, etapas e sócios</strong> do
            GitHub e do localStorage. <strong>Modelos são preservados.</strong> Ação irreversível.
          </Text>
          <Popconfirm
            title="Zerar todos os dados do ERP?"
            description="Isso apaga obras, lançamentos e cadastros. Modelos são mantidos. Sem volta."
            onConfirm={zerarDados}
            okText="Sim, zerar tudo"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} loading={zerando} size="large">
              Zerar ERP (manter modelos)
            </Button>
          </Popconfirm>
        </Space>
      </Card>
    </div>
  );
}
