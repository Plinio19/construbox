import { useEffect, useState } from 'react';
import { Drawer, Form, Input, InputNumber, Select, DatePicker, Space, Button, message } from 'antd';
import dayjs from 'dayjs';
import type { Lancamento, TipoLancamento, StatusLancamento } from '../../types';
import { useLancamentosStore } from '../../stores/useLancamentosStore';
import { useObrasStore } from '../../stores/useObrasStore';
import { uid, hoje } from '../../utils';

interface Props {
  tipo: TipoLancamento;
  lancamento: Lancamento | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTS: { value: StatusLancamento; label: string }[] = [
  { value: 'pendente',  label: 'Pendente' },
  { value: 'pago',      label: 'Pago / Recebido' },
  { value: 'vencido',   label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
];

const CATEGORIAS_RECEITA = ['Contrato', 'Medição', 'Adiantamento', 'Reembolso', 'Outros'];
const CATEGORIAS_DESPESA = [
  'Material', 'Mão de obra', 'Aluguel equipamento', 'Transporte',
  'Escritório', 'Impostos', 'Serviços terceiros', 'Outros',
];

export default function LancamentoForm({ tipo, lancamento, open, onClose }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const { upsert } = useLancamentosStore();
  const { obras, fetch: fetchObras } = useObrasStore();

  useEffect(() => { if (open) fetchObras(); }, [open]);

  useEffect(() => {
    if (!open) return;
    if (lancamento) {
      form.setFieldsValue({
        ...lancamento,
        vencimento: lancamento.vencimento ? dayjs(lancamento.vencimento) : null,
        pagamento:  lancamento.pagamento  ? dayjs(lancamento.pagamento)  : null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ tipo, status: 'pendente' });
    }
  }, [lancamento, open]);

  async function salvar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); }
    catch { return; }

    setSaving(true);
    try {
      const obraId = v.obraId as string | undefined;
      const novoLanc: Lancamento = {
        id:          lancamento?.id || uid(),
        tipo,
        descricao:   String(v.descricao || ''),
        valor:       Number(v.valor) || 0,
        vencimento:  (v.vencimento as dayjs.Dayjs).format('YYYY-MM-DD'),
        pagamento:   v.pagamento ? (v.pagamento as dayjs.Dayjs).format('YYYY-MM-DD') : undefined,
        status:      (v.status as StatusLancamento) || 'pendente',
        obraId,
        obraNome:    obras.find(o => o.id === obraId)?.nome,
        categoria:   v.categoria as string | undefined,
        observacoes: v.observacoes as string | undefined,
        criadoEm:    lancamento?.criadoEm || hoje(),
      };
      await upsert(novoLanc);
      message.success(`Lançamento ${lancamento ? 'atualizado' : 'criado'}!`);
      onClose();
    } catch (e) {
      message.error('Erro: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  const categorias = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const titulo = tipo === 'receita' ? 'Conta a Receber' : 'Conta a Pagar';

  return (
    <Drawer
      title={lancamento ? `Editar: ${titulo}` : `Nova: ${titulo}`}
      open={open} onClose={onClose} width={520}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" loading={saving} onClick={salvar}>
            {lancamento ? 'Salvar alterações' : 'Criar lançamento'}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="descricao" label="Descrição" rules={[{ required: true }]}>
          <Input placeholder={tipo === 'receita' ? 'Ex: Parcela 1 — Obra Silva' : 'Ex: Cimento Portland 50 sacos'} />
        </Form.Item>

        <Form.Item name="obraId" label="Obra vinculada">
          <Select showSearch optionFilterProp="label" allowClear placeholder="Selecione (opcional)"
            options={obras.map(o => ({ value: o.id, label: o.nome }))} />
        </Form.Item>

        <Form.Item name="categoria" label="Categoria">
          <Select options={categorias.map(c => ({ value: c, label: c }))} allowClear placeholder="Selecione" />
        </Form.Item>

        <Form.Item name="valor" label="Valor" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} prefix="R$" min={0} precision={2} />
        </Form.Item>

        <Form.Item name="vencimento" label="Vencimento" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="status" label="Status">
          <Select options={STATUS_OPTS} />
        </Form.Item>

        <Form.Item name="pagamento" label="Data de pagamento / recebimento">
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="observacoes" label="Observações">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
