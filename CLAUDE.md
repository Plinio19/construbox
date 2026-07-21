# CLAUDE.md — Blueprint: Construbox ERP (GitHub as Database)

## O QUE É ESTE ARQUIVO
Este arquivo descreve a arquitetura completa do sistema **Construbox** para que um novo chat consiga replicar o sistema para outro cliente — no caso, **VN ENGENHARIA**. Leia tudo antes de começar.

---

## OBJETIVO DO SISTEMA
ERP estático para gestão de obras de construção civil:
- Obras e Clientes
- Cronograma de Etapas (com dependências entre etapas)
- Materiais por Etapa (com controle de estoque/entrega)
- Compras de Obra
- Lançamentos financeiros por obra
- Classificação de extrato bancário (OFX)
- Relatório financeiro por obra

**Sem backend. Sem banco de dados. Sem servidor.** Tudo é HTML estático + GitHub API.

---

## ARQUITETURA FUNDAMENTAL

### GitHub como Banco de Dados
- Os dados ficam em arquivos JSON dentro do repositório: `data/obras.json`, `data/etapas.json`, `data/lancamentos.json` etc.
- O front-end usa a **GitHub Contents API** (GET para ler, PUT para escrever).
- O usuário configura: **owner** (usuário GitHub), **repo** (repositório), **branch** (main), **token** (Personal Access Token com escopo `repo`).
- A configuração fica salva em **localStorage** (`construbox_config_v1`).
- O site é hospedado no **GitHub Pages** do mesmo repositório.

### localStorage como Cache
- Cada módulo salva os dados no localStorage ao carregar do GitHub.
- Na próxima visita, renderiza do cache imediatamente e depois atualiza do GitHub em background.
- Isso evita tela em branco enquanto aguarda a API.

### SHA para Conflitos
- Toda operação de PUT precisa do SHA atual do arquivo.
- Se o SHA estiver desatualizado, o GitHub retorna erro 409.
- Solução padrão para páginas que múltiplas abas podem editar: sempre buscar o SHA fresco com um GET antes de fazer PUT.
- Páginas de edição única (ex: cronograma) podem guardar o SHA em variável local e atualizar após cada salvamento.

### Autenticação
- Token fica **somente no localStorage**. NUNCA em arquivos commitados.
- Instrução ao usuário: cole o token apenas na tela de Configurações (⚙️) dentro do sistema.

---

## ESTRUTURA DE ARQUIVOS

```
construbox/                  ← raiz do repositório
├── assets/
│   ├── core.css             ← design system completo
│   └── core.js              ← utilitários compartilhados (GitHub API, sidebar, toast, utils)
├── data/                    ← dados JSON (gerados pelo sistema, não editar manualmente)
│   ├── obras.json
│   ├── etapas.json
│   └── lancamentos.json
├── index.html               ← Dashboard (página inicial)
├── cadastros/index.html     ← Sócios & Clientes
├── obras/
│   ├── index.html           ← Lista de obras
│   └── cronograma/index.html ← Cronograma + materiais (página mais complexa)
├── compras/index.html       ← Compras de Obra (visão centralizada de materiais)
├── lancamentos/index.html   ← Lançamentos financeiros
├── contas-pagar/index.html  ← Contas a pagar
├── contas-receber/index.html ← Contas a receber
├── extrato/index.html       ← Classificar extrato OFX
├── conciliacao/index.html   ← Conciliação bancária
├── relatorios/index.html    ← Relatório por obra
└── CLAUDE.md                ← este arquivo
```

---

## core.js — Funções Disponíveis

Todas as páginas incluem `<script src="../assets/core.js"></script>` (ou `./assets/core.js` para o dashboard na raiz).

### GitHub API
```javascript
ghGet(path)                          // GET de arquivo JSON do repo
ghPut(path, content, sha, mensagem)  // PUT (criar/atualizar) arquivo no repo
carregarDados(path)                  // → { lista: [...], sha: '...' }
salvarDados(path, lista, sha, msg)   // → novo sha
```

### Utilitários
```javascript
configurado()          // true se token/owner/repo configurados
getConfig()            // { owner, repo, branch, token }
uid()                  // ID único (timestamp+random)
esc(s)                 // HTML escape
hl(texto, busca)       // destacar texto com <mark>
hoje()                 // '2026-07-20'
formatarData(iso)      // '2026-07-20' → '20/07/2026'
formatarMoeda(valor)   // → 'R$ 1.234,56'
parseMoeda(s)          // string → number
salvarLocal(chave, dados)
carregarLocal(chave)   // → dados ou null
toast(msg, tipo)       // tipo: 'sucesso' | 'aviso' | 'erro'
setSyncStatus(cor, texto) // 'verde' | 'amarelo' | 'vermelho'
buildSidebar(moduloAtivo) // retorna HTML da sidebar
```

### Sidebar
A sidebar é montada via `buildSidebar('id-do-modulo')` e renderizada em `<div id="sidebar-placeholder">`.
Os módulos são definidos no array `MODULOS` dentro de core.js.

