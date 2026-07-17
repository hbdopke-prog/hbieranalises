/**
 * HBier - Análise de Clientes
 * Backend (Google Apps Script)
 * Versão: v1.0
 *
 * Lê as abas "Faturamento" e "Litros" da planilha vinculada a este
 * script e devolve um JSON combinado por cliente/grupo/mês, no
 * formato consumido pelo front-end (Vercel).
 *
 * Estrutura esperada de cada aba (linha 1 = cabeçalho, nessa ordem
 * ou em qualquer ordem - o script busca pelo nome da coluna):
 *   cliente | grupo | ano | mes | valor
 *
 * - "cliente": nome do cliente (texto)
 * - "grupo": segmento/grupo do cliente (texto) - ex: Bares, Mercados...
 * - "ano": ano (número, ex: 2025)
 * - "mes": mês (número 1-12)
 * - "valor": faturamento (R$) na aba Faturamento, litros na aba Litros
 *
 * DEPLOY:
 *   1. Extensões > Apps Script na planilha do Google Sheets
 *   2. Cole este código em Code.gs
 *   3. Implantar > Nova implantação > Tipo: App da Web
 *        Executar como: Eu
 *        Quem pode acessar: Qualquer pessoa
 *   4. Copie a URL gerada (.../exec) e cole em VITE_GAS_URL no .env do front-end
 *
 * Toda vez que atualizar manualmente a planilha, os dados já refletem
 * na próxima chamada - não precisa reimplantar o script.
 */

const SHEET_FATURAMENTO = "Faturamento";
const SHEET_LITROS = "Litros";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const faturamento = lerAba(ss, SHEET_FATURAMENTO);
    const litros = lerAba(ss, SHEET_LITROS);
    const combinado = combinar(faturamento, litros);
    return jsonResponse({
      ok: true,
      dados: combinado,
      atualizadoEm: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse({ ok: false, erro: String(err.message || err) });
  }
}

function lerAba(ss, nomeAba) {
  const sheet = ss.getSheetByName(nomeAba);
  if (!sheet) throw new Error('Aba "' + nomeAba + '" não encontrada na planilha.');

  const valores = sheet.getDataRange().getValues();
  if (valores.length < 2) return [];

  const cabecalho = valores[0].map(function (c) {
    return String(c).trim().toLowerCase();
  });
  const linhas = valores.slice(1);

  const idx = {
    cliente: cabecalho.indexOf("cliente"),
    grupo: cabecalho.indexOf("grupo"),
    ano: cabecalho.indexOf("ano"),
    mes: cabecalho.indexOf("mes"),
    valor: cabecalho.indexOf("valor"),
  };

  ["cliente", "grupo", "ano", "mes", "valor"].forEach(function (campo) {
    if (idx[campo] === -1) {
      throw new Error('Coluna "' + campo + '" não encontrada na aba "' + nomeAba + '".');
    }
  });

  return linhas
    .filter(function (linha) {
      return linha[idx.cliente] !== "" && linha[idx.cliente] != null;
    })
    .map(function (linha) {
      return {
        cliente: String(linha[idx.cliente]).trim(),
        grupo: String(linha[idx.grupo] || "").trim(),
        ano: Number(linha[idx.ano]),
        mes: Number(linha[idx.mes]),
        valor: Number(linha[idx.valor]) || 0,
      };
    });
}

// Junta faturamento + litros num único registro por cliente/ano/mes
function combinar(faturamentoRows, litrosRows) {
  function chaveDe(r) {
    return r.cliente + "__" + r.ano + "-" + String(r.mes).padStart(2, "0");
  }

  const mapa = {};

  faturamentoRows.forEach(function (r) {
    const chave = chaveDe(r);
    if (!mapa[chave]) {
      mapa[chave] = { cliente: r.cliente, grupo: r.grupo, ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
    }
    mapa[chave].faturamento = r.valor;
    if (r.grupo) mapa[chave].grupo = r.grupo;
  });

  litrosRows.forEach(function (r) {
    const chave = chaveDe(r);
    if (!mapa[chave]) {
      mapa[chave] = { cliente: r.cliente, grupo: r.grupo, ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
    }
    mapa[chave].litros = r.valor;
    if (r.grupo) mapa[chave].grupo = r.grupo;
  });

  const lista = Object.keys(mapa).map(function (k) {
    return mapa[k];
  });

  lista.sort(function (a, b) {
    if (a.cliente !== b.cliente) return a.cliente.localeCompare(b.cliente);
    if (a.ano !== b.ano) return a.ano - b.ano;
    return a.mes - b.mes;
  });

  return lista;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
