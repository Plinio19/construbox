import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

interface Props { titulo: string; }

export default function EmBreve({ titulo }: Props) {
  const navigate = useNavigate();
  return (
    <Result
      status="info"
      title={titulo}
      subTitle="Esta página está sendo migrada para React. Em breve disponível aqui."
      extra={<Button onClick={() => navigate('/')}>Voltar ao Dashboard</Button>}
    />
  );
}