---

## core.css — Design System

Variáveis CSS principais:
```css
--brand          /* azul primário */
--verde / --verde-bg
--vermelho / --vermelho-bg
--amarelo / --amarelo-bg
--azul / --azul-bg
--laranja
--texto / --texto-leve
--fundo / --fundo2
--branco
--cinza / --cinza2
```

Classes disponíveis:
- `.main`, `.page`, `.topbar`, `.topbar-titulo`, `.topbar-sub`, `.topbar-acoes`
- `.sidebar`, `.sidebar-nav`, `.nav-item`, `.nav-grupo`
- `.card`, `.card-header`, `.card-body`, `.card-footer`
- `.stats-grid`, `.stat`, `.stat.verde`, `.stat.vermelho`, `.stat.amarelo`, `.stat.azul`
- `.btn`, `.btn-primary`, `.btn-success`, `.btn-outline`, `.btn-sm`
- `.badge`, `.badge.verde`, `.badge.vermelho`, `.badge.amarelo`, `.badge.azul`, `.badge.laranja`, `.badge.cinza`
- `.chip`, `.chip.ativo` (tabs/filtros)
- `.tabela` (table estilizada)
- `.form-campo`, `.form-control`, `label`, `input`, `select`, `textarea`
- `.modal`, `.overlay`, `.overlay.aberto`, `.modal-header`, `.modal-body`, `.modal-footer`, `.btn-fechar`
- `.sync-pill`, `.sync-dot`, `.sync-dot.amarelo`, `.sync-dot.vermelho`
- `.toast`, `.toast-container`, `.toast.sucesso`, `.toast.aviso`, `.toast.erro`
- `.overlay` — fundo escuro. Adicionar classe `aberto` para mostrar.

---

## MODELO DE DADOS

### obras.json
```json
[{
  "id": "abc123",
  "nome": "Residência Rua das Flores",
  "cliente": "João Silva",
  "endereco": "Rua das Flores, 123",
  "status": "ativa",          // ativa | paralisada | concluida
  "valorContrato": 180000,
  "valorMaoDeObra": 40000,
  "dataInicio": "2026-06-01",
  "previsaoConclusao": "2026-12-31",
  "obs": "",
  "criadoEm": "2026-06-01"
}]
```

### etapas.json
```json
[{
  "id": "et001",
  "obraId": "abc123",
  "nome": "Fundação",
  "ordem": 1,
  "responsavel": "Carlos",
  "status": "em_execucao",    // pendente | em_execucao | concluida | paralisada | aguardando_material
  "statusEfetivo": ...,       // calculado em runtime, NÃO salvo
  "dependencias": ["et000"],  // IDs de etapas que devem estar concluídas antes
  "dataInicio": "2026-06-10",
  "dataPrevFim": "2026-07-01",
  "dataConclusao": null,
  "percentual": 60,
  "valorMO": 8000,
  "valorPrevisto": 12000,
  "obs": "",
  "criadoEm": "2026-06-01",
  "materiais": [{
    "id": "mat001",
    "nome": "Cimento CP-II",
    "unidade": "sc",
    "classificacao": "obrigatorio_iniciar",  // obrigatorio_iniciar | obrigatorio_execucao | complementar | opcional
    "qtdPrevista": 100,
    "qtdMinIniciar": 30,
    "qtdComprada": 0,
    "qtdEntregue": 0,
    "qtdReservada": 0,
    "qtdUtilizada": 0,
    "fornecedor": "",
    "valorPrevisto": 3500,
    "valorComprado": 0,
    "pedidoCompra": false,
    "solicitacaoData": null,
    "obs": ""
  }]
}]
```

### lancamentos.json
```json
[{
  "id": "lan001",
  "obraId": "abc123",        // pode ser null para despesas gerais
  "tipo": "despesa",         // receita | despesa | ignorar
  "categoria": "mao-de-obra",
  "descricao": "Pagamento pedreiro semana 1",
  "valor": 1200,
  "data": "2026-06-15",
  "status": "pago",          // pago | pendente | agendado | cancelado
  "ofxId": "20260615-001",   // ID da transação OFX (para conciliação)
  "criadoEm": "2026-06-15"
}]
```

**Nota sobre `tipo: 'ignorar'`:** lançamentos com este tipo representam transações do extrato (RDB, investimentos etc.) que o usuário decidiu ignorar. São salvas no GitHub para persistir entre dispositivos.

---

## LÓGICA DO CRONOGRAMA (página mais complexa)

### statusEf(etapa) — Status Efetivo
O status exibido não é sempre o status salvo. A função `statusEf()` calcula:
1. Se a etapa tem dependências não concluídas → retorna `'bloqueada'`
2. Se tem materiais `obrigatorio_iniciar` com `qtdEntregue < qtdMinIniciar` → retorna `'aguardando_material'`
3. Senão → retorna o `e.status` salvo

