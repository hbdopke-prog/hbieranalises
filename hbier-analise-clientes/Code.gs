/**
 * HBier - Análise de Clientes
 * Backend (Google Apps Script)
 * Versão: v1.5
 *
 * Lê o relatório "Faturamento Mês a Mês por Clientes" exportado do ERP,
 * nas abas "faturamento" e "litros" (mesmo layout nas duas, um valor
 * em R$ e outro em litros).
 *
 * Layout real da planilha (linhas de metadado no topo, depois uma
 * linha de cabeçalho, depois uma linha por cliente):
 *
 *   Linha 1: título do relatório
 *   Linha 3: Empresas
 *   Linha 4: Grupo de Clientes (texto livre, não vinculado por linha)
 *   Linha 5: Vendedores
 *   Linha 6: Data do Faturamento (período do relatório)
 *   Linha 7: Valor a Apresentar (Litros / Valor Cobrado)
 *   Linha 9 (aprox.): cabeçalho -> Código | Cliente - Razão Social/Nome | 01/2023 | 02/2023 | ...
 *   Linha 10+: uma linha por cliente, uma coluna por mês (MM/AAAA)
 *
 * O script NÃO depende do número exato da linha do cabeçalho - ele
 * procura automaticamente a linha onde a coluna A contém "código" e
 * a coluna B contém "cliente".
 *
 * GRUPO DE CLIENTES (opcional):
 * Crie uma aba chamada "clientes" (cadastro) com 2 colunas:
 *   cliente | grupo
 * onde "cliente" tem que ser EXATAMENTE igual ao texto que aparece na
 * coluna "Cliente - Razão Social/Nome" das abas faturamento/litros
 * (copie e cole de lá pra garantir o match certo), e "grupo" é o
 * segmento dele (ex: Mini Mercado, Rede de Mercado, Bar/Restaurante...).
 * Se essa aba não existir, o app funciona normalmente, só sem grupo
 * (a comparação por "Grupo" fica vazia até essa aba ser criada).
 *
 * DEPLOY:
 *   1. Extensões > Apps Script na planilha do Google Sheets
 *   2. Cole este código em Code.gs
 *   3. Implantar > Nova implantação > Tipo: App da Web
 *        Executar como: Eu
 *        Quem pode acessar: Qualquer pessoa
 *   4. Copie a URL gerada (.../exec) e cole em VITE_GAS_URL
 */

const SHEET_FATURAMENTO = "faturamento";
const SHEET_LITROS = "litros";
const SHEET_CLIENTES = "clientes";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const faturamento = lerRelatorio(ss, SHEET_FATURAMENTO);
    const litros = lerRelatorio(ss, SHEET_LITROS);
    const grupoPorCliente = lerCadastroClientes(ss);
    const combinado = combinar(faturamento, litros, grupoPorCliente);
    return jsonResponse({
      ok: true,
      dados: combinado,
      atualizadoEm: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse({ ok: false, erro: String(err.message || err) });
  }
}

// Lê a aba opcional de cadastro cliente -> grupo. Se não existir, devolve {} (sem erro).
function lerCadastroClientes(ss) {
  const sheet = ss.getSheetByName(SHEET_CLIENTES);
  if (!sheet) return {};

  const valores = sheet.getDataRange().getValues();
  if (valores.length < 2) return {};

  const cabecalho = valores[0].map(function (c) {
    return String(c).trim().toLowerCase();
  });
  const idxCliente = cabecalho.indexOf("cliente");
  const idxGrupo = cabecalho.indexOf("grupo");
  if (idxCliente === -1 || idxGrupo === -1) return {};

  const mapa = {};
  for (let i = 1; i < valores.length; i++) {
    const cliente = String(valores[i][idxCliente] || "").trim();
    const grupo = String(valores[i][idxGrupo] || "").trim();
    if (cliente && grupo) mapa[cliente] = grupo;
  }
  return mapa;
}

