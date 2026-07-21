import { Tag } from 'antd';
import type { StatusObra, StatusEtapa } from '../../types';

const OBRA_COLORS: Record<StatusObra, string> = {
  orcamento:  'default',
  aprovado:   'blue',
  andamento:  'processing',
  pausada:    'warning',
  concluida:  'success',
  cancelada:  'error',
};

const OBRA_LABELS: Record<StatusObra, string> = {
  orcamento:  'Orçamento',
  aprovado:   'Aprovado',
  andamento:  'Em andamento',
  pausada:    'Pausada',
  concluida:  'Concluída',
  cancelada:  'Cancelada',
};

const ETAPA_COLORS: Record<StatusEtapa, string> = {
  planejada:    'default',
  em_andamento: 'processing',
  pausada:      'warning',
  concluida:    'success',
  cancelada:    'error',
};

const ETAPA_LABELS: Record<StatusEtapa, string> = {
  planejada:    'Planejada',
  em_andamento: 'Em andamento',
  pausada:      'Pausada',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
};

export function ObraStatusTag({ status }: { status: StatusObra }) {
  return <Tag color={OBRA_COLORS[status]}>{OBRA_LABELS[status]}</Tag>;
}

export function EtapaStatusTag({ status }: { status: StatusEtapa }) {
  return <Tag color={ETAPA_COLORS[status]}>{ETAPA_LABELS[status]}</Tag>;
}

export const OBRA_STATUS_OPTIONS = Object.entries(OBRA_LABELS).map(([value, label]) => ({ value, label }));
export const ETAPA_STATUS_OPTIONS = Object.entries(ETAPA_LABELS).map(([value, label]) => ({ value, label }));
