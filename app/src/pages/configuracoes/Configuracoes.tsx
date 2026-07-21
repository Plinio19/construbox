import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Alert, Typography, Space, Divider } from 'antd';
import { SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { GitHubConfig } from '../../types';

const { Title, Text } = Typography;
const LS = 'cbx_config';

export default function Configuracoes() {
  const [form]  = Form.useForm();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const cfg: GitHubConfig = JSON.parse(localStorage.getItem(LS) || '{}');
      form.setFieldsValue(cfg);
    } catch {}
  }, []);

  function salvar(values: GitHubConfig) {
    localStorage.setItem(LS, JSON.stringify(values));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Title level={4}>Configurações</Title>

      <Card title="Conexão GitHub (banco de dados)">
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          O sistema usa um repositório GitHub como banco de dados. Crie um token em{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
            github.com/settings/tokens
          </a>{' '}
          com permissão <code>repo</code>.
        </Text>

        {saved && (
          <Alert
            type="success"
            icon={<CheckCircleOutlined />}
            message="Configuração salva!"
            style={{ marginBottom: 16 }}
            showIcon
          />
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

          <Space>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              Salvar configuração
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
