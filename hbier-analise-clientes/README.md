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
- **Grupo por cliente**: esse relatório não traz um grupo por linha (só um resumo textual no topo). A comparação por "Clientes" funciona normalmente; a comparação por "Grupo" fica disponível só quando tivermos uma forma de vincular cliente → grupo (ex: uma aba extra `Clientes` com `cliente | grupo`).

## 2. Backend (Google Apps Script)

1. Na planilha: **Extensões > Apps Script**.
2. Apague o conteúdo padrão e cole o arquivo `Code.gs` (raiz deste projeto).
3. **Implantar > Nova implantação**:
   - Tipo: **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
4. Copie a URL gerada (termina em `/exec`).
5. Teste no navegador: abrindo a URL deve devolver um JSON com `"ok": true` e a lista de dados.

Sempre que editar a planilha, não precisa reimplantar — só editar quando mudar o **código** do `Code.gs`.

## 3. Front-end (local)

```bash
npm install
cp .env.example .env
# edite .env e cole a URL do passo anterior em VITE_GAS_URL
npm run dev
```

## 4. Deploy no Vercel

1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New Project** > importe o repositório.
3. Framework preset: **Vite** (detecta automaticamente).
4. Em **Environment Variables**, adicione:
   - `VITE_GAS_URL` = URL do Apps Script (`/exec`)
5. Deploy.

## Versionamento

A versão do app aparece na tela de login (`APP_VERSION` em `src/App.jsx`).
Incrementar +1 a cada ajuste feito no app.
