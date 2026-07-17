# HBier · Análise de Clientes

App para consultar faturamento e litros por cliente, e comparar
cenários (clientes individuais ou grupos inteiros), lendo dados
direto de uma planilha Google Sheets.

Arquitetura: **React/Vite (front, no Vercel) + Google Apps Script
(proxy) + Google Sheets (única fonte de dados)** — mesmo padrão dos
outros apps HBier.

## 1. Planilha (Google Sheets)

O app lê direto o relatório **"Faturamento Mês a Mês por Clientes"** exportado
do ERP, sem precisar reformatar nada - só exportar/colar como está em 2 abas:

- Aba **`faturamento`** → relatório com "Valor a Apresentar: Valor Cobrado"
- Aba **`litros`** → mesmo relatório com "Valor a Apresentar: Litros"

Layout esperado (linhas de metadado no topo, cabeçalho, depois uma linha por cliente):

| Código | Cliente - Razão Social/Nome | 01/2023 | 02/2023 | ... |
|---|---|---|---|---|
| 2078 | 1 MILLER COMÉRCIO DE ALIMENTOS LTDA | 1881,00 | 198,00 | ... |

O script (`Code.gs`) acha a linha de cabeçalho automaticamente (procura por
"Código" na coluna A e "Cliente" na coluna B), então não importa em qual
linha exata ela esteja nem quantas linhas de metadado vêm antes.

- Atualize manualmente (semanalmente, colando o relatório atualizado); o app sempre lê a versão mais recente, sem precisar reimplantar nada.
- **Identificação do cliente**: o app usa o **Código** (coluna A) como identificador único de cada cliente - não o nome. Isso importa quando duas lojas diferentes têm a mesma Razão Social (ex: várias unidades de uma rede) - cada Código vira um cliente separado de verdade, mesmo com nomes iguais.
- **Nome exibido/buscado (Nome Fantasia) e Grupo**: crie (ou use) uma aba de cadastro com estas colunas (qualquer nome de aba serve, o app acha sozinho):

  | Código | Nome Fantasia | Categoria |
  |---|---|---|
  | 2078 | Zaffari Higienópolis | Rede de Mercado |
  | 2079 | Zaffari Bourbon | Rede de Mercado |

  O app casa pelo **Código**, então o Nome Fantasia pode ser diferente mesmo quando a Razão Social é igual nas duas linhas. Se um código não estiver nessa aba, o app usa a Razão Social do relatório como nome de exibição (fallback). Se a aba inteira não existir, o app funciona normalmente, só sem nome fantasia/grupo.

- **Data de criação do cliente (opcional)**: se a mesma aba de cadastro tiver uma coluna com cabeçalho "Data de Criação", "Data de Cadastro", "Data de Abertura" ou "Criado em" (data real ou texto DD/MM/AAAA), o app usa isso para mostrar **quantos clientes novos foram cadastrados por mês** (aba Dashboard). Sem essa coluna, essa seção simplesmente não aparece.

## 2. Login e usuários admin

Crie uma aba chamada **`usuarios`** com estas colunas:

| usuario | senha | admin | nome |
|---|---|---|---|
| henrique | ******** | SIM | Henrique |
| equipe | ******** | NAO | Equipe |

- `admin` = SIM/TRUE/1 libera a aba **Global**; qualquer outro valor (ou vazio) deixa o usuário sem acesso a ela.
- `nome` é opcional (aparece no canto superior direito depois do login).
- **Atenção**: a senha fica em texto simples na planilha - é uma proteção básica adequada pra uso interno da equipe, não é criptografia de verdade. Não reutilize uma senha importante aqui.

## 3. Backend (Google Apps Script)

1. Na planilha: **Extensões > Apps Script**.
2. Apague o conteúdo padrão e cole o arquivo `Code.gs` (raiz deste projeto).
3. **Implantar > Nova implantação**:
   - Tipo: **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
4. Copie a URL gerada (termina em `/exec`).
5. Teste no navegador: abrindo a URL deve devolver um JSON com `"ok": true` e a lista de dados.

Sempre que editar a planilha, não precisa reimplantar — só editar quando mudar o **código** do `Code.gs`.

## 4. Front-end (local)

```bash
npm install
cp .env.example .env
# edite .env e cole a URL do passo anterior em VITE_GAS_URL
npm run dev
```

## 5. Deploy no Vercel

1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New Project** > importe o repositório.
3. Framework preset: **Vite** (detecta automaticamente).
4. Em **Environment Variables**, adicione:
   - `VITE_GAS_URL` = URL do Apps Script (`/exec`)
5. Deploy.

## Versionamento

A versão do app aparece na tela de login (`APP_VERSION` em `src/App.jsx`).
Incrementar +1 a cada ajuste feito no app.