// Lê o relatório "mês a mês por clientes" (formato largo) de uma aba
function lerRelatorio(ss, nomeAba) {
  const sheet = ss.getSheetByName(nomeAba);
  if (!sheet) throw new Error('Aba "' + nomeAba + '" não encontrada na planilha.');

  const valores = sheet.getDataRange().getValues();

  // acha a linha de cabeçalho procurando "código" na coluna A e "cliente" na coluna B
  let linhaCabecalho = -1;
  for (let i = 0; i < valores.length; i++) {
    const a = String(valores[i][0] || "").trim().toLowerCase();
    const b = String(valores[i][1] || "").trim().toLowerCase();
    if (a.indexOf("código") !== -1 && b.indexOf("cliente") !== -1) {
      linhaCabecalho = i;
      break;
    }
  }
  if (linhaCabecalho === -1) {
    throw new Error('Não encontrei a linha de cabeçalho (colunas "Código" e "Cliente...") na aba "' + nomeAba + '".');
  }

  const cabecalho = valores[linhaCabecalho];

  // colunas de mês: a partir da 3ª coluna (índice 2).
  // aceita tanto data real (célula formatada como MM/AAAA) quanto texto "01/2023" ou "01-2023"
  const colunasMes = [];
  for (let c = 2; c < cabecalho.length; c++) {
    const bruto = cabecalho[c];
    let mes = null, ano = null;

    if (Object.prototype.toString.call(bruto) === "[object Date]" && !isNaN(bruto)) {
      mes = bruto.getMonth() + 1;
      ano = bruto.getFullYear();
    } else {
      const texto = String(bruto || "").trim();
      const m = texto.match(/^(\d{1,2})[\/\-](\d{4})$/) || texto.match(/^(\d{4})[\/\-](\d{1,2})$/);
      if (m) {
        // detecta se veio "MM/AAAA" ou "AAAA/MM" pelo tamanho do primeiro grupo
        if (m[1].length === 4) { ano = parseInt(m[1], 10); mes = parseInt(m[2], 10); }
        else { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10); }
      }
    }

    if (mes && ano && mes >= 1 && mes <= 12) {
      colunasMes.push({ col: c, mes: mes, ano: ano });
    }
  }
  if (colunasMes.length === 0) {
    throw new Error('Nenhuma coluna de mês reconhecida no cabeçalho da aba "' + nomeAba + '". Verifique se as colunas de meses usam datas ou texto no formato MM/AAAA.');
  }

  // converte um valor de célula (número, texto com R$/vírgula, data, vazio) num número
  function paraNumero(bruto) {
    if (typeof bruto === "number") return bruto;
    if (bruto === "" || bruto === null || bruto === undefined) return 0;
    let texto = String(bruto).trim();
    if (texto === "" || texto === "-") return 0;
    texto = texto.replace(/[R$\s]/g, "");
    // remove separador de milhar (ponto) e troca vírgula decimal por ponto
    if (texto.indexOf(",") !== -1) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    }
    const n = parseFloat(texto);
    return isNaN(n) ? 0 : n;
  }

  // linhas de dados: da linha seguinte ao cabeçalho até o fim (ignora linhas sem nome de cliente)
  const linhas = [];
  for (let i = linhaCabecalho + 1; i < valores.length; i++) {
    const cliente = String(valores[i][1] || "").trim();
    if (!cliente) continue;
    colunasMes.forEach(function (cm) {
      const valor = paraNumero(valores[i][cm.col]);
      linhas.push({ cliente: cliente, grupo: "", ano: cm.ano, mes: cm.mes, valor: valor });
    });
  }

  return linhas;
}

// Junta faturamento + litros num único registro por cliente/ano/mes, aplicando o grupo (se houver)
function combinar(faturamentoRows, litrosRows, grupoPorCliente) {
  grupoPorCliente = grupoPorCliente || {};

  function chaveDe(r) {
    return r.cliente + "__" + r.ano + "-" + String(r.mes).padStart(2, "0");
  }

  const mapa = {};

  faturamentoRows.forEach(function (r) {
    const chave = chaveDe(r);
    if (!mapa[chave]) {
      mapa[chave] = { cliente: r.cliente, grupo: grupoPorCliente[r.cliente] || "", ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
    }
    mapa[chave].faturamento = r.valor;
  });

  litrosRows.forEach(function (r) {
    const chave = chaveDe(r);
    if (!mapa[chave]) {
      mapa[chave] = { cliente: r.cliente, grupo: grupoPorCliente[r.cliente] || "", ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
    }
    mapa[chave].litros = r.valor;
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
