# HBier · Análise de Clientes

App para consultar faturamento e litros por cliente, e comparar
cenários (clientes individuais ou grupos inteiros), lendo dados
direto de uma planilha Google Sheets.

Arquitetura: **React/Vite (front, no Vercel) + Google Apps Script
(proxy) + Google Sheets (única fonte de dados)** — mesmo padrão dos
outros apps HBier.

## 1. Planilha (Google Sheets)

Crie 2 abas na planilha, com estes cabeçalhos exatos na linha 1:

**Aba "Faturamento"**
| cliente | grupo | ano | mes | valor |
|---|---|---|---|---|
| Bar do Zé | Bares | 2025 | 7 | 8500 |

**Aba "Litros"** (mesma estrutura, `valor` em litros)
| cliente | grupo | ano | mes | valor |
|---|---|---|---|---|
| Bar do Zé | Bares | 2025 | 7 | 950 |

- `grupo`: segmento do cliente (ex: Bares, Mercados, Restaurantes, Distribuidores) — usado na aba de Comparação para selecionar um grupo inteiro de uma vez.
- `mes`: número de 1 a 12.
- Atualize manualmente (semanalmente); o app sempre lê a versão mais recente, sem precisar reimplantar nada.

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
