import { useEffect } from 'react';
import { Drawer, Form, Input, InputNumber, Select, Space, Button, Row, Col } from 'antd';
import type { Etapa, StatusEtapa } from '../../types';
import { ETAPA_STATUS_OPTIONS } from '../../components/common/StatusTag';
import { uid, hoje } from '../../utils';

interface Props {
  obraId: string;
  etapa: Etapa | null;
  open: boolean;
  onClose: () => void;
  onSave: (etapa: Etapa) => Promise<void>;
}

const CATEGORIAS = [
  'estrutura','alvenaria','cobertura','hidraulica','eletrica',
  'acabamento','revestimento','esquadria','instalacoes','outros',
].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

export default function EtapaForm({ obraId, etapa, open, onClose, onSave }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    if (etapa) {
      form.setFieldsValue(etapa);
    } else {
      form.resetFields();
      form.setFieldsValue({ status: 'planejada', categoria: 'outros' });
    }
  }, [etapa, open]);

  async function salvar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); }
    catch { return; }

    const novaEtapa: Etapa = {
      id:                 etapa?.id || uid(),
      obraId,
      modeloEtapaId:      etapa?.modeloEtapaId,
      geradoDeModelo:     etapa?.geradoDeModelo,
      nome:               String(v.nome || ''),
      codigo:             v.codigo as string | undefined,
      ordem:              Number(v.ordem) || undefined,
      categoria:          v.categoria as string | undefined,
      responsavel:        v.responsavel as string | undefined,
      descricao:          v.descricao as string | undefined,
      observacoes:        v.observacoes as string | undefined,
      memorial:           v.memorial as string | undefined,
      status:             (v.status as StatusEtapa) || 'planejada',
      peso:               Number(v.peso) || 0,
      percentualExecutado: etapa?.percentualExecutado || 0,
      dataPrevistoInicio: v.dataPrevistoInicio as string | undefined,
      dataPrevistoFim:    v.dataPrevistoFim as string | undefined,
      dataRealInicio:     etapa?.dataRealInicio,
      dataRealFim:        etapa?.dataRealFim,
      dependencias:       etapa?.dependencias || [],
      checklist:          etapa?.checklist || [],
      materiais:          etapa?.materiais || [],
      criadoEm:           etapa?.criadoEm || hoje(),
    };
    await onSave(novaEtapa);
    onClose();
  }

  return (
    <Drawer
      title={etapa ? `Editar: ${etapa.nome}` : 'Nova Etapa'}
      open={open} onClose={onClose} width={620}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" onClick={salvar}>
            {etapa ? 'Salvar alterações' : 'Criar etapa'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="nome" label="Nome da etapa" rules={[{ required: true }]}>
              <Input placeholder="Ex: Fundação" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="codigo" label="Código">
              <Input placeholder="01" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="status" label="Status">
              <Select options={ETAPA_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="categoria" label="Categoria">
              <Select options={CATEGORIAS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="peso" label="Peso (% da obra)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} suffix="%" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="responsavel" label="Responsável">
              <Input placeholder="Ex: Mestre de obras" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ordem" label="Ordem de execução">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="descricao" label="Descrição">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item name="memorial" label="Memorial Técnico / Instruções de Execução">
          <Input.TextArea
            rows={6}
            placeholder="Descreva os procedimentos, normas técnicas, cuidados especiais e sequência de execução desta etapa. Este texto será impresso na Ordem de Serviço entregue ao executor..."
          />
        </Form.Item>

        <Form.Item name="observacoes" label="Observações internas">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
