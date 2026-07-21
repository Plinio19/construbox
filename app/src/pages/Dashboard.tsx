import { Row, Col, Card, Statistic, Typography, Empty } from 'antd';
import {
  BuildOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useObrasStore } from '../stores/useObrasStore';
import { useLancamentosStore } from '../stores/useLancamentosStore';
import { useEffect } from 'react';
import { formatarMoeda } from '../utils';

const { Title, Text } = Typography;

export default function Dashboard() {
  const { obras, fetch: fetchObras } = useObrasStore();
  const { lancamentos, fetch: fetchLanc } = useLancamentosStore();

  useEffect(() => {
    fetchObras();
    fetchLanc();
  }, []);

  const emAndamento  = obras.filter(o => o.status === 'andamento').length;
  const concluidas   = obras.filter(o => o.status === 'concluida').length;
  const totalReceitas = lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pago')
    .reduce((s, l) => s + l.valor, 0);
  const pendentes    = lancamentos.filter(l => l.status === 'pendente').length;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Dashboard</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic
              title="Obras em andamento"
              value={emAndamento}
              prefix={<BuildOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic
              title="Obras concluídas"
              value={concluidas}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic
              title="Receitas recebidas"
              value={formatarMoeda(totalReceitas)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic
              title="Lançamentos pendentes"
              value={pendentes}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: pendentes > 0 ? '#faad14' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title="Obras recentes">
            {obras.length === 0 ? (
              <Empty description={<Text type="secondary">Nenhuma obra cadastrada ainda.</Text>} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {obras.slice(-5).reverse().map(o => (
                  <Card key={o.id} size="small" style={{ borderLeft: '3px solid #1677ff' }}>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Text strong>{o.nome}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{o.clienteNome || '—'}</Text>
                      </Col>
                      <Col>
                        <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                          {o.status}
                        </Text>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
