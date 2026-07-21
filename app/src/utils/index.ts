export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function gerarCodigo(prefixo: string, lista: { codigo?: string }[]): string {
  const nums = lista
    .map(i => parseInt((i.codigo || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const proximo = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefixo}-${String(proximo).padStart(4, '0')}`;
}