### Dependências
- Etapas podem depender de outras (array `dependencias` de IDs).
- Se qualquer dependência não estiver `concluida`, a etapa fica bloqueada.

### Materiais embutidos na Etapa
- Materiais ficam DENTRO de cada etapa (`etapa.materiais = [...]`), não em arquivo separado.
- Isso simplifica queries (tudo junto) mas exige salvar o arquivo inteiro ao editar um material.

---

## MÓDULO EXTRATO / CONCILIAÇÃO

### Fluxo OFX
1. Usuário faz upload de arquivo OFX (extrato bancário).
2. Sistema parseia as transações (`<STMTTRN>`) e as exibe.
3. Usuário classifica cada transação: associa a uma obra + categoria, ou ignora.
4. Classificadas viram lançamentos em `lancamentos.json`.
5. Ignoradas viram lançamentos com `tipo: 'ignorar'`.

### Persistência Entre Dispositivos
- Estado das transações (lançado/pendente/ignorado) é reconstruído via `reconstruirEstado()`:
  - **Pass 1:** busca lançamento pelo `ofxId` (match exato)
  - **Pass 2:** fallback por `data + valor + tipo` para lançamentos antigos sem `ofxId`
- Isso evita sincronizar o localStorage entre PCs — basta ter `lancamentos.json` no GitHub.

---

## TEMPLATE DE PÁGINA

Toda página segue este padrão:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>NomeDoSistema — Nome do Módulo</title>
  <link rel="stylesheet" href="../assets/core.css"/>
  <style>
    /* estilos específicos deste módulo */
  </style>
</head>
<body>
<div id="sidebar-placeholder"></div>
<div class="main">
  <div class="topbar">
    <div>
      <div class="topbar-titulo">Título</div>
      <div class="topbar-sub" id="header-sub">Subtítulo</div>
    </div>
    <div class="topbar-acoes">
      <div class="sync-pill">
        <div class="sync-dot amarelo" id="sync-dot"></div>
        <span id="sync-texto">Conectando</span>
      </div>
    </div>
  </div>
  <div class="page">
    <!-- conteúdo -->
  </div>
</div>

<div class="toast-container" id="toasts"></div>
<script src="../assets/core.js"></script>
<script>
document.getElementById('sidebar-placeholder').innerHTML = buildSidebar('id-do-modulo');

const DATA_PATH = 'data/arquivo.json';
const LS_KEY    = 'cbx_chave';

let lista = [], sha = null;

async function init() {
  lista = carregarLocal(LS_KEY) || [];
  render();
  if (!configurado()) { setSyncStatus('vermelho', 'Não configurado'); return; }
  setSyncStatus('amarelo', 'Carregando...');
  try {
    const res = await carregarDados(DATA_PATH);
    lista = res.lista; sha = res.sha;
    salvarLocal(LS_KEY, lista);
    render();
    setSyncStatus('verde', 'Conectado');
  } catch(e) {
    setSyncStatus('vermelho', 'Erro');
    toast('Usando cache local.', 'aviso');
  }
}

init();
</script>
</body>
</html>
```

---

## COMO CRIAR O SISTEMA PARA VN ENGENHARIA

### 1. Criar repositório novo no GitHub
- Criar repo `vn-engenharia` (ou similar) no GitHub do usuário
- Ativar GitHub Pages (Settings → Pages → Deploy from branch: main, folder: / root)

### 2. Copiar a base do Construbox
- Copiar `assets/core.css` e `assets/core.js`
- Adaptar o nome "Construbox" → "VN Engenharia" nos textos
- Adaptar o array `MODULOS` em core.js para os módulos que VN Engenharia vai ter
- Adaptar as variáveis de cor se quiser identidade visual diferente

### 3. Módulos necessários
Mesmos módulos do Construbox, ou subconjunto conforme necessidade de VN Engenharia.

### 4. Dados
- Pasta `data/` começa vazia (sem commits de JSON) — o sistema cria os arquivos ao primeiro salvamento
- Alternativa: commitar JSONs vazios `[]` para os arquivos de dados

### 5. Configuração do usuário
- Na primeira visita, o usuário vai em ⚙️ Configurações e coloca:
  - Usuário GitHub (owner)
  - Repositório (repo)
  - Branch: main
  - Token: Personal Access Token com escopo `repo`
- O token fica APENAS no localStorage, nunca commitado

---

## DIFERENÇAS PARA VN ENGENHARIA (perguntar ao usuário)
- Nome do sistema (já definido: VN Engenharia)
- Módulos necessários (todos? subconjunto?)
- Identidade visual (cores da empresa?)
- Campos específicos das obras que VN Engenharia usa?
- Repositório GitHub já criado ou criar do zero?

---

## URL DO SISTEMA ATUAL (Construbox)
https://plinio19.github.io/construbox/

## REPO DO CONSTRUBOX (para referência de código)
https://github.com/Plinio19/construbox
