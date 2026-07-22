import { useEffect } from 'react';
import { Row, Col, Card, Typography, Table, Tag, Space, Statistic, Avatar } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined } from '@ant-design/icons';
import { useFuncionariosStore } from '../../stores/useFuncionariosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { ObraStatusTag } from '../../components/common/StatusTag';
import { formatarMoeda } from '../../utils';

const { Title, Text } = Typography;

export default function EquipePage() {
  const { funcionarios, fetch: fetchFuncs } = useFuncionariosStore();
  const { obras, fetch: fetchObras } = useObrasStore();

  useEffect(() => { fetchFuncs(); fetchObras(); }, []);

  // Para cada funcionário, encontrar obras onde está alocado
  const funcionariosComObras = funcionarios.map(f => ({
    ...f,
    obrasAlocado: obras.filter(o => (o.funcionarios || []).some(of => of.funcionarioId === f.id)),
    salarioTotal: obras.filter(o => o.status === 'andamento').reduce((s, o) => {
      const alocacao = (o.funcionarios || []).find(of => of.funcionarioId === f.id);
      return s + (alocacao?.salario || 0);
    }, 0),
  }));

  const totalEquipe = funcionarios.length;
  const totalFolha = funcionariosComObras.reduce((s, f) => s + (f.salario || 0), 0);
  const alocados = funcionariosComObras.filter(f => f.obrasAlocado.some(o => o.status === 'andamento')).length;

  const columns: ColumnsType<typeof funcionariosComObras[0]> = [
    { title: 'Funcionário', key: 'nome',
      render: (_, r) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ background: '#1677ff' }} />
          <div>
            <Text strong>{r.nome}</Text>
            {r.cargo && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.cargo}</Text></div>}
          </div>
        </Space>
      ),
    },
    { title: 'Telefone', dataIndex: 'telefone', width: 140,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Salário base', dataIndex: 'salario', width: 130,
      render: (v: number) => v ? formatarMoeda(v) : <Text type="secondary">—</Text> },
    { title: 'Obras alocado', key: 'obras',
      render: (_, r) => (
        r.obrasAlocado.length === 0
          ? <Text type="secondary">Nenhuma</Text>
          : <Space wrap>
            {r.obrasAlocado.map(o => (
              <span key={o.id}>
                <Text style={{ fontSize: 12 }}>{o.nome}</Text>{' '}
                <ObraStatusTag status={o.status} />
              </span>
            ))}
          </Space>
      ),
    },
    { title: 'Status', key: 'status', width: 110,
      render: (_, r) => {
        const ativo = r.obrasAlocado.some(o => o.status === 'andamento');
        return <Tag color={ativo ? 'green' : 'default'}>{ativo ? 'Ativo em obra' : 'Disponível'}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>Equipe</Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Total equipe" value={totalEquipe} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Ativos em obra" value={alocados}
              valueStyle={{ color: '#52c41a', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Folha mensal estimada" value={formatarMoeda(totalFolha)}
              valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={funcionariosComObras}
        columns={columns}
        rowKey="id"
        size="middle"
        pagination={false}
        locale={{ emptyText: 'Nenhum funcionário cadastrado.' }}
      />
    </div>
  );
}
