/**
 * HBier - Análise de Clientes
 * Backend (Google Apps Script)
 * Versão: v1.6
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
 * GRUPO DE CLIENTES (opcional, 100% automático):
 * O script varre TODAS as abas da planilha (menos faturamento/litros)
 * procurando uma que tenha uma coluna de nome de cliente (com cabeçalho
 * "Cliente", "Razão Social" ou "Nome") e uma coluna de grupo (cabeçalho
 * "Grupo", "Categoria" ou "Segmento") - não importa o nome da aba nem
 * a ordem das colunas. Se sua planilha de cadastro de clientes já tem
 * essas colunas (com qualquer um desses nomes), o app encontra sozinho.
 * O nome do cliente é comparado sem o código/numeração do início (ex:
 * "1 MILLER..." e "MILLER..." batem), então não precisa ficar igual
 * caractere por caractere ao relatório de faturamento/litros.
 * Se nenhuma aba assim for encontrada, o app funciona normalmente, só
 * sem grupo (a comparação por "Grupo" fica vazia).
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

// Remove prefixos numéricos/código do início do nome do cliente (ex: "1 MILLER..." -> "MILLER...",
// "16.103.231 GIOVANE BRANDT" -> "GIOVANE BRANDT") e normaliza pra comparação (maiúsculo, espaços únicos).
function normalizarCliente(nome) {
  return String(nome || "")
    .trim()
    .replace(/^[\d.,\-\s]+/, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

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

// Procura em TODAS as abas (menos faturamento/litros) por uma que tenha uma coluna de
// nome de cliente ("Cliente", "Razão Social", "Nome"...) e uma de grupo ("Grupo", "Categoria",
// "Segmento"...). Não depende do nome da aba nem do nome exato das colunas.
// Se não encontrar nenhuma, devolve {} (o app funciona normalmente, só sem grupo).
function lerCadastroClientes(ss) {
  const sheets = ss.getSheets();
  const conhecidas = [SHEET_FATURAMENTO.toLowerCase(), SHEET_LITROS.toLowerCase()];

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    if (conhecidas.indexOf(sheet.getName().trim().toLowerCase()) !== -1) continue;

    const valores = sheet.getDataRange().getValues();
    const limiteLinhas = Math.min(valores.length, 15);

    for (let i = 0; i < limiteLinhas; i++) {
      let idxNome = -1, idxGrupo = -1;
      valores[i].forEach(function (celula, c) {
        const texto = String(celula || "").trim().toLowerCase();
        if (idxNome === -1 && /(raz.o social|cliente|nome)/.test(texto)) idxNome = c;
        if (idxGrupo === -1 && /(categoria|grupo|segmento)/.test(texto)) idxGrupo = c;
      });

      if (idxNome !== -1 && idxGrupo !== -1) {
        const mapa = {};
        for (let r = i + 1; r < valores.length; r++) {
          const nome = String(valores[r][idxNome] || "").trim();
          const grupo = String(valores[r][idxGrupo] || "").trim();
          if (nome && grupo) mapa[normalizarCliente(nome)] = grupo;
        }
        return mapa;
      }
    }
  }

  return {};
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
      mapa[chave] = { cliente: r.cliente, grupo: grupoPorCliente[normalizarCliente(r.cliente)] || "", ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
    }
    mapa[chave].faturamento = r.valor;
  });

  litrosRows.forEach(function (r) {
    const chave = chaveDe(r);
    if (!mapa[chave]) {
      mapa[chave] = { cliente: r.cliente, grupo: grupoPorCliente[normalizarCliente(r.cliente)] || "", ano: r.ano, mes: r.mes, faturamento: 0, litros: 0 };
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
