import { useEffect, useState } from 'react';
import { Drawer, Form, Input, InputNumber, Select, Space, Button, Row, Col, Tag, Typography } from 'antd';
import type { MaterialEtapa, UnidadeMedida, ClassificacaoMaterial } from '../../types';
import { useCatalogoStore } from '../../stores/useCatalogoStore';
import { uid } from '../../utils';

const { Text } = Typography;

interface Props {
  material: MaterialEtapa | null;
  open: boolean;
  onClose: () => void;
  onSave: (m: MaterialEtapa) => void;
}

const UNIDADES: UnidadeMedida[] = ['un','sc','m²','m³','m','kg','t','l','gl','cx','pc','barra'];

const CLASS_OPTS: { value: ClassificacaoMaterial; label: string }[] = [
  { value: 'obrigatorio_iniciar',  label: 'Obrigatório para iniciar' },
  { value: 'obrigatorio_concluir', label: 'Obrigatório para concluir' },
  { value: 'opcional',             label: 'Opcional' },
];

export default function MaterialEtapaForm({ material, open, onClose, onSave }: Props) {
  const [form] = Form.useForm();
  const { catalogo } = useCatalogoStore();
  const [catId, setCatId] = useState<string | undefined>();
  const [doCatalogo, setDoCatalogo] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (material) {
      form.setFieldsValue(material);
      setCatId(material.catalogoId);
      setDoCatalogo(!!material.catalogoId);
    } else {
      form.resetFields();
      form.setFieldsValue({ classificacao: 'obrigatorio_iniciar', unidade: 'un', qtdPrevista: 0, qtdComprada: 0, qtdEntregue: 0, qtdUtilizada: 0 });
      setCatId(undefined);
      setDoCatalogo(false);
    }
  }, [material, open]);

  function handleNomeChange(nome: string) {
    const item = catalogo.find(c => c.nome === nome);
    if (item) {
      form.setFieldsValue({ unidade: item.unidade, fornecedor: item.fornecedorRef || form.getFieldValue('fornecedor') });
      setCatId(item.id);
      setDoCatalogo(true);
    } else {
      setCatId(undefined);
      setDoCatalogo(false);
    }
  }

  function salvar() {
    form.validateFields().then(v => {
      const m: MaterialEtapa = {
        id:           material?.id || uid(),
        nome:         String(v.nome || ''),
        catalogoId:   catId,
        modeloRef:    material?.modeloRef,
        unidade:      v.unidade || 'un',
        classificacao: v.classificacao || 'obrigatorio_iniciar',
        qtdPrevista:  Number(v.qtdPrevista) || 0,
        qtdMinIniciar: Number(v.qtdMinIniciar) || 0,
        qtdComprada:  Number(v.qtdComprada) || 0,
        qtdEntregue:  Number(v.qtdEntregue) || 0,
        qtdReservada: Number(v.qtdReservada) || 0,
        qtdUtilizada: Number(v.qtdUtilizada) || 0,
        fornecedor:   v.fornecedor as string | undefined,
        valorPrevisto: Number(v.valorPrevisto) || 0,
        valorComprado: Number(v.valorComprado) || 0,
        pedidoCompra:  material?.pedidoCompra || false,
        obs:          v.obs as string | undefined,
      };
      onSave(m);
      onClose();
    }).catch(() => {});
  }

  return (
    <Drawer
      title={material ? 'Editar Material' : 'Adicionar Material'}
      open={open} onClose={onClose} width={580}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" onClick={salvar}>Salvar</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="nome" label={
          <Space>
            <span>Nome do material</span>
            {doCatalogo && <Tag color="blue" style={{ fontSize: 11 }}>do catálogo</Tag>}
          </Space>
        } rules={[{ required: true }]}>
          <Select
            showSearch
            allowClear
            placeholder="Buscar no catálogo ou digitar nome"
            optionFilterProp="label"
            options={catalogo.map(c => ({ value: c.nome, label: c.nome }))}
            onChange={handleNomeChange}
            onSearch={v => { if (!catalogo.find(c => c.nome === v)) { form.setFieldValue('nome', v); setCatId(undefined); setDoCatalogo(false); } }}
            notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>Material fora do catálogo — será adicionado com o nome digitado.</Text>}
            filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={10}>
            <Form.Item name="unidade" label="Unidade" rules={[{ required: true }]}>
              <Select options={UNIDADES.map(u => ({ value: u, label: u }))} />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item name="classificacao" label="Classificação">
              <Select options={CLASS_OPTS} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="qtdPrevista" label="Qtd. prevista">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="qtdMinIniciar" label="Qtd. mín. p/ iniciar">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="valorPrevisto" label="Valor previsto">
              <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="qtdComprada" label="Qtd. comprada">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="qtdEntregue" label="Qtd. entregue">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="qtdUtilizada" label="Qtd. utilizada">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="fornecedor" label="Fornecedor">
              <Input placeholder="Ex: Depósito ABC" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="valorComprado" label="Valor comprado">
              <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="obs" label="Observações">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
