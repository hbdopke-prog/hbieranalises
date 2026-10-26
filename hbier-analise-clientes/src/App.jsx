import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList, ReferenceLine, Cell,
  PieChart, Pie,
} from "recharts";
import { Search, LogIn, TrendingUp, Droplets, GitCompareArrows, LogOut, Users, Layers, RefreshCw, AlertTriangle, Calendar, Table as TableIcon, ArrowUp, ArrowDown, Minus, LayoutDashboard, Trophy, Globe, Package, Boxes, Factory } from "lucide-react";

/*
  HBier - Análise de Clientes
  ----------------------------------------
  Fonte de dados: Google Sheets (2 abas: "Faturamento" e "Litros"),
  servidas via Google Apps Script (Code.gs, na raiz deste projeto).

  Configuração: crie um arquivo .env (veja .env.example) com
    VITE_GAS_URL=https://script.google.com/macros/s/SEU_ID/exec

  IMPORTANTE - VERSIONAMENTO:
  Atualize APP_VERSION (+1) a cada ajuste no app e apareça no login.
*/

const APP_VERSION = "v10.49";
const GAS_URL = import.meta.env.VITE_GAS_URL;

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtMoeda(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtLitros(v) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L`;
}
function labelMes(chave) {
  const [ano, mes] = chave.split("-");
  return `${MESES[parseInt(mes,10)-1]}/${ano.slice(2)}`;
}
function media(rows, campo) {
  if (!rows.length) return 0;
  return rows.reduce((s,r) => s + r[campo], 0) / rows.length;
}
function soma(rows, campo) {
  return rows.reduce((s,r) => s + r[campo], 0);
}

// Chave (AAAA-MM) do mês corrente de verdade (data real de hoje, não o último dado da planilha)
function chaveMesAtualReal() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// Separa o último mês da série se ele for o mês em andamento (ainda não fechou), pra não
// distorcer comparações "mês fechado vs mês fechado". Retorna { fechados, emAndamento }.
function separarMesEmAndamento(rows) {
  if (!rows || !rows.length) return { fechados: rows || [], emAndamento: null };
  const ultimo = rows[rows.length - 1];
  if (ultimo.chave === chaveMesAtualReal()) {
    return { fechados: rows.slice(0, -1), emAndamento: ultimo };
  }
  return { fechados: rows, emAndamento: null };
}

// Projeta o total do mês em andamento por regra de três simples (ritmo atual x dias do mês),
// e compara essa estimativa com o mesmo mês do ano passado e com a média dos últimos 3 meses fechados.
function calcularProjecaoMesAndamento(emAndamentoRow, rowsFechados) {
  if (!emAndamentoRow) return null;
  const diasNoMes = new Date(emAndamentoRow.ano, emAndamentoRow.mes, 0).getDate();
  const hoje = new Date();
  const diaAtual = Math.min(Math.max(hoje.getDate(), 1), diasNoMes);
  const fator = diasNoMes / diaAtual;
  const estFat = emAndamentoRow.faturamento * fator;
  const estLit = emAndamentoRow.litros * fator;

  const mesmoMesAnoPassado = rowsFechados.find(r => r.ano === emAndamentoRow.ano - 1 && r.mes === emAndamentoRow.mes);
  const ultimos3 = rowsFechados.slice(-3);
  const mediaFat3 = ultimos3.length ? media(ultimos3, "faturamento") : null;
  const mediaLit3 = ultimos3.length ? media(ultimos3, "litros") : null;

  return {
    estFat, estLit, diaAtual, diasNoMes,
    mesmoMesAnoPassadoTexto: mesmoMesAnoPassado ? labelMes(mesmoMesAnoPassado.chave) : null,
    variacaoAnoPassadoFat: mesmoMesAnoPassado ? calcularVariacao(estFat, mesmoMesAnoPassado.faturamento) : null,
    variacaoAnoPassadoLit: mesmoMesAnoPassado ? calcularVariacao(estLit, mesmoMesAnoPassado.litros) : null,
    variacaoMedia3Fat: mediaFat3 != null ? calcularVariacao(estFat, mediaFat3) : null,
    variacaoMedia3Lit: mediaLit3 != null ? calcularVariacao(estLit, mediaLit3) : null,
  };
}

// Aviso do mês em andamento, com projeção linear e comparação vs mesmo mês do ano
// passado e vs média dos últimos 3 meses fechados.
function AvisoMesAndamento({ emAndamento, rowsFechados }) {
  if (!emAndamento) return null;
  const projecao = calcularProjecaoMesAndamento(emAndamento, rowsFechados);

  return (
    <div style={{ color: "#888", fontSize: 11, marginBottom: 10, background: "#141412", border: "1px dashed #444", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ marginBottom: projecao ? 6 : 0 }}>
        ⏳ {labelMes(emAndamento.chave)} em andamento (dia {projecao?.diaAtual ?? "?"} de {projecao?.diasNoMes ?? "?"}): {fmtMoeda(emAndamento.faturamento)} · {fmtLitros(emAndamento.litros)} até o momento
      </div>
      {projecao && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ color: "#666", fontSize: 10 }}>Projeção pro mês fechar (ritmo atual)</div>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{fmtMoeda(projecao.estFat)} · {fmtLitros(projecao.estLit)}</div>
          </div>
          {projecao.mesmoMesAnoPassadoTexto && (
            <div>
              <div style={{ color: "#666", fontSize: 10 }}>vs {projecao.mesmoMesAnoPassadoTexto} (ano passado)</div>
              <BadgeTendencia variacao={projecao.variacaoAnoPassadoFat} formatador={fmtMoeda} periodoTexto="" />
              <BadgeTendencia variacao={projecao.variacaoAnoPassadoLit} formatador={fmtLitros} periodoTexto="" />
            </div>
          )}
          {projecao.variacaoMedia3Fat && (
            <div>
              <div style={{ color: "#666", fontSize: 10 }}>vs média últimos 3 meses</div>
              <BadgeTendencia variacao={projecao.variacaoMedia3Fat} formatador={fmtMoeda} periodoTexto="" />
              <BadgeTendencia variacao={projecao.variacaoMedia3Lit} formatador={fmtLitros} periodoTexto="" />
            </div>
          )}
        </div>
      )}
      <div style={{ color: "#555", fontSize: 9, marginTop: 6 }}>
        Projeção é só uma estimativa linear (não usada nos cálculos de crescimento abaixo).
      </div>
    </div>
  );
}

// Preço médio por litro (faturamento / litros). Retorna null se não houver litros.
function precoMedioLitro(fat, lit) {
  if (!lit) return null;
  return fat / lit;
}
function fmtPrecoLitro(v) {
  if (v == null) return "-";
  return `${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 })}/L`;
}
function periodoTexto(rows) {
  if (!rows || !rows.length) return "";
  return rows.length === 1 ? labelMes(rows[0].chave) : `${labelMes(rows[0].chave)}–${labelMes(rows[rows.length - 1].chave)}`;
}

// Pega os N meses terminando em "chaveReferencia" (ex: últimos 3 meses até Jun/26) e os
// mesmos N meses-calendário do ano anterior (ex: Abr–Jun/25), pra comparação sazonal "ano a ano".
function janelaAnoAnterior(rows, chaveReferencia, n) {
  const idx = rows.findIndex(r => r.chave === chaveReferencia);
  if (idx === -1) return { atual: [], anoAnterior: [] };
  const inicioIdx = Math.max(0, idx - n + 1);
  const atual = rows.slice(inicioIdx, idx + 1);
  const anoAnterior = atual
    .map(r => rows.find(x => x.ano === r.ano - 1 && x.mes === r.mes))
    .filter(Boolean);
  return { atual, anoAnterior };
}

// Paleta de cores pra distinguir anos sobrepostos no mesmo gráfico (12 meses no eixo X)
const PALETA_ANOS = ["#02601D", "#C69700", "#4a90d9", "#d9534f", "#9b59b6", "#2ecc71", "#e67e22", "#1abc9c"];
// Grupos/canais que pesam muito nos filtros "Todos" (consumo interno, eventos, venda online -
// muitos clientes/pedidos de baixo valor unitário) e por isso ficam DE FORA da seleção padrão.
// Detecta pelo PADRÃO de numeração da empresa (5.xxx = consumo direto, 6.xxx = eventos) e pela
// palavra "online" - não pelo texto exato, porque o mesmo conceito aparece com nomes diferentes
// em taxonomias diferentes (ex: Grupo de Cliente usa "5. Venda Consumo Direto HBier", já o Canal
// de Produto usa "5. Consumidor Final" - o padrão numérico é o que se mantém igual nos dois).
function grupoEhPesado(g) {
  const norm = (g || "").trim().toUpperCase();
  if (!norm) return false;
  if (norm.includes("ONLINE")) return true;
  if (/^5[.\s]/.test(norm)) return true;
  if (/^6[.\s]/.test(norm)) return true;
  return false;
}
function gruposPadrao(grupos) {
  return grupos.filter(g => !grupoEhPesado(g));
}

// Classifica um produto pela embalagem, olhando o começo do nome (ex: "CHOPE HELLES" -> chope,
// "PET 2L HELLES" -> pet, "GARRAFA HELLES 355ML" -> outros)
function classificarEmbalagem(nomeProduto) {
  const n = (nomeProduto || "").trim().toUpperCase();
  if (n.startsWith("CHOPE")) return "chope";
  if (n.startsWith("PET")) return "pet";
  return "outros";
}

// Remove acentos e deixa maiúsculo, pra comparação de nome de produto tolerante a acento/caixa.
function normalizarTextoProduto(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

// Produtos que ficam sempre visíveis (como checkbox) no gráfico comparativo da aba Produtos.
// Os demais só aparecem pelo buscador. Cada entrada casa por palavras-chave (tolerante a
// acento/variação de escrita), pra funcionar mesmo que o nome exato na planilha seja tipo
// "PET 1L HELLES" em vez de "Helles 1L".
const PRODUTOS_FIXOS_GRAFICO = [
  { apelido: "Helles 1L", tokens: [/HELLES/, /\b1\s*L\b/], excluir: [/CHOPE/] },
  { apelido: "Helles 2L", tokens: [/HELLES/, /\b2\s*L\b/], excluir: [/CHOPE/] },
  { apelido: "Helles 500ml", tokens: [/^PET\b/, /HELLES/, /500\s*ML/], excluir: [/CHOPE/] },
  { apelido: "IPA 500ml", tokens: [/^PET\b/, /\bIPA\b/, /500\s*ML/], excluir: [/CHOPE/] },
  { apelido: "Red 500ml", tokens: [/^PET\b/, /\bRED\b/, /500\s*ML/], excluir: [/CHOPE/, /REDEFORT/] },
  { apelido: "Sem Álcool 500ml", tokens: [/^PET\b/, /SEM/, /ALCOOL/, /500\s*ML/], excluir: [/CHOPE/] },
  { apelido: "Redefort 1L", tokens: [/REDEFORT/, /\b1\s*L\b/], excluir: [/CHOPE/] },
  { apelido: "Oktoberfest 1L", tokens: [/OKTOBERFEST/, /\b1\s*L\b/], excluir: [/CHOPE/] },
  { apelido: "Chope Helles", tokens: [/CHOPE/, /HELLES/], excluir: [] },
  { apelido: "Chope Red", tokens: [/CHOPE/, /\bRED\b/], excluir: [/REDEFORT/] },
];

function encontrarProdutoFixo(def, nomes) {
  return nomes.find(n => {
    const norm = normalizarTextoProduto(n);
    if (def.excluir && def.excluir.some(rx => rx.test(norm))) return false;
    return def.tokens.every(rx => rx.test(norm));
  });
}

// Paletas de cor do gráfico comparativo de produtos: envasados em tons de verde clarinho,
// chopes em tons de amarelo clarinho. Cada combinação produto+ano pega uma tonalidade
// diferente dentro da família da sua categoria, ciclando se passar do tamanho da paleta.
// Tons bem variados (claro/escuro intercalado) pra linhas vizinhas no gráfico não ficarem
// parecidas - ainda dentro da família verde (envasado) ou amarelo/âmbar (chope).
const PALETA_ENVASADO_CLARO = ["#2ECC71", "#145A32", "#A5D6A7", "#0B8043", "#C6F17D", "#1B5E20", "#66BB6A", "#073B2E"];
const PALETA_CHOPE_CLARO = ["#FFD600", "#8D6708", "#FFF176", "#B8860B", "#F9A825", "#5C4404", "#FBE27B", "#7A5B00"];

// Quantos litros cabem num pallet, de acordo com o tamanho da embalagem no nome do produto.
// Retorna null se não reconhecer o tamanho (ex: garrafa 355ml, lata 473ml, chope) - nesses
// casos não existe conversão de pallet definida, então mantém o valor em litros mesmo.
function litrosPorPallet(nomeProduto) {
  const n = (nomeProduto || "").toUpperCase();
  if (/500\s*ML/.test(n)) return 1050;
  if (/\b2\s*L\b/.test(n)) return 1152;
  if (/\b1\s*L\b/.test(n)) return 1080;
  return null;
}

// Quantos litros tem UMA unidade (garrafa/embalagem), de acordo com o tamanho no nome do
// produto. Usado pra converter estoque reportado em unidades pra litros automaticamente,
// quando a planilha de estoque não traz litros direto (comum pra PET, que é contado em
// garrafas, diferente do Chope que já vem em litros).
function litrosPorUnidade(nomeProduto) {
  const n = (nomeProduto || "").toUpperCase();
  if (/500\s*ML/.test(n)) return 0.5;
  if (/\b2\s*L\b/.test(n)) return 2;
  if (/\b1\s*L\b/.test(n)) return 1;
  return null;
}

function corDoAno(idx) {
  return PALETA_ANOS[idx % PALETA_ANOS.length];
}

// Legenda padrão do app: texto sempre branco (o padrão do recharts colore o texto igual à
// série, o que fica ilegível no fundo escuro) - usada em gráficos de linha/barra.
function LegendaBranca({ payload }) {
  if (!payload) return null;
  return (
    <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: "4px 18px", justifyContent: "center" }}>
      {payload.map((entry, idx) => (
        <li key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, background: entry.color, display: "inline-block", borderRadius: 2, flexShrink: 0 }} />
          <span style={{ color: "#fff" }}>{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

// Legenda lateral pros gráficos de pizza: texto branco + % de cada fatia sobre o total
function LegendaPizza({ payload, total, campo, formatador }) {
  if (!payload) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {payload.map((entry, idx) => {
        const valor = entry.payload ? entry.payload[campo] : 0;
        const pct = total ? (valor / total * 100) : 0;
        return (
          <li key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: entry.color, display: "inline-block", borderRadius: 2, flexShrink: 0 }} />
            <span style={{ color: "#fff" }}>{entry.value} — {formatador ? formatador(valor) : valor} ({pct.toFixed(1)}%)</span>
          </li>
        );
      })}
    </ul>
  );
}

// Transforma uma série cronológica em "12 meses no eixo X, uma linha por ano" -
// ótimo pra comparar sazonalidade (mesmo mês em anos diferentes, lado a lado).
function construirSeriesPorAno(rows, campo) {
  const anos = [...new Set(rows.map(r => r.ano))].sort((a, b) => a - b);
  const dados = MESES.map((nomeMes, idx) => {
    const linha = { mes: nomeMes };
    anos.forEach(ano => {
      const row = rows.find(r => r.ano === ano && r.mes === idx + 1);
      linha[ano] = row ? row[campo] : null;
    });
    return linha;
  });
  return { anos, dados };
}

// Monta o rótulo da legenda com o % de crescimento vs ano anterior (ex: "2026 (+18.1%)")
function nomeComCrescimento(ano, variacaoPorAno) {
  const v = variacaoPorAno[ano];
  if (!v) return String(ano);
  const sinal = v.pct >= 0 ? "+" : "";
  return `${ano} (${sinal}${v.pct.toFixed(1)}%)`;
}

// Tooltip customizado pro gráfico "12 meses x 1 linha por ano": mostra o valor de cada
// ano naquele mês e o % vs o MESMO MÊS do ano anterior (não a média do ano inteiro).
function TooltipPorAno({ active, label, payload, formatador }) {
  if (!active || !payload || !payload.length) return null;
  const porAno = {};
  payload.forEach(p => { porAno[Number(p.dataKey)] = p.value; });
  const anosOrdenados = Object.keys(porAno).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</div>
      {anosOrdenados.map(ano => {
        const valor = porAno[ano];
        const valorAnoAnterior = porAno[ano - 1];
        const cor = payload.find(p => Number(p.dataKey) === ano)?.color || "#fff";
        let sufixo = "";
        if (valor != null && valorAnoAnterior != null) {
          const variacao = calcularVariacao(valor, valorAnoAnterior);
          const sinal = variacao.pct >= 0 ? "+" : "";
          sufixo = ` (${sinal}${variacao.pct.toFixed(1)}% vs ${ano - 1})`;
        }
        return (
          <div key={ano} style={{ color: cor, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            {ano}: {valor == null ? "-" : formatador(valor)}{sufixo}
          </div>
        );
      })}
    </div>
  );
}

// -------------------- Contexto de dados --------------------
const DataContext = createContext(null);
function useData() {
  return useContext(DataContext);
}

// Transforma a lista plana vinda do GAS em estruturas prontas pro app.
// Cada cliente é identificado pelo CÓDIGO (não pelo nome) - isso evita que
// clientes com o mesmo nome/razão social (ex: várias lojas da mesma rede)
// sejam misturados num só. O nome exibido/buscado é o Nome Fantasia.
function processarDados(linhas, produtosPorTipo, linhasEstoque, tanques, receitas, planoSalvoTexto, cenariosSalvosTexto) {
  const porCliente = {};       // codigo -> rows[]
  const grupoDoCliente = {};   // codigo -> grupo
  const labelDoCliente = {};   // codigo -> nome fantasia (exibido/buscado)
  const razaoSocialDoCliente = {}; // codigo -> razão social (info extra)
  const dataCriacaoDoCliente = {}; // codigo -> "AAAA-MM-DD" (data de cadastro do cliente)

  linhas.forEach(r => {
    const codigo = String(r.codigo);
    const chave = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    porCliente[codigo] = porCliente[codigo] || [];
    porCliente[codigo].push({
      ano: r.ano, mes: r.mes, chave,
      faturamento: Number(r.faturamento) || 0,
      litros: Number(r.litros) || 0,
    });
    if (r.grupo) grupoDoCliente[codigo] = r.grupo;
    labelDoCliente[codigo] = r.nomeFantasia || r.razaoSocial || codigo;
    razaoSocialDoCliente[codigo] = r.razaoSocial || "";
    if (r.dataCriacao) dataCriacaoDoCliente[codigo] = r.dataCriacao;
  });

  Object.keys(porCliente).forEach(codigo => {
    porCliente[codigo].sort((a, b) => a.chave.localeCompare(b.chave));
  });

  const nomes = Object.keys(porCliente).sort((a, b) =>
    (labelDoCliente[a] || "").localeCompare(labelDoCliente[b] || "")
  );
  const grupos = [...new Set(Object.values(grupoDoCliente))].sort();
  const clientesPorGrupo = Object.fromEntries(
    grupos.map(g => [g, nomes.filter(n => grupoDoCliente[n] === g)])
  );

  // união de todas as chaves de período existentes (ordenada)
  const periodosSet = new Set();
  Object.values(porCliente).forEach(rows => rows.forEach(r => periodosSet.add(r.chave)));
  const periodos = [...periodosSet].sort();

  // lista de clientes pra BUSCA/seleção individual - exclui os grupos pesados (Venda Online,
  // Consumo Direto): eles continuam entrando nos totais/grupos normalmente, só não aparecem
  // pra seleção individual, já que não fazem sentido de olhar um por um.
  const nomesVisiveis = nomes.filter(codigo => !grupoEhPesado(grupoDoCliente[codigo]));

  // produtos: mesmo formato {dados, nomes, periodos} usado pra clientes, só que a "chave"
  // é o nome do produto (Descrição) em vez do código do cliente
  const porProduto = {};
  (produtosPorTipo || []).forEach(r => {
    const chave = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    porProduto[r.produto] = porProduto[r.produto] || [];
    porProduto[r.produto].push({
      ano: r.ano, mes: r.mes, chave,
      faturamento: Number(r.faturamento) || 0,
      litros: Number(r.litros) || 0,
    });
  });
  Object.keys(porProduto).forEach(produto => {
    porProduto[produto].sort((a, b) => a.chave.localeCompare(b.chave));
  });
  const produtosNomes = Object.keys(porProduto).sort();
  const produtosPeriodosSet = new Set();
  Object.values(porProduto).forEach(rows => rows.forEach(r => produtosPeriodosSet.add(r.chave)));
  const produtosPeriodos = [...produtosPeriodosSet].sort();

  // estoque: mapa simples produto -> {unidades, litros} (não é série mensal, é a foto atual)
  const estoquePorProduto = {};
  (linhasEstoque || []).forEach(r => {
    estoquePorProduto[r.produto] = { unidades: r.unidades, litros: r.litros };
  });

  return {
    dados: porCliente, nomes, nomesVisiveis, grupos, clientesPorGrupo, periodos, grupoDoCliente,
    labelDoCliente, razaoSocialDoCliente, dataCriacaoDoCliente,
    produtosDados: porProduto, produtosNomes, produtosPeriodos,
    estoquePorProduto,
    tanques: tanques || [], receitas: receitas || [], planoSalvoTexto: planoSalvoTexto || "", cenariosSalvosTexto: cenariosSalvosTexto || "",
  };
}

// -------------------- Componentes visuais --------------------
// Calcula diferença/variação percentual entre dois valores (atual vs anterior)
function calcularVariacao(atual, anterior) {
  if (anterior == null) return null;
  const diff = atual - anterior;
  const pct = anterior !== 0 ? (diff / Math.abs(anterior)) * 100 : (atual === 0 ? 0 : 100);
  return { diff, pct };
}

// Escala de cores usada em todo o app pra crescimento/queda:
// > +10% verde · 0% a +10% amarelo · 0% a -10% laranja · < -10% vermelho
function classificarTendencia(pct) {
  if (pct > 10) return { cor: "#4caf6b", corFundo: "rgba(76,175,107,0.28)", Icon: ArrowUp, texto: "Crescimento" };
  if (pct >= 0) return { cor: "#e8c400", corFundo: "rgba(232,196,0,0.22)", Icon: ArrowUp, texto: "Crescimento leve" };
  if (pct >= -10) return { cor: "#f0883e", corFundo: "rgba(240,136,62,0.22)", Icon: ArrowDown, texto: "Queda leve" };
  return { cor: "#e0645a", corFundo: "rgba(224,101,90,0.28)", Icon: ArrowDown, texto: "Queda" };
}

// Badge colorido de crescimento/queda (verde/amarelo/laranja/vermelho), com texto opcional do período avaliado
function BadgeTendencia({ variacao, formatador, periodoTexto }) {
  if (!variacao) return null;
  const { diff, pct } = variacao;
  const { cor, Icon, texto } = classificarTendencia(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: cor, fontSize: 12, fontWeight: 700 }}>
        <Icon size={12} /> {texto} · {formatador ? formatador(Math.abs(diff)) : Math.abs(diff)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
      </span>
      {periodoTexto && <span style={{ color: "#666", fontSize: 10 }}>({periodoTexto})</span>}
    </div>
  );
}

function StatCard({ label, value, icon, badge }) {
  return (
    <div style={{
      background: "#1D1D1B", borderRadius: 10, padding: "14px 16px",
      flex: "1 1 160px", minWidth: 160, border: "1px solid #33332f",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C69700", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.4 }}>
        {icon}{label}
      </div>
      <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, fontFamily: "system-ui, -apple-system, sans-serif", letterSpacing: 0.2 }}>
        {value}
      </div>
      {badge}
    </div>
  );
}

// Card completo de janela (ex: "Últimos 3 meses"): mostra total e média do período atual,
// o badge de crescimento/queda, e — pra deixar claro contra o que está comparando — o total
// e a média do período anterior também.
// detalhado (opcional): mostra também a variação da MÉDIA/mês e uma tabelinha recolhível com o
// comparativo mês a mês (cada mês da janela vs o mesmo mês do ano anterior).
// chaveParcial (opcional): chave do mês ainda em andamento - se a janela incluir esse mês,
// avisa que total e média estão parciais.
function CardJanelaDetalhada({ titulo, icon, rowsAtual, rowsAnterior, campo, formatador, detalhado, chaveParcial }) {
  const totalAtual = soma(rowsAtual, campo);
  const mediaAtual = media(rowsAtual, campo);
  const totalAnterior = rowsAnterior.length ? soma(rowsAnterior, campo) : null;
  const mediaAnterior = rowsAnterior.length ? media(rowsAnterior, campo) : null;
  const variacao = rowsAnterior.length ? calcularVariacao(totalAtual, totalAnterior) : null;
  const variacaoMedia = rowsAnterior.length ? calcularVariacao(mediaAtual, mediaAnterior) : null;
  const temParcial = !!chaveParcial && rowsAtual.some(r => r.chave === chaveParcial);
  const diaParcial = temParcial ? new Date().getDate() : null;
  const diasParcial = temParcial ? diasNoMes(chaveParcial) : null;

  return (
    <div style={{
      background: "#1D1D1B", borderRadius: 10, padding: "14px 16px",
      flex: "1 1 280px", minWidth: 280, border: "1px solid #33332f",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C69700", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {icon}{titulo}
        {rowsAtual.length > 0 && <span style={{ textTransform: "none", color: "#555", fontWeight: 400 }}>({periodoTexto(rowsAtual)})</span>}
      </div>

      <div style={{ display: "flex", gap: 24, marginBottom: 8 }}>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Total</div>
          <div style={{ color: "#fff", fontSize: 19, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{formatador(totalAtual)}</div>
        </div>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Média/mês</div>
          <div style={{ color: "#ddd", fontSize: 19, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{formatador(mediaAtual)}</div>
        </div>
      </div>

      <BadgeTendencia variacao={variacao} formatador={formatador} periodoTexto={detalhado ? "total" : ""} />
      {detalhado && <BadgeTendencia variacao={variacaoMedia} formatador={formatador} periodoTexto="média/mês" />}
      {temParcial && (
        <div style={{ color: "#888", fontSize: 10, marginTop: 6 }}>
          ⏳ Inclui {labelMes(chaveParcial)} ainda em andamento (dia {diaParcial} de {diasParcial}) — total e média parciais.
        </div>
      )}

      {rowsAnterior.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a28" }}>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 4 }}>Período anterior comparado ({periodoTexto(rowsAnterior)})</div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ color: "#555", fontSize: 9 }}>Total</div>
              <div style={{ color: "#aaa", fontSize: 14, fontWeight: 700 }}>{formatador(totalAnterior)}</div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 9 }}>Média/mês</div>
              <div style={{ color: "#aaa", fontSize: 14, fontWeight: 700 }}>{formatador(mediaAnterior)}</div>
            </div>
          </div>
        </div>
      )}

      {detalhado && rowsAnterior.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", color: "#888", fontSize: 11 }}>Ver mês a mês</summary>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 6, fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", color: "#666", fontWeight: 600, padding: "3px 4px" }}>Mês</th>
                <th style={{ textAlign: "right", color: "#666", fontWeight: 600, padding: "3px 4px" }}>Atual</th>
                <th style={{ textAlign: "right", color: "#666", fontWeight: 600, padding: "3px 4px" }}>Ano anterior</th>
                <th style={{ textAlign: "right", color: "#666", fontWeight: 600, padding: "3px 4px" }}>Var.</th>
              </tr>
            </thead>
            <tbody>
              {rowsAtual.map(r => {
                const ant = rowsAnterior.find(x => x.mes === r.mes);
                const v = ant ? calcularVariacao(r[campo], ant[campo]) : null;
                const parcial = r.chave === chaveParcial;
                return (
                  <tr key={r.chave}>
                    <td style={{ color: "#ccc", padding: "3px 4px" }}>{labelMes(r.chave)}{parcial ? " ⏳" : ""}</td>
                    <td style={{ textAlign: "right", color: "#fff", padding: "3px 4px" }}>{formatador(r[campo])}</td>
                    <td style={{ textAlign: "right", color: "#aaa", padding: "3px 4px" }}>{ant ? formatador(ant[campo]) : "-"}</td>
                    <td style={{ textAlign: "right", padding: "3px 4px", color: v ? classificarTendencia(v.pct).cor : "#666" }}>
                      {v ? `${v.pct >= 0 ? "+" : ""}${v.pct.toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

// Card de ano-calendário mostrando Faturamento e Litros juntos (total + média/mês),
// com crescimento/queda vs o ano anterior (baseado na média/mês, justo mesmo com ano parcial)
// Quebra as rows fechadas de um ano em 4 trimestres (Jan-Mar, Abr-Jun, Jul-Set, Out-Dez).
// Só retorna trimestres que já têm pelo menos 1 mês fechado (trimestre totalmente no futuro
// não aparece). Trimestre com menos de 3 meses fechados é sinalizado como "em andamento" e a
// média/mês divide só pelos meses que realmente têm dado (não sempre por 3).
function calcularTrimestres(rowsDoAno, rowsAnoAnterior, totalFatAno, totalLitAno) {
  const definicoes = [
    { nome: "T1", label: "Jan-Mar", meses: [1, 2, 3] },
    { nome: "T2", label: "Abr-Jun", meses: [4, 5, 6] },
    { nome: "T3", label: "Jul-Set", meses: [7, 8, 9] },
    { nome: "T4", label: "Out-Dez", meses: [10, 11, 12] },
  ];
  return definicoes
    .map(def => {
      const rows = (rowsDoAno || []).filter(r => def.meses.includes(r.mes));
      if (!rows.length) return null;
      const totalFat = soma(rows, "faturamento");
      const totalLit = soma(rows, "litros");

      // compara com o MESMO CONJUNTO DE MESES do ano anterior (ex: se o trimestre atual só
      // tem Julho fechado, compara só com Julho do ano passado, não o trimestre inteiro) -
      // senão a % ficaria injusta/distorcida num trimestre ainda em andamento.
      const mesesPresentes = rows.map(r => r.mes);
      const rowsAnteriorMesmosMeses = (rowsAnoAnterior || []).filter(r => mesesPresentes.includes(r.mes));
      const totalFatAnterior = rowsAnteriorMesmosMeses.length ? soma(rowsAnteriorMesmosMeses, "faturamento") : null;
      const totalLitAnterior = rowsAnteriorMesmosMeses.length ? soma(rowsAnteriorMesmosMeses, "litros") : null;

      return {
        nome: def.nome, label: def.label, mesesFechados: rows.length, completo: rows.length === 3,
        totalFat, totalLit,
        mediaFat: totalFat / rows.length, mediaLit: totalLit / rows.length,
        pctFat: totalFatAno ? (totalFat / totalFatAno) * 100 : 0,
        pctLit: totalLitAno ? (totalLit / totalLitAno) * 100 : 0,
        variacaoFat: totalFatAnterior != null ? calcularVariacao(totalFat, totalFatAnterior) : null,
        variacaoLit: totalLitAnterior != null ? calcularVariacao(totalLit, totalLitAnterior) : null,
      };
    })
    .filter(Boolean);
}

function CardAnualCompleto({ dados, projecao, mostrarTrimestres }) {
  const { ano, meses, totalFat, totalLit, mediaFat, mediaLit, variacaoFat, variacaoLit, rowsDoAno, rowsAnoAnterior, rowsAnoAnteriorMesmoPeriodo, rowsAtualComparavel } = dados;
  // o ano anterior é comparado só nos meses em comum; se não for o ano inteiro, mostra o período equivalente
  const nMesesComparados = rowsAnoAnteriorMesmoPeriodo ? rowsAnoAnteriorMesmoPeriodo.length : 0;
  const comparacaoParcial = nMesesComparados > 0 && nMesesComparados < 12;
  // se o ano anterior é parcial, a variação usa só os meses em comum - aí o "atual" da base também é um recorte
  const atualDifere = comparacaoParcial && rowsAtualComparavel && rowsAtualComparavel.length !== rowsDoAno.length;
  const rotuloComparacao = comparacaoParcial ? `média/mês vs mesmo período de ${ano - 1}` : `média/mês vs ${ano - 1}`;
  const trimestres = mostrarTrimestres ? calcularTrimestres(rowsDoAno, rowsAnoAnterior, totalFat, totalLit) : [];
  return (
    <div style={{ background: "#1D1D1B", borderRadius: 10, padding: "14px 16px", border: "1px solid #33332f" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C69700", fontSize: 12, marginBottom: 10, fontWeight: 700 }}>
        <Calendar size={14} /> Ano {ano}{meses < 12 ? ` (${meses} meses fechados)` : ""}
      </div>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Faturamento total</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{fmtMoeda(totalFat)}</div>
          <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Média/mês: {fmtMoeda(mediaFat)}</div>
          <BadgeTendencia variacao={variacaoFat} formatador={fmtMoeda} periodoTexto={variacaoFat ? rotuloComparacao : ""} />
        </div>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Litros total</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{fmtLitros(totalLit)}</div>
          <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Média/mês: {fmtLitros(mediaLit)}</div>
          <BadgeTendencia variacao={variacaoLit} formatador={fmtLitros} periodoTexto={variacaoLit ? rotuloComparacao : ""} />
        </div>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Preço médio/L</div>
          <div style={{ color: "#C69700", fontSize: 18, fontWeight: 800 }}>{fmtPrecoLitro(precoMedioLitro(totalFat, totalLit))}</div>
        </div>
      </div>

      {comparacaoParcial && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #2a2a28" }}>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 6 }}>
            {ano - 1} no mesmo período ({periodoTexto(rowsAnoAnteriorMesmoPeriodo)}) — base da comparação acima
          </div>
          {atualDifere && (
            <div style={{ color: "#777", fontSize: 10, marginBottom: 8 }}>
              {ano} nesses mesmos meses ({periodoTexto(rowsAtualComparavel)}): média/mês {fmtMoeda(media(rowsAtualComparavel, "faturamento"))} · {fmtLitros(media(rowsAtualComparavel, "litros"))}
              (a variação acima usa este recorte, não o ano inteiro)
            </div>
          )}
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#555", fontSize: 9 }}>Faturamento total</div>
              <div style={{ color: "#aaa", fontSize: 14, fontWeight: 700 }}>{fmtMoeda(soma(rowsAnoAnteriorMesmoPeriodo, "faturamento"))}</div>
              <div style={{ color: "#777", fontSize: 10 }}>Média/mês: {fmtMoeda(media(rowsAnoAnteriorMesmoPeriodo, "faturamento"))}</div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 9 }}>Litros total</div>
              <div style={{ color: "#aaa", fontSize: 14, fontWeight: 700 }}>{fmtLitros(soma(rowsAnoAnteriorMesmoPeriodo, "litros"))}</div>
              <div style={{ color: "#777", fontSize: 10 }}>Média/mês: {fmtLitros(media(rowsAnoAnteriorMesmoPeriodo, "litros"))}</div>
            </div>
            <div>
              <div style={{ color: "#555", fontSize: 9 }}>Preço médio/L</div>
              <div style={{ color: "#aaa", fontSize: 14, fontWeight: 700 }}>
                {fmtPrecoLitro(precoMedioLitro(soma(rowsAnoAnteriorMesmoPeriodo, "faturamento"), soma(rowsAnoAnteriorMesmoPeriodo, "litros")))}
              </div>
            </div>
          </div>
        </div>
      )}

      {trimestres.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #2a2a28" }}>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Por trimestre</div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 8 }}>
            O % entre parênteses ao lado do total compara com o mesmo trimestre do ano anterior (mesmos meses, mesmo se o trimestre atual ainda estiver parcial).
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {trimestres.map(t => (
              <div key={t.nome} style={{ background: "#141412", border: "1px solid #333", borderRadius: 8, padding: 10, flex: "1 1 160px", minWidth: 160 }}>
                <div style={{ color: "#C69700", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                  {t.nome} · {t.label}{!t.completo ? ` (${t.mesesFechados} mês${t.mesesFechados > 1 ? "es" : ""} fechado${t.mesesFechados > 1 ? "s" : ""})` : ""}
                </div>
                <div style={{ color: "#666", fontSize: 9 }}>Litros total</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  {fmtLitros(t.totalLit)}<PctInline variacao={t.variacaoLit} />
                </div>
                <div style={{ color: "#888", fontSize: 10 }}>Média/mês: {fmtLitros(t.mediaLit)}</div>
                <div style={{ color: "#4a90d9", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>{t.pctLit.toFixed(1)}% do ano</div>
                <div style={{ color: "#666", fontSize: 9 }}>Faturamento total</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  {fmtMoeda(t.totalFat)}<PctInline variacao={t.variacaoFat} />
                </div>
                <div style={{ color: "#888", fontSize: 10 }}>Média/mês: {fmtMoeda(t.mediaFat)}</div>
                <div style={{ color: "#4a90d9", fontSize: 10, fontWeight: 700 }}>{t.pctFat.toFixed(1)}% do ano</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {projecao && projecao.meses > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #444" }}>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>
            📈 Projeção dos {projecao.meses} meses restantes ({projecao.pct}% do que {ano - 1} fez nesses mesmos meses):
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#666", fontSize: 10 }}>+ Faturamento projetado</div>
              <div style={{ color: "#C69700", fontSize: 15, fontWeight: 700 }}>+ {fmtMoeda(projecao.fat)}</div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 10 }}>+ Litros projetados</div>
              <div style={{ color: "#C69700", fontSize: 15, fontWeight: 700 }}>+ {fmtLitros(projecao.lit)}</div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 10 }}>Total com projeção</div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{fmtMoeda(totalFat + projecao.fat)} · {fmtLitros(totalLit + projecao.lit)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 16,
        fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8,
        borderBottom: "2px solid #02601D", paddingBottom: 8, marginBottom: 14,
      }}>
        {icon}{title}
      </h3>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8,
  border: "1px solid #444", background: "#141412", color: "#fff", fontSize: 14,
  outline: "none", boxSizing: "border-box",
};
const selectStyle = {
  flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #444",
  background: "#141412", color: "#fff", fontSize: 13,
};

function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  function tentarEntrar() {
    if (!usuario.trim() || !senha.trim()) {
      setErro("Preencha usuário e senha.");
      return;
    }
    if (!GAS_URL) {
      setErro("VITE_GAS_URL não configurada. Defina a URL do Apps Script no arquivo .env.");
      return;
    }
    setErro("");
    setCarregando(true);
    // Content-Type omitido de propósito: evita o preflight de CORS que o Apps Script não trata bem
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "login", usuario, senha }) })
      .then(r => r.json())
      .then(json => {
        setCarregando(false);
        if (!json.ok) {
          setErro(json.erro || "Usuário ou senha inválidos.");
          return;
        }
        onLogin(json.nome || usuario, !!json.admin, usuario);
      })
      .catch(err => {
        setCarregando(false);
        setErro(`Não foi possível validar o login: ${err.message}`);
      });
  }
  function handleKeyDown(e) {
    if (e.key === "Enter") tentarEntrar();
  }

  return (
    <div style={{ minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: "#1D1D1B", borderRadius: 12, padding: 24 }}>
      <div style={{ width: 300, textAlign: "center" }}>
        <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: 1.5, marginBottom: 4 }}>
          HBIER <span style={{ color: "#C69700" }}>BI</span>
        </div>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 18 }}>{APP_VERSION}</div>
        <input placeholder="Usuário" value={usuario} onKeyDown={handleKeyDown} onChange={e => setUsuario(e.target.value)} style={inputStyle} disabled={carregando} />
        <input placeholder="Senha" type="password" value={senha} onKeyDown={handleKeyDown} onChange={e => setSenha(e.target.value)} style={inputStyle} disabled={carregando} />
        {erro && <div style={{ color: "#e0645a", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <button type="button" onClick={tentarEntrar} disabled={carregando} style={{
          width: "100%", background: "#02601D", color: "#fff", border: "none",
          borderRadius: 8, padding: "10px 0", fontSize: 15, fontWeight: 600,
          cursor: carregando ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: carregando ? 0.7 : 1,
        }}>
          <LogIn size={16} /> {carregando ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}

function TabelaClienteMeses({ cliente, rows }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8, marginBottom: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
        <thead>
          <tr>
            <th style={thStyle}>{cliente}</th>
            {rows.map(r => <th key={r.chave} style={thStyle}>{labelMes(r.chave)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...tdStyle, color: "#02601D", fontWeight: 700 }}>Faturamento</td>
            {rows.map(r => <td key={r.chave} style={tdStyle}>{fmtMoeda(r.faturamento)}</td>)}
          </tr>
          <tr>
            <td style={{ ...tdStyle, color: "#C69700", fontWeight: 700 }}>Litros</td>
            {rows.map(r => <td key={r.chave} style={tdStyle}>{fmtLitros(r.litros)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  background: "#1D1D1B", color: "#fff", fontSize: 12, padding: "8px 10px",
  borderBottom: "1px solid #333", whiteSpace: "nowrap", textAlign: "left", position: "sticky", top: 0,
};
const tdStyle = {
  color: "#ddd", fontSize: 12, padding: "6px 10px", borderBottom: "1px solid #262624", whiteSpace: "nowrap",
};

const chipBtnStyle = {
  background: "transparent", border: "1px solid #444", color: "#C69700",
  borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600,
};

// Exporta um ou mais "quadros" pra um arquivo .xlsx num clique.
// abas = [{ nome: "Resumo", linhas: [ [cabecalho1, cabecalho2], [v1, v2], ... ] }]
// Os valores saem como NÚMEROS de verdade (não texto formatado tipo "R$ 14.7k"), pra dar
// pra somar/filtrar no Excel. Nome do arquivo: HBier_<Aba>_<data>.xlsx
async function exportarExcel(nomeAba, abas) {
  // a biblioteca do Excel só é carregada na hora do clique (não pesa na abertura do app)
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const usados = new Set();
  abas.forEach((aba, i) => {
    if (!aba || !aba.linhas || !aba.linhas.length) return;
    const ws = XLSX.utils.aoa_to_sheet(aba.linhas);
    // largura das colunas: ajusta pelo maior texto de cada coluna (com limite)
    const nCols = Math.max(...aba.linhas.map(l => l.length));
    ws["!cols"] = Array.from({ length: nCols }, (_, c) => ({
      wch: Math.min(45, Math.max(10, ...aba.linhas.map(l => String(l[c] == null ? "" : l[c]).length + 2))),
    }));
    // nome de planilha: máx 31 caracteres, sem caracteres proibidos, sem repetir
    let nome = String(aba.nome || `Planilha${i + 1}`).replace(/[\\/?*\[\]:]/g, "-").slice(0, 31);
    let base = nome, n = 2;
    while (usados.has(nome)) { nome = `${base.slice(0, 28)} ${n++}`; }
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  });
  if (!wb.SheetNames.length) { alert("Não há dados na tela pra exportar."); return; }
  const hoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `HBier_${nomeAba.replace(/\s+/g, "")}_${hoje}.xlsx`);
}

// número "limpo" pro Excel (2 casas, vazio se não houver) e % de uma variação
const nx = v => (v == null || v === "" || isNaN(v) ? "" : Number(Number(v).toFixed(2)));
const pctX = variacao => (variacao && variacao.pct != null && !isNaN(variacao.pct) ? Number(variacao.pct.toFixed(2)) : "");

// Monta as 2 planilhas de uma tabela "mês a mês" (linhas = produtos/grupos, colunas = meses):
// 1) valores (com Total, Média/mês, opcionalmente Média 7d, e uma linha TOTAL no fim)
// 2) % de cada célula vs o mesmo mês do ano anterior (o que a tela mostra entre parênteses)
function abasDeHeatmap(nomeValores, nomePct, rotuloColuna, linhas, dadosCompletos, opcoes) {
  if (!linhas || !linhas.length) return [];
  const opc = opcoes || {};
  const periodos = linhas[0].valores.map(v => v.periodo);
  const media7d = vals => {
    let soma = 0, dias = 0;
    vals.forEach(v => { soma += v.valor || 0; dias += diasNoMes(v.periodo); });
    return dias ? nx(soma / dias * 7) : "";
  };
  const cab = [rotuloColuna, ...periodos.map(labelMes), "Total", "Média/mês"];
  if (opc.media7d) cab.push("Média 7d (últ. mês)", "Média 7d (últ. 3 meses)", "Média 7d (período)");

  const corpo = linhas.map(l => {
    const total = l.valores.reduce((s, v) => s + (v.valor || 0), 0);
    const linha = [l.categoria, ...l.valores.map(v => nx(v.valor)), nx(total), nx(l.valores.length ? total / l.valores.length : 0)];
    if (opc.media7d) linha.push(media7d(l.valores.slice(-1)), media7d(l.valores.slice(-3)), media7d(l.valores));
    return linha;
  });

  const totVals = periodos.map((p, i) => ({ periodo: p, valor: linhas.reduce((s, l) => s + ((l.valores[i] && l.valores[i].valor) || 0), 0) }));
  const totalGeral = totVals.reduce((s, v) => s + v.valor, 0);
  const linhaTotal = ["TOTAL", ...totVals.map(v => nx(v.valor)), nx(totalGeral), nx(totVals.length ? totalGeral / totVals.length : 0)];
  if (opc.media7d) linhaTotal.push(media7d(totVals.slice(-1)), media7d(totVals.slice(-3)), media7d(totVals));

  const buscar = (l, chave) => {
    if (dadosCompletos && dadosCompletos[l.categoria]) return dadosCompletos[l.categoria][chave];
    const item = l.valores.find(v => v.periodo === chave);
    return item ? item.valor : undefined;
  };
  const corpoPct = linhas.map(l => [l.categoria, ...l.valores.map(v => {
    const anterior = buscar(l, chaveAnoAnterior(v.periodo));
    return anterior != null ? pctX(calcularVariacao(v.valor || 0, anterior)) : "";
  })]);

  return [
    { nome: nomeValores, linhas: [cab, ...corpo, linhaTotal] },
    { nome: nomePct, linhas: [[rotuloColuna, ...periodos.map(labelMes)], ...corpoPct] },
  ];
}

// Botão "Exportar Excel": recebe uma função que devolve as abas (montada na hora do clique,
// assim sempre exporta o que está na tela naquele momento, com os filtros aplicados).
function BotaoExcel({ nomeAba, gerar }) {
  return (
    <button onClick={() => exportarExcel(nomeAba, gerar())} style={{
      background: "transparent", border: "1px solid #4caf6b", color: "#4caf6b",
      borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      📊 Exportar Excel
    </button>
  );
}

// Botão pra gerar impressão (ou "Salvar como PDF" via caixa de diálogo do navegador) da aba
// atual. O CSS de impressão (em index.html) já força fundo branco e some com os botões/nav.
function BotaoImprimir({ label }) {
  return (
    <button onClick={() => window.print()} style={{
      background: "transparent", border: "1px solid #4a90d9", color: "#4a90d9",
      borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      🖨️ {label || "Gerar impressão"}
    </button>
  );
}

function ClienteDashboard() {
  const { dados, nomes, nomesVisiveis, periodos, labelDoCliente, razaoSocialDoCliente } = useData();
  const [busca, setBusca] = useState("");
  const [clientesSel, setClientesSel] = useState([]);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [mesRefAno, setMesRefAno] = useState("");

  const sugestoes = useMemo(() => {
    if (!busca.trim()) return [];
    return nomesVisiveis
      .filter(c => !clientesSel.includes(c) && (labelDoCliente[c] || "").toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 6);
  }, [busca, nomesVisiveis, labelDoCliente, clientesSel]);

  // agrega os clientes selecionados (soma faturamento/litros mês a mês) - com 1 só, é o próprio cliente
  const todasRows = useMemo(() => {
    if (!clientesSel.length) return null;
    if (clientesSel.length === 1) return dados[clientesSel[0]] || [];
    const periodosSet = new Set();
    clientesSel.forEach(c => (dados[c] || []).forEach(r => periodosSet.add(r.chave)));
    const periodosOrdenados = [...periodosSet].sort();
    return periodosOrdenados.map(chave => {
      const [ano, mes] = chave.split("-").map(Number);
      let faturamento = 0, litros = 0;
      clientesSel.forEach(c => {
        const row = (dados[c] || []).find(r => r.chave === chave);
        if (row) { faturamento += row.faturamento; litros += row.litros; }
      });
      return { ano, mes, chave, faturamento, litros };
    });
  }, [clientesSel, dados]);

  function adicionarCliente(codigo) {
    setClientesSel(prev => prev.includes(codigo) ? prev : [...prev, codigo]);
    setBusca("");
  }
  function removerCliente(codigo) {
    setClientesSel(prev => prev.filter(c => c !== codigo));
  }
  function limparClientes() {
    setClientesSel([]);
    setBusca("");
  }

  // recalcula o período padrão (início/fim/mês de referência) sempre que a seleção mudar
  const clientesSelKey = clientesSel.join(",");
  useEffect(() => {
    if (!todasRows || !todasRows.length) {
      setInicio(""); setFim(""); setMesRefAno("");
      return;
    }
    setInicio(todasRows[0].chave);
    setFim(todasRows[todasRows.length - 1].chave);
    const { fechados } = separarMesEmAndamento(todasRows);
    setMesRefAno(fechados.length ? fechados[fechados.length - 1].chave : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesSelKey]);

  const rowsFiltradas = useMemo(() => {
    if (!todasRows || !inicio || !fim) return [];
    const iIdx = todasRows.findIndex(r => r.chave === inicio);
    const fIdx = todasRows.findIndex(r => r.chave === fim);
    if (iIdx === -1 || fIdx === -1 || iIdx > fIdx) return [];
    return todasRows.slice(iIdx, fIdx + 1);
  }, [todasRows, inicio, fim]);

  const { fechados: rowsFechadas, emAndamento } = useMemo(() => separarMesEmAndamento(todasRows || []), [todasRows]);

  const ultimos3 = rowsFechadas.slice(-3);
  const ultimos6 = rowsFechadas.slice(-6);
  const ultimos12 = rowsFechadas.slice(-12);
  const anteriores3 = rowsFechadas.slice(-6, -3);
  const anteriores6 = rowsFechadas.slice(-12, -6);
  const anteriores12 = rowsFechadas.slice(-24, -12);

  const variacaoFat3 = anteriores3.length ? calcularVariacao(media(ultimos3, "faturamento"), media(anteriores3, "faturamento")) : null;
  const variacaoLit3 = anteriores3.length ? calcularVariacao(media(ultimos3, "litros"), media(anteriores3, "litros")) : null;
  const variacaoFat6 = anteriores6.length ? calcularVariacao(media(ultimos6, "faturamento"), media(anteriores6, "faturamento")) : null;
  const variacaoLit6 = anteriores6.length ? calcularVariacao(media(ultimos6, "litros"), media(anteriores6, "litros")) : null;

  // comparações ano a ano (mesmo mês/meses do ano anterior), a partir do mês de referência selecionável
  const janelasAno = useMemo(() => {
    if (!rowsFechadas.length || !mesRefAno) return null;
    return {
      m1: janelaAnoAnterior(rowsFechadas, mesRefAno, 1),
      m3: janelaAnoAnterior(rowsFechadas, mesRefAno, 3),
      m6: janelaAnoAnterior(rowsFechadas, mesRefAno, 6),
      m12: janelaAnoAnterior(rowsFechadas, mesRefAno, 12),
    };
  }, [rowsFechadas, mesRefAno]);

  // médias por ano-calendário (ex: 2023, 2024, 2025...), com crescimento vs o ano anterior
  const mediasPorAno = useMemo(() => {
    if (!rowsFechadas.length) return [];
    const anos = [...new Set(rowsFechadas.map(r => r.ano))].sort((a, b) => a - b);
    return anos.map((ano, idx) => {
      const rowsDoAno = rowsFechadas.filter(r => r.ano === ano);
      const rowsAnoAnterior = idx > 0 ? rowsFechadas.filter(r => r.ano === anos[idx - 1]) : [];
      const mediaFatAno = media(rowsDoAno, "faturamento");
      const mediaLitAno = media(rowsDoAno, "litros");
      // comparação justa: só os meses que existem nos DOIS anos. Ex: 2026 com Jan-Ago fechados
      // compara só com Jan-Ago/2025 (e não com a média do 2025 inteiro, que mistura a sazonalidade
      // de Nov/Dez com meses que ainda nem aconteceram em 2026)
      const mesesAtual = new Set(rowsDoAno.map(r => r.mes));
      const mesesAnt = new Set(rowsAnoAnterior.map(r => r.mes));
      const rowsAtualComparavel = rowsDoAno.filter(r => mesesAnt.has(r.mes));
      const rowsAnoAnteriorMesmoPeriodo = rowsAnoAnterior.filter(r => mesesAtual.has(r.mes));
      const temComparacao = rowsAtualComparavel.length > 0 && rowsAnoAnteriorMesmoPeriodo.length > 0;
      return {
        ano, meses: rowsDoAno.length, rowsDoAno, rowsAnoAnterior, rowsAnoAnteriorMesmoPeriodo, rowsAtualComparavel,
        totalFat: soma(rowsDoAno, "faturamento"), totalLit: soma(rowsDoAno, "litros"),
        mediaFat: mediaFatAno, mediaLit: mediaLitAno,
        // variação da MÉDIA mensal, comparando só os meses em comum com o ano anterior
        variacaoFat: temComparacao ? calcularVariacao(media(rowsAtualComparavel, "faturamento"), media(rowsAnoAnteriorMesmoPeriodo, "faturamento")) : null,
        variacaoLit: temComparacao ? calcularVariacao(media(rowsAtualComparavel, "litros"), media(rowsAnoAnteriorMesmoPeriodo, "litros")) : null,
      };
    });
  }, [rowsFechadas]);

  const seriesFatCliente = construirSeriesPorAno(rowsFiltradas, "faturamento");
  const seriesLitCliente = construirSeriesPorAno(rowsFiltradas, "litros");
  const variacaoFatPorAno = Object.fromEntries(mediasPorAno.map(m => [m.ano, m.variacaoFat]));
  const variacaoLitPorAno = Object.fromEntries(mediasPorAno.map(m => [m.ano, m.variacaoLit]));
  const primeiroPeriodo = todasRows && todasRows.length ? todasRows[0].chave : "";
  const ultimoPeriodo = todasRows && todasRows.length ? todasRows[todasRows.length - 1].chave : "";

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Cliente" gerar={() => {
          const titulo = clientesSel.length ? clientesSel.map(c => labelDoCliente[c]).join(" + ") : "Nenhum cliente selecionado";
          const mensal = [["Cliente(s)", titulo], [], ["Mês", "Faturamento (R$)", "Litros", "Preço médio (R$/L)"],
            ...(rowsFiltradas || []).map(r => [labelMes(r.chave), nx(r.faturamento), nx(r.litros), r.litros ? nx(r.faturamento / r.litros) : ""])];
          const anual = [["Ano", "Meses fechados", "Faturamento total (R$)", "Litros total", "Média fat./mês (R$)", "Média litros/mês",
            "Var. média fat. vs ano ant. (%)", "Var. média litros vs ano ant. (%)", "Preço médio (R$/L)",
            "Período do ano ant. comparado", "Fat. total no período ano ant. (R$)", "Fat. média/mês no período ano ant. (R$)", "Litros total no período ano ant.", "Litros média/mês no período ano ant."],
            ...mediasPorAno.map(m => [m.ano, m.meses, nx(m.totalFat), nx(m.totalLit), nx(m.mediaFat), nx(m.mediaLit), pctX(m.variacaoFat), pctX(m.variacaoLit), m.totalLit ? nx(m.totalFat / m.totalLit) : "",
              ...(m.rowsAnoAnteriorMesmoPeriodo && m.rowsAnoAnteriorMesmoPeriodo.length
                ? [periodoTexto(m.rowsAnoAnteriorMesmoPeriodo), nx(soma(m.rowsAnoAnteriorMesmoPeriodo, "faturamento")), nx(media(m.rowsAnoAnteriorMesmoPeriodo, "faturamento")), nx(soma(m.rowsAnoAnteriorMesmoPeriodo, "litros")), nx(media(m.rowsAnoAnteriorMesmoPeriodo, "litros"))]
                : ["", "", "", "", ""])])];
          const tri = [["Ano", "Trimestre", "Meses fechados", "Litros", "Média litros/mês", "% do ano (litros)", "Var. litros vs mesmo tri. ano ant. (%)",
            "Faturamento (R$)", "Média fat./mês (R$)", "% do ano (fat.)", "Var. fat. vs mesmo tri. ano ant. (%)"]];
          mediasPorAno.forEach(m => calcularTrimestres(m.rowsDoAno, m.rowsAnoAnterior, m.totalFat, m.totalLit).forEach(t =>
            tri.push([m.ano, `${t.nome} (${t.label})`, t.mesesFechados, nx(t.totalLit), nx(t.mediaLit), nx(t.pctLit), pctX(t.variacaoLit), nx(t.totalFat), nx(t.mediaFat), nx(t.pctFat), pctX(t.variacaoFat)])));
          return [{ nome: "Mensal", linhas: mensal }, { nome: "Anual", linhas: anual }, { nome: "Trimestres", linhas: tri }];
        }} />
        <BotaoImprimir label="Imprimir Cliente" />
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1D1D1B", borderRadius: 8, padding: "10px 14px", border: "1px solid #333" }}>
          <Search size={16} color="#C69700" />
          <input placeholder="Buscar cliente... (pode adicionar vários)" value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14 }} />
          {clientesSel.length > 0 && (
            <button onClick={limparClientes} style={{ background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
              Limpar seleção
            </button>
          )}
        </div>
        {sugestoes.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
            {sugestoes.map(c => (
              <div key={c} onClick={() => adicionarCliente(c)}
                style={{ padding: "10px 14px", color: "#fff", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #2a2a28" }}
                onMouseEnter={e => e.currentTarget.style.background = "#02601D"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {labelDoCliente[c]}
                {razaoSocialDoCliente[c] && razaoSocialDoCliente[c] !== labelDoCliente[c] && (
                  <div style={{ color: "#888", fontSize: 11 }}>{razaoSocialDoCliente[c]}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {clientesSel.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {clientesSel.map(c => (
            <div key={c} style={{
              display: "flex", alignItems: "center", gap: 6, background: "#1D1D1B", border: "1px solid #02601D",
              borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 12, color: "#fff",
            }}>
              {labelDoCliente[c]}
              <button onClick={() => removerCliente(c)} style={{
                background: "#02601D", border: "none", color: "#fff", borderRadius: "50%",
                width: 18, height: 18, cursor: "pointer", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {clientesSel.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
          Busque um ou mais clientes para visualizar faturamento e litros (a seleção é somada quando há mais de um).
        </div>
      )}

      {clientesSel.length > 0 && todasRows && todasRows.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
          Nenhum dado encontrado para os clientes selecionados.
        </div>
      )}

      {clientesSel.length > 0 && todasRows && todasRows.length > 0 && (
        <>
          <h2 style={{ color: "#C69700", fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1, marginBottom: 2 }}>
            {clientesSel.length === 1 ? labelDoCliente[clientesSel[0]] : `${clientesSel.length} clientes (somados)`}
          </h2>
          {clientesSel.length === 1 && razaoSocialDoCliente[clientesSel[0]] && razaoSocialDoCliente[clientesSel[0]] !== labelDoCliente[clientesSel[0]] && (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>{razaoSocialDoCliente[clientesSel[0]]}</div>
          )}

          <AvisoMesAndamento emAndamento={emAndamento} rowsFechados={rowsFechadas} />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 22, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Período:</span>
            <button onClick={() => setInicio(primeiroPeriodo)} style={chipBtnStyle}>Desde o início</button>
            <MonthPicker periodosDisponiveis={todasRows.map(r => r.chave)} valor={inicio} onSelecionar={setInicio} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={todasRows.map(r => r.chave)} valor={fim} onSelecionar={setFim} placeholder="Fim" />
            <button onClick={() => setFim(ultimoPeriodo)} style={chipBtnStyle}>Até hoje</button>
          </div>

          <Section title="Preço médio por litro" icon={<Droplets size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatCard label={`Últimos 3 meses (${periodoTexto(ultimos3)})`}
                value={fmtPrecoLitro(precoMedioLitro(soma(ultimos3, "faturamento"), soma(ultimos3, "litros")))} icon={<Droplets size={14} />}
                badge={<BadgeTendencia
                  variacao={anteriores3.length ? calcularVariacao(precoMedioLitro(soma(ultimos3,"faturamento"),soma(ultimos3,"litros")), precoMedioLitro(soma(anteriores3,"faturamento"),soma(anteriores3,"litros"))) : null}
                  formatador={fmtPrecoLitro} periodoTexto={anteriores3.length ? `vs ${periodoTexto(anteriores3)}` : ""} />} />
              <StatCard label={`Últimos 6 meses (${periodoTexto(ultimos6)})`}
                value={fmtPrecoLitro(precoMedioLitro(soma(ultimos6, "faturamento"), soma(ultimos6, "litros")))} icon={<Droplets size={14} />}
                badge={<BadgeTendencia
                  variacao={anteriores6.length ? calcularVariacao(precoMedioLitro(soma(ultimos6,"faturamento"),soma(ultimos6,"litros")), precoMedioLitro(soma(anteriores6,"faturamento"),soma(anteriores6,"litros"))) : null}
                  formatador={fmtPrecoLitro} periodoTexto={anteriores6.length ? `vs ${periodoTexto(anteriores6)}` : ""} />} />
              <StatCard label={`Últimos 12 meses (${periodoTexto(ultimos12)})`}
                value={fmtPrecoLitro(precoMedioLitro(soma(ultimos12, "faturamento"), soma(ultimos12, "litros")))} icon={<Droplets size={14} />}
                badge={<BadgeTendencia
                  variacao={anteriores12.length ? calcularVariacao(precoMedioLitro(soma(ultimos12,"faturamento"),soma(ultimos12,"litros")), precoMedioLitro(soma(anteriores12,"faturamento"),soma(anteriores12,"litros"))) : null}
                  formatador={fmtPrecoLitro} periodoTexto={anteriores12.length ? `vs ${periodoTexto(anteriores12)}` : ""} />} />
            </div>
          </Section>

          <Section title="Comparação Ano a Ano" icon={<Calendar size={18} color="#C69700" />}>
            <div style={{ background: "rgba(76,175,107,0.06)", border: "1px solid rgba(76,175,107,0.25)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
                <span style={{ color: "#888", fontSize: 12 }}>Mês de referência:</span>
                <MonthPicker periodosDisponiveis={rowsFechadas.map(r => r.chave)} valor={mesRefAno} onSelecionar={setMesRefAno} placeholder="Selecionar mês" />
                <span style={{ color: "#666", fontSize: 11 }}>
                  {mesRefAno && `comparando com ${labelMes(mesRefAno).split("/")[0]}/${(parseInt(mesRefAno.split("-")[0],10)-1).toString().slice(2)} (mesmo mês do ano anterior)`}
                </span>
              </div>

              {!janelasAno && <div style={{ color: "#888", fontSize: 13 }}>Selecione um mês de referência.</div>}

              {janelasAno && (
                <>
                  <div style={{ color: "#4caf6b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Faturamento comparativo por ano anterior</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                    <CardJanelaDetalhada titulo="Último mês" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m1.atual} rowsAnterior={janelasAno.m1.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                    <CardJanelaDetalhada titulo="Últimos 3 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m3.atual} rowsAnterior={janelasAno.m3.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                    <CardJanelaDetalhada titulo="Últimos 6 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m6.atual} rowsAnterior={janelasAno.m6.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                    <CardJanelaDetalhada titulo="Últimos 12 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m12.atual} rowsAnterior={janelasAno.m12.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                  </div>

                  <div style={{ color: "#4caf6b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Litros comparativo por ano anterior</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <CardJanelaDetalhada titulo="Último mês" icon={<Droplets size={13} />} rowsAtual={janelasAno.m1.atual} rowsAnterior={janelasAno.m1.anoAnterior} campo="litros" formatador={fmtLitros} />
                    <CardJanelaDetalhada titulo="Últimos 3 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m3.atual} rowsAnterior={janelasAno.m3.anoAnterior} campo="litros" formatador={fmtLitros} />
                    <CardJanelaDetalhada titulo="Últimos 6 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m6.atual} rowsAnterior={janelasAno.m6.anoAnterior} campo="litros" formatador={fmtLitros} />
                    <CardJanelaDetalhada titulo="Últimos 12 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m12.atual} rowsAnterior={janelasAno.m12.anoAnterior} campo="litros" formatador={fmtLitros} />
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <CardJanelaDetalhada titulo="Últimos 3 meses" icon={<TrendingUp size={13} />} rowsAtual={ultimos3} rowsAnterior={anteriores3} campo="faturamento" formatador={fmtMoeda} />
              <CardJanelaDetalhada titulo="Últimos 6 meses" icon={<TrendingUp size={13} />} rowsAtual={ultimos6} rowsAnterior={anteriores6} campo="faturamento" formatador={fmtMoeda} />
              <StatCard label={`Média 12 meses (${periodoTexto(ultimos12)})`} value={fmtMoeda(media(ultimos12, "faturamento"))} icon={<TrendingUp size={14} />} />
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 8px 4px" }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={seriesFatCliente.dados}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#ccc", fontSize: 13 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<TooltipPorAno formatador={fmtMoeda} />} />
                  <Legend content={<LegendaBranca />} />
                  {seriesFatCliente.anos.map((ano, idx) => (
                    <Line key={ano} type="monotone" dataKey={ano} name={String(ano)} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Litros" icon={<Droplets size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <CardJanelaDetalhada titulo="Últimos 3 meses" icon={<Droplets size={13} />} rowsAtual={ultimos3} rowsAnterior={anteriores3} campo="litros" formatador={fmtLitros} />
              <CardJanelaDetalhada titulo="Últimos 6 meses" icon={<Droplets size={13} />} rowsAtual={ultimos6} rowsAnterior={anteriores6} campo="litros" formatador={fmtLitros} />
              <StatCard label={`Média 12 meses (${periodoTexto(ultimos12)})`} value={fmtLitros(media(ultimos12, "litros"))} icon={<Droplets size={14} />} />
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 8px 4px" }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={seriesLitCliente.dados}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#ccc", fontSize: 13 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                  <Tooltip content={<TooltipPorAno formatador={fmtLitros} />} />
                  <Legend content={<LegendaBranca />} />
                  {seriesLitCliente.anos.map((ano, idx) => (
                    <Line key={ano} type="monotone" dataKey={ano} name={String(ano)} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {mediasPorAno.length > 0 && (
            <Section title="Faturamento e Litros por Ano" icon={<Calendar size={18} color="#C69700" />}>
              <div style={{ background: "rgba(198,151,0,0.06)", border: "1px solid rgba(198,151,0,0.25)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {mediasPorAno.map(m => (
                    <CardAnualCompleto key={m.ano} dados={m} mostrarTrimestres />
                  ))}
                </div>
              </div>
            </Section>
          )}

          <Section title="Tabela" icon={<TableIcon size={18} color="#888" />}>
            <TabelaClienteMeses cliente={clientesSel.length === 1 ? labelDoCliente[clientesSel[0]] : `${clientesSel.length} clientes (somados)`} rows={rowsFiltradas} />
          </Section>
        </>
      )}
    </div>
  );
}

const navBtnStyle = {
  background: "transparent", border: "1px solid #444", color: "#C69700",
  borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 14, lineHeight: 1,
};

// Seletor de mês/ano em formato de "calendário" (navega por ano, clica no mês)
function MonthPicker({ periodosDisponiveis, valor, onSelecionar, disabled, placeholder }) {
  const [aberto, setAberto] = useState(false);
  const anoPadrao = valor
    ? parseInt(valor.split("-")[0], 10)
    : (periodosDisponiveis.length ? parseInt(periodosDisponiveis[periodosDisponiveis.length - 1].split("-")[0], 10) : new Date().getFullYear());
  const [anoVisivel, setAnoVisivel] = useState(anoPadrao);

  const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  function chaveDoMes(idx) {
    return `${anoVisivel}-${String(idx + 1).padStart(2, "0")}`;
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <button type="button" disabled={disabled} onClick={() => setAberto(a => !a)} style={{
        width: "100%", textAlign: "left", background: "#141412", border: "1px solid #444",
        borderRadius: 6, padding: "8px 10px", fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#555" : (valor ? "#fff" : "#888"),
      }}>
        {valor ? labelMes(valor) : (placeholder || "Selecionar")}
      </button>

      {aberto && !disabled && (
        <div style={{
          position: "absolute", zIndex: 30, top: "100%", left: 0, marginTop: 4,
          background: "#1D1D1B", border: "1px solid #444", borderRadius: 8, padding: 10, width: 220,
          boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button type="button" onClick={() => setAnoVisivel(a => a - 1)} style={navBtnStyle}>‹</button>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{anoVisivel}</span>
            <button type="button" onClick={() => setAnoVisivel(a => a + 1)} style={navBtnStyle}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {MESES_ABREV.map((m, idx) => {
              const chave = chaveDoMes(idx);
              const disponivel = periodosDisponiveis.includes(chave);
              const selecionado = chave === valor;
              return (
                <button key={m} type="button" disabled={!disponivel}
                  onClick={() => { onSelecionar(chave); setAberto(false); }}
                  style={{
                    padding: "6px 0", fontSize: 12, borderRadius: 6,
                    cursor: disponivel ? "pointer" : "not-allowed",
                    background: selecionado ? "#C69700" : "transparent",
                    color: !disponivel ? "#444" : (selecionado ? "#141412" : "#ddd"),
                    border: "1px solid " + (selecionado ? "#C69700" : "#333"), fontWeight: selecionado ? 700 : 400,
                  }}>
                  {m}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setAberto(false)} style={{
            marginTop: 8, width: "100%", background: "transparent", border: "none", color: "#666", fontSize: 11, cursor: "pointer",
          }}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function SeletorPeriodo({ ativo, inicio, fim, onInicio, onFim }) {
  const { periodos } = useData();
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <MonthPicker periodosDisponiveis={periodos} valor={inicio} onSelecionar={onInicio} disabled={!ativo} placeholder="Início" />
      <MonthPicker periodosDisponiveis={periodos} valor={fim} onSelecionar={onFim} disabled={!ativo} placeholder="Fim" />
    </div>
  );
}

function ColunaComparacao({ titulo, cor, modo, setModo, selecionados, setSelecionados, gruposSel, setGruposSel, inicio, setInicio, fim, setFim }) {
  const { nomes, nomesVisiveis, grupos, clientesPorGrupo, labelDoCliente } = useData();
  const [buscaCliente, setBuscaCliente] = useState("");

  function toggleCliente(nome) {
    setSelecionados(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]);
  }

  function toggleGrupo(g) {
    setGruposSel(prev => {
      const novo = prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g];
      const uniao = [...new Set(novo.flatMap(gr => clientesPorGrupo[gr] || []))];
      setSelecionados(uniao);
      return novo;
    });
  }

  const ativo = selecionados.length > 0;
  const nomesFiltrados = buscaCliente.trim()
    ? nomesVisiveis.filter(n => (labelDoCliente[n] || "").toLowerCase().includes(buscaCliente.toLowerCase()))
    : nomesVisiveis;

  function limparSelecao() {
    setSelecionados([]);
    setGruposSel([]);
    setBuscaCliente("");
    setInicio("");
    setFim("");
  }

  return (
    <div style={{ flex: 1, minWidth: 280, background: "#1D1D1B", borderRadius: 10, padding: 16, border: `1px solid ${cor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: cor, fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 0.5 }}>
          {titulo}
        </div>
        <button onClick={limparSelecao} style={{
          background: "transparent", border: "1px solid #444", color: "#888",
          borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer",
        }}>
          Limpar seleção
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={() => { setModo("clientes"); setGruposSel([]); setSelecionados([]); }} style={modoBtnStyle(modo === "clientes", cor)}>
          <Users size={13} /> Clientes
        </button>
        <button onClick={() => { setModo("grupo"); setSelecionados([]); }} style={modoBtnStyle(modo === "grupo", cor)}>
          <Layers size={13} /> Grupo
        </button>
      </div>

      {modo === "grupo" && (
        <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid #333", borderRadius: 6, padding: "6px 8px" }}>
          {grupos.length === 0 && <div style={{ color: "#666", fontSize: 12, padding: "4px 0" }}>Nenhum grupo cadastrado ainda.</div>}
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupo(g)} />
              {g} ({clientesPorGrupo[g].length}){grupoEhPesado(g) ? " ⚠" : ""}
            </label>
          ))}
        </div>
      )}

      {modo === "clientes" && (
        <>
          <input placeholder="Buscar cliente..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
            style={{ ...selectStyle, marginBottom: 6, width: "100%", boxSizing: "border-box" }} />
          <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid #333", borderRadius: 6, padding: "6px 8px" }}>
            {nomesFiltrados.map(nome => (
              <label key={nome} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={selecionados.includes(nome)} onChange={() => toggleCliente(nome)} />
                {labelDoCliente[nome]}
              </label>
            ))}
            {nomesFiltrados.length === 0 && <div style={{ color: "#666", fontSize: 12, padding: "4px 0" }}>Nenhum cliente encontrado.</div>}
          </div>
        </>
      )}

      <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
        {selecionados.length === 0 ? "Nenhum cliente selecionado" : `${selecionados.length} cliente(s) selecionado(s)`}
      </div>

      <SeletorPeriodo ativo={ativo} inicio={inicio} fim={fim} onInicio={setInicio} onFim={setFim} />
    </div>
  );
}

function modoBtnStyle(ativo, cor) {
  return {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    padding: "6px 0", fontSize: 12, borderRadius: 6, cursor: "pointer",
    background: ativo ? cor : "transparent", color: ativo ? "#141412" : "#888",
    border: `1px solid ${ativo ? cor : "#444"}`, fontWeight: 600,
  };
}

function mediaSimples(valores) {
  const validos = valores.filter(v => v != null);
  if (!validos.length) return 0;
  return validos.reduce((s, v) => s + v, 0) / validos.length;
}

function CardComparativo({ titulo, valorA, valorB, variacao, formatador, icon }) {
  return (
    <div style={{
      background: "#1D1D1B", borderRadius: 10, padding: "14px 16px",
      flex: "1 1 220px", minWidth: 220, border: "1px solid #33332f",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C69700", fontSize: 11, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {icon}{titulo}
      </div>
      <div style={{ display: "flex", gap: 20, marginBottom: 8 }}>
        <div>
          <div style={{ color: "#4caf6b", fontSize: 11, fontWeight: 700 }}>A</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{formatador(valorA)}</div>
        </div>
        <div>
          <div style={{ color: "#e8c67a", fontSize: 11, fontWeight: 700 }}>B</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{formatador(valorB)}</div>
        </div>
      </div>
      <BadgeTendencia variacao={variacao} formatador={formatador} periodoTexto="A em relação a B" />
    </div>
  );
}

function ComparacaoTab() {
  const { dados, periodos, labelDoCliente, nomesVisiveis } = useData();

  // comparação entre grupos de clientes (cada grupo pode ter 1 ou vários clientes, somados)
  const [gruposComparar, setGruposComparar] = useState([]);
  const proximoIdGrupoRef = useRef(1);

  function adicionarGrupoComparar() {
    const id = proximoIdGrupoRef.current++;
    setGruposComparar(prev => [...prev, { id, nome: `Grupo ${prev.length + 1}`, clientes: [] }]);
  }
  function removerGrupoComparar(id) {
    setGruposComparar(prev => prev.filter(g => g.id !== id));
  }
  function renomearGrupoComparar(id, nome) {
    setGruposComparar(prev => prev.map(g => g.id === id ? { ...g, nome } : g));
  }
  function adicionarClienteAoGrupo(id, codigo) {
    setGruposComparar(prev => prev.map(g => {
      if (g.id !== id) return g;
      if (g.clientes.includes(codigo)) return g;
      // se o grupo ainda não teve nome customizado (nome padrão "Grupo N") e é o primeiro
      // cliente adicionado, já batiza o grupo com o nome desse cliente
      const nomeAutomatico = /^Grupo \d+$/.test(g.nome) && g.clientes.length === 0;
      return { ...g, clientes: [...g.clientes, codigo], nome: nomeAutomatico ? labelDoCliente[codigo] : g.nome };
    }));
  }
  function removerClienteDoGrupo(id, codigo) {
    setGruposComparar(prev => prev.map(g => g.id === id ? { ...g, clientes: g.clientes.filter(c => c !== codigo) } : g));
  }
  function limparGruposComparar() {
    setGruposComparar([]);
  }

  const [inicioComparar, setInicioComparar] = useState(() => periodos[0] || "");
  const [fimComparar, setFimComparar] = useState(() => periodos[periodos.length - 1] || "");

  const periodosComparar = useMemo(() => {
    if (!inicioComparar || !fimComparar) return periodos;
    return periodos.filter(p => p >= inicioComparar && p <= fimComparar);
  }, [periodos, inicioComparar, fimComparar]);

  const seriesComparacaoGrupos = useMemo(() => {
    if (!gruposComparar.length) return [];
    return periodosComparar.map((chave) => {
      const idxGlobal = periodos.indexOf(chave);
      const anteriorChave = idxGlobal > 0 ? periodos[idxGlobal - 1] : null;
      const linha = { mes: labelMes(chave) };
      gruposComparar.forEach(grupo => {
        let fatAtual = 0, litAtual = 0, teveAtual = false;
        let fatAnterior = 0, litAnterior = 0, teveAnterior = false;
        grupo.clientes.forEach(codigo => {
          const rows = dados[codigo] || [];
          const atual = rows.find(r => r.chave === chave);
          if (atual) { fatAtual += atual.faturamento; litAtual += atual.litros; teveAtual = true; }
          if (anteriorChave) {
            const ant = rows.find(r => r.chave === anteriorChave);
            if (ant) { fatAnterior += ant.faturamento; litAnterior += ant.litros; teveAnterior = true; }
          }
        });
        linha[`fat_${grupo.id}`] = teveAtual ? fatAtual : null;
        linha[`lit_${grupo.id}`] = teveAtual ? litAtual : null;
        linha[`fatDiff_${grupo.id}`] = (teveAtual && teveAnterior) ? (fatAtual - fatAnterior) : null;
        linha[`litDiff_${grupo.id}`] = (teveAtual && teveAnterior) ? (litAtual - litAnterior) : null;
      });
      return linha;
    });
  }, [gruposComparar, dados, periodos, periodosComparar]);

  // resumo acumulado (total litros/faturamento) de cada grupo, dentro do período
  const resumoComparacaoGrupos = useMemo(() => {
    if (!gruposComparar.length) return [];
    const chaves = new Set(periodosComparar);
    return gruposComparar.map(grupo => {
      let fat = 0, lit = 0;
      grupo.clientes.forEach(codigo => {
        (dados[codigo] || []).forEach(r => { if (chaves.has(r.chave)) { fat += r.faturamento; lit += r.litros; } });
      });
      return { id: grupo.id, nome: grupo.nome, fat, lit };
    });
  }, [gruposComparar, dados, periodosComparar]);

  const [modoA, setModoA] = useState("clientes");
  const [selA, setSelA] = useState([]);
  const [gruposA, setGruposA] = useState([]);
  const [inicioA, setInicioA] = useState("");
  const [fimA, setFimA] = useState("");

  const [modoB, setModoB] = useState("clientes");
  const [selB, setSelB] = useState([]);
  const [gruposB, setGruposB] = useState([]);
  const [inicioB, setInicioB] = useState("");
  const [fimB, setFimB] = useState("");

  function extrairPeriodoAgregado(clientes, inicio, fim) {
    if (!clientes.length || !inicio || !fim) return [];
    const iIdx = periodos.indexOf(inicio);
    const fIdx = periodos.indexOf(fim);
    if (iIdx === -1 || fIdx === -1 || iIdx > fIdx) return [];
    const chavesPeriodo = periodos.slice(iIdx, fIdx + 1);
    return chavesPeriodo.map(chave => {
      let faturamento = 0, litros = 0;
      clientes.forEach(nome => {
        const row = (dados[nome] || []).find(r => r.chave === chave);
        if (row) { faturamento += row.faturamento; litros += row.litros; }
      });
      return { chave, faturamento, litros };
    });
  }

  const rowsA = extrairPeriodoAgregado(selA, inicioA, fimA);
  const rowsB = extrairPeriodoAgregado(selB, inicioB, fimB);

  const labelA = modoA === "grupo" && gruposA.length ? `Grupo: ${gruposA.join(" + ")}` : (selA.length > 1 ? `${selA.length} clientes (A)` : (labelDoCliente[selA[0]] || "A"));
  const labelB = modoB === "grupo" && gruposB.length ? `Grupo: ${gruposB.join(" + ")}` : (selB.length > 1 ? `${selB.length} clientes (B)` : (labelDoCliente[selB[0]] || "B"));

  // versão curta pra caber nos cards de estatística (o nome completo continua na legenda/tooltip do gráfico)
  const labelACurto = modoA === "grupo" && gruposA.length
    ? (gruposA.length > 1 ? `${gruposA.length} grupos (A)` : gruposA[0])
    : labelA;
  const labelBCurto = modoB === "grupo" && gruposB.length
    ? (gruposB.length > 1 ? `${gruposB.length} grupos (B)` : gruposB[0])
    : labelB;

  // rótulo real de cada ponto do gráfico (data de A e/ou de B, já que os períodos podem ser de anos diferentes)
  const maxLen = Math.max(rowsA.length, rowsB.length);
  const chartFat = [], chartLit = [];
  for (let i = 0; i < maxLen; i++) {
    const dataA = rowsA[i] ? labelMes(rowsA[i].chave) : null;
    const dataB = rowsB[i] ? labelMes(rowsB[i].chave) : null;
    const periodo = dataA && dataB ? (dataA === dataB ? dataA : `${dataA} / ${dataB}`) : (dataA || dataB || `M${i + 1}`);
    chartFat.push({ periodo, faturamentoA: rowsA[i]?.faturamento ?? null, faturamentoB: rowsB[i]?.faturamento ?? null, diferencaFat: (rowsA[i] && rowsB[i]) ? (rowsA[i].faturamento - rowsB[i].faturamento) : null });
    chartLit.push({ periodo, litrosA: rowsA[i]?.litros ?? null, litrosB: rowsB[i]?.litros ?? null, diferencaLit: (rowsA[i] && rowsB[i]) ? (rowsA[i].litros - rowsB[i].litros) : null });
  }

  const totFatA = rowsA.reduce((s,r)=>s+r.faturamento,0);
  const totFatB = rowsB.reduce((s,r)=>s+r.faturamento,0);
  const totLitA = rowsA.reduce((s,r)=>s+r.litros,0);
  const totLitB = rowsB.reduce((s,r)=>s+r.litros,0);

  const mediaFatA = mediaSimples(rowsA.map(r => r.faturamento));
  const mediaFatB = mediaSimples(rowsB.map(r => r.faturamento));
  const mediaLitA = mediaSimples(rowsA.map(r => r.litros));
  const mediaLitB = mediaSimples(rowsB.map(r => r.litros));

  const media3FatA = mediaSimples(rowsA.slice(-3).map(r => r.faturamento));
  const media3FatB = mediaSimples(rowsB.slice(-3).map(r => r.faturamento));
  const media3LitA = mediaSimples(rowsA.slice(-3).map(r => r.litros));
  const media3LitB = mediaSimples(rowsB.slice(-3).map(r => r.litros));

  const pronto = rowsA.length > 0 && rowsB.length > 0;

  // A vs B: quanto A está acima/abaixo de B, em cada métrica
  const compTotalFat = pronto ? calcularVariacao(totFatA, totFatB) : null;
  const compTotalLit = pronto ? calcularVariacao(totLitA, totLitB) : null;
  const compMediaFat = pronto ? calcularVariacao(mediaFatA, mediaFatB) : null;
  const compMediaLit = pronto ? calcularVariacao(mediaLitA, mediaLitB) : null;
  const compMedia3Fat = pronto ? calcularVariacao(media3FatA, media3FatB) : null;
  const compMedia3Lit = pronto ? calcularVariacao(media3LitA, media3LitB) : null;

  const precoLitroA = precoMedioLitro(totFatA, totLitA);
  const precoLitroB = precoMedioLitro(totFatB, totLitB);
  const compPrecoLitro = (precoLitroA != null && precoLitroB != null) ? calcularVariacao(precoLitroA, precoLitroB) : null;

  function rotuloCompactoMoeda(v) {
    if (v == null) return "";
    if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
    return fmtMoeda(v);
  }
  function rotuloCompactoLitros(v) {
    if (v == null) return "";
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k L`;
    return `${Math.round(v)} L`;
  }
  function rotuloDiferencaMoeda(v) {
    if (v == null) return "";
    const sinal = v > 0 ? "+" : "";
    return `${sinal}${rotuloCompactoMoeda(v)}`;
  }
  function rotuloDiferencaLitros(v) {
    if (v == null) return "";
    const sinal = v > 0 ? "+" : "";
    return `${sinal}${rotuloCompactoLitros(v)}`;
  }

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Comparacao" gerar={() => {
          const abas = [];
          if (pronto) {
            abas.push({ nome: "Cenário A vs B", linhas: [
              ["Período", `Faturamento ${labelA} (R$)`, `Faturamento ${labelB} (R$)`, "Diferença faturamento A-B (R$)", `Litros ${labelA}`, `Litros ${labelB}`, "Diferença litros A-B"],
              ...chartFat.map((f, i) => [f.periodo, nx(f.faturamentoA), nx(f.faturamentoB), nx(f.diferencaFat), nx(chartLit[i].litrosA), nx(chartLit[i].litrosB), nx(chartLit[i].diferencaLit)]),
            ] });
            abas.push({ nome: "Resumo A vs B", linhas: [
              ["Indicador", labelA, labelB],
              ["Faturamento total (R$)", nx(totFatA), nx(totFatB)], ["Litros total", nx(totLitA), nx(totLitB)],
              ["Faturamento médio/mês (R$)", nx(mediaFatA), nx(mediaFatB)], ["Litros médio/mês", nx(mediaLitA), nx(mediaLitB)],
              ["Faturamento média últ. 3 meses (R$)", nx(media3FatA), nx(media3FatB)], ["Litros média últ. 3 meses", nx(media3LitA), nx(media3LitB)],
            ] });
          }
          if (gruposComparar.length) {
            const cabG = ["Mês"];
            gruposComparar.forEach(g => cabG.push(`${g.nome} - Faturamento (R$)`, `${g.nome} - Litros`));
            abas.push({ nome: "Grupos - mensal", linhas: [cabG, ...seriesComparacaoGrupos.map(r => [r.mes, ...gruposComparar.flatMap(g => [nx(r[`fat_${g.id}`]), nx(r[`lit_${g.id}`])])])] });
            const ordenado = [...resumoComparacaoGrupos].sort((a, b) => b.fat - a.fat);
            const maior = ordenado[0] ? ordenado[0].fat : 0;
            const somaF = ordenado.reduce((s, r) => s + r.fat, 0);
            abas.push({ nome: "Grupos - resumo", linhas: [["#", "Grupo", "Litros (total)", "Faturamento (total, R$)", "% do líder", "% do total"],
              ...ordenado.map((g, i) => [i + 1, g.nome, nx(g.lit), nx(g.fat), maior ? nx(g.fat / maior * 100) : "", somaF ? nx(g.fat / somaF * 100) : ""])] });
          }
          return abas;
        }} />
        <BotaoImprimir label="Imprimir Comparação" />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <ColunaComparacao titulo="Cenário A" cor="#02601D"
          modo={modoA} setModo={setModoA} selecionados={selA} setSelecionados={setSelA}
          gruposSel={gruposA} setGruposSel={setGruposA} inicio={inicioA} setInicio={setInicioA} fim={fimA} setFim={setFimA} />
        <ColunaComparacao titulo="Cenário B" cor="#C69700"
          modo={modoB} setModo={setModoB} selecionados={selB} setSelecionados={setSelB}
          gruposSel={gruposB} setGruposSel={setGruposB} inicio={inicioB} setInicio={setInicioB} fim={fimB} setFim={setFimB} />
      </div>

      {!pronto && (
        <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
          Selecione cliente(s) ou grupo(s), e período (início/fim), para os dois cenários.
        </div>
      )}

      {pronto && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <StatCard label={`${labelACurto} · Faturamento total`} value={fmtMoeda(totFatA)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelBCurto} · Faturamento total`} value={fmtMoeda(totFatB)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelACurto} · Litros total`} value={fmtLitros(totLitA)} icon={<Droplets size={14} />} />
            <StatCard label={`${labelBCurto} · Litros total`} value={fmtLitros(totLitB)} icon={<Droplets size={14} />} />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label={`${labelACurto} · Média 3 meses (Fat.)`} value={fmtMoeda(media3FatA)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelBCurto} · Média 3 meses (Fat.)`} value={fmtMoeda(media3FatB)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelACurto} · Média 3 meses (Lit.)`} value={fmtLitros(media3LitA)} icon={<Droplets size={14} />} />
            <StatCard label={`${labelBCurto} · Média 3 meses (Lit.)`} value={fmtLitros(media3LitB)} icon={<Droplets size={14} />} />
          </div>

          <Section title="Comparativo A vs B" icon={<GitCompareArrows size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <CardComparativo titulo="Faturamento · Média 3 meses" valorA={media3FatA} valorB={media3FatB} variacao={compMedia3Fat} formatador={fmtMoeda} icon={<TrendingUp size={13} />} />
              <CardComparativo titulo="Faturamento · Média do período" valorA={mediaFatA} valorB={mediaFatB} variacao={compMediaFat} formatador={fmtMoeda} icon={<TrendingUp size={13} />} />
              <CardComparativo titulo="Faturamento · Total do período" valorA={totFatA} valorB={totFatB} variacao={compTotalFat} formatador={fmtMoeda} icon={<TrendingUp size={13} />} />
              <CardComparativo titulo="Litros · Média 3 meses" valorA={media3LitA} valorB={media3LitB} variacao={compMedia3Lit} formatador={fmtLitros} icon={<Droplets size={13} />} />
              <CardComparativo titulo="Litros · Média do período" valorA={mediaLitA} valorB={mediaLitB} variacao={compMediaLit} formatador={fmtLitros} icon={<Droplets size={13} />} />
              <CardComparativo titulo="Litros · Total do período" valorA={totLitA} valorB={totLitB} variacao={compTotalLit} formatador={fmtLitros} icon={<Droplets size={13} />} />
              <CardComparativo titulo="Preço médio por litro" valorA={precoLitroA} valorB={precoLitroB} variacao={compPrecoLitro} formatador={fmtPrecoLitro} icon={<Droplets size={13} />} />
            </div>
          </Section>

          <div style={{ background: "rgba(76,175,107,0.05)", border: "1px solid rgba(76,175,107,0.2)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartFat} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="periodo" tick={{ fill: "#fff", fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v, n) => [v == null ? "-" : fmtMoeda(v), n]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <Legend content={<LegendaBranca />} />
                  <Bar dataKey="faturamentoA" name={labelA} fill="#02601D" radius={[4,4,0,0]}>
                    <LabelList dataKey="faturamentoA" position="top" formatter={rotuloCompactoMoeda} style={{ fontSize: 10, fill: "#8fd19e" }} />
                  </Bar>
                  <Bar dataKey="faturamentoB" name={labelB} fill="#C69700" radius={[4,4,0,0]}>
                    <LabelList dataKey="faturamentoB" position="top" formatter={rotuloCompactoMoeda} style={{ fontSize: 10, fill: "#e8c67a" }} />
                  </Bar>
                  <ReferenceLine y={mediaFatA} stroke="#4caf6b" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média A: ${rotuloCompactoMoeda(mediaFatA)}`, position: "insideTopLeft", fill: "#4caf6b", fontSize: 13, fontWeight: 700 }} />
                  <ReferenceLine y={mediaFatB} stroke="#e8c67a" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média B: ${rotuloCompactoMoeda(mediaFatB)}`, position: "insideBottomLeft", fill: "#e8c67a", fontSize: 13, fontWeight: 700 }} />
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Diferença mês a mês (A − B) · Faturamento" icon={<GitCompareArrows size={16} color="#888" />}>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartFat} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="periodo" tick={{ fill: "#fff", fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis stroke="#888" fontSize={11} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => [v == null ? "-" : rotuloDiferencaMoeda(v), "Diferença A − B"]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <ReferenceLine y={0} stroke="#666" />
                  <Bar dataKey="diferencaFat" radius={[3,3,3,3]}>
                    <LabelList dataKey="diferencaFat" position="top" formatter={rotuloDiferencaMoeda} style={{ fontSize: 10, fill: "#ccc" }} />
                    {chartFat.map((entry, idx) => (
                      <Cell key={idx} fill={entry.diferencaFat == null ? "#555" : (entry.diferencaFat >= 0 ? "#4caf6b" : "#e0645a")} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>

          <div style={{ background: "rgba(74,144,217,0.05)", border: "1px solid rgba(74,144,217,0.2)", borderRadius: 12, padding: 16 }}>
            <Section title="Litros" icon={<Droplets size={18} color="#C69700" />}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartLit} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="periodo" tick={{ fill: "#fff", fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                  <Tooltip formatter={(v, n) => [v == null ? "-" : fmtLitros(v), n]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <Legend content={<LegendaBranca />} />
                  <Line type="monotone" dataKey="litrosA" name={labelA} stroke="#02601D" strokeWidth={2} dot={{ r: 3 }}>
                    <LabelList dataKey="litrosA" position="top" formatter={rotuloCompactoLitros} style={{ fontSize: 10, fill: "#8fd19e" }} />
                  </Line>
                  <Line type="monotone" dataKey="litrosB" name={labelB} stroke="#C69700" strokeWidth={2} dot={{ r: 3 }}>
                    <LabelList dataKey="litrosB" position="top" formatter={rotuloCompactoLitros} style={{ fontSize: 10, fill: "#e8c67a" }} />
                  </Line>
                  <ReferenceLine y={mediaLitA} stroke="#4caf6b" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média A: ${rotuloCompactoLitros(mediaLitA)}`, position: "insideTopLeft", fill: "#4caf6b", fontSize: 13, fontWeight: 700 }} />
                  <ReferenceLine y={mediaLitB} stroke="#e8c67a" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média B: ${rotuloCompactoLitros(mediaLitB)}`, position: "insideBottomLeft", fill: "#e8c67a", fontSize: 13, fontWeight: 700 }} />
                </LineChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Diferença mês a mês (A − B) · Litros" icon={<GitCompareArrows size={16} color="#888" />}>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartLit} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="periodo" tick={{ fill: "#fff", fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis stroke="#888" fontSize={11} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                  <Tooltip formatter={v => [v == null ? "-" : rotuloDiferencaLitros(v), "Diferença A − B"]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <ReferenceLine y={0} stroke="#666" />
                  <Bar dataKey="diferencaLit" radius={[3,3,3,3]}>
                    <LabelList dataKey="diferencaLit" position="top" formatter={rotuloDiferencaLitros} style={{ fontSize: 10, fill: "#ccc" }} />
                    {chartLit.map((entry, idx) => (
                      <Cell key={idx} fill={entry.diferencaLit == null ? "#555" : (entry.diferencaLit >= 0 ? "#4caf6b" : "#e0645a")} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>
        </>
      )}

      <Section title="Comparar Clientes Específicos (mês a mês)" icon={<GitCompareArrows size={18} color="#4a90d9" />}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#888", fontSize: 12 }}>
            Cada grupo pode ter 1 cliente só (ex: Redefort) ou vários somados (ex: as 5 lojas Miller) — o gráfico compara os grupos entre si.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={adicionarGrupoComparar} style={chipBtnStyle}>+ Novo grupo</button>
            {gruposComparar.length > 0 && (
              <button onClick={limparGruposComparar} style={{ background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                Limpar tudo
              </button>
            )}
          </div>
        </div>

        {gruposComparar.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {gruposComparar.map((grupo, idx) => (
              <GrupoComparacaoCard key={grupo.id} grupo={grupo} cor={corDoAno(idx)}
                onRenomear={nome => renomearGrupoComparar(grupo.id, nome)}
                onAdicionarCliente={codigo => adicionarClienteAoGrupo(grupo.id, codigo)}
                onRemoverCliente={codigo => removerClienteDoGrupo(grupo.id, codigo)}
                onRemoverGrupo={() => removerGrupoComparar(grupo.id)}
                nomesVisiveis={nomesVisiveis} labelDoCliente={labelDoCliente} />
            ))}
          </div>
        )}

        {gruposComparar.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Período:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioComparar} onSelecionar={setInicioComparar} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimComparar} onSelecionar={setFimComparar} placeholder="Fim" />
          </div>
        )}

        {gruposComparar.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Clique em "+ Novo grupo" pra começar (ex: um grupo "Redefort" com 1 cliente, e outro "Miller" com as 5 lojas somadas).
          </div>
        )}

        {gruposComparar.length > 0 && (
          <>
            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 8 }}>Faturamento</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesComparacaoGrupos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => v == null ? "-" : fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                {gruposComparar.map((grupo, idx) => (
                  <Line key={grupo.id} type="monotone" dataKey={`fat_${grupo.id}`} name={grupo.nome} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 20 }}>Diferença mês a mês · Faturamento</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seriesComparacaoGrupos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => v == null ? "-" : (v >= 0 ? "+" : "") + fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                <ReferenceLine y={0} stroke="#666" />
                {gruposComparar.map((grupo, idx) => (
                  <Bar key={grupo.id} dataKey={`fatDiff_${grupo.id}`} name={grupo.nome} fill={corDoAno(idx)} radius={[3,3,3,3]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 24 }}>Litros</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesComparacaoGrupos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                <Tooltip formatter={v => v == null ? "-" : fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                {gruposComparar.map((grupo, idx) => (
                  <Line key={grupo.id} type="monotone" dataKey={`lit_${grupo.id}`} name={grupo.nome} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 20 }}>Diferença mês a mês · Litros</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seriesComparacaoGrupos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                <Tooltip formatter={v => v == null ? "-" : (v >= 0 ? "+" : "") + fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                <ReferenceLine y={0} stroke="#666" />
                {gruposComparar.map((grupo, idx) => (
                  <Bar key={grupo.id} dataKey={`litDiff_${grupo.id}`} name={grupo.nome} fill={corDoAno(idx)} radius={[3,3,3,3]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10, marginTop: 28 }}>
              Resumo do período ({periodosComparar.length ? `${labelMes(periodosComparar[0])}–${labelMes(periodosComparar[periodosComparar.length - 1])}` : "-"})
            </div>
            <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Grupo</th>
                    <th style={thStyle}>Litros (total)</th>
                    <th style={thStyle}>Faturamento (total)</th>
                    <th style={thStyle}>% do líder</th>
                    <th style={thStyle}>% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const ordenado = [...resumoComparacaoGrupos].sort((a, b) => b.fat - a.fat);
                    const maiorFat = ordenado[0]?.fat || 0;
                    const somaFat = ordenado.reduce((s, r) => s + r.fat, 0);
                    return ordenado.map(({ id, nome, fat, lit }, idx) => {
                      const corOriginal = corDoAno(gruposComparar.findIndex(g => g.id === id));
                      const pctLider = maiorFat ? (fat / maiorFat) * 100 : 0;
                      const pctTotal = somaFat ? (fat / somaFat) * 100 : 0;
                      return (
                        <tr key={id}>
                          <td style={{ ...tdStyle, color: "#888" }}>{idx + 1}</td>
                          <td style={{ ...tdStyle, color: corOriginal, fontWeight: 700 }}>{nome}</td>
                          <td style={{ ...tdStyle, color: "#fff", fontWeight: 700 }}>{fmtLitros(lit)}</td>
                          <td style={{ ...tdStyle, color: "#fff", fontWeight: 700 }}>{fmtMoeda(fat)}</td>
                          <td style={{ ...tdStyle, color: idx === 0 ? "#4caf6b" : "#ddd", fontWeight: idx === 0 ? 700 : 400 }}>
                            {idx === 0 ? "líder" : `${pctLider.toFixed(1)}%`}
                          </td>
                          <td style={{ ...tdStyle, color: "#C69700", fontWeight: 700 }}>{pctTotal.toFixed(1)}%</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>
              "% do líder" compara o faturamento de cada grupo com o maior da lista. "% do total" é a fatia de cada grupo dentro da soma de todos os grupos comparados aqui (soma 100%).
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function CarregandoDados({ onRetry, mensagem }) {
  return (
    <div style={{ minHeight: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#888" }}>
      {mensagem ? (
        <>
          <AlertTriangle size={28} color="#C69700" />
          <div style={{ fontSize: 14, textAlign: "center", maxWidth: 360 }}>{mensagem}</div>
          <button onClick={onRetry} style={{
            display: "flex", alignItems: "center", gap: 6, background: "transparent",
            border: "1px solid #444", color: "#fff", borderRadius: 6, padding: "8px 14px",
            fontSize: 13, cursor: "pointer",
          }}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </>
      ) : (
        <>
          <RefreshCw size={22} className="spin" />
          <div style={{ fontSize: 14 }}>Carregando dados da planilha...</div>
        </>
      )}
    </div>
  );
}

function rotuloCompactoGeral(v, unidade) {
  if (v == null) return "-";
  if (unidade === "L") {
    return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k L` : `${Math.round(v)} L`;
  }
  if (unidade === "pal") {
    return `${v.toFixed(1)} pal`;
  }
  return Math.abs(v) >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmtMoeda(v);
}

function calcularMetricasCliente(rowsBrutas, mesRefAno) {
  const { fechados: rows, emAndamento } = separarMesEmAndamento(rowsBrutas);
  const n = rows.length;
  const atual = rows[n - 1];
  const anterior = rows[n - 2];

  const j3 = rows.slice(-3), j3Prev = rows.slice(-6, -3);
  const j6 = rows.slice(-6), j6Prev = rows.slice(-12, -6);
  const j12 = rows.slice(-12), j12Prev = rows.slice(-24, -12);

  function janela(rowsJanela, rowsAnteriores) {
    const fat = soma(rowsJanela, "faturamento");
    const lit = soma(rowsJanela, "litros");
    return {
      fat, lit, meses: rowsJanela.length, precoLitro: precoMedioLitro(fat, lit),
      varFat: rowsAnteriores.length ? calcularVariacao(fat, soma(rowsAnteriores, "faturamento")) : null,
      varLit: rowsAnteriores.length ? calcularVariacao(lit, soma(rowsAnteriores, "litros")) : null,
      periodoTexto: rowsJanela.length ? periodoTexto(rowsJanela) : "",
      periodoAnteriorTexto: rowsAnteriores.length ? periodoTexto(rowsAnteriores) : "",
    };
  }

  let comparacaoAno = null;
  if (mesRefAno && rows.some(r => r.chave === mesRefAno)) {
    const m1 = janelaAnoAnterior(rows, mesRefAno, 1);
    const m3 = janelaAnoAnterior(rows, mesRefAno, 3);
    const m6 = janelaAnoAnterior(rows, mesRefAno, 6);
    const m12 = janelaAnoAnterior(rows, mesRefAno, 12);
    comparacaoAno = {
      m1: janela(m1.atual, m1.anoAnterior),
      m3: janela(m3.atual, m3.anoAnterior),
      m6: janela(m6.atual, m6.anoAnterior),
      m12: janela(m12.atual, m12.anoAnterior),
    };
  }

  return {
    ultimoMesFechado: atual ? {
      fat: atual.faturamento, lit: atual.litros, meses: 1, precoLitro: precoMedioLitro(atual.faturamento, atual.litros),
      varFat: anterior ? calcularVariacao(atual.faturamento, anterior.faturamento) : null,
      varLit: anterior ? calcularVariacao(atual.litros, anterior.litros) : null,
      mesTexto: labelMes(atual.chave),
    } : null,
    emAndamentoRow: emAndamento,
    rowsFechados: rows,
    j3: janela(j3, j3Prev),
    j6: janela(j6, j6Prev),
    j12: janela(j12, j12Prev),
    comparacaoAno,
  };
}

// Pega os N clientes com maior/menor variação (crescimento ou queda) segundo um seletor de variação
function topN(clientesComMetricas, seletor, n, ordem) {
  return clientesComMetricas
    .map(c => ({ nome: c.nome, variacao: seletor(c.metricas) }))
    .filter(c => c.variacao != null)
    .sort((a, b) => ordem === "desc" ? b.variacao.pct - a.variacao.pct : a.variacao.pct - b.variacao.pct)
    .slice(0, n);
}

// % pequeno e colorido pra usar inline ao lado de um valor (ex: "15.337 L (+12.3%)")
function PctInline({ variacao }) {
  if (!variacao) return null;
  const { cor } = classificarTendencia(variacao.pct);
  return (
    <span style={{ color: cor, fontSize: 10, fontWeight: 700, marginLeft: 5 }}>
      ({variacao.pct >= 0 ? "+" : ""}{variacao.pct.toFixed(1)}%)
    </span>
  );
}

function ListaTop10({ titulo, itens, formatador, labelDoCliente }) {
  return (
    <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 10, padding: 14, flex: "1 1 300px", minWidth: 300 }}>
      <div style={{ color: "#C69700", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{titulo}</div>
      {itens.length === 0 && <div style={{ color: "#666", fontSize: 12 }}>Sem dados suficientes pra esse comparativo.</div>}
      {itens.map((item, idx) => {
        const { cor, Icon } = classificarTendencia(item.variacao.pct);
        return (
          <div key={item.nome} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            padding: "6px 0", borderBottom: idx < itens.length - 1 ? "1px solid #262624" : "none", fontSize: 12,
          }}>
            <span style={{ color: "#fff" }}>{idx + 1}. {labelDoCliente[item.nome]}</span>
            <span style={{ color: cor, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
              <Icon size={11} /> {item.variacao.pct >= 0 ? "+" : ""}{item.variacao.pct.toFixed(1)}% ({formatador(Math.abs(item.variacao.diff))})
            </span>
          </div>
        );
      })}
    </div>
  );
}

function JanelaMetrica({ label, fat, lit, precoLitro, varFat, varLit, periodoTexto: pTexto, periodoAnteriorTexto, meses }) {
  const mediaFat = meses > 1 ? fat / meses : null;
  const mediaLit = meses > 1 ? lit / meses : null;
  return (
    <div style={{ minWidth: 175, flex: "1 1 175px" }}>
      <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>
        {label}{pTexto && <span style={{ textTransform: "none", color: "#555" }}> ({pTexto})</span>}
      </div>
      <div style={{ color: "#666", fontSize: 9, marginBottom: 2 }}>Total no período</div>
      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>
        {fmtMoeda(fat)}{mediaFat != null && <span style={{ color: "#888", fontSize: 10, fontWeight: 400 }}> ({fmtMoeda(mediaFat)} média/mês)</span>}
      </div>
      <BadgeTendencia variacao={varFat} formatador={fmtMoeda} periodoTexto={periodoAnteriorTexto ? `vs ${periodoAnteriorTexto}` : ""} />
      <div style={{ color: "#ddd", fontSize: 13, fontWeight: 700, marginTop: 6 }}>
        {fmtLitros(lit)}{mediaLit != null && <span style={{ color: "#888", fontSize: 10, fontWeight: 400 }}> ({fmtLitros(mediaLit)} média/mês)</span>}
      </div>
      <BadgeTendencia variacao={varLit} formatador={fmtLitros} periodoTexto={periodoAnteriorTexto ? `vs ${periodoAnteriorTexto}` : ""} />
      <div style={{ color: "#C69700", fontSize: 12, fontWeight: 700, marginTop: 6 }}>{fmtPrecoLitro(precoLitro)}</div>
    </div>
  );
}

function CardClienteDashboard({ posicao, nome, metricas }) {
  return (
    <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 10, padding: 16, marginBottom: 10 }}>
      <div style={{ color: "#C69700", fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
        #{posicao} · {nome}
      </div>
      <AvisoMesAndamento emAndamento={metricas.emAndamentoRow} rowsFechados={metricas.rowsFechados} />
      <div style={{ background: "rgba(74,144,217,0.06)", border: "1px solid rgba(74,144,217,0.22)", borderRadius: 10, padding: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
        {metricas.ultimoMesFechado && (
          <JanelaMetrica label={`Último mês fechado`} periodoTexto={metricas.ultimoMesFechado.mesTexto} meses={metricas.ultimoMesFechado.meses}
            fat={metricas.ultimoMesFechado.fat} lit={metricas.ultimoMesFechado.lit} precoLitro={metricas.ultimoMesFechado.precoLitro}
            varFat={metricas.ultimoMesFechado.varFat} varLit={metricas.ultimoMesFechado.varLit} periodoAnteriorTexto="mês anterior" />
        )}
        <JanelaMetrica label="Últimos 3 meses" periodoTexto={metricas.j3.periodoTexto} periodoAnteriorTexto={metricas.j3.periodoAnteriorTexto} meses={metricas.j3.meses}
          fat={metricas.j3.fat} lit={metricas.j3.lit} precoLitro={metricas.j3.precoLitro} varFat={metricas.j3.varFat} varLit={metricas.j3.varLit} />
        <JanelaMetrica label="Últimos 6 meses" periodoTexto={metricas.j6.periodoTexto} periodoAnteriorTexto={metricas.j6.periodoAnteriorTexto} meses={metricas.j6.meses}
          fat={metricas.j6.fat} lit={metricas.j6.lit} precoLitro={metricas.j6.precoLitro} varFat={metricas.j6.varFat} varLit={metricas.j6.varLit} />
        <JanelaMetrica label="Últimos 12 meses" periodoTexto={metricas.j12.periodoTexto} periodoAnteriorTexto={metricas.j12.periodoAnteriorTexto} meses={metricas.j12.meses}
          fat={metricas.j12.fat} lit={metricas.j12.lit} precoLitro={metricas.j12.precoLitro} varFat={metricas.j12.varFat} varLit={metricas.j12.varLit} />
      </div>

      {metricas.comparacaoAno && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #2a2a28" }}>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>vs mesmo período do ano anterior</div>
          <div style={{ background: "rgba(224,101,90,0.06)", border: "1px solid rgba(224,101,90,0.22)", borderRadius: 10, padding: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <JanelaMetrica label="Este mês" periodoTexto={metricas.comparacaoAno.m1.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m1.periodoAnteriorTexto} meses={metricas.comparacaoAno.m1.meses}
              fat={metricas.comparacaoAno.m1.fat} lit={metricas.comparacaoAno.m1.lit} precoLitro={metricas.comparacaoAno.m1.precoLitro} varFat={metricas.comparacaoAno.m1.varFat} varLit={metricas.comparacaoAno.m1.varLit} />
            <JanelaMetrica label="Últimos 3 meses" periodoTexto={metricas.comparacaoAno.m3.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m3.periodoAnteriorTexto} meses={metricas.comparacaoAno.m3.meses}
              fat={metricas.comparacaoAno.m3.fat} lit={metricas.comparacaoAno.m3.lit} precoLitro={metricas.comparacaoAno.m3.precoLitro} varFat={metricas.comparacaoAno.m3.varFat} varLit={metricas.comparacaoAno.m3.varLit} />
            <JanelaMetrica label="Últimos 6 meses" periodoTexto={metricas.comparacaoAno.m6.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m6.periodoAnteriorTexto} meses={metricas.comparacaoAno.m6.meses}
              fat={metricas.comparacaoAno.m6.fat} lit={metricas.comparacaoAno.m6.lit} precoLitro={metricas.comparacaoAno.m6.precoLitro} varFat={metricas.comparacaoAno.m6.varFat} varLit={metricas.comparacaoAno.m6.varLit} />
            <JanelaMetrica label="Últimos 12 meses" periodoTexto={metricas.comparacaoAno.m12.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m12.periodoAnteriorTexto} meses={metricas.comparacaoAno.m12.meses}
              fat={metricas.comparacaoAno.m12.fat} lit={metricas.comparacaoAno.m12.lit} precoLitro={metricas.comparacaoAno.m12.precoLitro} varFat={metricas.comparacaoAno.m12.varFat} varLit={metricas.comparacaoAno.m12.varLit} />
          </div>
        </div>
      )}
    </div>
  );
}

// Heatmap: linhas = grupos (+ "Sem grupo"), colunas = meses, cor da célula = crescimento/queda vs mês anterior
// Heatmap genérico (categoria x mês) - usado na aba Produtos, com "valor" já na unidade
// escolhida (R$ ou L), cor da célula por crescimento/queda vs o mês anterior na mesma linha.
// "2026-03" -> "2026-02" (mês anterior) / "2026-01" -> "2025-12" (vira ano)
function chaveMesAnterior(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  if (mes === 1) return `${ano - 1}-12`;
  return `${ano}-${String(mes - 1).padStart(2, "0")}`;
}
// "2026-03" -> "2025-03" (mesmo mês, ano anterior)
function chaveAnoAnterior(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return `${ano - 1}-${String(mes).padStart(2, "0")}`;
}
// quantos dias tem esse mês (considera ano bissexto certinho)
function diasNoMes(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

// linhas: [{ categoria, valores: [{periodo, valor}] }] - só as colunas visíveis (janela escolhida)
// dadosCompletos (opcional): { categoria: { chave: valor } } - histórico INTEIRO de cada categoria,
// usado pra calcular as comparações mesmo quando só 1 mês (ou uma janela curta) está sendo exibido.
// Sem dadosCompletos, cai pra buscar dentro da própria janela visível (funciona quando ela já
// cobre o histórico todo, como no heatmap de grupos do Dashboard).
function TabelaHeatmapCategoria({ linhas, rotuloColuna, unidade, dadosCompletos, colunasProjecao, mostrarMedia7d }) {
  function formatador(v) { return rotuloCompactoGeral(v, unidade); }
  const ehProjecao = periodo => colunasProjecao && colunasProjecao.has(periodo);

  function buscarValor(linha, chave) {
    if (dadosCompletos && dadosCompletos[linha.categoria]) {
      return dadosCompletos[linha.categoria][chave];
    }
    const item = linha.valores.find(v => v.periodo === chave);
    return item ? item.valor : undefined;
  }

  // soma de TODOS os produtos exibidos, chave a chave - usada pra linha de TOTAL no fim da
  // tabela (soma o histórico inteiro de cada produto, não só a janela visível, pra dar pra
  // comparar com mês/ano anterior direito mesmo com janela curta)
  const dadosCompletosTotal = useMemo(() => {
    const mapa = {};
    linhas.forEach(linha => {
      const porChave = (dadosCompletos && dadosCompletos[linha.categoria]) || {};
      Object.keys(porChave).forEach(chave => { mapa[chave] = (mapa[chave] || 0) + (porChave[chave] || 0); });
      if (!dadosCompletos) {
        linha.valores.forEach(v => { mapa[v.periodo] = (mapa[v.periodo] || 0) + (v.valor || 0); });
      }
    });
    return mapa;
  }, [linhas, dadosCompletos]);
  function buscarValorTotal(chave) {
    return Object.prototype.hasOwnProperty.call(dadosCompletosTotal, chave) ? dadosCompletosTotal[chave] : undefined;
  }

  // média diária estimada (total ÷ dias corridos dos meses envolvidos) × 7 - já que os dados
  // são mensais, não diários, isso é uma ESTIMATIVA assumindo distribuição uniforme no mês.
  function media7dEstimada(categoria, chaves) {
    let somaValor = 0, somaDias = 0;
    chaves.forEach(chave => {
      const valor = buscarValor({ categoria, valores: [] }, chave) || 0;
      somaValor += valor;
      somaDias += diasNoMes(chave);
    });
    if (!somaDias) return 0;
    return (somaValor / somaDias) * 7;
  }
  function media7dEstimadaTotal(chaves) {
    let somaValor = 0, somaDias = 0;
    chaves.forEach(chave => {
      somaValor += buscarValorTotal(chave) || 0;
      somaDias += diasNoMes(chave);
    });
    if (!somaDias) return 0;
    return (somaValor / somaDias) * 7;
  }

  function textoVariacao(rotulo, variacao) {
    if (!variacao) return "";
    const sinalPct = variacao.pct >= 0 ? "+" : "";
    const sinalDiff = variacao.diff >= 0 ? "+" : "";
    return `\n${rotulo}: ${sinalPct}${variacao.pct.toFixed(1)}% (${sinalDiff}${formatador(variacao.diff)})`;
  }

  // (removido: antes usava o último mês/3 meses de TODO o histórico, ignorando o período
  // selecionado - agora "último mês" e "últ. 3 meses" sempre olham pro que está na tela)

  return (
    <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 2 }}>{rotuloColuna}</th>
            {linhas[0]?.valores.map(v => (
              <th key={v.periodo} style={{ ...thStyle, color: ehProjecao(v.periodo) ? "#C69700" : "#fff", fontStyle: ehProjecao(v.periodo) ? "italic" : "normal" }}>
                {labelMes(v.periodo)}{ehProjecao(v.periodo) ? "*" : ""}
              </th>
            ))}
            <th style={{ ...thStyle, color: "#C69700", borderLeft: "2px solid #444" }}>Total</th>
            <th style={{ ...thStyle, color: "#C69700" }}>Média/mês</th>
            {mostrarMedia7d && (
              <>
                <th style={{ ...thStyle, color: "#4a90d9", borderLeft: "2px solid #444" }}>Média 7d (últ. mês)</th>
                <th style={{ ...thStyle, color: "#4a90d9" }}>Média 7d (últ. 3 meses)</th>
                <th style={{ ...thStyle, color: "#4a90d9" }}>Média 7d (período)</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => {
            const total = linha.valores.reduce((s, v) => s + (v.valor || 0), 0);
            const media = linha.valores.length ? total / linha.valores.length : 0;

            // média do MESMO período, 1 ano antes (ex: se a tabela mostra Mar-Jun/26, compara
            // com a média de Mar-Jun/25) - usa só os meses que realmente têm dado no ano anterior
            const valoresAnoAnteriorPeriodo = linha.valores
              .map(v => buscarValor(linha, chaveAnoAnterior(v.periodo)))
              .filter(v => v != null);
            const mediaAnoAnteriorPeriodo = valoresAnoAnteriorPeriodo.length
              ? valoresAnoAnteriorPeriodo.reduce((s, v) => s + v, 0) / valoresAnoAnteriorPeriodo.length
              : null;
            const variacaoMediaPeriodo = mediaAnoAnteriorPeriodo != null ? calcularVariacao(media, mediaAnoAnteriorPeriodo) : null;

            const chavesVisiveis = linha.valores.map(v => v.periodo);
            const ultimoPeriodoVisivel = chavesVisiveis[chavesVisiveis.length - 1];
            const chavesUltimos3Visiveis = chavesVisiveis.slice(-3);

            const media7dUltimoMes = mostrarMedia7d && ultimoPeriodoVisivel ? media7dEstimada(linha.categoria, [ultimoPeriodoVisivel]) : 0;
            const media7d3Meses = mostrarMedia7d ? media7dEstimada(linha.categoria, chavesUltimos3Visiveis) : 0;
            const media7dPeriodo = mostrarMedia7d ? media7dEstimada(linha.categoria, chavesVisiveis) : 0;

            return (
              <tr key={linha.categoria}>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "#1D1D1B", position: "sticky", left: 0 }}>{linha.categoria}</td>
                {linha.valores.map(v => {
                  const valor = v.valor || 0;

                  if (ehProjecao(v.periodo)) {
                    return (
                      <td key={v.periodo} title={`Projeção: ${formatador(valor)}`} style={{
                        ...tdStyle, background: "rgba(198,151,0,0.08)", border: "1px dashed rgba(198,151,0,0.4)",
                        color: "#C69700", fontStyle: "italic", cursor: "default",
                      }}>
                        {valor ? formatador(valor) : "-"}
                      </td>
                    );
                  }

                  const valorMesAnterior = buscarValor(linha, chaveMesAnterior(v.periodo));
                  const valorAnoAnterior = buscarValor(linha, chaveAnoAnterior(v.periodo));
                  const variacaoMes = valorMesAnterior != null ? calcularVariacao(valor, valorMesAnterior) : null;
                  const variacaoAno = valorAnoAnterior != null ? calcularVariacao(valor, valorAnoAnterior) : null;

                  const bg = variacaoMes ? classificarTendencia(variacaoMes.pct).corFundo : "transparent";
                  const tooltip = formatador(valor) + textoVariacao("vs mês anterior", variacaoMes) + textoVariacao("vs mesmo mês ano anterior", variacaoAno);

                  return (
                    <td key={v.periodo} title={tooltip} style={{ ...tdStyle, background: bg, cursor: "default" }}>
                      {valor ? formatador(valor) : "-"}<PctInline variacao={variacaoAno} />
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.04)", borderLeft: "2px solid #444" }}>{formatador(total)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#C69700", background: "rgba(198,151,0,0.06)" }}>
                  {formatador(media)}<PctInline variacao={variacaoMediaPeriodo} />
                </td>
                {mostrarMedia7d && (
                  <>
                    <td title="Estimativa: total do último mês visível na tela ÷ dias do mês × 7" style={{ ...tdStyle, fontWeight: 700, color: "#4a90d9", background: "rgba(74,144,217,0.06)", borderLeft: "2px solid #444", cursor: "default" }}>{formatador(media7dUltimoMes)}</td>
                    <td title="Estimativa: total dos últimos 3 meses visíveis na tela ÷ dias corridos × 7" style={{ ...tdStyle, fontWeight: 700, color: "#4a90d9", background: "rgba(74,144,217,0.06)", cursor: "default" }}>{formatador(media7d3Meses)}</td>
                    <td title="Estimativa: total do período selecionado na tabela ÷ dias corridos × 7" style={{ ...tdStyle, fontWeight: 700, color: "#4a90d9", background: "rgba(74,144,217,0.06)", cursor: "default" }}>{formatador(media7dPeriodo)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {(() => {
            const colunas = linhas[0]?.valores.map(v => v.periodo) || [];
            const totalGeral = colunas.reduce((s, chave) => s + (buscarValorTotal(chave) || 0), 0);
            const mediaGeral = colunas.length ? totalGeral / colunas.length : 0;

            const valoresAnoAnteriorTotal = colunas.map(c => buscarValorTotal(chaveAnoAnterior(c))).filter(v => v != null);
            const mediaAnoAnteriorTotal = valoresAnoAnteriorTotal.length
              ? valoresAnoAnteriorTotal.reduce((s, v) => s + v, 0) / valoresAnoAnteriorTotal.length
              : null;
            const variacaoMediaTotal = mediaAnoAnteriorTotal != null ? calcularVariacao(mediaGeral, mediaAnoAnteriorTotal) : null;

            const ultimaColuna = colunas[colunas.length - 1];
            const ultimas3Colunas = colunas.slice(-3);
            const media7dUltimoMesTotal = mostrarMedia7d && ultimaColuna ? media7dEstimadaTotal([ultimaColuna]) : 0;
            const media7d3MesesTotal = mostrarMedia7d ? media7dEstimadaTotal(ultimas3Colunas) : 0;
            const media7dPeriodoTotal = mostrarMedia7d ? media7dEstimadaTotal(colunas) : 0;

            return (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 800, color: "#fff", background: "#2a2a28", position: "sticky", left: 0, borderTop: "2px solid #444" }}>TOTAL</td>
                {colunas.map(chave => {
                  if (ehProjecao(chave)) {
                    const v = buscarValorTotal(chave) || 0;
                    return (
                      <td key={chave} title={`Projeção total: ${formatador(v)}`} style={{
                        ...tdStyle, fontWeight: 800, background: "rgba(198,151,0,0.14)", border: "1px dashed rgba(198,151,0,0.4)",
                        color: "#C69700", fontStyle: "italic", cursor: "default", borderTop: "2px solid #444",
                      }}>
                        {v ? formatador(v) : "-"}
                      </td>
                    );
                  }
                  const valor = buscarValorTotal(chave) || 0;
                  const valorMesAnterior = buscarValorTotal(chaveMesAnterior(chave));
                  const valorAnoAnterior = buscarValorTotal(chaveAnoAnterior(chave));
                  const variacaoMes = valorMesAnterior != null ? calcularVariacao(valor, valorMesAnterior) : null;
                  const variacaoAno = valorAnoAnterior != null ? calcularVariacao(valor, valorAnoAnterior) : null;
                  const bg = variacaoMes ? classificarTendencia(variacaoMes.pct).corFundo : "#2a2a28";
                  const tooltip = formatador(valor) + textoVariacao("vs mês anterior", variacaoMes) + textoVariacao("vs mesmo mês ano anterior", variacaoAno);
                  return (
                    <td key={chave} title={tooltip} style={{ ...tdStyle, fontWeight: 800, background: bg, cursor: "default", borderTop: "2px solid #444" }}>
                      {valor ? formatador(valor) : "-"}<PctInline variacao={variacaoAno} />
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,0.1)", borderLeft: "2px solid #444", borderTop: "2px solid #444" }}>{formatador(totalGeral)}</td>
                <td style={{ ...tdStyle, fontWeight: 800, color: "#C69700", background: "rgba(198,151,0,0.14)", borderTop: "2px solid #444" }}>
                  {formatador(mediaGeral)}<PctInline variacao={variacaoMediaTotal} />
                </td>
                {mostrarMedia7d && (
                  <>
                    <td style={{ ...tdStyle, fontWeight: 800, color: "#4a90d9", background: "rgba(74,144,217,0.14)", borderLeft: "2px solid #444", borderTop: "2px solid #444" }}>{formatador(media7dUltimoMesTotal)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800, color: "#4a90d9", background: "rgba(74,144,217,0.14)", borderTop: "2px solid #444" }}>{formatador(media7d3MesesTotal)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800, color: "#4a90d9", background: "rgba(74,144,217,0.14)", borderTop: "2px solid #444" }}>{formatador(media7dPeriodoTotal)}</td>
                  </>
                )}
              </tr>
            );
          })()}
        </tfoot>
      </table>
      {mostrarMedia7d && (
        <div style={{ color: "#666", fontSize: 11, padding: "8px 12px", borderTop: "1px solid #333" }}>
          "Média 7d" é uma estimativa (os dados são mensais, não diários): pega o total do período, divide pelos dias corridos e multiplica por 7 — assume venda distribuída igualmente ao longo do mês, não reflete picos reais de dia da semana.
        </div>
      )}
    </div>
  );
}

// Tabela de projeção, separada da tabela de dados reais (sem cor de variação/comparação,
// já que é estimativa) - mesmo formato {categoria, valores:[{periodo,valor}]}.
function TabelaProjecao({ linhas, rotuloColuna, unidade }) {
  function formatador(v) { return rotuloCompactoGeral(v, unidade); }
  return (
    <div style={{ overflowX: "auto", border: "1px dashed rgba(198,151,0,0.4)", borderRadius: 8, background: "rgba(198,151,0,0.04)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 2, background: "#1D1D1B" }}>{rotuloColuna}</th>
            {linhas[0]?.valores.map(v => (
              <th key={v.periodo} style={{ ...thStyle, color: "#C69700", fontStyle: "italic" }}>{labelMes(v.periodo)}*</th>
            ))}
            <th style={{ ...thStyle, color: "#C69700", borderLeft: "2px solid rgba(198,151,0,0.4)" }}>Total</th>
            <th style={{ ...thStyle, color: "#C69700" }}>Média/mês</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => {
            const totalBase = linha.valores.reduce((s, v) => s + (v.base || 0), 0);
            const totalMin = linha.valores.reduce((s, v) => s + (v.min || 0), 0);
            const totalMax = linha.valores.reduce((s, v) => s + (v.max || 0), 0);
            const n = linha.valores.length || 1;
            return (
              <tr key={linha.categoria}>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "#1D1D1B", position: "sticky", left: 0 }}>{linha.categoria}</td>
                {linha.valores.map(v => (
                  <td key={v.periodo} style={{ ...tdStyle, color: "#C69700", fontStyle: "italic" }}>
                    <div>{v.base ? formatador(v.base) : "-"}</div>
                    <div style={{ fontSize: 9, color: "#888", fontStyle: "normal", marginTop: 2 }}>
                      Mín {formatador(v.min)} · Máx {formatador(v.max)}
                    </div>
                  </td>
                ))}
                <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "rgba(198,151,0,0.12)", borderLeft: "2px solid rgba(198,151,0,0.4)" }}>
                  <div>{formatador(totalBase)}</div>
                  <div style={{ fontSize: 9, color: "#ccc", fontWeight: 400, marginTop: 2 }}>Mín {formatador(totalMin)} · Máx {formatador(totalMax)}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "rgba(198,151,0,0.12)" }}>
                  <div>{formatador(totalBase / n)}</div>
                  <div style={{ fontSize: 9, color: "#ccc", fontWeight: 400, marginTop: 2 }}>Mín {formatador(totalMin / n)} · Máx {formatador(totalMax / n)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {(() => {
            const colunas = linhas[0]?.valores.map(v => v.periodo) || [];
            const n = colunas.length || 1;
            let totalBaseGeral = 0, totalMinGeral = 0, totalMaxGeral = 0;
            linhas.forEach(linha => {
              totalBaseGeral += linha.valores.reduce((s, v) => s + (v.base || 0), 0);
              totalMinGeral += linha.valores.reduce((s, v) => s + (v.min || 0), 0);
              totalMaxGeral += linha.valores.reduce((s, v) => s + (v.max || 0), 0);
            });
            return (
              <tr>
                <td style={{ ...tdStyle, fontWeight: 800, color: "#fff", background: "#2a2a28", position: "sticky", left: 0, borderTop: "2px solid rgba(198,151,0,0.4)" }}>TOTAL</td>
                {colunas.map(chave => {
                  let base = 0, min = 0, max = 0;
                  linhas.forEach(linha => {
                    const v = linha.valores.find(x => x.periodo === chave);
                    if (v) { base += v.base || 0; min += v.min || 0; max += v.max || 0; }
                  });
                  return (
                    <td key={chave} style={{ ...tdStyle, fontWeight: 800, color: "#C69700", fontStyle: "italic", background: "rgba(198,151,0,0.14)", borderTop: "2px solid rgba(198,151,0,0.4)" }}>
                      <div>{base ? formatador(base) : "-"}</div>
                      <div style={{ fontSize: 9, color: "#ccc", fontWeight: 400, fontStyle: "normal", marginTop: 2 }}>Mín {formatador(min)} · Máx {formatador(max)}</div>
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontWeight: 800, color: "#fff", background: "rgba(198,151,0,0.2)", borderLeft: "2px solid rgba(198,151,0,0.4)", borderTop: "2px solid rgba(198,151,0,0.4)" }}>
                  <div>{formatador(totalBaseGeral)}</div>
                  <div style={{ fontSize: 9, color: "#ccc", fontWeight: 400, marginTop: 2 }}>Mín {formatador(totalMinGeral)} · Máx {formatador(totalMaxGeral)}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 800, color: "#fff", background: "rgba(198,151,0,0.2)", borderTop: "2px solid rgba(198,151,0,0.4)" }}>
                  <div>{formatador(totalBaseGeral / n)}</div>
                  <div style={{ fontSize: 9, color: "#ccc", fontWeight: 400, marginTop: 2 }}>Mín {formatador(totalMinGeral / n)} · Máx {formatador(totalMaxGeral / n)}</div>
                </td>
              </tr>
            );
          })()}
        </tfoot>
      </table>
    </div>
  );
}

function DashboardTab() {
  const { dados, nomes, grupos, clientesPorGrupo, periodos, labelDoCliente, dataCriacaoDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState(() => gruposPadrao(grupos));
  const [buscaCliente, setBuscaCliente] = useState("");
  const periodosFechados = periodos.filter(p => p !== chaveMesAtualReal());
  const [mesRefAno, setMesRefAno] = useState(() => periodosFechados[periodosFechados.length - 1] || "");
  const [inicioNovos, setInicioNovos] = useState(() => periodos.includes("2025-01") ? "2025-01" : (periodos[0] || ""));
  const [fimNovos, setFimNovos] = useState(() => periodosFechados[periodosFechados.length - 1] || "");

  // heatmap por grupo: período próprio, padrão nos últimos 3 meses
  const [inicioHeatmapGrupo, setInicioHeatmapGrupo] = useState(() => periodos[Math.max(0, periodos.length - 3)] || "");
  const [fimHeatmapGrupo, setFimHeatmapGrupo] = useState(() => periodos[periodos.length - 1] || "");

  // Top N: tamanho ajustável + período customizado opcional ("cresceu entre X e Y")
  const [tamanhoTopN, setTamanhoTopN] = useState(10);
  const [inicioTopN, setInicioTopN] = useState("");
  const [fimTopN, setFimTopN] = useState("");

  function toggleGrupoFiltro(g) {
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function marcarTodosGrupos() {
    setGruposSel([...grupos]);
  }
  function marcarPadraoGrupos() {
    setGruposSel(gruposPadrao(grupos));
  }
  function desmarcarTodosGrupos() {
    setGruposSel([]);
  }

  const clientesFiltrados = [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  const clientesComMetricas = useMemo(() => {
    return clientesFiltrados
      .map(nome => ({ nome, metricas: calcularMetricasCliente(dados[nome] || [], mesRefAno) }))
      .sort((a, b) => b.metricas.j12.fat - a.metricas.j12.fat)
      .map((c, idx) => ({ ...c, posicao: idx + 1 }));
  }, [clientesFiltrados, dados, mesRefAno]);

  const clientesExibidos = buscaCliente.trim()
    ? clientesComMetricas.filter(c => (labelDoCliente[c.nome] || "").toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientesComMetricas;

  // Top N maiores crescimentos e maiores quedas (faturamento e litros, vs mês anterior e vs mesmo mês ano anterior)
  const top10FatMesCresc = topN(clientesComMetricas, c => c.ultimoMesFechado?.varFat, tamanhoTopN, "desc");
  const top10FatMesQueda = topN(clientesComMetricas, c => c.ultimoMesFechado?.varFat, tamanhoTopN, "asc");
  const top10FatAnoCresc = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varFat, tamanhoTopN, "desc");
  const top10FatAnoQueda = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varFat, tamanhoTopN, "asc");
  const top10LitMesCresc = topN(clientesComMetricas, c => c.ultimoMesFechado?.varLit, tamanhoTopN, "desc");
  const top10LitMesQueda = topN(clientesComMetricas, c => c.ultimoMesFechado?.varLit, tamanhoTopN, "asc");
  const top10LitAnoCresc = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varLit, tamanhoTopN, "desc");
  const top10LitAnoQueda = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varLit, tamanhoTopN, "asc");

  // Top N num período customizado escolhido por você (ex: "cresceu entre Mar/25 e Jun/25")
  // compara o valor no mês final com o valor no mês inicial, direto.
  function valorNoMes(rows, chave, campo) {
    const row = (rows || []).find(r => r.chave === chave);
    return row ? row[campo] : null;
  }
  const clientesComVariacaoPeriodo = useMemo(() => {
    if (!inicioTopN || !fimTopN) return [];
    return clientesFiltrados.map(nome => {
      const rows = dados[nome] || [];
      const fatInicio = valorNoMes(rows, inicioTopN, "faturamento");
      const fatFim = valorNoMes(rows, fimTopN, "faturamento");
      const litInicio = valorNoMes(rows, inicioTopN, "litros");
      const litFim = valorNoMes(rows, fimTopN, "litros");
      return {
        nome,
        metricas: {
          varFatPeriodo: (fatInicio != null && fatFim != null) ? calcularVariacao(fatFim, fatInicio) : null,
          varLitPeriodo: (litInicio != null && litFim != null) ? calcularVariacao(litFim, litInicio) : null,
        },
      };
    });
  }, [clientesFiltrados, dados, inicioTopN, fimTopN]);

  const topFatPeriodoCresc = topN(clientesComVariacaoPeriodo, m => m.varFatPeriodo, tamanhoTopN, "desc");
  const topFatPeriodoQueda = topN(clientesComVariacaoPeriodo, m => m.varFatPeriodo, tamanhoTopN, "asc");
  const topLitPeriodoCresc = topN(clientesComVariacaoPeriodo, m => m.varLitPeriodo, tamanhoTopN, "desc");
  const topLitPeriodoQueda = topN(clientesComVariacaoPeriodo, m => m.varLitPeriodo, tamanhoTopN, "asc");

  // novos clientes cadastrados por mês, no período selecionado - respeita o filtro de grupo
  const novosClientesPorMes = useMemo(() => {
    if (!inicioNovos || !fimNovos) return [];
    const mesesRange = periodos.filter(p => p >= inicioNovos && p <= fimNovos);
    return mesesRange.map(mes => {
      const clientesDoMes = clientesFiltrados.filter(codigo => (dataCriacaoDoCliente[codigo] || "").slice(0, 7) === mes);
      return { mes, quantidade: clientesDoMes.length, clientes: clientesDoMes.map(c => labelDoCliente[c]) };
    });
  }, [inicioNovos, fimNovos, periodos, clientesFiltrados, dataCriacaoDoCliente, labelDoCliente]);

  const totalNovosClientes = novosClientesPorMes.reduce((s, m) => s + m.quantidade, 0);
  const temDataCriacao = Object.keys(dataCriacaoDoCliente).length > 0;
  const ultimoMesNovos = novosClientesPorMes[novosClientesPorMes.length - 1];

  const [metricaHeatmapGrupo, setMetricaHeatmapGrupo] = useState("faturamento"); // 'faturamento' | 'litros'

  const linhasHeatmap = useMemo(() => {
    const periodosHeatmap = (!inicioHeatmapGrupo || !fimHeatmapGrupo)
      ? periodos
      : periodos.filter(p => p >= inicioHeatmapGrupo && p <= fimHeatmapGrupo);
    const nomesComGrupo = new Set(grupos.flatMap(g => clientesPorGrupo[g] || []));
    const semGrupo = nomes.filter(n => !nomesComGrupo.has(n));
    const categorias = grupos.filter(g => gruposSel.includes(g));
    if (semGrupo.length) categorias.push("Sem grupo");

    return categorias.map(cat => {
      const clientesCat = cat === "Sem grupo" ? semGrupo : clientesPorGrupo[cat];
      const valores = periodosHeatmap.map(p => {
        let fat = 0, lit = 0;
        clientesCat.forEach(nome => {
          const row = (dados[nome] || []).find(r => r.chave === p);
          if (row) { fat += row.faturamento; lit += row.litros; }
        });
        return { periodo: p, valor: metricaHeatmapGrupo === "litros" ? lit : fat };
      });
      return { categoria: cat, valores };
    });
  }, [grupos, clientesPorGrupo, nomes, periodos, dados, metricaHeatmapGrupo, inicioHeatmapGrupo, fimHeatmapGrupo, gruposSel]);

  // histórico INTEIRO por grupo (todos os meses, não só a janela selecionada) - pra dar pra
  // comparar com mês/ano anterior mesmo quando a janela mostrada for curta
  const dadosCompletosHeatmapGrupo = useMemo(() => {
    const nomesComGrupo = new Set(grupos.flatMap(g => clientesPorGrupo[g] || []));
    const semGrupo = nomes.filter(n => !nomesComGrupo.has(n));
    const categorias = grupos.filter(g => gruposSel.includes(g));
    if (semGrupo.length) categorias.push("Sem grupo");

    const mapa = {};
    categorias.forEach(cat => {
      const clientesCat = cat === "Sem grupo" ? semGrupo : clientesPorGrupo[cat];
      const porChave = {};
      periodos.forEach(p => {
        let fat = 0, lit = 0;
        clientesCat.forEach(nome => {
          const row = (dados[nome] || []).find(r => r.chave === p);
          if (row) { fat += row.faturamento; lit += row.litros; }
        });
        porChave[p] = metricaHeatmapGrupo === "litros" ? lit : fat;
      });
      mapa[cat] = porChave;
    });
    return mapa;
  }, [grupos, clientesPorGrupo, nomes, periodos, dados, metricaHeatmapGrupo, gruposSel]);

  // gráfico do heatmap por grupo: por padrão mostra TODOS os grupos que estão na tabela acima;
  // null = "todos automaticamente" (segue a tabela se o filtro mudar), array = seleção manual
  const [gruposGraficoOverride, setGruposGraficoOverride] = useState(null);
  const categoriasDisponiveisGrafico = linhasHeatmap.map(l => l.categoria);
  const gruposNoGrafico = gruposGraficoOverride || categoriasDisponiveisGrafico;

  function toggleGrupoGrafico(cat) {
    setGruposGraficoOverride(prev => {
      const base = prev || categoriasDisponiveisGrafico;
      return base.includes(cat) ? base.filter(x => x !== cat) : [...base, cat];
    });
  }
  function marcarTodosGrafico() { setGruposGraficoOverride(null); }
  function desmarcarTodosGrafico() { setGruposGraficoOverride([]); }

  // modo "agrupado": junta vários grupos numa linha só do gráfico (soma), você cria quantos
  // agrupamentos quiser (ex: "Varejo total" juntando 1./1.2/1.3/1.4)
  const [modoGraficoHeatmap, setModoGraficoHeatmap] = useState("individual"); // 'individual' | 'agrupado'
  const [agrupamentosGrafico, setAgrupamentosGrafico] = useState([]);
  const proximoIdAgrupamentoRef = useRef(1);

  function adicionarAgrupamento() {
    const id = proximoIdAgrupamentoRef.current++;
    setAgrupamentosGrafico(prev => [...prev, { id, nome: `Agrupamento ${prev.length + 1}`, grupos: [] }]);
  }
  function removerAgrupamento(id) {
    setAgrupamentosGrafico(prev => prev.filter(a => a.id !== id));
  }
  function renomearAgrupamento(id, nome) {
    setAgrupamentosGrafico(prev => prev.map(a => a.id === id ? { ...a, nome } : a));
  }
  function toggleGrupoNoAgrupamento(id, grupoNome) {
    setAgrupamentosGrafico(prev => prev.map(a => {
      if (a.id !== id) return a;
      return { ...a, grupos: a.grupos.includes(grupoNome) ? a.grupos.filter(g => g !== grupoNome) : [...a.grupos, grupoNome] };
    }));
  }

  const dadosGraficoAgrupado = useMemo(() => {
    const colunas = linhasHeatmap[0]?.valores.map(v => v.periodo) || [];
    return colunas.map(periodo => {
      const linha = { mes: labelMes(periodo) };
      agrupamentosGrafico.forEach(ag => {
        let soma = 0, achou = false;
        ag.grupos.forEach(catNome => {
          const l = linhasHeatmap.find(x => x.categoria === catNome);
          const item = l ? l.valores.find(v => v.periodo === periodo) : null;
          if (item) { soma += item.valor || 0; achou = true; }
        });
        linha[`ag_${ag.id}`] = achou ? soma : null;
      });
      return linha;
    });
  }, [linhasHeatmap, agrupamentosGrafico]);

  const dadosGraficoHeatmap = useMemo(() => {
    const colunas = linhasHeatmap[0]?.valores.map(v => v.periodo) || [];
    return colunas.map(periodo => {
      const linha = { mes: labelMes(periodo) };
      linhasHeatmap.forEach(l => {
        if (gruposNoGrafico.includes(l.categoria)) {
          const item = l.valores.find(v => v.periodo === periodo);
          linha[l.categoria] = item ? item.valor : null;
        }
      });
      return linha;
    });
  }, [linhasHeatmap, gruposNoGrafico]);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Canais" gerar={() => {
          const unid = metricaHeatmapGrupo === "litros" ? "litros" : "R$";
          const abas = abasDeHeatmap("Grupos mês a mês", "Grupos - % vs ano ant", `Grupo (${unid})`, linhasHeatmap, dadosCompletosHeatmapGrupo);
          if (novosClientesPorMes.length) {
            abas.push({ nome: "Novos clientes", linhas: [["Mês", "Novos clientes (qtd)", "Nomes"], ...novosClientesPorMes.map(m => [labelMes(m.mes), m.quantidade, m.clientes.join("; ")])] });
          }
          const longa = [["Lista", "#", "Cliente", "Variação (%)", "Diferença"]];
          const add = (titulo, itens) => itens.forEach((it, i) => longa.push([titulo, i + 1, labelDoCliente[it.nome] || it.nome, pctX(it.variacao), nx(it.variacao.diff)]));
          add("Crescimento - Faturamento vs mês anterior", top10FatMesCresc);
          add("Crescimento - Faturamento vs mesmo mês ano anterior", top10FatAnoCresc);
          add("Crescimento - Litros vs mês anterior", top10LitMesCresc);
          add("Crescimento - Litros vs mesmo mês ano anterior", top10LitAnoCresc);
          add("Queda - Faturamento vs mês anterior", top10FatMesQueda);
          add("Queda - Faturamento vs mesmo mês ano anterior", top10FatAnoQueda);
          add("Queda - Litros vs mês anterior", top10LitMesQueda);
          add("Queda - Litros vs mesmo mês ano anterior", top10LitAnoQueda);
          if (inicioTopN && fimTopN) {
            const per = `${labelMes(inicioTopN)} a ${labelMes(fimTopN)}`;
            add(`Crescimento - Faturamento ${per}`, topFatPeriodoCresc);
            add(`Crescimento - Litros ${per}`, topLitPeriodoCresc);
            add(`Queda - Faturamento ${per}`, topFatPeriodoQueda);
            add(`Queda - Litros ${per}`, topLitPeriodoQueda);
          }
          abas.push({ nome: `Top ${tamanhoTopN}`, linhas: longa });
          const melhores = [["#", "Cliente",
            "Último mês - Fat. (R$)", "Último mês - Litros", "Último mês - Var. fat. vs mês ant. (%)", "Último mês - Var. litros vs mês ant. (%)",
            "Últ. 3 meses - Fat. (R$)", "Últ. 3 meses - Litros", "Últ. 3 meses - Var. fat. (%)", "Últ. 3 meses - Var. litros (%)",
            "Últ. 6 meses - Fat. (R$)", "Últ. 6 meses - Litros", "Últ. 6 meses - Var. fat. (%)", "Últ. 6 meses - Var. litros (%)",
            "Últ. 12 meses - Fat. (R$)", "Últ. 12 meses - Litros", "Últ. 12 meses - Var. fat. (%)", "Últ. 12 meses - Var. litros (%)",
            "Mês vs ano ant. - Var. fat. (%)", "Mês vs ano ant. - Var. litros (%)", "3 meses vs ano ant. - Var. fat. (%)", "3 meses vs ano ant. - Var. litros (%)",
            "6 meses vs ano ant. - Var. fat. (%)", "6 meses vs ano ant. - Var. litros (%)", "12 meses vs ano ant. - Var. fat. (%)", "12 meses vs ano ant. - Var. litros (%)"]];
          clientesExibidos.forEach(c => {
            const m = c.metricas, um = m.ultimoMesFechado, ca = m.comparacaoAno;
            melhores.push([c.posicao, labelDoCliente[c.nome],
              nx(um && um.fat), nx(um && um.lit), pctX(um && um.varFat), pctX(um && um.varLit),
              nx(m.j3.fat), nx(m.j3.lit), pctX(m.j3.varFat), pctX(m.j3.varLit),
              nx(m.j6.fat), nx(m.j6.lit), pctX(m.j6.varFat), pctX(m.j6.varLit),
              nx(m.j12.fat), nx(m.j12.lit), pctX(m.j12.varFat), pctX(m.j12.varLit),
              pctX(ca && ca.m1 && ca.m1.varFat), pctX(ca && ca.m1 && ca.m1.varLit), pctX(ca && ca.m3 && ca.m3.varFat), pctX(ca && ca.m3 && ca.m3.varLit),
              pctX(ca && ca.m6 && ca.m6.varFat), pctX(ca && ca.m6 && ca.m6.varLit), pctX(ca && ca.m12 && ca.m12.varFat), pctX(ca && ca.m12 && ca.m12.varLit)]);
          });
          abas.push({ nome: "Melhores clientes", linhas: melhores });
          return abas;
        }} />
        <BotaoImprimir label="Imprimir Canais" />
      </div>
      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Filtrar por grupo ({clientesFiltrados.length} clientes selecionados) — vale pra toda a aba:
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={marcarPadraoGrupos} style={chipBtnStyle}>Padrão (sem grupos pesados)</button>
          <button onClick={marcarTodosGrupos} style={chipBtnStyle}>Marcar todos</button>
          <button onClick={desmarcarTodosGrupos} style={chipBtnStyle}>Desmarcar todos</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupoFiltro(g)} />
              {g} ({clientesPorGrupo[g].length}){grupoEhPesado(g) ? " ⚠" : ""}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#141412", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
          <Search size={14} color="#C69700" />
          <input placeholder="Buscar um cliente específico dentro do ranking..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Mês de referência (comparação ano a ano):</span>
          <MonthPicker periodosDisponiveis={periodosFechados} valor={mesRefAno} onSelecionar={setMesRefAno} placeholder="Selecionar mês" />
        </div>
      </div>

      <Section title={`Comparação mês a mês por grupo · ${metricaHeatmapGrupo === "litros" ? "Litros" : "Faturamento"}`} icon={<AlertTriangle size={16} color="#C69700" />}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setMetricaHeatmapGrupo("faturamento")} style={modoBtnStyle(metricaHeatmapGrupo === "faturamento", "#02601D")}>
            <TrendingUp size={13} /> Faturamento
          </button>
          <button onClick={() => setMetricaHeatmapGrupo("litros")} style={modoBtnStyle(metricaHeatmapGrupo === "litros", "#C69700")}>
            <Droplets size={13} /> Litros
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <span style={{ color: "#888", fontSize: 12 }}>Período (padrão: últimos 3 meses):</span>
          <MonthPicker periodosDisponiveis={periodos} valor={inicioHeatmapGrupo} onSelecionar={setInicioHeatmapGrupo} placeholder="Início" />
          <span style={{ color: "#666" }}>até</span>
          <MonthPicker periodosDisponiveis={periodos} valor={fimHeatmapGrupo} onSelecionar={setFimHeatmapGrupo} placeholder="Fim" />
        </div>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 acima de +10% · 🟡 0% a +10% · 🟠 0% a -10% · 🔴 abaixo de -10% (cor de fundo = vs mês anterior). O % entre parênteses ao lado de cada
          valor (mês a mês e na Média/mês) compara com o mesmo mês/período do ano anterior. Passe o mouse numa célula pra ver a diferença em número
          também. A última coluna pode ser um mês ainda em andamento — compare com cautela. Só mostra os grupos marcados no filtro lá em cima.
        </div>
        <TabelaHeatmapCategoria linhas={linhasHeatmap} rotuloColuna="Grupo" unidade={metricaHeatmapGrupo === "litros" ? "L" : undefined} dadosCompletos={dadosCompletosHeatmapGrupo} />

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setModoGraficoHeatmap("individual")} style={modoBtnStyle(modoGraficoHeatmap === "individual", "#4a90d9")}>
              Grupos individuais
            </button>
            <button onClick={() => setModoGraficoHeatmap("agrupado")} style={modoBtnStyle(modoGraficoHeatmap === "agrupado", "#4a90d9")}>
              Agrupar grupos
            </button>
          </div>

          {modoGraficoHeatmap === "individual" ? (
            <>
              <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                <Layers size={13} /> Grupos no gráfico ({gruposNoGrafico.length} de {categoriasDisponiveisGrafico.length}):
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={marcarTodosGrafico} style={chipBtnStyle}>Mostrar todos automaticamente</button>
                <button onClick={desmarcarTodosGrafico} style={chipBtnStyle}>Desmarcar todos</button>
              </div>
              <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {categoriasDisponiveisGrafico.map(cat => (
                  <label key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", cursor: "pointer" }}>
                    <input type="checkbox" checked={gruposNoGrafico.includes(cat)} onChange={() => toggleGrupoGrafico(cat)} />
                    {cat}
                  </label>
                ))}
              </div>

              {gruposNoGrafico.length === 0 ? (
                <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
                  Marque pelo menos um grupo pra ver o gráfico.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dadosGraficoHeatmap}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => rotuloCompactoGeral(v, metricaHeatmapGrupo === "litros" ? "L" : undefined)} />
                    <Tooltip formatter={v => v == null ? "-" : rotuloCompactoGeral(v, metricaHeatmapGrupo === "litros" ? "L" : undefined)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                    <Legend content={<LegendaBranca />} />
                    {gruposNoGrafico.map((cat, idx) => (
                      <Line key={cat} type="monotone" dataKey={cat} name={cat} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </>
          ) : (
            <>
              <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ color: "#888", fontSize: 12 }}>
                  Cada agrupamento soma os grupos marcados nele (ex: "Varejo total" juntando 1., 1.2, 1.3 e 1.4) e vira uma linha só no gráfico.
                </span>
                <button onClick={adicionarAgrupamento} style={chipBtnStyle}>+ Novo agrupamento</button>
              </div>

              {agrupamentosGrafico.length > 0 && (
                <div className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  {agrupamentosGrafico.map((ag, idx) => (
                    <AgrupamentoGraficoCard key={ag.id} agrupamento={ag} opcoes={categoriasDisponiveisGrafico} cor={corDoAno(idx)}
                      onRenomear={nome => renomearAgrupamento(ag.id, nome)}
                      onToggleGrupo={grupoNome => toggleGrupoNoAgrupamento(ag.id, grupoNome)}
                      onRemover={() => removerAgrupamento(ag.id)} />
                  ))}
                </div>
              )}

              {agrupamentosGrafico.length === 0 ? (
                <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
                  Clique em "+ Novo agrupamento" pra começar (ex: juntar todos os grupos de Varejo numa linha só).
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dadosGraficoAgrupado}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => rotuloCompactoGeral(v, metricaHeatmapGrupo === "litros" ? "L" : undefined)} />
                    <Tooltip formatter={v => v == null ? "-" : rotuloCompactoGeral(v, metricaHeatmapGrupo === "litros" ? "L" : undefined)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                    <Legend content={<LegendaBranca />} />
                    {agrupamentosGrafico.map((ag, idx) => (
                      <Line key={ag.id} type="monotone" dataKey={`ag_${ag.id}`} name={ag.nome} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </>
          )}
        </div>
      </Section>

      {temDataCriacao && (
        <Section title="Novos Clientes" icon={<Users size={18} color="#C69700" />}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Período:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioNovos} onSelecionar={setInicioNovos} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimNovos} onSelecionar={setFimNovos} placeholder="Fim" />
          </div>

          <StatCard label={`Total novos clientes (${periodoTexto(novosClientesPorMes.map(m => ({ chave: m.mes })))})`} value={String(totalNovosClientes)} icon={<Users size={14} />} />

          <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8, marginTop: 16 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Mês</th>
                  {novosClientesPorMes.map(m => <th key={m.mes} style={thStyle}>{labelMes(m.mes)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>Novos clientes</td>
                  {novosClientesPorMes.map(m => (
                    <td key={m.mes} style={{ ...tdStyle, fontWeight: m.quantidade > 0 ? 700 : 400, color: m.quantidade > 0 ? "#4caf6b" : "#666" }}>
                      {m.quantidade}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {ultimoMesNovos && ultimoMesNovos.clientes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Nomes dos novos clientes em {labelMes(ultimoMesNovos.mes)} ({ultimoMesNovos.clientes.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 14 }}>
                {ultimoMesNovos.clientes.map((nomeCliente, idx) => (
                  <div key={idx} style={{ color: "#fff", fontSize: 13, minWidth: 200 }}>{nomeCliente}</div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      <Section title="Top N · Maiores Crescimentos e Quedas" icon={<GitCompareArrows size={18} color="#4a90d9" />}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ color: "#888", fontSize: 12 }}>Tamanho do Top:</span>
          <select value={tamanhoTopN} onChange={e => setTamanhoTopN(Number(e.target.value))} style={selectStyle}>
            {[10, 20, 30, 50, 100, 200, 300].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>

        <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
            Período customizado (opcional) — ex: "quem mais cresceu entre Mar/25 e Jun/25": compara o valor do mês final com o valor do mês inicial.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioTopN} onSelecionar={setInicioTopN} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimTopN} onSelecionar={setFimTopN} placeholder="Fim" />
            {(inicioTopN || fimTopN) && (
              <button onClick={() => { setInicioTopN(""); setFimTopN(""); }} style={chipBtnStyle}>Limpar período</button>
            )}
          </div>
        </div>

        {inicioTopN && fimTopN && (
          <>
            <div style={{ color: "#4caf6b", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              Maiores crescimentos entre {labelMes(inicioTopN)} e {labelMes(fimTopN)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <ListaTop10 titulo={`Faturamento (${labelMes(inicioTopN)} → ${labelMes(fimTopN)})`} itens={topFatPeriodoCresc} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
              <ListaTop10 titulo={`Litros (${labelMes(inicioTopN)} → ${labelMes(fimTopN)})`} itens={topLitPeriodoCresc} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
            </div>
            <div style={{ color: "#e0645a", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              Maiores quedas entre {labelMes(inicioTopN)} e {labelMes(fimTopN)}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <ListaTop10 titulo={`Faturamento (${labelMes(inicioTopN)} → ${labelMes(fimTopN)})`} itens={topFatPeriodoQueda} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
              <ListaTop10 titulo={`Litros (${labelMes(inicioTopN)} → ${labelMes(fimTopN)})`} itens={topLitPeriodoQueda} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
            </div>
          </>
        )}

        <div style={{ color: "#4caf6b", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Maiores crescimentos</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <ListaTop10 titulo="Faturamento vs mês anterior" itens={top10FatMesCresc} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Faturamento vs mesmo mês ano anterior" itens={top10FatAnoCresc} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mês anterior" itens={top10LitMesCresc} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mesmo mês ano anterior" itens={top10LitAnoCresc} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
        </div>

        <div style={{ color: "#e0645a", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Maiores quedas</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ListaTop10 titulo="Faturamento vs mês anterior" itens={top10FatMesQueda} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Faturamento vs mesmo mês ano anterior" itens={top10FatAnoQueda} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mês anterior" itens={top10LitMesQueda} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mesmo mês ano anterior" itens={top10LitAnoQueda} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
        </div>
      </Section>

      <Section title={`Melhores Clientes (${clientesExibidos.length} de ${clientesComMetricas.length})`} icon={<Trophy size={18} color="#C69700" />}>
        {clientesComMetricas.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
            Selecione ao menos um grupo, ou clique em "Marcar todos".
          </div>
        )}
        {clientesComMetricas.length > 0 && clientesExibidos.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
            Nenhum cliente encontrado com esse nome no filtro atual.
          </div>
        )}
        {clientesExibidos.map(c => (
          <CardClienteDashboard key={c.nome} posicao={c.posicao} nome={labelDoCliente[c.nome]} metricas={c.metricas} />
        ))}
      </Section>
    </div>
  );
}

function GlobalTab() {
  const { dados, nomes, periodos, grupos, clientesPorGrupo, dataCriacaoDoCliente } = useData();

  // agrega todos os clientes num "cliente virtual" - a empresa toda, mês a mês
  const rowsGlobais = useMemo(() => {
    return periodos.map(chave => {
      const [ano, mes] = chave.split("-").map(Number);
      let faturamento = 0, litros = 0;
      nomes.forEach(codigo => {
        const row = (dados[codigo] || []).find(r => r.chave === chave);
        if (row) { faturamento += row.faturamento; litros += row.litros; }
      });
      return { ano, mes, chave, faturamento, litros };
    });
  }, [dados, nomes, periodos]);

  const { fechados: rowsFechadas, emAndamento } = useMemo(() => separarMesEmAndamento(rowsGlobais), [rowsGlobais]);

  const ultimos3 = rowsFechadas.slice(-3);
  const ultimos6 = rowsFechadas.slice(-6);
  const ultimos12 = rowsFechadas.slice(-12);

  const [mesRefAno, setMesRefAno] = useState(() => rowsFechadas.length ? rowsFechadas[rowsFechadas.length - 1].chave : "");

  // usa TODOS os meses (inclusive o em andamento) pra dar pra escolher o mês corrente como
  // referência - a comparação avisa quando a janela inclui o mês parcial
  const janelasAno = useMemo(() => {
    if (!rowsGlobais.length || !mesRefAno) return null;
    return {
      m1: janelaAnoAnterior(rowsGlobais, mesRefAno, 1),
      m3: janelaAnoAnterior(rowsGlobais, mesRefAno, 3),
      m6: janelaAnoAnterior(rowsGlobais, mesRefAno, 6),
      m12: janelaAnoAnterior(rowsGlobais, mesRefAno, 12),
    };
  }, [rowsGlobais, mesRefAno]);

  const mediasPorAno = useMemo(() => {
    if (!rowsFechadas.length) return [];
    const anos = [...new Set(rowsFechadas.map(r => r.ano))].sort((a, b) => a - b);
    return anos.map((ano, idx) => {
      const rowsDoAno = rowsFechadas.filter(r => r.ano === ano);
      const rowsAnoAnterior = idx > 0 ? rowsFechadas.filter(r => r.ano === anos[idx - 1]) : [];
      const mediaFatAno = media(rowsDoAno, "faturamento");
      const mediaLitAno = media(rowsDoAno, "litros");
      // comparação justa: só os meses que existem nos DOIS anos. Ex: 2026 com Jan-Ago fechados
      // compara só com Jan-Ago/2025 (e não com a média do 2025 inteiro, que mistura a sazonalidade
      // de Nov/Dez com meses que ainda nem aconteceram em 2026)
      const mesesAtual = new Set(rowsDoAno.map(r => r.mes));
      const mesesAnt = new Set(rowsAnoAnterior.map(r => r.mes));
      const rowsAtualComparavel = rowsDoAno.filter(r => mesesAnt.has(r.mes));
      const rowsAnoAnteriorMesmoPeriodo = rowsAnoAnterior.filter(r => mesesAtual.has(r.mes));
      const temComparacao = rowsAtualComparavel.length > 0 && rowsAnoAnteriorMesmoPeriodo.length > 0;
      return {
        ano, meses: rowsDoAno.length, rowsDoAno, rowsAnoAnterior, rowsAnoAnteriorMesmoPeriodo, rowsAtualComparavel,
        totalFat: soma(rowsDoAno, "faturamento"), totalLit: soma(rowsDoAno, "litros"),
        mediaFat: mediaFatAno, mediaLit: mediaLitAno,
        variacaoFat: temComparacao ? calcularVariacao(media(rowsAtualComparavel, "faturamento"), media(rowsAnoAnteriorMesmoPeriodo, "faturamento")) : null,
        variacaoLit: temComparacao ? calcularVariacao(media(rowsAtualComparavel, "litros"), media(rowsAnoAnteriorMesmoPeriodo, "litros")) : null,
      };
    });
  }, [rowsFechadas]);

  // clientes ativos no último mês fechado (faturaram ou tiraram litros)
  const ultimoMesFechado = rowsFechadas[rowsFechadas.length - 1];
  const clientesAtivos = useMemo(() => {
    if (!ultimoMesFechado) return 0;
    return nomes.filter(codigo => {
      const row = (dados[codigo] || []).find(r => r.chave === ultimoMesFechado.chave);
      return row && (row.faturamento > 0 || row.litros > 0);
    }).length;
  }, [nomes, dados, ultimoMesFechado]);

  const novosClientes12m = useMemo(() => {
    if (!Object.keys(dataCriacaoDoCliente).length) return null;
    const chaves12 = ultimos12.map(r => r.chave);
    return nomes.filter(codigo => chaves12.includes((dataCriacaoDoCliente[codigo] || "").slice(0, 7))).length;
  }, [nomes, dataCriacaoDoCliente, ultimos12]);

  // faturamento por grupo, últimos 12 meses fechados
  const fatPorGrupo = useMemo(() => {
    const chaves12 = new Set(ultimos12.map(r => r.chave));
    return grupos.map(g => {
      let total = 0;
      (clientesPorGrupo[g] || []).forEach(codigo => {
        (dados[codigo] || []).forEach(r => { if (chaves12.has(r.chave)) total += r.faturamento; });
      });
      return { grupo: g, total };
    }).sort((a, b) => b.total - a.total);
  }, [grupos, clientesPorGrupo, dados, ultimos12]);

  const seriesFat = construirSeriesPorAno(rowsGlobais, "faturamento");
  const seriesLit = construirSeriesPorAno(rowsGlobais, "litros");
  const variacaoFatPorAnoGlobal = Object.fromEntries(mediasPorAno.map(m => [m.ano, m.variacaoFat]));
  const variacaoLitPorAnoGlobal = Object.fromEntries(mediasPorAno.map(m => [m.ano, m.variacaoLit]));
  const chartGrupo = fatPorGrupo.map(g => ({ grupo: g.grupo, Faturamento: g.total }));

  const precoLitroGeral12m = precoMedioLitro(soma(ultimos12, "faturamento"), soma(ultimos12, "litros"));

  // projeção dos meses restantes do ano corrente (parcial), baseada nos mesmos meses do ano anterior x %
  const [pctProjecao, setPctProjecao] = useState(100);
  const projecaoAnoParcial = useMemo(() => {
    if (!mediasPorAno.length) return null;
    const ultimoAno = mediasPorAno[mediasPorAno.length - 1];
    if (ultimoAno.meses >= 12) return null;
    let fat = 0, lit = 0, meses = 0;
    for (let m = ultimoAno.meses + 1; m <= 12; m++) {
      const rowAnoAnterior = rowsFechadas.find(r => r.ano === ultimoAno.ano - 1 && r.mes === m);
      if (rowAnoAnterior) {
        fat += rowAnoAnterior.faturamento * (pctProjecao / 100);
        lit += rowAnoAnterior.litros * (pctProjecao / 100);
        meses++;
      }
    }
    return { ano: ultimoAno.ano, fat, lit, meses, pct: pctProjecao };
  }, [mediasPorAno, rowsFechadas, pctProjecao]);

  // gráficos de pizza: faturamento/litros por grupo, com período e grupos selecionáveis
  const [gruposSelPizza, setGruposSelPizza] = useState(() => gruposPadrao(grupos));
  const [inicioPizza, setInicioPizza] = useState(() => ultimos12[0]?.chave || "");
  const [fimPizza, setFimPizza] = useState(() => ultimos12[ultimos12.length - 1]?.chave || "");

  function toggleGrupoPizza(g) {
    setGruposSelPizza(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function marcarPadraoPizza() {
    setGruposSelPizza(gruposPadrao(grupos));
  }
  function marcarTodosPizza() {
    setGruposSelPizza([...grupos]);
  }
  function desmarcarTodosPizza() {
    setGruposSelPizza([]);
  }

  const dadosPizza = useMemo(() => {
    if (!inicioPizza || !fimPizza) return [];
    const chaves = new Set(periodos.filter(p => p >= inicioPizza && p <= fimPizza));
    return gruposSelPizza.map(g => {
      let fat = 0, lit = 0;
      (clientesPorGrupo[g] || []).forEach(codigo => {
        (dados[codigo] || []).forEach(r => { if (chaves.has(r.chave)) { fat += r.faturamento; lit += r.litros; } });
      });
      return { grupo: g, fat, lit };
    }).filter(d => d.fat > 0 || d.lit > 0);
  }, [gruposSelPizza, inicioPizza, fimPizza, periodos, clientesPorGrupo, dados]);

  const totalFatPizza = dadosPizza.reduce((s, d) => s + d.fat, 0);
  const totalLitPizza = dadosPizza.reduce((s, d) => s + d.lit, 0);

  // comparativo dos cards de topo vs mesmo período do ano passado (usa a mesma janela de
  // 12 meses ancorada no mês de referência, já calculada em janelasAno.m12)
  const anoAnterior12 = janelasAno ? janelasAno.m12.anoAnterior : [];
  const variacaoFat12 = anoAnterior12.length ? calcularVariacao(soma(ultimos12, "faturamento"), soma(anoAnterior12, "faturamento")) : null;
  const variacaoLit12 = anoAnterior12.length ? calcularVariacao(soma(ultimos12, "litros"), soma(anoAnterior12, "litros")) : null;
  const precoLitroAnoAnterior12 = anoAnterior12.length ? precoMedioLitro(soma(anoAnterior12, "faturamento"), soma(anoAnterior12, "litros")) : null;
  const variacaoPrecoLitro12 = precoLitroAnoAnterior12 != null ? calcularVariacao(precoLitroGeral12m, precoLitroAnoAnterior12) : null;

  const mesmoMesAnoPassado = ultimoMesFechado ? rowsFechadas.find(r => r.ano === ultimoMesFechado.ano - 1 && r.mes === ultimoMesFechado.mes) : null;
  const clientesAtivosAnoPassado = useMemo(() => {
    if (!mesmoMesAnoPassado) return null;
    return nomes.filter(codigo => {
      const row = (dados[codigo] || []).find(r => r.chave === mesmoMesAnoPassado.chave);
      return row && (row.faturamento > 0 || row.litros > 0);
    }).length;
  }, [nomes, dados, mesmoMesAnoPassado]);
  const variacaoClientesAtivos = clientesAtivosAnoPassado != null ? calcularVariacao(clientesAtivos, clientesAtivosAnoPassado) : null;

  const chaveAnoPassadoRef = mesmoMesAnoPassado ? mesmoMesAnoPassado.chave : null;
  const totalClientesAnoPassado = useMemo(() => {
    if (!chaveAnoPassadoRef) return null;
    return nomes.filter(codigo => (dados[codigo] || []).some(r => r.chave <= chaveAnoPassadoRef)).length;
  }, [nomes, dados, chaveAnoPassadoRef]);
  const variacaoTotalClientes = totalClientesAnoPassado != null ? calcularVariacao(nomes.length, totalClientesAnoPassado) : null;

  const novosClientesAnoPassado12m = useMemo(() => {
    if (!Object.keys(dataCriacaoDoCliente).length || !anoAnterior12.length) return null;
    const chaves = anoAnterior12.map(r => r.chave);
    return nomes.filter(codigo => chaves.includes((dataCriacaoDoCliente[codigo] || "").slice(0, 7))).length;
  }, [nomes, dataCriacaoDoCliente, anoAnterior12]);
  const variacaoNovosClientes = (novosClientes12m != null && novosClientesAnoPassado12m != null) ? calcularVariacao(novosClientes12m, novosClientesAnoPassado12m) : null;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Global" gerar={() => {
          const resumo = [["Indicador", "Valor", "Var. vs ano anterior (%)"],
            ["Faturamento (12 meses) (R$)", nx(soma(ultimos12, "faturamento")), pctX(variacaoFat12)],
            ["Litros (12 meses)", nx(soma(ultimos12, "litros")), pctX(variacaoLit12)],
            ["Preço médio geral (R$/L) (12 meses)", nx(precoLitroGeral12m), pctX(variacaoPrecoLitro12)],
            ["Clientes ativos (último mês fechado)", clientesAtivos, pctX(variacaoClientesAtivos)],
            ["Total de clientes cadastrados", nomes.length, pctX(variacaoTotalClientes)],
            ["Novos clientes (12 meses)", novosClientes12m == null ? "" : novosClientes12m, pctX(variacaoNovosClientes)]];
          const anual = [["Ano", "Meses fechados", "Faturamento total (R$)", "Litros total", "Média fat./mês (R$)", "Média litros/mês",
            "Var. média fat. vs ano ant. (%)", "Var. média litros vs ano ant. (%)", "Preço médio (R$/L)",
            "Período do ano ant. comparado", "Fat. total no período ano ant. (R$)", "Fat. média/mês no período ano ant. (R$)", "Litros total no período ano ant.", "Litros média/mês no período ano ant."],
            ...mediasPorAno.map(m => [m.ano, m.meses, nx(m.totalFat), nx(m.totalLit), nx(m.mediaFat), nx(m.mediaLit), pctX(m.variacaoFat), pctX(m.variacaoLit), m.totalLit ? nx(m.totalFat / m.totalLit) : "",
              ...(m.rowsAnoAnteriorMesmoPeriodo && m.rowsAnoAnteriorMesmoPeriodo.length
                ? [periodoTexto(m.rowsAnoAnteriorMesmoPeriodo), nx(soma(m.rowsAnoAnteriorMesmoPeriodo, "faturamento")), nx(media(m.rowsAnoAnteriorMesmoPeriodo, "faturamento")), nx(soma(m.rowsAnoAnteriorMesmoPeriodo, "litros")), nx(media(m.rowsAnoAnteriorMesmoPeriodo, "litros"))]
                : ["", "", "", "", ""])])];
          const tri = [["Ano", "Trimestre", "Meses fechados", "Litros", "Média litros/mês", "% do ano (litros)", "Var. litros vs mesmo tri. ano ant. (%)",
            "Faturamento (R$)", "Média fat./mês (R$)", "% do ano (fat.)", "Var. fat. vs mesmo tri. ano ant. (%)"]];
          mediasPorAno.forEach(m => calcularTrimestres(m.rowsDoAno, m.rowsAnoAnterior, m.totalFat, m.totalLit).forEach(t =>
            tri.push([m.ano, `${t.nome} (${t.label})`, t.mesesFechados, nx(t.totalLit), nx(t.mediaLit), nx(t.pctLit), pctX(t.variacaoLit), nx(t.totalFat), nx(t.mediaFat), nx(t.pctFat), pctX(t.variacaoFat)])));
          // comparação ano a ano (mês de referência escolhido): total e média/mês, atual vs ano anterior
          const comp = [[`Mês de referência: ${mesRefAno ? labelMes(mesRefAno) : ""}`], [],
            ["Métrica", "Janela", "Período atual", "Total atual", "Média/mês atual", "Período ano anterior", "Total ano anterior", "Média/mês ano anterior", "Var. total (%)", "Var. média/mês (%)"]];
          const compMes = [["Métrica", "Janela", "Mês", "Atual", "Ano anterior", "Var. (%)"]];
          if (janelasAno) {
            [["Faturamento (R$)", "faturamento"], ["Litros", "litros"]].forEach(([nome, campo]) => {
              [["Último mês", "m1"], ["Últimos 3 meses", "m3"], ["Últimos 6 meses", "m6"], ["Últimos 12 meses", "m12"]].forEach(([jn, k]) => {
                const j = janelasAno[k];
                const ta = soma(j.atual, campo), ma = media(j.atual, campo);
                const tem = j.anoAnterior.length > 0;
                const tp = tem ? soma(j.anoAnterior, campo) : null, mp = tem ? media(j.anoAnterior, campo) : null;
                comp.push([nome, jn, periodoTexto(j.atual), nx(ta), nx(ma), periodoTexto(j.anoAnterior), nx(tp), nx(mp),
                  tem ? pctX(calcularVariacao(ta, tp)) : "", tem ? pctX(calcularVariacao(ma, mp)) : ""]);
                j.atual.forEach(r => {
                  const ant = j.anoAnterior.find(x => x.mes === r.mes);
                  compMes.push([nome, jn, labelMes(r.chave) + (emAndamento && r.chave === emAndamento.chave ? " (parcial)" : ""),
                    nx(r[campo]), ant ? nx(ant[campo]) : "", ant ? pctX(calcularVariacao(r[campo], ant[campo])) : ""]);
                });
              });
            });
          }
          const evol = ser => [["Mês", ...ser.anos.map(String)], ...ser.dados.map(d => [d.mes, ...ser.anos.map(a => nx(d[a]))])];
          const porGrupo = [[`Período: ${inicioPizza ? labelMes(inicioPizza) : ""} a ${fimPizza ? labelMes(fimPizza) : ""}`], [],
            ["Grupo", "Faturamento (R$)", "Litros", "% do faturamento", "% dos litros"],
            ...dadosPizza.map(d => [d.grupo, nx(d.fat), nx(d.lit), totalFatPizza ? nx(d.fat / totalFatPizza * 100) : "", totalLitPizza ? nx(d.lit / totalLitPizza * 100) : ""])];
          return [{ nome: "Resumo 12 meses", linhas: resumo }, { nome: "Anual", linhas: anual }, { nome: "Trimestres", linhas: tri },
            { nome: "Comparação ano a ano", linhas: comp }, { nome: "Comparação mês a mês", linhas: compMes },
            { nome: "Evolução mensal - Fat.", linhas: evol(seriesFat) }, { nome: "Evolução mensal - Litros", linhas: evol(seriesLit) },
            { nome: "Por grupo", linhas: porGrupo }];
        }} />
        <BotaoImprimir label="Imprimir Global" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Faturamento (12 meses)" value={fmtMoeda(soma(ultimos12, "faturamento"))} icon={<TrendingUp size={14} />}
          badge={<BadgeTendencia variacao={variacaoFat12} formatador={fmtMoeda} periodoTexto="vs mesmos 12 meses ano passado" />} />
        <StatCard label="Litros (12 meses)" value={fmtLitros(soma(ultimos12, "litros"))} icon={<Droplets size={14} />}
          badge={<BadgeTendencia variacao={variacaoLit12} formatador={fmtLitros} periodoTexto="vs mesmos 12 meses ano passado" />} />
        <StatCard label="Preço médio geral/L (12 meses)" value={fmtPrecoLitro(precoLitroGeral12m)} icon={<Droplets size={14} />}
          badge={<BadgeTendencia variacao={variacaoPrecoLitro12} formatador={fmtPrecoLitro} periodoTexto="vs mesmos 12 meses ano passado" />} />
        <StatCard label={`Clientes ativos (${ultimoMesFechado ? labelMes(ultimoMesFechado.chave) : "-"})`} value={String(clientesAtivos)} icon={<Users size={14} />}
          badge={<BadgeTendencia variacao={variacaoClientesAtivos} formatador={v => String(Math.round(v))} periodoTexto={mesmoMesAnoPassado ? `vs ${labelMes(mesmoMesAnoPassado.chave)}` : ""} />} />
        <StatCard label="Total de clientes cadastrados" value={String(nomes.length)} icon={<Users size={14} />}
          badge={<BadgeTendencia variacao={variacaoTotalClientes} formatador={v => String(Math.round(v))} periodoTexto={mesmoMesAnoPassado ? `vs ${labelMes(mesmoMesAnoPassado.chave)}` : ""} />} />
        {novosClientes12m != null && (
          <StatCard label="Novos clientes (12 meses)" value={String(novosClientes12m)} icon={<Users size={14} />}
            badge={<BadgeTendencia variacao={variacaoNovosClientes} formatador={v => String(Math.round(v))} periodoTexto="vs mesmos 12 meses ano passado" />} />
        )}
      </div>

      <AvisoMesAndamento emAndamento={emAndamento} rowsFechados={rowsFechadas} />

      <Section title="Evolução Mensal · Faturamento (por ano)" icon={<TrendingUp size={18} color="#02601D" />}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 8px 4px" }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={seriesFat.dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 13 }} />
              <YAxis tick={{ fill: "#ccc", fontSize: 13 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TooltipPorAno formatador={fmtMoeda} />} />
              <Legend content={<LegendaBranca />} />
              {seriesFat.anos.map((ano, idx) => (
                <Line key={ano} type="monotone" dataKey={ano} name={String(ano)} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Evolução Mensal · Litros (por ano)" icon={<Droplets size={18} color="#C69700" />}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 8px 4px" }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={seriesLit.dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 13 }} />
              <YAxis tick={{ fill: "#ccc", fontSize: 13 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
              <Tooltip content={<TooltipPorAno formatador={fmtLitros} />} />
              <Legend content={<LegendaBranca />} />
              {seriesLit.anos.map((ano, idx) => (
                <Line key={ano} type="monotone" dataKey={ano} name={String(ano)} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              ))}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Comparação Ano a Ano (Global)" icon={<Calendar size={18} color="#C69700" />}>
        <div style={{ background: "rgba(76,175,107,0.06)", border: "1px solid rgba(76,175,107,0.25)", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Mês de referência:</span>
            <MonthPicker periodosDisponiveis={rowsGlobais.map(r => r.chave)} valor={mesRefAno} onSelecionar={setMesRefAno} placeholder="Selecionar mês" />
            {emAndamento && mesRefAno === emAndamento.chave && (
              <span style={{ color: "#888", fontSize: 11 }}>
                ⏳ {labelMes(emAndamento.chave)} ainda em andamento (dia {new Date().getDate()} de {diasNoMes(emAndamento.chave)}): os valores do mês são parciais,
                então a comparação com o mês cheio do ano passado tende a mostrar queda. A projeção do fechamento está no quadro lá em cima.
              </span>
            )}
          </div>

          {janelasAno && (
            <>
              <div style={{ color: "#4caf6b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Faturamento comparativo por ano anterior</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Último mês" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m1.atual} rowsAnterior={janelasAno.m1.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 3 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m3.atual} rowsAnterior={janelasAno.m3.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 6 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m6.atual} rowsAnterior={janelasAno.m6.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 12 meses" icon={<TrendingUp size={13} />} rowsAtual={janelasAno.m12.atual} rowsAnterior={janelasAno.m12.anoAnterior} campo="faturamento" formatador={fmtMoeda} />
              </div>

              <div style={{ color: "#4caf6b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Litros comparativo por ano anterior</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Último mês" icon={<Droplets size={13} />} rowsAtual={janelasAno.m1.atual} rowsAnterior={janelasAno.m1.anoAnterior} campo="litros" formatador={fmtLitros} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 3 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m3.atual} rowsAnterior={janelasAno.m3.anoAnterior} campo="litros" formatador={fmtLitros} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 6 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m6.atual} rowsAnterior={janelasAno.m6.anoAnterior} campo="litros" formatador={fmtLitros} />
                <CardJanelaDetalhada detalhado chaveParcial={emAndamento ? emAndamento.chave : null} titulo="Últimos 12 meses" icon={<Droplets size={13} />} rowsAtual={janelasAno.m12.atual} rowsAnterior={janelasAno.m12.anoAnterior} campo="litros" formatador={fmtLitros} />
              </div>
            </>
          )}
        </div>
      </Section>

      {mediasPorAno.length > 0 && (
        <Section title="Faturamento e Litros por Ano (Global)" icon={<Calendar size={18} color="#C69700" />}>
          {projecaoAnoParcial && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
              <span style={{ color: "#888", fontSize: 12 }}>% do ano anterior usado na projeção dos meses restantes:</span>
              <input type="number" min="0" max="200" value={pctProjecao} onChange={e => setPctProjecao(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                style={{ width: 70, background: "#141412", border: "1px solid #444", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
              <span style={{ color: "#666", fontSize: 11 }}>% (100% = igual ao mesmo período do ano anterior)</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mediasPorAno.map((m, idx) => (
              <CardAnualCompleto key={m.ano} dados={m} projecao={idx === mediasPorAno.length - 1 ? projecaoAnoParcial : null} mostrarTrimestres />
            ))}
          </div>
        </Section>
      )}

      <Section title="Faturamento e Litros por Grupo (pizza)" icon={<Layers size={18} color="#C69700" />}>
        <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Período:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioPizza} onSelecionar={setInicioPizza} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimPizza} onSelecionar={setFimPizza} placeholder="Fim" />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#888", fontSize: 12 }}>Grupos:</span>
            <button onClick={marcarPadraoPizza} style={chipBtnStyle}>Padrão (sem grupos pesados)</button>
            <button onClick={marcarTodosPizza} style={chipBtnStyle}>Marcar todos</button>
            <button onClick={desmarcarTodosPizza} style={chipBtnStyle}>Desmarcar todos</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {grupos.map(g => (
              <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={gruposSelPizza.includes(g)} onChange={() => toggleGrupoPizza(g)} />
                {g}{grupoEhPesado(g) ? " ⚠" : ""}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <StatCard label="Total Faturamento (amostra selecionada)" value={fmtMoeda(totalFatPizza)} icon={<TrendingUp size={14} />} />
          <StatCard label="Total Litros (amostra selecionada)" value={fmtLitros(totalLitPizza)} icon={<Droplets size={14} />} />
        </div>

        {dadosPizza.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
            Nenhum grupo selecionado (ou sem dados no período escolhido).
          </div>
        )}

        {dadosPizza.length > 0 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 420px", minWidth: 340 }}>
              <div style={{ color: "#888", fontSize: 12, marginBottom: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.4 }}>Faturamento por grupo</div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={dadosPizza} dataKey="fat" nameKey="grupo" cx="38%" cy="50%" outerRadius={105}>
                    {dadosPizza.map((d, idx) => <Cell key={d.grupo} fill={corDoAno(idx)} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" content={<LegendaPizza total={totalFatPizza} campo="fat" formatador={fmtMoeda} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: "1 1 420px", minWidth: 340 }}>
              <div style={{ color: "#888", fontSize: 12, marginBottom: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.4 }}>Litros por grupo</div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={dadosPizza} dataKey="lit" nameKey="grupo" cx="38%" cy="50%" outerRadius={105}>
                    {dadosPizza.map((d, idx) => <Cell key={d.grupo} fill={corDoAno(idx)} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" content={<LegendaPizza total={totalLitPizza} campo="lit" formatador={fmtLitros} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Section>

      {fatPorGrupo.length > 0 && (
        <Section title="Faturamento por Grupo (últimos 12 meses)" icon={<Layers size={18} color="#C69700" />}>
          <ResponsiveContainer width="100%" height={Math.max(200, fatPorGrupo.length * 40)}>
            <BarChart data={chartGrupo} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" stroke="#888" fontSize={11} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="grupo" stroke="#888" fontSize={11} width={160} />
              <Tooltip formatter={v => fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
              <Bar dataKey="Faturamento" fill="#02601D" radius={[0,4,4,0]}>
                <LabelList dataKey="Faturamento" position="right" formatter={v => fmtMoeda(v)} style={{ fontSize: 10, fill: "#8fd19e" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}
    </div>
  );
}

// Card de um "grupo de comparação": pode ter 1 ou vários clientes (somados), com nome editável
// e busca própria pra adicionar clientes só a esse grupo.
// Card de um "agrupamento" de grupos (junta vários grupos numa linha só do gráfico, somados)
function AgrupamentoGraficoCard({ agrupamento, opcoes, cor, onRenomear, onToggleGrupo, onRemover }) {
  return (
    <div style={{ border: `1px solid ${cor}`, borderRadius: 10, padding: 12, background: "#1D1D1B", flex: "1 1 260px", minWidth: 240 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input value={agrupamento.nome} onChange={e => onRenomear(e.target.value)}
          style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 13, padding: "3px 2px", outline: "none" }} />
        <button onClick={onRemover} style={{ background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          Remover
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
        {opcoes.map(g => (
          <label key={g} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={agrupamento.grupos.includes(g)} onChange={() => onToggleGrupo(g)} />
            {g}
          </label>
        ))}
      </div>
    </div>
  );
}

function GrupoComparacaoCard({ grupo, cor, onRenomear, onAdicionarCliente, onRemoverCliente, onRemoverGrupo, nomesVisiveis, labelDoCliente }) {
  const [busca, setBusca] = useState("");
  const sugestoes = useMemo(() => {
    if (!busca.trim()) return [];
    return nomesVisiveis
      .filter(c => !grupo.clientes.includes(c) && (labelDoCliente[c] || "").toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 6);
  }, [busca, nomesVisiveis, labelDoCliente, grupo.clientes]);

  return (
    <div style={{ border: `1px solid ${cor}`, borderRadius: 10, padding: 14, background: "#1D1D1B", flex: "1 1 300px", minWidth: 280 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input value={grupo.nome} onChange={e => onRenomear(e.target.value)}
          style={{ flex: 1, background: "transparent", border: "none", borderBottom: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 14, padding: "3px 2px", outline: "none" }} />
        <button onClick={onRemoverGrupo} style={{ background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          Remover
        </button>
      </div>

      <div style={{ position: "relative", marginBottom: 8 }}>
        <input placeholder="Adicionar cliente a esse grupo..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "#141412", border: "1px solid #333", borderRadius: 6, padding: "7px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
        {sugestoes.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 6, background: "#1D1D1B", border: "1px solid #333", borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
            {sugestoes.map(c => (
              <div key={c} onClick={() => { onAdicionarCliente(c); setBusca(""); }}
                style={{ padding: "8px 10px", fontSize: 13, color: "#fff", cursor: "pointer", borderBottom: "1px solid #2a2a28" }}
                onMouseEnter={e => e.currentTarget.style.background = "#02601D"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {labelDoCliente[c]}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {grupo.clientes.map(c => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, background: "#141412", border: `1px solid ${cor}`, borderRadius: 16, padding: "3px 4px 3px 10px", fontSize: 11, color: "#fff" }}>
            {labelDoCliente[c]}
            <button onClick={() => onRemoverCliente(c)} style={{ background: cor, border: "none", color: "#fff", borderRadius: "50%", width: 16, height: 16, cursor: "pointer", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        ))}
        {grupo.clientes.length === 0 && <span style={{ color: "#666", fontSize: 11 }}>Nenhum cliente nesse grupo ainda.</span>}
      </div>
    </div>
  );
}

function MesTab() {
  const { dados, nomes, nomesVisiveis, grupos, clientesPorGrupo, periodos, labelDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState(() => gruposPadrao(grupos));
  const [buscaCliente, setBuscaCliente] = useState("");
  const [ordenacao, setOrdenacao] = useState("litros"); // 'litros' | 'faturamento' | 'precoLitro'
  const [expandido, setExpandido] = useState(false);
  const [modo, setModo] = useState("mes"); // 'mes' | 'periodo'

  const mesAtualReal = chaveMesAtualReal();
  const [mesSelecionado, setMesSelecionado] = useState(() =>
    periodos.includes(mesAtualReal) ? mesAtualReal : (periodos[periodos.length - 1] || "")
  );

  const chaveJaneiroAnoAtual = `${new Date().getFullYear()}-01`;
  const [inicioPeriodo, setInicioPeriodo] = useState(() =>
    periodos.includes(chaveJaneiroAnoAtual) ? chaveJaneiroAnoAtual : (periodos[0] || "")
  );
  const [fimPeriodo, setFimPeriodo] = useState(() =>
    periodos.includes(mesAtualReal) ? mesAtualReal : (periodos[periodos.length - 1] || "")
  );

  function toggleGrupoFiltro(g) {
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function marcarPadraoGrupos() { setGruposSel(gruposPadrao(grupos)); }
  function marcarTodosGrupos() { setGruposSel([...grupos]); }
  function desmarcarTodosGrupos() { setGruposSel([]); }

  const clientesFiltrados = [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  // chaves de período consideradas: um mês só, ou o intervalo inteiro no modo período
  const chavesConsideradas = useMemo(() => {
    if (modo === "mes") return mesSelecionado ? [mesSelecionado] : [];
    if (!inicioPeriodo || !fimPeriodo) return [];
    return periodos.filter(p => p >= inicioPeriodo && p <= fimPeriodo);
  }, [modo, mesSelecionado, inicioPeriodo, fimPeriodo, periodos]);

  // chaves do mesmo período, um ano antes (pra comparação por cliente)
  const chavesAnoAnterior = useMemo(() => {
    return chavesConsideradas
      .map(chave => {
        const [ano, mes] = chave.split("-").map(Number);
        return `${ano - 1}-${String(mes).padStart(2, "0")}`;
      })
      .filter(chave => periodos.includes(chave));
  }, [chavesConsideradas, periodos]);

  const clientesMes = useMemo(() => {
    if (!chavesConsideradas.length) return [];
    const chaves = new Set(chavesConsideradas);
    const chavesAnt = new Set(chavesAnoAnterior);
    return clientesFiltrados
      .map(codigo => {
        let fat = 0, lit = 0, fatAnt = 0, litAnt = 0;
        (dados[codigo] || []).forEach(r => {
          if (chaves.has(r.chave)) { fat += r.faturamento; lit += r.litros; }
          if (chavesAnt.has(r.chave)) { fatAnt += r.faturamento; litAnt += r.litros; }
        });
        if (fat <= 0 && lit <= 0) return null;
        const teveAnoAnterior = chavesAnt.size > 0 && (fatAnt > 0 || litAnt > 0);
        return {
          codigo, fat, lit, precoLitro: precoMedioLitro(fat, lit),
          varFat: teveAnoAnterior ? calcularVariacao(fat, fatAnt) : null,
          varLit: teveAnoAnterior ? calcularVariacao(lit, litAnt) : null,
        };
      })
      .filter(Boolean);
  }, [clientesFiltrados, dados, chavesConsideradas, chavesAnoAnterior]);

  const clientesOrdenados = useMemo(() => {
    const campo = ordenacao === "litros" ? "lit" : ordenacao === "faturamento" ? "fat" : "precoLitro";
    return [...clientesMes].sort((a, b) => (b[campo] || 0) - (a[campo] || 0));
  }, [clientesMes, ordenacao]);

  const clientesExibidos = buscaCliente.trim()
    ? clientesOrdenados.filter(c => (labelDoCliente[c.codigo] || "").toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientesOrdenados;

  const LIMITE_PADRAO = 30;
  const clientesVisiveisNaLista = expandido ? clientesExibidos : clientesExibidos.slice(0, LIMITE_PADRAO);

  const totalLit = clientesMes.reduce((s, c) => s + c.lit, 0);
  const totalFat = clientesMes.reduce((s, c) => s + c.fat, 0);
  const precoLitroGeral = precoMedioLitro(totalFat, totalLit);
  const emAndamento = modo === "mes" ? mesSelecionado === mesAtualReal : fimPeriodo === mesAtualReal;
  const rotuloPeriodo = modo === "mes"
    ? (mesSelecionado ? labelMes(mesSelecionado) : "-")
    : (inicioPeriodo && fimPeriodo ? `${labelMes(inicioPeriodo)}–${labelMes(fimPeriodo)}` : "-");

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="TopClientes" gerar={() => {
          const resumo = [["Período", rotuloPeriodo], ["Litros total", nx(totalLit)], ["Faturamento total (R$)", nx(totalFat)],
            ["Preço médio geral (R$/L)", nx(precoLitroGeral)], ["Clientes com venda no período", clientesMes.length]];
          const ranking = [["#", "Cliente", "Litros", "Litros - Var. vs ano ant. (%)", "Faturamento (R$)", "Faturamento - Var. vs ano ant. (%)", "Preço médio (R$/L)"],
            ...clientesExibidos.map((c, i) => [i + 1, labelDoCliente[c.codigo], nx(c.lit), pctX(c.varLit), nx(c.fat), pctX(c.varFat), nx(c.precoLitro)])];
          return [{ nome: "Resumo", linhas: resumo }, { nome: "Ranking de clientes", linhas: ranking }];
        }} />
        <BotaoImprimir label="Imprimir Top Clientes" />
      </div>
      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setModo("mes")} style={modoBtnStyle(modo === "mes", "#C69700")}>
            <Calendar size={13} /> Mês único
          </button>
          <button onClick={() => setModo("periodo")} style={modoBtnStyle(modo === "periodo", "#C69700")}>
            <Calendar size={13} /> Período
          </button>
        </div>

        {modo === "mes" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Mês:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={mesSelecionado} onSelecionar={setMesSelecionado} placeholder="Selecionar mês" />
            {emAndamento && <span style={{ color: "#888", fontSize: 11 }}>⏳ mês em andamento — dados parciais até hoje</span>}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Período:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioPeriodo} onSelecionar={setInicioPeriodo} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimPeriodo} onSelecionar={setFimPeriodo} placeholder="Fim" />
            {emAndamento && <span style={{ color: "#888", fontSize: 11 }}>⏳ o mês final ainda está em andamento — dados parciais até hoje</span>}
          </div>
        )}

        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Categoria ({clientesFiltrados.length} clientes selecionados):
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={marcarPadraoGrupos} style={chipBtnStyle}>Padrão (sem grupos pesados)</button>
          <button onClick={marcarTodosGrupos} style={chipBtnStyle}>Marcar todos</button>
          <button onClick={desmarcarTodosGrupos} style={chipBtnStyle}>Desmarcar todos</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupoFiltro(g)} />
              {g} ({clientesPorGrupo[g].length}){grupoEhPesado(g) ? " ⚠" : ""}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#141412", border: "1px solid #333", borderRadius: 6, padding: "8px 12px" }}>
          <Search size={14} color="#C69700" />
          <input placeholder="Buscar um cliente específico dentro da lista..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label={`Litros (${rotuloPeriodo})`} value={fmtLitros(totalLit)} icon={<Droplets size={14} />} />
        <StatCard label={`Faturamento (${rotuloPeriodo})`} value={fmtMoeda(totalFat)} icon={<TrendingUp size={14} />} />
        <StatCard label="Preço médio geral/L" value={fmtPrecoLitro(precoLitroGeral)} icon={<Droplets size={14} />} />
        <StatCard label="Clientes com venda no período" value={String(clientesMes.length)} icon={<Users size={14} />} />
      </div>

      <Section title={`Top Clientes · ${rotuloPeriodo}`} icon={<Trophy size={18} color="#C69700" />}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={() => setOrdenacao("litros")} style={modoBtnStyle(ordenacao === "litros", "#C69700")}>
            <Droplets size={13} /> Litros
          </button>
          <button onClick={() => setOrdenacao("faturamento")} style={modoBtnStyle(ordenacao === "faturamento", "#02601D")}>
            <TrendingUp size={13} /> Faturamento
          </button>
          <button onClick={() => setOrdenacao("precoLitro")} style={modoBtnStyle(ordenacao === "precoLitro", "#4a90d9")}>
            <Droplets size={13} /> Preço/L
          </button>
        </div>
        <div style={{ color: "#666", fontSize: 11, marginBottom: 14 }}>
          O % entre parênteses em Litros e Faturamento compara com o mesmo período do ano anterior.
        </div>

        {clientesMes.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
            Nenhum cliente com venda nesse período, com esse filtro de categoria.
          </div>
        )}

        {clientesMes.length > 0 && (
          <>
            <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={{ ...thStyle, color: ordenacao === "litros" ? "#C69700" : "#fff" }}>Litros</th>
                    <th style={{ ...thStyle, color: ordenacao === "faturamento" ? "#C69700" : "#fff" }}>Faturamento</th>
                    <th style={{ ...thStyle, color: ordenacao === "precoLitro" ? "#C69700" : "#fff" }}>Preço/L</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesVisiveisNaLista.map((c, idx) => (
                    <tr key={c.codigo}>
                      <td style={{ ...tdStyle, color: "#888" }}>{idx + 1}</td>
                      <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{labelDoCliente[c.codigo]}</td>
                      <td style={{ ...tdStyle, fontWeight: ordenacao === "litros" ? 800 : 400, color: ordenacao === "litros" ? "#C69700" : "#ddd" }}>
                        {fmtLitros(c.lit)}<PctInline variacao={c.varLit} />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: ordenacao === "faturamento" ? 800 : 400, color: ordenacao === "faturamento" ? "#4caf6b" : "#ddd" }}>
                        {fmtMoeda(c.fat)}<PctInline variacao={c.varFat} />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: ordenacao === "precoLitro" ? 800 : 400, color: ordenacao === "precoLitro" ? "#4a90d9" : "#ddd" }}>{fmtPrecoLitro(c.precoLitro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {clientesExibidos.length > LIMITE_PADRAO && (
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button onClick={() => setExpandido(e => !e)} style={chipBtnStyle}>
                  {expandido ? "Mostrar menos" : `Ver todos (${clientesExibidos.length} clientes)`}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// Agrupa a lista já pré-agregada (tipo/canal/ano/mes/faturamento/litros) vinda do backend
// por uma categoria (tipo OU canal), no mesmo formato {dados, nomes, periodos} usado em
// todo o resto do app (dados[nome] = rows[] ordenadas, uma por mês).
// Pro último mês fechado de um produto: valor, comparação vs mês anterior e vs mesmo mês do ano anterior.
function calcularComparativoCategoria(rowsBrutas) {
  const { fechados: rows } = separarMesEmAndamento(rowsBrutas);
  const n = rows.length;
  const atual = rows[n - 1];
  if (!atual) return null;
  const anterior = rows[n - 2];
  const mesmoMesAnoPassado = rows.find(r => r.ano === atual.ano - 1 && r.mes === atual.mes);
  return {
    mesTexto: labelMes(atual.chave),
    fat: atual.faturamento, lit: atual.litros, precoLitro: precoMedioLitro(atual.faturamento, atual.litros),
    varFatMes: anterior ? calcularVariacao(atual.faturamento, anterior.faturamento) : null,
    varLitMes: anterior ? calcularVariacao(atual.litros, anterior.litros) : null,
    varFatAno: mesmoMesAnoPassado ? calcularVariacao(atual.faturamento, mesmoMesAnoPassado.faturamento) : null,
    varLitAno: mesmoMesAnoPassado ? calcularVariacao(atual.litros, mesmoMesAnoPassado.litros) : null,
    mesmoMesAnoPassadoTexto: mesmoMesAnoPassado ? labelMes(mesmoMesAnoPassado.chave) : null,
  };
}

function CardCategoriaProduto({ nome, comp, cor }) {
  return (
    <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 10, padding: 14, flex: "1 1 260px", minWidth: 260 }}>
      <div style={{ color: cor, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{nome}</div>
      {!comp && <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>Sem dado no último mês fechado.</div>}
      {comp && (
        <>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 8 }}>{comp.mesTexto}</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "#666", fontSize: 10 }}>Faturamento</div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>{fmtMoeda(comp.fat)}</div>
            <BadgeTendencia variacao={comp.varFatMes} formatador={fmtMoeda} periodoTexto="vs mês anterior" />
            <BadgeTendencia variacao={comp.varFatAno} formatador={fmtMoeda} periodoTexto={comp.mesmoMesAnoPassadoTexto ? `vs ${comp.mesmoMesAnoPassadoTexto}` : ""} />
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 10 }}>Litros</div>
            <div style={{ color: "#ddd", fontSize: 15, fontWeight: 700 }}>{fmtLitros(comp.lit)}</div>
            <BadgeTendencia variacao={comp.varLitMes} formatador={fmtLitros} periodoTexto="vs mês anterior" />
            <BadgeTendencia variacao={comp.varLitAno} formatador={fmtLitros} periodoTexto={comp.mesmoMesAnoPassadoTexto ? `vs ${comp.mesmoMesAnoPassadoTexto}` : ""} />
          </div>
          <div style={{ color: "#C69700", fontSize: 12, fontWeight: 700, marginTop: 8 }}>{fmtPrecoLitro(comp.precoLitro)}</div>
        </>
      )}
    </div>
  );
}

function CardResumoPositivacao({ titulo, cor, quantidade, total, icone }) {
  const pct = total ? (quantidade / total * 100) : 0;
  return (
    <div style={{ background: "#1D1D1B", border: `1px solid ${cor}`, borderRadius: 10, padding: 16, flex: "1 1 220px", minWidth: 220 }}>
      <div style={{ color: cor, fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        {icone} {titulo}
      </div>
      <div style={{ color: "#fff", fontSize: 28, fontWeight: 800 }}>{quantidade}</div>
      <div style={{ color: "#888", fontSize: 12 }}>{pct.toFixed(1)}% dos {total} clientes filtrados</div>
    </div>
  );
}

function ListaPositivacao({ titulo, cor, itens, labelDoCliente, mostrarData }) {
  const [expandido, setExpandido] = useState(false);
  const LIMITE = 20;
  const visiveis = expandido ? itens : itens.slice(0, LIMITE);

  // resumo automático: total de litros/faturamento dos últimos pedidos desse grupo, quantos
  // clientes entram nessa soma, e o mês (se todo mundo tiver a última compra no mesmo mês)
  const itensComCompra = itens.filter(i => i.ultimaCompra);
  const totalFat = itensComCompra.reduce((s, i) => s + (i.ultimoFat || 0), 0);
  const totalLit = itensComCompra.reduce((s, i) => s + (i.ultimoLit || 0), 0);
  const mesesUnicos = new Set(itensComCompra.map(i => i.ultimaCompra));
  const mesResumo = mesesUnicos.size === 1 ? labelMes([...mesesUnicos][0]) : null;

  return (
    <div style={{ background: "#1D1D1B", border: `1px solid ${cor}`, borderRadius: 10, padding: 14, flex: "1 1 280px", minWidth: 280 }}>
      <div style={{ color: cor, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{titulo} ({itens.length})</div>
      {itensComCompra.length > 0 && (
        <div style={{ color: "#888", fontSize: 11, marginBottom: 10 }}>
          Total: {fmtLitros(totalLit)} · {fmtMoeda(totalFat)} ({itensComCompra.length} cliente{itensComCompra.length > 1 ? "s" : ""}{mesResumo ? `, ${mesResumo}` : ""})
        </div>
      )}
      {itens.length === 0 && <div style={{ color: "#666", fontSize: 12 }}>Nenhum cliente nesse grupo.</div>}
      {visiveis.map(({ codigo, ultimaCompra, ultimoFat, ultimoLit }) => (
        <div key={codigo} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid #2a2a28", fontSize: 12 }}>
          <span style={{ color: "#fff" }}>{labelDoCliente[codigo]}</span>
          <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            {mostrarData && <div style={{ color: "#888" }}>{ultimaCompra ? labelMes(ultimaCompra) : "nunca"}</div>}
            {ultimaCompra && (
              <div style={{ color: "#4caf6b", fontSize: 11 }}>{fmtMoeda(ultimoFat)} · {fmtLitros(ultimoLit)}</div>
            )}
          </span>
        </div>
      ))}
      {itens.length > LIMITE && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button onClick={() => setExpandido(e => !e)} style={chipBtnStyle}>
            {expandido ? "Mostrar menos" : `Ver todos (${itens.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

// Estima a "taxa diária de venda" (litros/dia) de um produto, olhando os últimos N meses de
// dados mensais - já que os dados são mensais, não diários, isso é uma ESTIMATIVA (mesma
// lógica da Média 7d: total vendido no período ÷ dias corridos do período).
function taxaDiariaVenda(rows, chavesPeriodo) {
  let totalLitros = 0, totalDias = 0;
  chavesPeriodo.forEach(chave => {
    const row = (rows || []).find(r => r.chave === chave);
    totalLitros += row ? row.litros : 0;
    totalDias += diasNoMes(chave);
  });
  return totalDias ? totalLitros / totalDias : 0;
}

// Data prevista pro estoque zerar (hoje + dias de estoque), formatada dd/mm/aa
function dataPrevistaFimEstoque(dias) {
  if (dias == null) return null;
  const hoje = new Date();
  const data = new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function EstoqueTab() {
  const { produtosDados, produtosNomes: todosProdutosNomes, produtosPeriodos, estoquePorProduto } = useData();
  const [buscaTipo, setBuscaTipo] = useState("");
  const [baseDestaque, setBaseDestaque] = useState("30"); // '30' | '60' | '90' | '120' - controla o ordenamento
  const [limiteAlerta, setLimiteAlerta] = useState(7);
  const [pctCrescimento, setPctCrescimento] = useState(100); // 100% = repete exatamente o ano passado

  // filtro por embalagem: Chope / Pet / Outros (mesmo padrão da aba Produtos)
  const [embalagensSel, setEmbalagensSel] = useState(["chope", "pet", "outros"]);
  function toggleEmbalagem(e) {
    setEmbalagensSel(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }
  const produtosNomes = useMemo(
    () => todosProdutosNomes.filter(nome => embalagensSel.includes(classificarEmbalagem(nome))),
    [todosProdutosNomes, embalagensSel]
  );

  const produtosComEstoque = useMemo(
    () => produtosNomes.filter(nome => estoquePorProduto[nome] != null),
    [produtosNomes, estoquePorProduto]
  );

  const linhas = useMemo(() => {
    return produtosComEstoque.map(nome => {
      const estoque = estoquePorProduto[nome] || {};
      // se a planilha não trouxe litros direto (comum pra PET, que é contado em unidades),
      // converte automaticamente pelo tamanho da embalagem no nome do produto
      const litrosPorUnid = litrosPorUnidade(nome);
      const estoqueLitrosEfetivo = estoque.litros != null
        ? estoque.litros
        : (estoque.unidades != null && litrosPorUnid != null ? estoque.unidades * litrosPorUnid : null);
      const litrosConvertidos = estoque.litros == null && estoqueLitrosEfetivo != null;

      const rows = produtosDados[nome] || [];
      const bases = {};
      [30, 60, 90, 120].forEach(dias => {
        const nMeses = Math.max(1, Math.round(dias / 30));
        const chavesRecentes = produtosPeriodos.slice(-nMeses);

        const taxaRecente = taxaDiariaVenda(rows, chavesRecentes);
        const chavesAnoPassado = chavesRecentes
          .map(c => { const [ano, mes] = c.split("-").map(Number); return `${ano - 1}-${String(mes).padStart(2, "0")}`; })
          .filter(c => produtosPeriodos.includes(c));
        const taxaAnoPassadoBase = taxaDiariaVenda(rows, chavesAnoPassado);
        const taxaAnoPassado = taxaAnoPassadoBase * (pctCrescimento / 100);

        bases[dias] = {
          recente: { taxaDiaria: taxaRecente, diasEstoque: (taxaRecente > 0 && estoqueLitrosEfetivo != null) ? estoqueLitrosEfetivo / taxaRecente : null },
          anoPassado: { taxaDiaria: taxaAnoPassado, diasEstoque: (taxaAnoPassado > 0 && estoqueLitrosEfetivo != null) ? estoqueLitrosEfetivo / taxaAnoPassado : null },
        };
      });
      return { nome, estoqueUnidades: estoque.unidades, estoqueLitros: estoqueLitrosEfetivo, litrosConvertidos, bases };
    });
  }, [produtosComEstoque, estoquePorProduto, produtosDados, produtosPeriodos, pctCrescimento]);

  const linhasExibidas = buscaTipo.trim()
    ? linhas.filter(l => l.nome.toLowerCase().includes(buscaTipo.toLowerCase()))
    : linhas;

  const linhasOrdenadas = [...linhasExibidas].sort((a, b) => {
    const da = a.bases[baseDestaque].recente.diasEstoque;
    const db = b.bases[baseDestaque].recente.diasEstoque;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  const semDadosDeEstoqueNenhum = produtosNomes.length > 0 && produtosComEstoque.length === 0;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Estoque" gerar={() => {
          const cab = ["Produto", "Estoque (un.)", "Estoque (L)", "Litros convertidos de unidades?"];
          [30, 60, 90, 120].forEach(d => cab.push(`Dias estoque - Ano passado (${d}d)`, `Vendido/dia - Ano passado (${d}d) (L)`, `Dias estoque - Recente (${d}d)`, `Vendido/dia - Recente (${d}d) (L)`));
          cab.push(`Acaba em (recente ${baseDestaque}d)`);
          const corpo = linhasOrdenadas.map(l => {
            const linha = [l.nome, nx(l.estoqueUnidades), nx(l.estoqueLitros), l.litrosConvertidos ? "sim" : "não"];
            [30, 60, 90, 120].forEach(d => linha.push(nx(l.bases[d].anoPassado.diasEstoque), nx(l.bases[d].anoPassado.taxaDiaria), nx(l.bases[d].recente.diasEstoque), nx(l.bases[d].recente.taxaDiaria)));
            const dd = l.bases[baseDestaque].recente.diasEstoque;
            linha.push(dd != null ? dataPrevistaFimEstoque(dd) : "");
            return linha;
          });
          return [{ nome: "Estoque", linhas: [[`% de crescimento aplicado no "ano passado": ${pctCrescimento}%`], [], cab, ...corpo] }];
        }} />
        <BotaoImprimir label="Imprimir Estoque" />
      </div>

      {todosProdutosNomes.length > 0 && (
        <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Package size={13} /> Embalagem ({produtosNomes.length} de {todosProdutosNomes.length} produtos):
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={embalagensSel.includes("chope")} onChange={() => toggleEmbalagem("chope")} />
              🍺 Chope
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={embalagensSel.includes("pet")} onChange={() => toggleEmbalagem("pet")} />
              🧴 Pet
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={embalagensSel.includes("outros")} onChange={() => toggleEmbalagem("outros")} />
              📦 Outros (garrafa, lata, etc.)
            </label>
          </div>
        </div>
      )}

      {produtosNomes.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", padding: "60px 20px", fontSize: 14 }}>
          Nenhum dado de produtos encontrado ainda. Essa aba depende das abas de produtos (faturamento/litros) já configuradas.
        </div>
      )}

      {semDadosDeEstoqueNenhum && (
        <div style={{ color: "#888", textAlign: "center", padding: "60px 20px", fontSize: 14 }}>
          Nenhum dado de estoque encontrado ainda. Crie a aba <strong style={{ color: "#C69700" }}>estoque</strong> na planilha,
          com colunas "Produto" e pelo menos uma de "Estoque (Unidades)" ou "Estoque (Litros)" — o nome do produto precisa bater
          com o que já aparece em produtos_faturamento/produtos_litros.
        </div>
      )}

      {produtosComEstoque.length > 0 && (
        <Section title="Tempo de Estoque" icon={<Package size={18} color="#C69700" />}>
          <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "rgba(74,144,217,0.06)", border: "1px solid rgba(74,144,217,0.25)", borderRadius: 8, padding: 10 }}>
              <span style={{ color: "#888", fontSize: 12 }}>% de crescimento esperado vs ano passado (usado nas colunas "ano passado"):</span>
              <input type="number" min="0" max="500" value={pctCrescimento} onChange={e => setPctCrescimento(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 65, background: "#141412", border: "1px solid #4a90d9", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
              <span style={{ color: "#666", fontSize: 11 }}>% (100% = repete exatamente o ritmo do ano passado; 120% = espera 20% de crescimento)</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#888", fontSize: 12 }}>Ordenar pela coluna "Recente" de:</span>
              {["30", "60", "90", "120"].map(d => (
                <button key={d} onClick={() => setBaseDestaque(d)} style={modoBtnStyle(baseDestaque === d, "#C69700")}>
                  {d} dias
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ color: "#888", fontSize: 12 }}>Alertar quando dias de estoque forem menos que:</span>
              <input type="number" min="0" max="90" value={limiteAlerta} onChange={e => setLimiteAlerta(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 60, background: "#141412", border: "1px solid #444", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
              <span style={{ color: "#666", fontSize: 11 }}>dias</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#141412", border: "1px solid #333", borderRadius: 6, padding: "8px 12px" }}>
              <Search size={14} color="#C69700" />
              <input placeholder="Buscar um produto específico..." value={buscaTipo} onChange={e => setBuscaTipo(e.target.value)}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
            </div>
          </div>

          <div style={{ color: "#888", fontSize: 11, marginBottom: 12 }}>
            "Vendido/dia" e "Dias de estoque" são ESTIMATIVAS (os dados de venda são mensais, não diários): total vendido no período
            ÷ dias corridos do período. Pra cada base (30/60/90/120d), a coluna <strong>"Ano passado"</strong> usa os meses equivalentes 1
            ano antes + o % de crescimento configurado acima; a coluna <strong>"Recente"</strong> usa os últimos meses reais disponíveis.
            Ordenado do menor pro maior "dias de estoque" na coluna "Recente" da base escolhida acima (quem vai acabar primeiro, primeiro).
            Produto sem nenhuma venda no período mostra "-" em vez de dias de estoque. Estoque (L) com <strong>*</strong> foi convertido
            automaticamente de unidades pra litros (comum pra PET/500ml, contado em garrafas na planilha de estoque) — garrafa/lata sem
            tamanho reconhecido no nome não converte, fica "-". "Acaba em" é a data prevista (hoje + dias de estoque) — acima de 150 dias
            mostra só "150+ dias", sem data, já que fica longe demais pra ser uma previsão útil.
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Produto</th>
                  <th style={thStyle}>Estoque (un.)</th>
                  <th style={thStyle}>Estoque (L)</th>
                  {[30, 60, 90, 120].map(d => (
                    <React.Fragment key={d}>
                      <th style={{ ...thStyle, color: "#4a90d9", borderLeft: "2px solid #444" }}>Ano passado ({d}d)</th>
                      <th style={{ ...thStyle, color: String(d) === baseDestaque ? "#C69700" : "#fff" }}>Recente ({d}d)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map(l => (
                  <tr key={l.nome}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>{l.nome}</td>
                    <td style={tdStyle}>{l.estoqueUnidades != null ? l.estoqueUnidades.toLocaleString("pt-BR") : "-"}</td>
                    <td style={tdStyle} title={l.litrosConvertidos ? "Convertido automaticamente de unidades pra litros, pelo tamanho da embalagem no nome do produto" : undefined}>
                      {l.estoqueLitros != null ? `${fmtLitros(l.estoqueLitros)}${l.litrosConvertidos ? "*" : ""}` : "-"}
                    </td>
                    {[30, 60, 90, 120].map(d => {
                      const destaque = String(d) === baseDestaque;

                      const vAno = l.bases[d].anoPassado.diasEstoque;
                      const alertaAno = vAno != null && vAno < limiteAlerta;
                      const cortadoAno = vAno != null && vAno > 150;
                      const dataAno = (vAno != null && !cortadoAno) ? dataPrevistaFimEstoque(vAno) : null;

                      const vRec = l.bases[d].recente.diasEstoque;
                      const alertaRec = vRec != null && vRec < limiteAlerta;
                      const cortadoRec = vRec != null && vRec > 150;
                      const dataRec = (vRec != null && !cortadoRec) ? dataPrevistaFimEstoque(vRec) : null;

                      return (
                        <React.Fragment key={d}>
                          <td title={`Estimativa de venda (ano passado × ${pctCrescimento}%): ${fmtLitros(l.bases[d].anoPassado.taxaDiaria)}/dia`} style={{
                            ...tdStyle, borderLeft: "2px solid #444",
                            color: alertaAno ? "#e0645a" : "#4a90d9",
                          }}>
                            <div>{vAno != null ? (cortadoAno ? "150+ dias" : `${vAno.toFixed(1)} dias`) : "-"}{alertaAno ? " ⚠" : ""}</div>
                            {dataAno && <div style={{ fontSize: 10, color: "#888", fontWeight: 400, marginTop: 2 }}>Acaba em {dataAno}</div>}
                          </td>
                          <td title={`Estimativa de venda (recente): ${fmtLitros(l.bases[d].recente.taxaDiaria)}/dia`} style={{
                            ...tdStyle, fontWeight: destaque ? 800 : 400,
                            color: alertaRec ? "#e0645a" : (destaque ? "#C69700" : "#ddd"),
                            background: destaque ? (alertaRec ? "rgba(224,101,90,0.12)" : "rgba(198,151,0,0.06)") : "transparent",
                          }}>
                            <div>{vRec != null ? (cortadoRec ? "150+ dias" : `${vRec.toFixed(1)} dias`) : "-"}{alertaRec ? " ⚠" : ""}</div>
                            {dataRec && <div style={{ fontSize: 10, color: "#888", fontWeight: 400, marginTop: 2 }}>Acaba em {dataRec}</div>}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function ProjecaoVendasTab() {
  const { dados, grupos, clientesPorGrupo, periodos, labelDoCliente, dataCriacaoDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState(() => gruposPadrao(grupos));
  const [inicioNovos, setInicioNovos] = useState(() => periodos.includes("2026-01") ? "2026-01" : (periodos[0] || ""));
  const mesAtualReal = chaveMesAtualReal();
  const periodosFechados = periodos.filter(p => p !== mesAtualReal);
  const [fimNovos, setFimNovos] = useState(() => periodosFechados[periodosFechados.length - 1] || "");
  const [ritmo, setRitmo] = useState("media3"); // 'ultimoMes' | 'media3'
  const [pctAjuste, setPctAjuste] = useState(100);
  const [pctNovos, setPctNovos] = useState(100); // ajuste específico pra estimativa dos novos PDVs (modo "mesmo mês ano passado")

  function toggleGrupoFiltro(g) {
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function marcarPadraoGrupos() { setGruposSel(gruposPadrao(grupos)); }
  function marcarTodosGrupos() { setGruposSel([...grupos]); }
  function desmarcarTodosGrupos() { setGruposSel([]); }

  const clientesFiltrados = [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  const analise = useMemo(() => {
    if (!inicioNovos || !fimNovos) return null;
    const periodosDoPeriodo = periodos.filter(p => p >= inicioNovos && p <= fimNovos);
    const chavesPeriodoSet = new Set(periodosDoPeriodo);

    const novos = clientesFiltrados.filter(c => {
      const dt = (dataCriacaoDoCliente[c] || "").slice(0, 7);
      return dt && dt >= inicioNovos && dt <= fimNovos;
    });
    const existentes = clientesFiltrados.filter(c => !novos.includes(c));

    // faturamento TOTAL já gerado pelos novos clientes desde que entraram até hoje (não só
    // dentro do período de cadastro - inclui meses depois que já compraram de novo)
    let fatNovosTotal = 0, litNovosTotal = 0;
    novos.forEach(c => (dados[c] || []).forEach(r => { fatNovosTotal += r.faturamento; litNovosTotal += r.litros; }));

    // faturamento dentro do PERÍODO escolhido (pra comparar com o total da empresa no mesmo período, de forma justa)
    let fatNovosNoPeriodo = 0, fatGeralNoPeriodo = 0;
    clientesFiltrados.forEach(c => {
      (dados[c] || []).forEach(r => {
        if (!chavesPeriodoSet.has(r.chave)) return;
        fatGeralNoPeriodo += r.faturamento;
        if (novos.includes(c)) fatNovosNoPeriodo += r.faturamento;
      });
    });
    const pctDoTotal = fatGeralNoPeriodo ? (fatNovosNoPeriodo / fatGeralNoPeriodo) * 100 : 0;

    // mês a mês: novos vs existentes vs total, pra todo o período escolhido
    const mesAMes = periodosDoPeriodo.map(chave => {
      let fatNovosMes = 0, fatExistentesMes = 0;
      clientesFiltrados.forEach(c => {
        const row = (dados[c] || []).find(r => r.chave === chave);
        if (!row) return;
        if (novos.includes(c)) fatNovosMes += row.faturamento;
        else fatExistentesMes += row.faturamento;
      });
      return { chave, fatNovos: fatNovosMes, fatExistentes: fatExistentesMes, total: fatNovosMes + fatExistentesMes };
    });

    // ritmo pra projetar o resto do ano - 3 modos:
    //  'ultimoMes' / 'media3': taxa fixa recente, separada por novos/existentes, repetida em
    //  cada mês restante.
    //  'anoAnterior': base = mesmo mês do ano passado (na prática já é só o padrão dos
    //  clientes que JÁ EXISTIAM, já que os "novos" de 2026 não tinham nenhuma venda em 2025)
    //  + uma estimativa própria dos novos PDVs (ritmo recente deles, últimos 3 meses),
    //  somados mês a mês - assim dá pra ver a base histórica e o incremento dos novos separados.
    const anoAnalise = Number(fimNovos.split("-")[0]);
    const mesesFechadosDoAno = periodosFechados.filter(p => p.startsWith(`${anoAnalise}-`));
    const mesesRestantes = Math.max(0, 12 - mesesFechadosDoAno.length);
    const fatRealizadoAno = clientesFiltrados.reduce((s, c) => s + soma((dados[c] || []).filter(r => mesesFechadosDoAno.includes(r.chave)), "faturamento"), 0);

    let taxaNovos = 0, taxaExistentes = 0, projecaoRestante = 0, detalheAnoAnterior = [];

    if (ritmo === "anoAnterior") {
      // chaves dos meses restantes (ex: fechou até Ago/26 -> restam Set,Out,Nov,Dez/26)
      const ultimoMesFechadoNum = mesesFechadosDoAno.length ? Number(mesesFechadosDoAno[mesesFechadosDoAno.length - 1].split("-")[1]) : 0;
      const chavesRestantes = [];
      for (let m = ultimoMesFechadoNum + 1; m <= 12; m++) chavesRestantes.push(`${anoAnalise}-${String(m).padStart(2, "0")}`);

      // ritmo próprio dos novos PDVs (últimos 3 meses fechados) - eles não têm "ano passado"
      // pra comparar, então usam o ritmo recente deles mesmos
      const chavesRitmoNovos = mesesFechadosDoAno.slice(-3);
      let totalNovosRecente = 0;
      novos.forEach(c => (dados[c] || []).forEach(r => { if (chavesRitmoNovos.includes(r.chave)) totalNovosRecente += r.faturamento; }));
      taxaNovos = chavesRitmoNovos.length ? totalNovosRecente / chavesRitmoNovos.length : 0;

      detalheAnoAnterior = chavesRestantes.map(chave => {
        const [, mes] = chave.split("-");
        const chaveAnoPassado = `${anoAnalise - 1}-${mes}`;
        const valorBaseAnoPassado = existentes.reduce((s, c) => {
          const row = (dados[c] || []).find(r => r.chave === chaveAnoPassado);
          return s + (row ? row.faturamento : 0);
        }, 0);
        const valorBaseAjustado = valorBaseAnoPassado * (pctAjuste / 100);
        const valorNovosAjustado = taxaNovos * (pctNovos / 100);
        return {
          chave, chaveAnoPassado, valorBaseAnoPassado, valorBaseAjustado,
          valorNovosAjustado, valorTotal: valorBaseAjustado + valorNovosAjustado,
        };
      });
      projecaoRestante = detalheAnoAnterior.reduce((s, d) => s + d.valorTotal, 0);
      taxaExistentes = null; // não é mais taxa fixa nesse modo - varia mês a mês (ver tabela)
    } else {
      const chavesRitmo = ritmo === "ultimoMes" ? mesesFechadosDoAno.slice(-1) : mesesFechadosDoAno.slice(-3);
      function taxaMensal(lista) {
        if (!chavesRitmo.length) return 0;
        let total = 0;
        lista.forEach(c => (dados[c] || []).forEach(r => { if (chavesRitmo.includes(r.chave)) total += r.faturamento; }));
        return total / chavesRitmo.length;
      }
      taxaNovos = taxaMensal(novos);
      taxaExistentes = taxaMensal(existentes);
      projecaoRestante = (taxaNovos + taxaExistentes) * mesesRestantes * (pctAjuste / 100);
    }

    const totalAnoProjetado = fatRealizadoAno + projecaoRestante;

    return {
      novos, existentes, fatNovosTotal, litNovosTotal, pctDoTotal, mesAMes,
      anoAnalise, mesesFechadosDoAno, taxaNovos, taxaExistentes, mesesRestantes,
      fatRealizadoAno, projecaoRestante, totalAnoProjetado, detalheAnoAnterior,
    };
  }, [clientesFiltrados, dados, periodos, periodosFechados, inicioNovos, fimNovos, dataCriacaoDoCliente, ritmo, pctAjuste, pctNovos]);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Projecao" gerar={() => {
          if (!analise) return [];
          const a = analise;
          const modoTxt = ritmo === "ultimoMes" ? "Ritmo: último mês fechado" : ritmo === "media3" ? "Ritmo: média últimos 3 meses" : "Mesmo mês do ano passado";
          const resumo = [["Período que define novos clientes", `${labelMes(inicioNovos)} a ${labelMes(fimNovos)}`], [], ["Indicador", "Valor"],
            ["Quantidade de clientes novos", a.novos.length],
            ["Faturamento total gerado pelos novos (R$)", nx(a.fatNovosTotal)],
            ["Litros total gerado pelos novos", nx(a.litNovosTotal)],
            ["Faturamento médio por cliente novo (R$)", nx(a.novos.length ? a.fatNovosTotal / a.novos.length : 0)],
            ["% do faturamento da empresa no período", nx(a.pctDoTotal)], [],
            [`Projeção ${a.anoAnalise}`, ""], ["Modo", modoTxt],
            [ritmo === "anoAnterior" ? "% de ajuste sobre a base (ano passado)" : "% de ajuste sobre o ritmo", pctAjuste],
            ...(ritmo === "anoAnterior" ? [["% de ajuste sobre os novos PDVs", pctNovos]] : []),
            ["Já realizado no ano (R$)", nx(a.fatRealizadoAno)],
            ["Ritmo mensal - novos clientes (R$)", nx(a.taxaNovos)],
            ["Ritmo mensal - clientes existentes (R$)", a.taxaExistentes == null ? "" : nx(a.taxaExistentes)],
            [`Projeção pros ${a.mesesRestantes} meses restantes (R$)`, nx(a.projecaoRestante)],
            [`Total projetado pra ${a.anoAnalise} (R$)`, nx(a.totalAnoProjetado)]];
          const mes = [["Mês", "Novos (R$)", "Existentes (R$)", "Total (R$)"], ...a.mesAMes.map(m => [labelMes(m.chave), nx(m.fatNovos), nx(m.fatExistentes), nx(m.total)])];
          const abas = [{ nome: "Resumo", linhas: resumo }, { nome: "Mês a mês", linhas: mes }];
          if (ritmo === "anoAnterior" && a.detalheAnoAnterior.length) {
            abas.push({ nome: "Projeção ano passado", linhas: [["Mês (a projetar)", "Mesmo mês ano passado (R$)", "Base ajustada (R$)", "Novos PDVs (R$)", "Total (R$)"],
              ...a.detalheAnoAnterior.map(d => [labelMes(d.chave), nx(d.valorBaseAnoPassado), nx(d.valorBaseAjustado), nx(d.valorNovosAjustado), nx(d.valorTotal)])] });
          }
          const novosLista = a.novos.map(c => {
            let f = 0, l = 0;
            (dados[c] || []).forEach(r => { f += r.faturamento; l += r.litros; });
            const dt = dataCriacaoDoCliente[c];
            return [labelDoCliente[c], dt ? dt.split("-").reverse().join("/") : "", nx(f), nx(l)];
          }).sort((x, y) => (y[2] || 0) - (x[2] || 0));
          abas.push({ nome: "Novos clientes", linhas: [["Cliente", "Data de cadastro", "Faturamento total (R$)", "Litros total"], ...novosLista] });
          return abas;
        }} />
        <BotaoImprimir label="Imprimir Projeção" />
      </div>

      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ color: "#888", fontSize: 12 }}>Período que define "clientes novos":</span>
          <MonthPicker periodosDisponiveis={periodos} valor={inicioNovos} onSelecionar={setInicioNovos} placeholder="Início" />
          <span style={{ color: "#666" }}>até</span>
          <MonthPicker periodosDisponiveis={periodos} valor={fimNovos} onSelecionar={setFimNovos} placeholder="Fim" />
        </div>

        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Filtrar por grupo ({clientesFiltrados.length} clientes selecionados):
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={marcarPadraoGrupos} style={chipBtnStyle}>Padrão (sem grupos pesados)</button>
          <button onClick={marcarTodosGrupos} style={chipBtnStyle}>Marcar todos</button>
          <button onClick={desmarcarTodosGrupos} style={chipBtnStyle}>Desmarcar todos</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupoFiltro(g)} />
              {g} ({clientesPorGrupo[g].length}){grupoEhPesado(g) ? " ⚠" : ""}
            </label>
          ))}
        </div>
      </div>

      {!analise && (
        <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>Selecione o período.</div>
      )}

      {analise && (
        <>
          <Section title={`Novos Clientes · ${labelMes(inicioNovos)} a ${labelMes(fimNovos)}`} icon={<Users size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <StatCard label="Quantidade de clientes novos" value={String(analise.novos.length)} icon={<Users size={14} />} />
              <StatCard label="Faturamento total gerado (desde o cadastro até hoje)" value={fmtMoeda(analise.fatNovosTotal)} icon={<TrendingUp size={14} />} />
              <StatCard label="Litros total gerado (desde o cadastro até hoje)" value={fmtLitros(analise.litNovosTotal)} icon={<Droplets size={14} />} />
              <StatCard label="Faturamento médio por cliente novo" value={fmtMoeda(analise.novos.length ? analise.fatNovosTotal / analise.novos.length : 0)} icon={<TrendingUp size={14} />} />
              <StatCard label={`% do faturamento da empresa (${labelMes(inicioNovos)}–${labelMes(fimNovos)})`} value={`${analise.pctDoTotal.toFixed(1)}%`} icon={<TrendingUp size={14} />} />
            </div>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Mês a mês: novos vs clientes existentes</div>
            <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8, marginBottom: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Mês</th>
                    <th style={{ ...thStyle, color: "#4caf6b" }}>Novos</th>
                    <th style={{ ...thStyle, color: "#4a90d9" }}>Existentes</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {analise.mesAMes.map(m => (
                    <tr key={m.chave}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>{labelMes(m.chave)}</td>
                      <td style={{ ...tdStyle, color: "#4caf6b" }}>{fmtMoeda(m.fatNovos)}</td>
                      <td style={{ ...tdStyle, color: "#4a90d9" }}>{fmtMoeda(m.fatExistentes)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>{fmtMoeda(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Projeção Combinada · Fim de ${analise.anoAnalise}`} icon={<GitCompareArrows size={18} color="#4a90d9" />}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => setRitmo("ultimoMes")} style={modoBtnStyle(ritmo === "ultimoMes", "#4a90d9")}>Ritmo: último mês fechado</button>
              <button onClick={() => setRitmo("media3")} style={modoBtnStyle(ritmo === "media3", "#4a90d9")}>Ritmo: média últimos 3 meses</button>
              <button onClick={() => setRitmo("anoAnterior")} style={modoBtnStyle(ritmo === "anoAnterior", "#4a90d9")}>Mesmo mês do ano passado</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ritmo === "anoAnterior" ? 8 : 16, flexWrap: "wrap" }}>
              <span style={{ color: "#888", fontSize: 12 }}>{ritmo === "anoAnterior" ? "% de ajuste sobre a base (ano passado):" : "% de ajuste sobre o ritmo (100% = sem ajuste):"}</span>
              <input type="number" min="0" max="300" value={pctAjuste} onChange={e => setPctAjuste(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 65, background: "#141412", border: "1px solid #4a90d9", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
            </div>
            {ritmo === "anoAnterior" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ color: "#4caf6b", fontSize: 12 }}>% de ajuste sobre os Novos PDVs:</span>
                <input type="number" min="0" max="500" value={pctNovos} onChange={e => setPctNovos(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: 65, background: "#141412", border: "1px solid #4caf6b", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                <span style={{ color: "#666", fontSize: 11 }}>(separado da base — dá pra simular os novos PDVs crescendo mais rápido, por exemplo)</span>
              </div>
            )}

            <div style={{ color: "#888", fontSize: 11, marginBottom: 14 }}>
              {ritmo === "anoAnterior"
                ? `Faturamento já realizado em ${analise.anoAnalise} + pra cada mês restante: BASE (o mesmo mês de ${analise.anoAnalise - 1} — na prática já é só o padrão dos clientes que existiam antes, já que os novos não tinham venda em ${analise.anoAnalise - 1}), ajustada pelo % da base + NOVOS PDVS (ritmo recente próprio deles, últimos 3 meses), ajustado pelo % dos novos PDVs (independente um do outro).`
                : `Faturamento já realizado em ${analise.anoAnalise} (${analise.mesesFechadosDoAno.length} meses fechados) + ritmo mensal recente (novos + existentes) × ${analise.mesesRestantes} meses restantes, com o % de ajuste aplicado.`}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: ritmo === "anoAnterior" ? 20 : 0 }}>
              <StatCard label={`Já realizado em ${analise.anoAnalise}`} value={fmtMoeda(analise.fatRealizadoAno)} icon={<TrendingUp size={14} />} />
              <StatCard label="Ritmo mensal · novos clientes (últ. 3 meses)" value={fmtMoeda(analise.taxaNovos)} icon={<TrendingUp size={14} />} />
              {ritmo !== "anoAnterior" && (
                <StatCard label="Ritmo mensal · clientes existentes" value={fmtMoeda(analise.taxaExistentes)} icon={<TrendingUp size={14} />} />
              )}
              <StatCard label={`Projeção pros ${analise.mesesRestantes} meses restantes`} value={fmtMoeda(analise.projecaoRestante)} icon={<TrendingUp size={14} />} />
              <StatCard label={`Total projetado pra ${analise.anoAnalise}`} value={fmtMoeda(analise.totalAnoProjetado)} icon={<Trophy size={14} />} />
            </div>

            {ritmo === "anoAnterior" && analise.detalheAnoAnterior.length > 0 && (
              <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 650 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Mês (a projetar)</th>
                      <th style={thStyle}>Base: mesmo mês {analise.anoAnalise - 1}</th>
                      <th style={{ ...thStyle, color: "#4caf6b" }}>+ Novos PDVs ({pctNovos}%)</th>
                      <th style={{ ...thStyle, color: "#4a90d9" }}>= Total ajustado ({pctAjuste}%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.detalheAnoAnterior.map(d => (
                      <tr key={d.chave}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>{labelMes(d.chave)}</td>
                        <td style={tdStyle}>{labelMes(d.chaveAnoPassado)}: {fmtMoeda(d.valorBaseAnoPassado)} → {fmtMoeda(d.valorBaseAjustado)}</td>
                        <td style={{ ...tdStyle, color: "#4caf6b" }}>{fmtMoeda(d.valorNovosAjustado)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: "#4a90d9" }}>{fmtMoeda(d.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function PositivacaoTab() {
  const { dados, grupos, clientesPorGrupo, periodos, labelDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState(() => gruposPadrao(grupos));
  const mesAtualReal = chaveMesAtualReal();
  const [mesRef, setMesRef] = useState(() => periodos.includes(mesAtualReal) ? mesAtualReal : (periodos[periodos.length - 1] || ""));

  function toggleGrupoFiltro(g) {
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }
  function marcarPadraoGrupos() { setGruposSel(gruposPadrao(grupos)); }
  function marcarTodosGrupos() { setGruposSel([...grupos]); }
  function desmarcarTodosGrupos() { setGruposSel([]); }

  const clientesFiltrados = [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  const classificacao = useMemo(() => {
    const positivados = [], semCompraMes = [], semCompra2Meses = [], nuncaComprou = [];
    if (!mesRef) return { positivados, semCompraMes, semCompra2Meses, nuncaComprou };
    const mesAnteriorRef = chaveMesAnterior(mesRef);

    clientesFiltrados.forEach(codigo => {
      const comprasAteRef = (dados[codigo] || []).filter(r => r.chave <= mesRef && r.faturamento > 0);
      if (!comprasAteRef.length) {
        nuncaComprou.push({ codigo, ultimaCompra: null });
        return;
      }
      const ultima = comprasAteRef[comprasAteRef.length - 1];
      const item = { codigo, ultimaCompra: ultima.chave, ultimoFat: ultima.faturamento, ultimoLit: ultima.litros };
      if (ultima.chave === mesRef) positivados.push(item);
      else if (ultima.chave === mesAnteriorRef) semCompraMes.push(item);
      else semCompra2Meses.push(item);
    });

    const porNome = (a, b) => (labelDoCliente[a.codigo] || "").localeCompare(labelDoCliente[b.codigo] || "");
    return {
      positivados: positivados.sort(porNome),
      semCompraMes: semCompraMes.sort(porNome),
      semCompra2Meses: semCompra2Meses.sort((a, b) => (a.ultimaCompra || "").localeCompare(b.ultimaCompra || "")),
      nuncaComprou: nuncaComprou.sort(porNome),
    };
  }, [clientesFiltrados, dados, mesRef, labelDoCliente]);

  const totalFiltrado = clientesFiltrados.length;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Positivacao" gerar={() => {
          const resumo = [["Mês de referência", mesRef ? labelMes(mesRef) : ""], [], ["Situação", "Clientes"],
            ["Positivados", classificacao.positivados.length], ["Sem compra no mês", classificacao.semCompraMes.length],
            ["Sem compra há 2+ meses", classificacao.semCompra2Meses.length], ["Nunca comprou", classificacao.nuncaComprou.length]];
          const lista = [["Situação", "Cliente", "Última compra", "Último pedido - Faturamento (R$)", "Último pedido - Litros"]];
          const add = (nome, itens) => itens.forEach(i => lista.push([nome, labelDoCliente[i.codigo], i.ultimaCompra ? labelMes(i.ultimaCompra) : "nunca", nx(i.ultimoFat), nx(i.ultimoLit)]));
          add("Positivado", classificacao.positivados);
          add("Sem compra no mês", classificacao.semCompraMes);
          add("Sem compra há 2+ meses", classificacao.semCompra2Meses);
          add("Nunca comprou", classificacao.nuncaComprou);
          return [{ nome: "Resumo", linhas: resumo }, { nome: "Clientes", linhas: lista }];
        }} />
        <BotaoImprimir label="Imprimir Positivação" />
      </div>

      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Mês de referência:</span>
          <MonthPicker periodosDisponiveis={periodos} valor={mesRef} onSelecionar={setMesRef} placeholder="Selecionar mês" />
          {mesRef === mesAtualReal && <span style={{ color: "#888", fontSize: 11 }}>⏳ mês em andamento — dados parciais até hoje</span>}
        </div>

        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Filtrar por grupo ({totalFiltrado} clientes selecionados):
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={marcarPadraoGrupos} style={chipBtnStyle}>Padrão (sem grupos pesados)</button>
          <button onClick={marcarTodosGrupos} style={chipBtnStyle}>Marcar todos</button>
          <button onClick={desmarcarTodosGrupos} style={chipBtnStyle}>Desmarcar todos</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: grupoEhPesado(g) ? "#C69700" : "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupoFiltro(g)} />
              {g} ({clientesPorGrupo[g].length}){grupoEhPesado(g) ? " ⚠" : ""}
            </label>
          ))}
        </div>
      </div>

      {!mesRef && (
        <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>Selecione um mês de referência.</div>
      )}

      {mesRef && (
        <>
          <Section title={`Positivação de Clientes · ${labelMes(mesRef)}`} icon={<Trophy size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <CardResumoPositivacao titulo="Positivados" cor="#4caf6b" icone="🟢" quantidade={classificacao.positivados.length} total={totalFiltrado} />
              <CardResumoPositivacao titulo="Sem compra no mês" cor="#e8c400" icone="🟡" quantidade={classificacao.semCompraMes.length} total={totalFiltrado} />
              <CardResumoPositivacao titulo="Sem compra há 2+ meses" cor="#e0645a" icone="🔴" quantidade={classificacao.semCompra2Meses.length} total={totalFiltrado} />
              <CardResumoPositivacao titulo="Nunca comprou" cor="#888" icone="⚪" quantidade={classificacao.nuncaComprou.length} total={totalFiltrado} />
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <ListaPositivacao titulo="🟢 Positivados" cor="#4caf6b" itens={classificacao.positivados} labelDoCliente={labelDoCliente} mostrarData={false} />
              <ListaPositivacao titulo="🟡 Sem compra no mês" cor="#e8c400" itens={classificacao.semCompraMes} labelDoCliente={labelDoCliente} mostrarData />
              <ListaPositivacao titulo="🔴 Sem compra há 2+ meses" cor="#e0645a" itens={classificacao.semCompra2Meses} labelDoCliente={labelDoCliente} mostrarData />
              <ListaPositivacao titulo="⚪ Nunca comprou" cor="#888" itens={classificacao.nuncaComprou} labelDoCliente={labelDoCliente} mostrarData={false} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// -------------------- Planejamento de Produção --------------------
const CAPACIDADE_ENVASE_PET_DIA = 8000; // litros/dia
const LITROS_BATELADA = 1330;           // capacidade da brassagem por batelada

function normalizarPlano(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}
function escaparRegex(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function somarDiasData(base, dias) { const d = new Date(base.getTime()); d.setDate(d.getDate() + dias); return d; }
function fmtDataCurta(d) { return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; }
const DIAS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function fmtDataSem(d) { return `${DIAS_SEM[d.getDay()]} ${fmtDataCurta(d)}`; }
function chaveDia(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dataDeChave(k) { const [a, m, d] = String(k).slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d); }
// feriados sem produção/envase (AAAA-MM-DD)
const FERIADOS = new Set(["2026-11-02", "2026-11-20", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"]);
function diaUtil(d) { const w = d.getDay(); return w >= 1 && w <= 5 && !FERIADOS.has(chaveDia(d)); }
function diasUteisSemana(seg) { return [0, 1, 2, 3, 4].map(i => somarDiasData(seg, i)).filter(diaUtil); }
function proximoUtil(d) { let x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); while (!diaUtil(x)) x = somarDiasData(x, 1); return x; }
function segundaDaSemana(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = x.getDay(); return somarDiasData(x, w === 0 ? -6 : 1 - w); }
// Semanas de um mês (AAAA-MM): devolve as datas de início de cada semana (4 ou 5). A 1ª começa no dia 1º;
// as demais, nas segundas-feiras. Pedaço de semana com menos de 4 dias é juntado à semana vizinha.
function semanasDoMes(chave) {
  const [a, m] = chave.split("-").map(Number);
  const dias = new Date(a, m, 0).getDate();
  let starts = [1];
  for (let d = 2; d <= dias; d++) if (new Date(a, m - 1, d).getDay() === 1) starts.push(d);
  if (starts.length > 1 && starts[1] - starts[0] < 4) starts.splice(1, 1);
  if (starts.length > 1 && dias - starts[starts.length - 1] + 1 < 4) starts.pop();
  return starts.map(d => new Date(a, m - 1, d));
}
function bateladasDoTanque(t) { return t.bateladas > 0 ? Math.round(t.bateladas) : Math.max(1, Math.ceil(t.capacidade / LITROS_BATELADA - 0.05)); }
function diasEntre(a, b) { return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }

// Programa lotes tanque a tanque, em SEQUÊNCIA: a brassagem só começa o próximo tanque quando o
// anterior estiver cheio (um tanque pode começar num dia e terminar no seguinte, ex.: 1+5 ou 5+4,
// mas nenhum outro tanque entra no meio). Só seg-sex. Pronto até o dia 1º de cada mês.
function planejarBrassagem({ meses, tanques, capDia, hoje, limpeza, diasPadrao, suprimentoInicial, horizonteDias, hellesNome, hellesDias, prioridade, tolerancia, diasLote, repor, regras, loteMax, manuais }) {
  const contTanque = {}; // nº do lote dentro de cada tanque (para ajustes manuais de maturação por lote)
  const diasDoLote = (t, padrao) => { const i = contTanque[t.nome] || 0; contTanque[t.nome] = i + 1; const v = diasLote && diasLote[`${t.nome}|${i}`]; return v !== undefined && v !== "" && Number(v) > 0 ? Number(v) : padrao; };
  const tol = Math.max(0, Number(tolerancia) || 0); // dias, dentro da semana, em que a cerveja ainda pode ficar pronta sem contar atraso
  const DIA_TOTAL = 6;      // máximo de bateladas da brassagem por dia
  const GRANDE = 8000;      // tanque grande: >= 8.000 L
  const usado = {};         // dia -> bateladas usadas
  const bigDia = {};        // dia -> já tem um tanque grande sendo enchido
  const estado = tanques.filter(t => !(regras && regras[t.nome] && regras[t.nome].bloqueado)).map(t => ({ ...t, livre: t.livreDe && t.livreDe > hoje ? t.livreDe : hoje }));
  // lote máximo por estilo (ex.: Helles sem álcool de 1.000 em 1.000 L) e estilos permitidos por tanque
  const capEf = (t, e) => { const m = Number(loteMax && loteMax[e]); const nb = bateladasDoTanque(t); if (!(m > 0)) return t.capacidade; const porBat = t.capacidade / nb; return Math.max(1, Math.min(nb, Math.floor(m / porBat + 1e-6))) * porBat; };
  const permitido = (t, e) => { const r = regras && regras[t.nome]; return !r || !r.estilos || !r.estilos.length || r.estilos.includes(e); };
  const restrito = t => { const r = regras && regras[t.nome]; return !!(r && r.estilos && r.estilos.length); };
  const sobraEstilo = { ...(suprimentoInicial || {}) };
  const lotes = [];
  const fimHorizonte = somarDiasData(hoje, horizonteDias || 120);

  // REGRAS DA BRASSAGEM
  // - Tanque grande: enche em dias de 3 ou 6 bateladas (conforme o ritmo), seguidos e na MESMA semana (seg-sex).
  // - Só um tanque grande por dia: nunca termina um e começa outro no mesmo dia (espera/adianta o início).
  // - Tanque pequeno (1.000 L/batelada): entra junto no dia, nas vagas que sobraram (ex.: 3 Helles + 1 Stout).
  const colocar = (t, release, b) => {
    const grande = t.capacidade >= GRANDE;
    let rel = release;
    for (let tent = 0; tent < 400; tent++) {
      const d0 = proximoUtil(rel > t.livre ? rel : t.livre);
      if (grande) {
        const pedacos = []; let rest = b;
        while (rest > 0) { const c = Math.min(capDia, rest); pedacos.push(c); rest -= c; }
        const aloc = []; let d = d0, ok = true;
        for (let i = 0; i < pedacos.length; i++) {
          if (i > 0) d = proximoUtil(somarDiasData(d, 1));
          const k = chaveDia(d);
          if (bigDia[k] || (usado[k] || 0) + pedacos[i] > DIA_TOTAL) { ok = false; break; }
          aloc.push({ data: new Date(d), n: pedacos[i] });
        }
        if (ok && segundaDaSemana(aloc[0].data).getTime() === segundaDaSemana(aloc[aloc.length - 1].data).getTime()) {
          return { inicio: aloc[0].data, fim: aloc[aloc.length - 1].data, aloc };
        }
      } else {
        const k = chaveDia(d0);
        if ((usado[k] || 0) + b <= DIA_TOTAL) {
          return { inicio: d0, fim: d0, aloc: [{ data: new Date(d0), n: b }] };
        }
      }
      rel = somarDiasData(d0, 1);
    }
    return null;
  };
  const confirmar = (t, av) => {
    av.aloc.forEach(a => {
      const k = chaveDia(a.data);
      usado[k] = (usado[k] || 0) + a.n;
      if (t.capacidade >= GRANDE) bigDia[k] = true;
    });
  };

  // demanda: entregas semanais em ordem de prazo (e, no mesmo prazo, as de maturação mais longa primeiro)
  const itens = [];
  meses.forEach(mes => {
    const rk = e => { const i = (prioridade || []).indexOf(e); return i < 0 ? 999 : i; };
    mes.necessidades.slice().sort((a, b) => rk(a.estilo) - rk(b.estilo) || (b.dias || diasPadrao) - (a.dias || diasPadrao) || b.necessario - a.necessario)
      .forEach(n => itens.push({ mes, n, dias: n.dias || diasPadrao, restante: null }));
  });
  const peso = {}, diasEstilo = {}, petSum = {}, extra = {};
  itens.forEach(({ n }) => {
    peso[n.estilo] = (peso[n.estilo] || 0) + n.necessario;
    diasEstilo[n.estilo] = n.dias || diasPadrao;
    petSum[n.estilo] = (petSum[n.estilo] || 0) + n.petProd;
  });
  const estilosRep = Object.keys(peso).filter(e => peso[e] > 0);
  // cerveja pronta dentro do tanque conta como oferta (cobertura) e o tanque só libera quando a demanda a consumir
  Object.keys(suprimentoInicial || {}).forEach(e => { extra[e] = (extra[e] || 0) + suprimentoInicial[e]; });
  // REGRA: ao ficar pronta, a cerveja vai para barril ou PET (vira estoque de produto acabado) e o tanque libera na hora.
  // Por isso o tanque nunca fica esperando venda: ele só fica ocupado até o "pronto" (já calculado em livreDe).

  // diagnóstico de lote atrasado: o que está acontecendo e o que dá para ajustar
  const diagnosticar = (t, av, item, livreAntes) => {
    const P = somarDiasData(item.mes.prazo, tol), D = item.dias;
    const atraso = diasEntre(P, av.pronto);
    if (atraso <= 0) return null;
    const latestFim = somarDiasData(P, -D);
    const maisCedo = somarDiasData(hoje, D);
    const diasNec = Math.max(1, diasEntre(av.fim, P));
    const f = fmtDataCurta;
    if (maisCedo >= P || av.inicio.getTime() <= proximoUtil(hoje).getTime()) return { causa: "maturacao", atrasoDias: atraso, diasNecessarios: Math.max(1, D - atraso),
      texto: `Mesmo começando agora, ${item.n.estilo} só fica pronto em ${f(av.pronto)} (brassagem + ${D} dias de maturação) e a entrega é ${f(P)}.`,
      ajuste: `Reduzir os dias de ${item.n.estilo} para ${Math.max(1, D - atraso)} (hoje ${D}) entregaria no prazo; ou cobrir essa semana com estoque de produto acabado; ou aceitar o atraso.` };
    if (livreAntes > latestFim) return { causa: "tanque", atrasoDias: atraso, diasNecessarios: diasNec,
      texto: `${t.nome} só libera em ${f(livreAntes)} (a cerveja que está/ficará nele ainda não saiu) e a brassagem precisaria ser até ${f(latestFim)}.`,
      ajuste: `Reduzir os dias de maturação do lote anterior desse tanque, usar um tanque que libere antes, ou reduzir os dias de ${item.n.estilo} para ${diasNec}.` };
    return { causa: "brassagem", atrasoDias: atraso, diasNecessarios: diasNec,
      texto: `O tanque estaria livre, mas a brassagem só coube em ${f(av.inicio)} (regras: 1 tanque grande por dia, 3 ou 6 bateladas, lote na mesma semana).`,
      ajuste: `Usar 6 bateladas/dia, adiantar a brassagem, ou reduzir os dias de ${item.n.estilo} para ${diasNec}.` };
  };

  // Tanque grande sempre com Helles; pequenos rodam os outros estilos. Outro estilo só entra em tanque grande
  // se, com os pequenos, ficaria atrasado. TANQUE SEMPRE CHEIO: o tanque que libera primeiro recebe lote novo na hora
  // (demanda; se não houver, reposição de estoque). A cerveja pode ficar mais tempo no tanque.
  const ehHelles = e => normalizarPlano(e) === "HELLES";
  const pequenos = estado.filter(t => t.capacidade < GRANDE);
  const diasDe = e => diasEstilo[e] || (ehHelles(e) && hellesDias) || diasPadrao;
  const urgente = (it) => {
    if (!pequenos.length) return true;
    const melhor = Math.min(...pequenos.map(o => somarDiasData(o.livre > hoje ? o.livre : hoje, it.dias).getTime()));
    return melhor > somarDiasData(it.mes.prazo, tol).getTime();
  };
  // escolha do tanque pequeno: o que desperdiça menos cerveja, desde que o outro ainda entregue no prazo
  const melhorPequeno = (it, t) => {
    const waste = Math.max(0, capEf(t, it.n.estilo) - it.restante);
    const prazoEf = somarDiasData(it.mes.prazo, tol);
    return !pequenos.some(o => {
      if (o === t) return false;
      const w = Math.max(0, capEf(o, it.n.estilo) - it.restante);
      if (w >= waste - 0.5) return false;
      const prontoO = somarDiasData(o.livre > hoje ? o.livre : hoje, it.dias + 1);
      return o.livre <= somarDiasData(t.livre, 3) || prontoO <= prazoEf;
    });
  };

  // produções manuais (instrução do usuário): entram antes do planejamento automático
  (manuais || []).forEach(m => {
    const t = estado.find(x => x.nome === m.tanque); if (!t || !m.estilo || !m.inicio) return;
    const ini = dataDeChave(m.inicio); if (!ini || isNaN(ini.getTime())) return;
    const capM = capEf(t, m.estilo), nb = bateladasDoTanque(t);
    const bM = Math.max(1, Math.round(capM / (t.capacidade / nb)));
    t.livre = ini; // a data que você escolheu manda (mesmo que o planejador achasse o tanque ocupado pela cerveja que está nele)
    const av = colocar(t, ini, bM); if (!av) return;
    const dM = diasDoLote(t, diasDe(m.estilo));
    av.pronto = somarDiasData(av.fim, dM);
    confirmar(t, av);
    t.livre = somarDiasData(av.pronto, limpeza);
    sobraEstilo[m.estilo] = (sobraEstilo[m.estilo] || 0) + capM;
    lotes.push({ estilo: m.estilo, tanque: t.nome, codigo: t.codigo, capacidade: capM, bateladas: bM, volume: capM, atende: 0, sobra: capM, dias: dM, diasPreenchido: true,
      mes: chaveDia(av.pronto).slice(0, 7), prazo: av.pronto, petPct: peso[m.estilo] > 0 ? petSum[m.estilo] / peso[m.estilo] : 0,
      inicio: av.inicio, fim: av.fim, pronto: av.pronto, aloc: av.aloc, livreAte: t.livre, atrasado: false, reposicao: true, manual: true });
  });
  let guarda = 0;
  while (guarda++ < 2000) {
    const t = estado.slice().sort((a, b) => a.livre - b.livre || b.capacidade - a.capacidade)[0];
    const grande = t.capacidade >= GRANDE;
    let item = null;
    for (const it of itens) {
      if (it.restante === null) {
        const disp = sobraEstilo[it.n.estilo] || 0;
        it.restante = Math.max(0, it.n.necessario - disp);
        sobraEstilo[it.n.estilo] = Math.max(0, disp - it.n.necessario);
      }
      if (it.restante <= 0.5) continue;
      if (!permitido(t, it.n.estilo)) continue;
      if (restrito(t)) { item = it; break; } // instrução do usuário para este tanque: primeiro estilo permitido que precisa
      const hel = ehHelles(it.n.estilo);
      if (grande) { if (hel || (urgente(it) && it.restante >= t.capacidade * 0.6)) { item = it; break; } }
      else if (!hel && melhorPequeno(it, t)) { item = it; break; }
    }
    // tanque pequeno livre e nenhuma demanda de outro estilo pendente: ajuda a produzir Helles (demanda real, depois reposição)
    if (!item && !grande && !restrito(t) && !itens.some(it => !ehHelles(it.n.estilo) && it.restante !== null && it.restante > 0.5)) {
      item = itens.find(it => ehHelles(it.n.estilo) && it.restante !== null && it.restante > 0.5) || null;
    }
    const bTanque = bateladasDoTanque(t);
    const capL = item ? capEf(t, item.n.estilo) : t.capacidade;
    const b = item ? Math.max(1, Math.round(capL / (t.capacidade / bTanque))) : bTanque;
    if (item) {
      const av = colocar(t, hoje, b);
      if (!av) break;
      const dL = diasDoLote(t, item.dias);
      av.pronto = somarDiasData(av.fim, dL);
      const livreAntes = t.livre;
      confirmar(t, av);
      const atende = Math.min(capL, item.restante);
      const sobra = capL - atende;
      sobraEstilo[item.n.estilo] = (sobraEstilo[item.n.estilo] || 0) + sobra;
      t.livre = somarDiasData(av.pronto, limpeza);
      item.restante -= atende;
      // a sobra do tanque (cerveja pronta além da necessidade) abate as entregas futuras já criadas do mesmo estilo
      // que ainda dá tempo de usá-la (prazo + tolerância >= data em que o lote fica pronto)
      for (const it2 of itens) {
        if (it2 === item || it2.n.estilo !== item.n.estilo || it2.restante === null || it2.restante <= 0.5) continue;
        if ((sobraEstilo[item.n.estilo] || 0) <= 0.5) break;
        if (somarDiasData(it2.mes.prazo, tol) < av.pronto) continue;
        const usar = Math.min(sobraEstilo[item.n.estilo], it2.restante);
        it2.restante -= usar; sobraEstilo[item.n.estilo] -= usar;
      }
      lotes.push({
        estilo: item.n.estilo, tanque: t.nome, codigo: t.codigo, capacidade: capL, bateladas: b,
        volume: capL, atende, sobra, dias: dL, diasPreenchido: !!item.n.dias,
        mes: item.mes.chave, prazo: item.mes.prazo, petPct: item.n.necessario > 0 ? item.n.petProd / item.n.necessario : 0,
        inicio: av.inicio, fim: av.fim, pronto: av.pronto, aloc: av.aloc, livreAte: t.livre,
        atrasado: av.pronto > somarDiasData(item.mes.prazo, tol), diag: diagnosticar(t, av, { ...item, dias: dL }, livreAntes),
      });
    } else {
      if (t.livre > fimHorizonte) break;
      // sem reposição: só produz o que a demanda pede; o tanque sem demanda fica livre (a sobra já vai para o estoque)
      if (!repor) { t.livre = somarDiasData(fimHorizonte, 1); continue; }
      if (restrito(t) && !estilosRep.some(x => permitido(t, x))) { t.livre = somarDiasData(fimHorizonte, 1); continue; }
      const cobertura = x => ((extra[x] || 0) + (sobraEstilo[x] || 0)) / peso[x];
      // tanque pequeno: primeiro outros estilos que ainda não têm estoque para a demanda; se não houver, Helles (nunca fica vazio)
      const candidatos = restrito(t) ? estilosRep.filter(x => permitido(t, x)) : (grande ? estilosRep.filter(ehHelles) : (estilosRep.filter(e => !ehHelles(e) && cobertura(e) < 1).length ? estilosRep.filter(e => !ehHelles(e) && cobertura(e) < 1) : estilosRep));
      let e;
      if (candidatos.length) e = candidatos.slice().sort((x, y) => (((extra[x] || 0) + (sobraEstilo[x] || 0)) / peso[x]) - (((extra[y] || 0) + (sobraEstilo[y] || 0)) / peso[y]))[0];
      else if (grande && hellesNome) e = hellesNome;
      else if (estilosRep.length) e = estilosRep.slice().sort((x, y) => (((extra[x] || 0) + (sobraEstilo[x] || 0)) / peso[x]) - (((extra[y] || 0) + (sobraEstilo[y] || 0)) / peso[y]))[0];
      else break;
      const dEstilo = diasDe(e);
      const capF = capEf(t, e);
      const bF = Math.max(1, Math.round(capF / (t.capacidade / bTanque)));
      const av = colocar(t, hoje, bF);
      if (!av || av.inicio > fimHorizonte) break;
      const dE = diasDoLote(t, dEstilo);
      av.pronto = somarDiasData(av.fim, dE);
      confirmar(t, av);
      t.livre = somarDiasData(av.pronto, limpeza);
      extra[e] = (extra[e] || 0) + capF;
      lotes.push({
        estilo: e, tanque: t.nome, codigo: t.codigo, capacidade: capF, bateladas: bF,
        volume: capF, atende: 0, sobra: capF, dias: dE, diasPreenchido: true,
        mes: chaveDia(av.pronto).slice(0, 7), prazo: av.pronto, petPct: peso[e] > 0 ? petSum[e] / peso[e] : 0,
        inicio: av.inicio, fim: av.fim, pronto: av.pronto, aloc: av.aloc, livreAte: t.livre,
        atrasado: false, reposicao: true,
      });
    }
  }
  const pend = {};
  itens.forEach(it => { if (it.restante !== null && it.restante > 0.5) pend[it.n.estilo] = (pend[it.n.estilo] || 0) + it.restante; });
  const naoAgendado = Object.entries(pend).map(([e, v]) => `${e} (${Math.round(v).toLocaleString("pt-BR")} L)`);
  const diasBrassagem = Object.keys(usado).length;
  const atrasados = lotes.filter(l => l.atrasado).length;
  const ultimoPronto = lotes.reduce((m, l) => (l.pronto > m ? l.pronto : m), hoje);
  const bateladasTotal = Object.values(usado).reduce((s, v) => s + v, 0);
  return { lotes, usado, diasBrassagem, atrasados, ultimoPronto, bateladasTotal, naoAgendado };
}

function serializarLotes(lotes) {
  return lotes.map(l => ({
    estilo: l.estilo, tanque: l.tanque, codigo: l.codigo, capacidade: l.capacidade, bateladas: l.bateladas,
    volume: l.volume, atende: Math.round(l.atende), sobra: Math.round(l.sobra), dias: l.dias, diasPreenchido: l.diasPreenchido,
    mes: l.mes, prazo: chaveDia(l.prazo), petPct: Number(l.petPct.toFixed(4)),
    inicio: chaveDia(l.inicio), fim: chaveDia(l.fim), pronto: chaveDia(l.pronto), livreAte: chaveDia(l.livreAte),
    aloc: l.aloc.map(a => [chaveDia(a.data), a.n]), atrasado: l.atrasado, reposicao: !!l.reposicao, diag: l.diag || null,
  }));
}
function reviverLotes(arr) {
  return (arr || []).map(l => ({
    ...l, prazo: dataDeChave(l.prazo), inicio: dataDeChave(l.inicio), fim: dataDeChave(l.fim),
    pronto: dataDeChave(l.pronto), livreAte: dataDeChave(l.livreAte),
    aloc: (l.aloc || []).map(a => ({ data: dataDeChave(a[0]), n: a[1] })),
  }));
}

// Formato da embalagem PET a partir do nome (PET 1L, PET 2L, PET 500ML...)
function formatoPet(nome) {
  const n = normalizarPlano(nome);
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(ML|LITROS?|LT|L)\b/);
  if (!m) return { rotulo: "PET", litros: 0 };
  const v = parseFloat(m[1].replace(",", "."));
  const litros = m[2] === "ML" ? v / 1000 : v;
  return { rotulo: litros < 1 ? `${Math.round(litros * 1000)}ml` : `${litros}L`, litros };
}

// Previsão de vendas da semana -> envase dia a dia -> de qual tanque sai cada litro.
// PET: cada produto é envasado UMA vez na semana, em bloco (agrupado por formato), até 8.000 L/dia, sem voltar.
// Barril: previsão da semana dividida pelos 5 dias úteis. A cerveja sai primeiro dos tanques que ficaram prontos antes.
function simularEnvase({ semanas, necPorMes, semanasPorMes, lotes, statusTanques, hojeReal, semanasPet500 }) {
  const estoque = [];
  statusTanques.forEach(t => {
    if (t.base && t.litrosNoTanque > 0) estoque.push({ id: `${t.nome}|atual`, tanque: t.nome, estilo: t.base, rest: t.litrosNoTanque, pronto: t.pronto && t.pronto > hojeReal ? t.pronto : hojeReal });
  });
  lotes.forEach(l => estoque.push({ id: `${l.tanque}|L${chaveDia(l.inicio)}`, tanque: l.tanque, estilo: l.estilo, rest: l.volume, pronto: l.pronto }));
  const porMes = {}; necPorMes.forEach(({ chave, nec }) => { porMes[chave] = nec; });
  const retirar = (estilo, litros, dia) => {
    let falta = litros; const usos = [];
    estoque.filter(e => e.estilo === estilo && e.rest > 0.5 && e.pronto <= dia).sort((a, b) => a.pronto - b.pronto || a.rest - b.rest).forEach(e => {
      if (falta <= 0.5) return;
      const q = Math.min(e.rest, falta); e.rest -= q; falta -= q;
      const u = usos.find(x => x.id === e.id); if (u) u.litros += q; else usos.push({ id: e.id, tanque: e.tanque, litros: q });
    });
    return { usos, falta: Math.max(0, falta) };
  };
  const somarUsos = (alvo, usos) => usos.forEach(u => { const x = alvo.find(y => y.id === u.id); if (x) x.litros += u.litros; else alvo.push({ ...u }); });
  const out = {};
  const cacheProd = {};
  const produtosDaSemana = (seg) => {
    const kk = chaveDia(seg); if (cacheProd[kk]) return cacheProd[kk];
    const quarta = somarDiasData(seg, 2);
    const chave = `${quarta.getFullYear()}-${String(quarta.getMonth() + 1).padStart(2, "0")}`;
    const nec = porMes[chave] || [];
    const W = (semanasPorMes[chave] || []).length || 1;
    const produtos = [];
    nec.forEach(n => {
      const fb = n.barrilProj > 0 ? n.barril / n.barrilProj : 1, fp = n.petProj > 0 ? n.pet / n.petProj : 1;
      let temB = false, temP = false;
      n.det.forEach(d => {
        if (d.lit <= 0) return;
        if (d.emb === "chope") { produtos.push({ produto: d.produto, estilo: n.estilo, emb: "barril", litros: d.lit * fb / W }); temB = true; }
        else if (d.emb === "pet") { produtos.push({ produto: d.produto, estilo: n.estilo, emb: "pet", litros: d.lit * fp / W }); temP = true; }
      });
      if (!temB && n.barril > 0) produtos.push({ produto: `${n.estilo} (barril · ajuste manual)`, estilo: n.estilo, emb: "barril", litros: n.barril / W });
      if (!temP && n.pet > 0) produtos.push({ produto: `${n.estilo} (PET · ajuste manual)`, estilo: n.estilo, emb: "pet", litros: n.pet / W });
    });
    cacheProd[kk] = { chave, W, produtos };
    return cacheProd[kk];
  };
  semanas.forEach((seg, idxSem) => {
    const { chave, W, produtos } = produtosDaSemana(seg);
    const dias = [0, 1, 2, 3, 4].map(i => somarDiasData(seg, i));
    const uteis = dias.map((d, i) => (diaUtil(d) ? i : -1)).filter(i => i >= 0);
    // PET 500ml: envasa a cada N semanas, de uma vez, o volume de N semanas (vira estoque de produto acabado)
    const N500 = Math.max(1, Number(semanasPet500) || 1);
    const petVenda = produtos.filter(p => p.emb === "pet");
    const petEnv = [];
    petVenda.forEach(p => {
      if (formatoPet(p.produto).rotulo === "500ml" && N500 > 1) {
        if (idxSem % N500 !== 0) return;
        let tot = 0;
        for (let k = 0; k < N500 && idxSem + k < semanas.length; k++) { const pr = produtosDaSemana(semanas[idxSem + k]).produtos.find(x => x.produto === p.produto && x.emb === "pet"); if (pr) tot += pr.litros; }
        petEnv.push({ ...p, litros: tot });
      } else petEnv.push(p);
    });
    // PET em blocos por formato, 8.000 L/dia
    const pet = petEnv.map(p => ({ ...p, fmt: formatoPet(p.produto) }));
    const volFmt = {}; pet.forEach(p => { volFmt[p.fmt.rotulo] = (volFmt[p.fmt.rotulo] || 0) + p.litros; });
    pet.sort((a, b) => (volFmt[b.fmt.rotulo] - volFmt[a.fmt.rotulo]) || a.fmt.rotulo.localeCompare(b.fmt.rotulo) || b.litros - a.litros);
    const blocosPorDia = [[], [], [], [], []]; let di = 0, uso = 0, overflow = 0;
    pet.forEach(p => {
      let rest = p.litros;
      while (rest > 0.5) {
        if (di >= uteis.length) { overflow += rest; break; }
        const q = Math.min(rest, CAPACIDADE_ENVASE_PET_DIA - uso);
        blocosPorDia[uteis[di]].push({ produto: p.produto, estilo: p.estilo, fmt: p.fmt.rotulo, litros: q });
        rest -= q; uso += q;
        if (uso >= CAPACIDADE_ENVASE_PET_DIA - 0.5) { di++; uso = 0; }
      }
    });
    const barril = {}; produtos.filter(p => p.emb === "barril").forEach(p => { barril[p.estilo] = (barril[p.estilo] || 0) + p.litros; });
    const barrilRes = Object.entries(barril).map(([estilo, litros]) => ({ estilo, litros, usos: [], falta: 0 }));
    const petDias = dias.map((d, i) => ({ data: d, blocos: blocosPorDia[i].map(b => ({ ...b, usos: [], falta: 0 })), litros: 0 }));
    dias.forEach((d, i) => {
      petDias[i].blocos.forEach(b => { const r = retirar(b.estilo, b.litros, d); b.usos = r.usos; b.falta = r.falta; petDias[i].litros += b.litros; });
      if (diaUtil(d)) barrilRes.forEach(b => { const r = retirar(b.estilo, b.litros / uteis.length, d); somarUsos(b.usos, r.usos); b.falta += r.falta; });
    });
    out[chaveDia(seg)] = {
      chave, W, produtos, petDias, barril: barrilRes, overflow,
      totalPet: petVenda.reduce((s, p) => s + p.litros, 0), diasUteis: uteis.length, totalBarril: Object.values(barril).reduce((s, v) => s + v, 0),
    };
  });
  return out;
}

function PlanejamentoProducao() {
  const { produtosDados, produtosNomes, produtosPeriodos, tanques, receitas, estoquePorProduto, planoSalvoTexto, cenariosSalvosTexto } = useData();
  const mesAtual = chaveMesAtualReal();
  const hoje = useMemo(() => proximoUtil(new Date()), []);
  const hojeReal = useMemo(() => { const x = new Date(); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); }, []);

  const salvoInicial = useMemo(() => { try { return planoSalvoTexto ? JSON.parse(planoSalvoTexto) : null; } catch (e) { return null; } }, [planoSalvoTexto]);
  const cfg0 = (salvoInicial && salvoInicial.config) || {};

  const mesesAlvo = useMemo(() => {
    const out = [];
    let [a, m] = mesAtual.split("-").map(Number);
    for (let i = 0; i < 13; i++) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
    return out;
  }, [mesAtual]);

  const [alvo, setAlvo] = useState(() => {
    if (cfg0.alvo) return cfg0.alvo;
    let [a, m] = mesAtual.split("-").map(Number);
    m++; if (m > 12) { m = 1; a++; }
    return `${a}-${String(m).padStart(2, "0")}`;
  });
  const [cenario, setCenario] = useState(cfg0.cenario || "base");
  const [pcts, setPcts] = useState(cfg0.pcts || { min: 80, base: 100, max: 120 });
  const [incluirOutros, setIncluirOutros] = useState(cfg0.incluirOutros ?? true);
  const [descontarEstoque, setDescontarEstoque] = useState(cfg0.descontarEstoque ?? true);
  const [folga, setFolga] = useState(cfg0.folga ?? 3);
  const [limpezaDias, setLimpezaDias] = useState(cfg0.limpezaDias ?? 1);
  const [diasPadrao, setDiasPadrao] = useState(cfg0.diasPadrao ?? 14);
  const [semVendaMeses, setSemVendaMeses] = useState(cfg0.semVendaMeses ?? 3);
  const [pctMes, setPctMes] = useState(cfg0.pctMes || {});
  const [mostrarTodosAtrasos, setMostrarTodosAtrasos] = useState(false);
  const [toleranciaSemana, setToleranciaSemana] = useState(cfg0.toleranciaSemana ?? 4); // dias da semana de entrega em que o lote ainda pode ficar pronto
  const [lotesManuais, setLotesManuais] = useState(cfg0.lotesManuais || []); // produções incluídas à mão
  const [novoManual, setNovoManual] = useState({ tanque: "", estilo: "", inicio: "" });
  const [semanasPet500, setSemanasPet500] = useState(cfg0.semanasPet500 ?? 4); // PET 500ml: envasa de N em N semanas
  const [regrasTanque, setRegrasTanque] = useState(cfg0.regrasTanque || {}); // instruções por tanque: {TANQUE n: {bloqueado, estilos[]}}
  const [loteMax, setLoteMax] = useState(cfg0.loteMax || {}); // lote máximo (L) por estilo
  const [reporTanques, setReporTanques] = useState(cfg0.reporTanques ?? true); // false = produz só quando a demanda/estoque pedir
  const [diasLote, setDiasLote] = useState(cfg0.diasLote || {}); // maturação ajustada por lote: "TANQUE n|ordem" -> dias
  const [prioridade, setPrioridade] = useState(cfg0.prioridade || []); // estilos que não podem atrasar, em ordem
  const [mesesOff, setMesesOff] = useState(cfg0.mesesOff || {}); // meses que NÃO quero projetar
  const [ovProd, setOvProd] = useState(cfg0.ovProd || {}); // litros/mês digitados à mão por produto (mês|produto)
  const [diasEstilo, setDiasEstilo] = useState(cfg0.diasEstilo || {}); // dias de maturação por estilo (sobrescreve a receita)
  const [diasMes, setDiasMes] = useState(cfg0.diasMes || {});         // dias por mês+estilo (sobrescreve o do estilo)
  const [estilosOff, setEstilosOff] = useState(cfg0.estilosOff || {}); // estilos desmarcados (não entram no plano)
  const [ovBarril, setOvBarril] = useState(cfg0.ovBarril || {});
  const [ovPet, setOvPet] = useState(cfg0.ovPet || {});
  const [ritmo, setRitmo] = useState(cfg0.ritmo || "auto"); // 'auto' | '3' | '6'
  const [vista, setVista] = useState("30");
  const [mesVista, setMesVista] = useState(alvo);
  const [granular, setGranular] = useState("dia");
  const [feitos, setFeitos] = useState(cfg0.feitos || {});
  const [expandidos, setExpandidos] = useState({});
  const [cenariosSalvos, setCenariosSalvos] = useState(() => { try { const a = cenariosSalvosTexto ? JSON.parse(cenariosSalvosTexto) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } });
  const [nomeNovoCenario, setNomeNovoCenario] = useState("");
  const [cenarioCarregado, setCenarioCarregado] = useState("");
  const [msgCenario, setMsgCenario] = useState("");
  const [cenarioValidado, setCenarioValidado] = useState(cfg0.cenarioValidado ?? !!salvoInicial);
  const [planoSalvo, setPlanoSalvo] = useState(salvoInicial);
  const [previa, setPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msgSalvar, setMsgSalvar] = useState("");

  const temConfig = tanques && tanques.length && receitas && receitas.length;

  const { receitaPorEstilo, resolverBase, matchers } = useMemo(() => {
    const porEstilo = {};
    (receitas || []).forEach(r => { porEstilo[normalizarPlano(r.estilo)] = r; });
    const resolver = (estilo) => {
      let atual = estilo, n = 0;
      while (n++ < 6) {
        const r = porEstilo[normalizarPlano(atual)];
        if (!r || !r.derivadaDe || !porEstilo[normalizarPlano(r.derivadaDe)]) return r ? r.estilo : atual;
        atual = r.derivadaDe;
      }
      return atual;
    };
    const ms = (receitas || []).filter(r => r.trecho).map(r => {
      const t = normalizarPlano(r.trecho);
      return { estilo: r.estilo, tamanho: t.length, re: new RegExp("(^|[^A-Z0-9])" + escaparRegex(t)) };
    }).sort((a, b) => b.tamanho - a.tamanho);
    return { receitaPorEstilo: porEstilo, resolverBase: resolver, matchers: ms };
  }, [receitas]);

  const estiloDeTexto = (texto) => {
    const n = normalizarPlano(texto);
    if (!n) return null;
    if (receitaPorEstilo[n]) return receitaPorEstilo[n].estilo;
    const m = matchers.find(x => x.re.test(n));
    return m ? m.estilo : null;
  };

  // status atual dos tanques (vem da aba "tanques")
  const statusTanques = useMemo(() => (tanques || []).map(t => {
    const temCerveja = !!(t.cerveja || t.litrosNoTanque > 0);
    if (!temCerveja) return { ...t, situacao: "vazio", livreDe: null };
    const estilo = estiloDeTexto(t.cerveja);
    const base = estilo ? resolverBase(estilo) : null;
    const rec = base ? receitaPorEstilo[normalizarPlano(base)] : null;
    const diasRec = rec && rec.dias ? rec.dias : null;
    let dataProd = t.dataProducao ? dataDeChave(t.dataProducao) : null;
    let diasProd = dataProd ? Math.max(0, diasEntre(dataProd, hojeReal)) : null;
    if (!dataProd && t.diasNoTanque != null) { diasProd = t.diasNoTanque; dataProd = somarDiasData(hojeReal, -t.diasNoTanque); }
    const ovAtual = diasLote[`${t.nome}|atual`];
    const diasUsados = ovAtual !== undefined && ovAtual !== "" && Number(ovAtual) > 0 ? Number(ovAtual) : (diasRec || diasPadrao);
    let diasLiberar = null, pronto = null;
    if (dataProd) { pronto = somarDiasData(dataProd, diasUsados); diasLiberar = Math.max(0, diasEntre(hojeReal, pronto)); }
    const prontaJa = dataProd ? diasLiberar === 0 : false;
    return {
      ...t, estilo, base, diasRec, dataProd, diasProd, diasLiberar, pronto, diasUsados,
      situacao: !dataProd ? "sem data" : prontaJa ? "pronta" : "maturando",
      livreDe: pronto && pronto > hoje ? pronto : null,
    };
  }), [tanques, receitaPorEstilo, matchers, diasPadrao, hoje, hojeReal, diasLote]);

  const tanquesPlano = useMemo(() => statusTanques.map(t => ({ ...t })), [statusTanques]);
  const suprimentoInicial = useMemo(() => {
    const m = {};
    statusTanques.forEach(t => {
      if (t.base && t.litrosNoTanque > 0) m[t.base] = (m[t.base] || 0) + t.litrosNoTanque;
    });
    return m;
  }, [statusTanques]);
  // estoque de produto acabado (aba estoque: chope/barril e PET), somado por estilo base
  const estoqueAcabado = useMemo(() => {
    const m = {};
    (produtosNomes || []).forEach(nome => {
      if (classificarEmbalagem(nome) === "outros") return;
      const lit = (estoquePorProduto[nome] && estoquePorProduto[nome].litros) || 0;
      if (lit <= 0) return;
      const est = estiloDeTexto(nome); if (!est) return;
      const base = resolverBase(est);
      m[base] = (m[base] || 0) + lit;
    });
    return m;
  }, [produtosNomes, estoquePorProduto, matchers]);
  // o que o planejador pode usar já: cerveja nos tanques + (se ligado) produto acabado
  const suprimentoPlano = useMemo(() => {
    const m = { ...suprimentoInicial };
    if (descontarEstoque) Object.keys(estoqueAcabado).forEach(e => { m[e] = (m[e] || 0) + estoqueAcabado[e]; });
    return m;
  }, [suprimentoInicial, estoqueAcabado, descontarEstoque]);

  // semanas de cada mês e meses planejados (qualquer mês com semana de entrega nos próximos 120 dias + mês-alvo)
  const semanasPorMes = useMemo(() => { const m = {}; mesesAlvo.forEach(c => { m[c] = semanasDoMes(c); }); return m; }, [mesesAlvo]);
  const mesesCandidatos = useMemo(() => {
    const limite = somarDiasData(hoje, 120);
    const set = new Set(mesesAlvo.filter(c => semanasPorMes[c].some(s => s > hoje && s <= limite)));
    set.add(alvo);
    set.add(mesAtual);
    return [...set].sort();
  }, [mesesAlvo, semanasPorMes, hoje, alvo, mesAtual]);
  // seletor: meses desmarcados saem da projeção (o mês em destaque fica sempre)
  const mesesPlano = useMemo(() => mesesCandidatos.filter(c => c === alvo || !mesesOff[c]), [mesesCandidatos, alvo, mesesOff]);

  // projeção por estilo base para cada mês planejado (com a origem de cada número)
  const projecoes = useMemo(() => {
    if (!temConfig) return {};
    const fechados = (produtosPeriodos || []).filter(p => p < mesAtual);
    const janelaVenda = new Set(fechados.slice(-Math.max(1, semVendaMeses)));
    const resultado = {};
    mesesPlano.forEach(chave => {
      const pct = ((pctMes[chave] !== undefined && pctMes[chave] !== "" ? Number(pctMes[chave]) : pcts[cenario]) || 0) / 100;
      const [aAlvo, mAlvo] = chave.split("-").map(Number);
      const refAno = `${aAlvo - 1}-${String(mAlvo).padStart(2, "0")}`;
      const porEstilo = {}; const semReceita = {}; const ignorados = {};
      produtosNomes.forEach(nome => {
        if (classificarEmbalagem(nome) === "outros") return; // garrafa, lata etc. ficam fora do planejamento
        const rows = produtosDados[nome] || [];
        const vendeuRecente = rows.some(r => janelaVenda.has(r.chave) && (r.litros || 0) > 0);
        let lit = 0, origem = "";
        const refRow = rows.find(r => r.chave === refAno);
        if (refRow && (refRow.litros || 0) > 0) { lit = refRow.litros; origem = `mesmo mês do ano anterior (${labelMes(refAno)})`; }
        else {
          // produto novo / sem histórico no mesmo mês do ano passado: média dos últimos meses fechados COM venda (até 3)
          const f = rows.filter(r => r.chave < mesAtual && (r.litros || 0) > 0).slice(-3);
          lit = f.length ? f.reduce((s, r) => s + r.litros, 0) / f.length : 0;
          origem = f.length ? `produto sem histórico no ano anterior: média dos últimos ${f.length} mês(es) com venda (${f.map(r => labelMes(r.chave)).join(", ")})` : "sem vendas registradas — informe manualmente";
        }
        lit *= pct;
        const est = (estoquePorProduto[nome] && estoquePorProduto[nome].litros) || 0;
        const manualP = ovProd[`${chave}|${nome}`];
        const temManual = manualP !== undefined && manualP !== "";
        if (!temManual) {
          if (semVendaMeses > 0 && !vendeuRecente) { if (lit > 0) ignorados[nome] = lit; return; }
          if (lit <= 0 && est <= 0 && !vendeuRecente) return;
        }
        const estilo = estiloDeTexto(nome);
        if (!estilo) { if (lit > 0) semReceita[nome] = Math.max(semReceita[nome] || 0, lit); return; }
        const base = resolverBase(estilo);
        const emb = classificarEmbalagem(nome);
        const o = porEstilo[base] || (porEstilo[base] = { barril: 0, pet: 0, outros: 0, estoque: 0, det: [] });
        if (emb === "chope") o.barril += lit; else if (emb === "pet") o.pet += lit; else o.outros += lit;
        o.estoque += est;
        if (lit > 0 || est > 0 || vendeuRecente || temManual) o.det.push({ produto: nome, emb, lit, est, origem });
      });
      resultado[chave] = { porEstilo, semReceita, ignorados };
    });
    return resultado;
  }, [temConfig, mesesPlano, cenario, pcts, pctMes, produtosNomes, produtosDados, produtosPeriodos, estoquePorProduto, mesAtual, semVendaMeses, matchers, ovProd]);

  const montarNecessidades = (proj, chaveMes, usarOverrides, descontar) => {
    if (!proj) return [];
    return Object.entries(proj.porEstilo).filter(([estilo]) => !estilosOff[estilo]).map(([estilo, o]) => {
      const detAj = o.det.map(d => {
        const v = usarOverrides ? ovProd[`${chaveMes}|${d.produto}`] : undefined;
        const manual = v !== undefined && v !== "";
        return { ...d, litProj: d.lit, lit: manual ? (Number(v) || 0) : d.lit, manual };
      });
      const barrilProj = detAj.filter(d => d.emb === "chope").reduce((s, d) => s + d.lit, 0);
      const petProjAj = detAj.filter(d => d.emb === "pet").reduce((s, d) => s + d.lit, 0);
      const ovB = usarOverrides ? ovBarril[`${chaveMes}|${estilo}`] : undefined, ovP = usarOverrides ? ovPet[`${chaveMes}|${estilo}`] : undefined;
      const barril = ovB !== undefined && ovB !== "" ? Number(ovB) : barrilProj;
      const pet = ovP !== undefined && ovP !== "" ? Number(ovP) : petProjAj;
      const bruto = barril + pet;
      const estoque = descontar ? o.estoque : 0;
      const necessario = Math.max(0, bruto - estoque);
      const fator = bruto > 0 ? necessario / bruto : 0;
      const rec = receitaPorEstilo[normalizarPlano(estilo)];
      const diasReceita = rec && rec.dias ? rec.dias : null;
      const dOvMes = Number(diasMes[`${chaveMes}|${estilo}`]), dOvEstilo = Number(diasEstilo[estilo]);
      const dias = dOvMes > 0 ? dOvMes : dOvEstilo > 0 ? dOvEstilo : diasReceita;
      return { estilo, barrilProj, petProj: petProjAj, barril, pet, estoque: o.estoque, necessario, barrilProd: barril * fator, petProd: pet * fator, dias, diasReceita, diasEstiloBase: dOvEstilo > 0 ? dOvEstilo : diasReceita, diasUsados: dias || diasPadrao, det: detAj };
    }).filter(n => n.necessario > 0 || n.barril > 0 || n.pet > 0 || n.estoque > 0).sort((a, b) => b.necessario - a.necessario);
  };

  const primeiroMesProducao = mesesPlano.find(c => (semanasPorMes[c] || []).some(sm => sm > hoje));
  const descontaMes = () => false; // o estoque de produto acabado agora entra como suprimento (consumido semana a semana), não como desconto do 1º mês
  const necPorMes = useMemo(() => mesesPlano.map(chave => ({ chave, nec: montarNecessidades(projecoes[chave], chave, true, descontaMes(chave)) })),
    [mesesPlano, projecoes, ovBarril, ovPet, ovProd, estilosOff, diasEstilo, diasMes, descontarEstoque, diasPadrao, receitaPorEstilo]);
  const necessidades = useMemo(() => montarNecessidades(projecoes[alvo], alvo, true, descontaMes(alvo)),
    [projecoes, alvo, ovBarril, ovPet, ovProd, estilosOff, diasEstilo, diasMes, incluirOutros, descontarEstoque, diasPadrao, receitaPorEstilo]);

  // cada mês vira N entregas semanais iguais (volume do mês ÷ nº de semanas), cada uma pronta até o início da semana
  const mesesParaPlano = useMemo(() => {
    const limite = somarDiasData(hoje, 120);
    const out = [];
    mesesPlano.forEach((chave, idx) => {
      const semanas = semanasPorMes[chave] || [];
      const W = semanas.length || 1;
      const necs = montarNecessidades(projecoes[chave], chave, true, descontaMes(chave)).filter(n => n.necessario > 0);
      semanas.filter(sm => sm > hoje && (sm <= limite || chave === alvo)).forEach(sm => {
        out.push({ chave, prazo: sm, necessidades: necs.map(n => ({ ...n, necessario: n.necessario / W, petProd: n.petProd / W, barrilProd: n.barrilProd / W })) });
      });
    });
    return out.sort((a, b) => a.prazo - b.prazo);
  }, [mesesPlano, semanasPorMes, hoje, projecoes, alvo, ovBarril, ovPet, ovProd, estilosOff, diasEstilo, diasMes, descontarEstoque, diasPadrao, receitaPorEstilo]);

  const planos = useMemo(() => {
    if (!temConfig) return null;
    const args = { meses: mesesParaPlano, tanques: tanquesPlano, hoje, folga, limpeza: limpezaDias, diasPadrao, suprimentoInicial: suprimentoPlano, horizonteDias: 120, hellesNome: (receitaPorEstilo["HELLES"] || {}).estilo, hellesDias: (receitaPorEstilo["HELLES"] || {}).dias, prioridade, tolerancia: toleranciaSemana, diasLote, repor: reporTanques, regras: regrasTanque, loteMax, manuais: lotesManuais };
    return {
      p3: planejarBrassagem({ ...args, tanques: tanquesPlano.map(t => ({ ...t })), capDia: 3 }),
      p6: planejarBrassagem({ ...args, tanques: tanquesPlano.map(t => ({ ...t })), capDia: 6 }),
    };
  }, [temConfig, mesesParaPlano, tanquesPlano, hoje, folga, limpezaDias, diasPadrao, suprimentoPlano, prioridade, receitaPorEstilo, toleranciaSemana, diasLote, reporTanques, regrasTanque, loteMax, lotesManuais]);

  if (!temConfig) {
    return (
      <div style={{ color: "#888", fontSize: 13, padding: 16 }}>
        Não encontrei as abas <strong style={{ color: "#C69700" }}>tanques</strong> e <strong style={{ color: "#C69700" }}>receitas</strong> no retorno da planilha.
        Atualize o Code.gs no Apps Script (versão v3.1), reimplante e recarregue o app.
      </div>
    );
  }

  const { p3, p6 } = planos;
  let recomendado = "3", motivo;
  if (p3.atrasados === 0) {
    motivo = `Com 3 bateladas/dia tudo fica pronto no prazo (${p3.diasBrassagem} dias de brassagem no período). É o ritmo mais folgado para a equipe.`;
  } else if (p6.atrasados < p3.atrasados) {
    recomendado = "6";
    motivo = p6.atrasados === 0
      ? `Com 3 bateladas/dia, ${p3.atrasados} lote(s) atrasam. Com 6/dia tudo fecha no prazo (${p6.diasBrassagem} dias de brassagem). Há pressa: use 6/dia.`
      : `Mesmo com 6/dia ${p6.atrasados} lote(s) atrasam (contra ${p3.atrasados} com 3/dia): falta capacidade de tanque/brassagem para esse volume.`;
  } else {
    motivo = `Nem 3 nem 6 bateladas/dia resolvem os ${p3.atrasados} atraso(s): o gargalo são os tanques/prazos de maturação, não a brassagem.`;
  }
  const ritmoUsado = ritmo === "auto" ? recomendado : ritmo;
  const planoCalc = ritmoUsado === "6" ? p6 : p3;

  // qualquer mudança de premissa (estilos, %, overrides, dias) sai do plano salvo e mostra a prévia recalculada
  const primeiraRef = useRef(true);
  useEffect(() => {
    if (primeiraRef.current) { primeiraRef.current = false; return; }
    setPrevia(true);
    if (planoSalvo) setCenarioValidado(true); // havia plano salvo: mantém a programação e a recomendação 3/6 visíveis
  }, [estilosOff, mesesOff, prioridade, toleranciaSemana, diasLote, reporTanques, regrasTanque, loteMax, lotesManuais, semanasPet500, pcts, pctMes, ovBarril, ovPet, ovProd, diasEstilo, diasMes, descontarEstoque, semVendaMeses, limpezaDias, diasPadrao, alvo, cenario]);

  const usarSalvo = !!planoSalvo && !previa;
  const lotesExibidos = usarSalvo ? reviverLotes(planoSalvo.lotes) : planoCalc.lotes;
  const capDia = usarSalvo ? (planoSalvo.ritmo === "6" ? 6 : 3) : (ritmoUsado === "6" ? 6 : 3);
  const chaveLote = l => `${l.tanque}|${l.estilo}|${l.mes}|${chaveDia(l.inicio)}`;
  const plano = { lotes: lotesExibidos, atrasados: lotesExibidos.filter(l => l.atrasado).length };

  const configAtual = () => ({ lotesManuais, semanasPet500, regrasTanque, loteMax, reporTanques, diasLote, toleranciaSemana, prioridade, mesesOff, ovProd, diasEstilo, diasMes, cenarioValidado, alvo, cenario, pcts, pctMes, estilosOff, incluirOutros, descontarEstoque, folga, limpezaDias, diasPadrao, semVendaMeses, ovBarril, ovPet, ritmo, feitos });
  async function salvarPlano(lotesParaSalvar, ritmoSalvo, feitosAtual) {
    setSalvando(true); setMsgSalvar("");
    const payload = { salvoEm: new Date().toISOString(), ritmo: ritmoSalvo, config: { ...configAtual(), feitos: feitosAtual }, lotes: serializarLotes(lotesParaSalvar) };
    try { localStorage.setItem("hbier_plano_producao", JSON.stringify(payload)); } catch (e) { /* ignora */ }
    try {
      const r = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "salvarPlano", plano: JSON.stringify(payload) }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "falha ao salvar");
      setPlanoSalvo(payload); setPrevia(false);
      setMsgSalvar("✅ Plano salvo na planilha (aba plano_salvo) — todos os aparelhos veem o mesmo plano.");
    } catch (e) {
      setMsgSalvar("⚠️ Não consegui salvar na planilha (" + (e.message || e) + "). Atualize o Code.gs para v3.1 e reimplante. O plano ficou guardado só neste navegador.");
      setPlanoSalvo(payload); setPrevia(false);
    }
    setSalvando(false);
  }
  // cenários de vendas com nome (guardados na planilha, aba cenarios_salvos)
  async function persistirCenarios(lista, msgOk) {
    setCenariosSalvos(lista);
    try { localStorage.setItem("hbier_cenarios_salvos", JSON.stringify(lista)); } catch (e) { /* ignora */ }
    try {
      const r = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "salvarCenarios", cenarios: JSON.stringify(lista) }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "falha ao salvar");
      setMsgCenario(msgOk);
    } catch (e) {
      setMsgCenario("⚠️ Não consegui gravar na planilha (" + (e.message || e) + "). Atualize o Code.gs para v3.3 e reimplante; por ora ficou só neste navegador.");
    }
  }
  function salvarCenarioComNome() {
    const nome = nomeNovoCenario.trim();
    if (!nome) { setMsgCenario("Digite um nome para o cenário."); return; }
    const resumo = {};
    necPorMes.forEach(({ chave, nec }) => { resumo[chave] = Math.round(nec.reduce((s, n) => s + n.necessario, 0)); });
    const novo = {
      nome, salvoEm: new Date().toISOString(), resumo,
      config: { cenario, pcts, pctMes, estilosOff, ovBarril, ovPet, ovProd, mesesOff, prioridade, toleranciaSemana, diasLote, reporTanques, regrasTanque, loteMax, lotesManuais, semanasPet500, semVendaMeses, descontarEstoque, diasEstilo, diasMes },
    };
    const existe = cenariosSalvos.some(c => c.nome.toLowerCase() === nome.toLowerCase());
    const lista = existe ? cenariosSalvos.map(c => (c.nome.toLowerCase() === nome.toLowerCase() ? novo : c)) : [...cenariosSalvos, novo];
    setCenarioCarregado(nome);
    persistirCenarios(lista, existe ? `✅ Cenário “${nome}” atualizado.` : `✅ Cenário “${nome}” salvo.`);
  }
  function carregarCenario(c) {
    const g = c.config || {};
    setCenario(g.cenario || "base"); setPcts(g.pcts || { min: 80, base: 100, max: 120 }); setPctMes(g.pctMes || {});
    setEstilosOff(g.estilosOff || {}); setOvBarril(g.ovBarril || {}); setOvPet(g.ovPet || {});
    setSemVendaMeses(g.semVendaMeses ?? 3); setDescontarEstoque(!!g.descontarEstoque); setDiasEstilo(g.diasEstilo || {}); setDiasMes(g.diasMes || {}); setOvProd(g.ovProd || {}); setMesesOff(g.mesesOff || {}); setPrioridade(g.prioridade || []); setToleranciaSemana(g.toleranciaSemana ?? 4); setDiasLote(g.diasLote || {}); setReporTanques(!!g.reporTanques); setRegrasTanque(g.regrasTanque || {}); setLotesManuais(g.lotesManuais || []); setSemanasPet500(g.semanasPet500 ?? 4); setLoteMax(g.loteMax || {});
    setCenarioCarregado(c.nome); setNomeNovoCenario(c.nome); setCenarioValidado(false);
    setMsgCenario(`Cenário “${c.nome}” carregado. Confira os números e valide para ver a programação.`);
  }
  function excluirCenario(c) {
    if (!window.confirm(`Excluir o cenário “${c.nome}”?`)) return;
    persistirCenarios(cenariosSalvos.filter(x => x.nome !== c.nome), `Cenário “${c.nome}” excluído.`);
  }
  function alternarFeito(l) {
    const k = chaveLote(l);
    const novo = { ...feitos, [k]: !feitos[k] };
    setFeitos(novo);
    if (usarSalvo) salvarPlano(lotesExibidos, planoSalvo.ritmo, novo);
  }

  let wIni = hoje, wFim;
  if (vista === "mes") {
    const [a, m] = mesVista.split("-").map(Number);
    wIni = new Date(a, m - 1, 1); wFim = new Date(a, m, 0);
    if (wIni < hoje && a === hoje.getFullYear() && m === hoje.getMonth() + 1) wIni = hoje;
  } else wFim = somarDiasData(hoje, Number(vista) - 1);

  const semanas = [];
  for (let s = segundaDaSemana(wIni); s <= wFim; s = somarDiasData(s, 7)) semanas.push(s);
  const semanasSim = [];
  const fimSim = wFim > somarDiasData(hojeReal, 120) ? wFim : somarDiasData(hojeReal, 120);
  for (let sm = segundaDaSemana(hojeReal); sm <= fimSim; sm = somarDiasData(sm, 7)) semanasSim.push(sm);
  const envase = simularEnvase({ semanas: semanasSim, necPorMes, semanasPorMes, lotes: lotesExibidos, statusTanques, hojeReal, semanasPet500 });

  // visão tanque a tanque: o que acontece com cada tanque (produção, pronto, saídas de barril/PET, esvaziamento)
  // fatia PET de cada estilo (para dividir o que vai para barril e o que vai para PET ao ficar pronto)
  const petShareEstilo = (e) => { let pet = 0, tot = 0; necPorMes.forEach(({ nec }) => nec.forEach(n => { if (n.estilo === e) { pet += n.pet || 0; tot += (n.pet || 0) + (n.barril || 0); } })); return tot > 0 ? pet / tot : 0; };
  const visaoTanques = (() => {
    const evs = {}; // tanque -> [{data, tipo, litros}]
    Object.keys(envase).forEach(k => {
      const e = envase[k];
      e.petDias.forEach(d => d.blocos.forEach(b => b.usos.forEach(u => { (evs[u.tanque] = evs[u.tanque] || []).push({ id: u.id, data: d.data, tipo: "pet", litros: u.litros }); })));
      e.barril.forEach(b => b.usos.forEach(u => {
        // barril: previsão da semana ÷ 5 dias úteis
        { const du = diasUteisSemana(dataDeChave(k)); du.forEach(dd => (evs[u.tanque] = evs[u.tanque] || []).push({ id: u.id, data: dd, tipo: "barril", litros: u.litros / (du.length || 1) })); }
      }));
    });
    return statusTanques.map(t => {
      const meus = lotesExibidos.filter(l => l.tanque === t.nome).sort((a, b) => a.inicio - b.inicio);
      const ev = (evs[t.nome] || []).slice().sort((a, b) => a.data - b.data);
      // saída de CADA lote (a cerveja do lote continua saindo mesmo depois que o tanque é reenchido: ela vai para o estoque)
      const janela = (id, volume) => {
        const dentro = ev.filter(x => x.id === id);
        const barril = dentro.filter(x => x.tipo === "barril").reduce((s2, x) => s2 + x.litros, 0);
        const pet = dentro.filter(x => x.tipo === "pet").reduce((s2, x) => s2 + x.litros, 0);
        let vazio = null, acum = 0;
        for (const x of dentro) { acum += x.litros; if (acum >= volume - 0.5) { vazio = x.data; break; } }
        return { barril, pet, vazio, saiu: barril + pet };
      };
      const atual = (t.litrosNoTanque > 0) ? (() => {
        return { cerveja: t.base || t.cerveja || "—", litros: t.litrosNoTanque, pronto: t.pronto, ...janela(`${t.nome}|atual`, t.litrosNoTanque) };
      })() : null;
      const passos = meus.map((l) => ({ l, ...janela(`${l.tanque}|L${chaveDia(l.inicio)}`, l.volume) }));
      return { t, atual, passos };
    });
  })();
  const diasDaSemana = (seg) => diasUteisSemana(seg);
  const eventosDia = (d) => {
    const k = chaveDia(d);
    const brass = []; const prontos = [];
    lotesExibidos.forEach(l => {
      l.aloc.forEach(a => { if (chaveDia(a.data) === k) brass.push({ l, n: a.n }); });
      if (chaveDia(proximoUtil(l.pronto)) === k) prontos.push(l);
    });
    // cerveja que já está nos tanques hoje e fica pronta (ou já está pronta) entra como "pronto" no dia certo
    statusTanques.forEach(t => {
      if (!(t.litrosNoTanque > 0) || !t.pronto) return;
      const quando = t.pronto > hoje ? t.pronto : hoje;
      if (chaveDia(proximoUtil(quando)) === k) prontos.push({ tanque: t.nome, estilo: t.base || t.cerveja || "—", atende: t.litrosNoTanque, volume: t.litrosNoTanque, petPct: 0, reposicao: false, pronto: quando, existente: true, aloc: [], capacidade: t.capacidade, bateladas: 1 });
    });
    return { brass, prontos };
  };

  const projAlvoBruto = projecoes[alvo] || { porEstilo: {} };
  // lista de todos os estilos base (com os derivados) e o volume projetado do mês-alvo, para marcar o que entra no plano
  const listaEstilos = (receitas || []).filter(r => resolverBase(r.estilo) === r.estilo).map(r => {
    const o = (projAlvoBruto.porEstilo || {})[r.estilo];
    const vol = o ? o.barril + o.pet : 0;
    const derivados = (receitas || []).filter(x => x.estilo !== r.estilo && resolverBase(x.estilo) === r.estilo).map(x => x.estilo);
    return { estilo: r.estilo, vol, derivados, dias: r.dias };
  }).sort((a, b) => b.vol - a.vol || a.estilo.localeCompare(b.estilo));
  const totBarril = necessidades.reduce((s, n) => s + n.barrilProd, 0);
  const totPet = necessidades.reduce((s, n) => s + n.petProd, 0);
  const totNec = necessidades.reduce((s, n) => s + n.necessario, 0);
  const diasEnvasePet = totPet / CAPACIDADE_ENVASE_PET_DIA;
  const semDias = [...new Set(mesesParaPlano.flatMap(m => m.necessidades.filter(n => !n.dias).map(n => n.estilo)))];
  const projAlvo = projecoes[alvo] || { semReceita: {}, ignorados: {} };
  const semReceitaLista = Object.entries(projAlvo.semReceita).sort((a, b) => b[1] - a[1]);
  const ignoradosLista = Object.entries(projAlvo.ignorados).sort((a, b) => b[1] - a[1]);
  const estoqueTotalConsiderado = necessidades.reduce((s, n) => s + n.estoque, 0);
  const L = v => Math.round(v || 0).toLocaleString("pt-BR");
  const litrosTanques = statusTanques.reduce((s, t) => s + (t.litrosNoTanque || 0), 0);

  const inputNum = { background: "#111", border: "1px solid #444", color: "#fff", borderRadius: 4, padding: "4px 6px", fontSize: 12, width: 78, textAlign: "right" };
  const th = { textAlign: "right", padding: "6px 8px", color: "#C69700", fontSize: 11, borderBottom: "1px solid #333", whiteSpace: "nowrap" };
  const td = { textAlign: "right", padding: "6px 8px", fontSize: 12, color: "#ddd", borderBottom: "1px solid #222" };
  const card = (titulo, valor, sub, cor) => (
    <div style={{ flex: "1 1 150px", background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#999" }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor || "#fff" }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "#888" }}>{sub}</div>}
    </div>
  );
  const btn = (cor) => ({ background: "transparent", border: `1px solid ${cor}`, color: cor, borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 });

  function fasesTanqueSemana(t, seg) {
    const fim = somarDiasData(seg, 6);
    const itens = [];
    // beer que já está no tanque hoje
    const st = statusTanques.find(x => x.nome === t.nome);
    if (st && st.situacao !== "vazio" && seg <= (st.pronto || hoje) ) {
      const ate = st.pronto || hoje;
      if (ate >= seg) itens.push({ txt: `${st.cerveja || "cerveja"} · ${st.situacao === "pronta" ? "🟢 pronta no tanque" : "⏳ maturando (pronta " + fmtDataCurta(ate) + ")"}` });
    }
    lotesExibidos.filter(l => l.tanque === t.nome).forEach(l => {
      if (l.inicio > fim || l.livreAte < seg) return;
      let fase;
      if (l.fim >= seg && l.inicio <= fim) fase = `⚙️ brassagem (${l.aloc.filter(a => a.data >= seg && a.data <= fim).reduce((s, a) => s + a.n, 0)} bat.)`;
      else if (l.pronto >= seg && l.pronto <= fim) fase = "🟢 pronto";
      else if (l.pronto > fim) fase = "⏳ maturando";
      else fase = "🧽 limpeza";
      itens.push({ txt: `${l.estilo}${l.reposicao ? " (reposição)" : ""} · ${fase}`, atrasado: l.atrasado });
    });
    return itens;
  }

  function gerarExcel() {
    const diasLista = [];
    for (let d = wIni; d <= wFim; d = somarDiasData(d, 1)) if (diaUtil(d)) diasLista.push(d);
    return [
      { nome: "Status dos tanques", linhas: [
        ["Tanque", "Capacidade (L)", "Cerveja", "Produzida em", "Dias no tanque", "Dias p/ liberar", "Litros no tanque", "Situação"],
        ...statusTanques.map(t => [t.nome, t.capacidade, t.cerveja || "", t.dataProducao || "", t.diasProd ?? "", t.diasLiberar ?? "", t.litrosNoTanque ?? "", t.situacao]),
      ] },
      { nome: "Cenário por mês", linhas: [
        ["Mês", "Estilo base", "Barril (L)", "PET (L)", "Estoque (L)", "A produzir (L)", "Dias até pronto"],
        ...necPorMes.flatMap(({ chave, nec }) => nec.map(n => [chave, n.estilo, nx(n.barril), nx(n.pet), nx(n.estoque), nx(n.necessario), n.dias || ""])),
      ] },
      { nome: "Brassagem dia a dia", linhas: [
        ["Data", "Dia", "Tanque", "Estilo", "Bateladas", "Litros brassados", "Mês-alvo"],
        ...diasLista.flatMap(d => eventosDia(d).brass.map(({ l, n }) => [chaveDia(d), DIAS_SEM[d.getDay()], l.tanque, l.estilo, n, n * (l.capacidade / l.bateladas), l.mes])),
      ] },
      { nome: "Lotes por tanque", linhas: [
        ["Tanque", "Estilo", "Mês-alvo", "Volume do lote (L)", "Atende (L)", "Sobra p/ estoque (L)", "Bateladas", "1ª brassagem", "Última brassagem", "Pronto", "Prazo", "Atrasado", "Feito", "Tipo"],
        ...lotesExibidos.map(l => [l.tanque, l.estilo, l.mes, nx(l.volume), nx(l.atende), nx(l.sobra), l.bateladas, chaveDia(l.inicio), chaveDia(l.fim), chaveDia(l.pronto), chaveDia(l.prazo), l.atrasado ? "SIM" : "", feitos[chaveLote(l)] ? "SIM" : "", l.reposicao ? "reposição" : "demanda"]),
      ] },
      { nome: "Envase", linhas: [
        ["Mês", "Estilo base", "Barril (L)", "PET (L)", "Dias de envase PET"],
        ...necPorMes.flatMap(({ chave, nec }) => nec.map(n => [chave, n.estilo, nx(n.barrilProd), nx(n.petProd), nx(n.petProd / CAPACIDADE_ENVASE_PET_DIA)])),
      ] },
    ];
  }

  const rotuloRitmo = (r) => r === "auto" ? `Recomendado (${recomendado}/dia)` : `${r} bateladas/dia`;
  const nomeCenario = { min: "Mínimo", base: "Base", max: "Máximo" }[cenario];

  return (
    <div>
      {/* plano salvo */}
      <div style={{ background: usarSalvo ? "#12261a" : "#2a2112", border: `1px solid ${usarSalvo ? "#1f5c35" : "#6b5300"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: usarSalvo ? "#bfe6cc" : "#e8c766" }}>
        {usarSalvo ? (
          <div>
            <strong>📌 Plano salvo em {new Date(planoSalvo.salvoEm).toLocaleString("pt-BR")}</strong> (ritmo {planoSalvo.ritmo}/dia). É esse plano que a equipe segue — as datas só mudam se você replanejar.
          </div>
        ) : (
          <div>
            <strong>{planoSalvo ? "Prévia (não salva)" : "Nenhum plano salvo ainda"}</strong> — {planoSalvo ? "o plano salvo continua valendo até você salvar esta prévia." : "ajuste os dados abaixo e clique em “Salvar este plano”."}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          {usarSalvo && <button style={btn("#C69700")} onClick={() => setPrevia(true)}>🔄 Replanejar com os dados atuais</button>}
          {!usarSalvo && <button disabled={salvando} style={btn("#4caf6b")} onClick={() => salvarPlano(planoCalc.lotes, ritmoUsado, feitos)}>{salvando ? "Salvando…" : "💾 Salvar este plano"}</button>}
          {!usarSalvo && planoSalvo && <button style={btn("#888")} onClick={() => setPrevia(false)}>↩ Voltar ao plano salvo</button>}
          <BotaoExcel nomeAba="PlanejamentoProducao" gerar={gerarExcel} />
        </div>
        {msgSalvar && <div style={{ marginTop: 6 }}>{msgSalvar}</div>}
      </div>

      {/* status dos tanques */}
      <h4 style={{ color: "#fff", fontSize: 13, margin: "6px 0" }}>Status atual dos tanques <span style={{ color: "#888", fontWeight: 400 }}>(preencha na aba “tanques” da planilha: cerveja, dias no tanque e litros)</span></h4>
      <div style={{ overflowX: "auto", marginBottom: 18 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Tanque</th><th style={th}>Capacidade (L)</th><th style={{ ...th, textAlign: "left" }}>Cerveja no tanque</th>
            <th style={th}>Dias no tanque</th><th style={th}>Produzida em</th><th style={th}>Dias p/ liberar</th><th style={th}>Litros no tanque</th><th style={{ ...th, textAlign: "left" }}>Situação</th>
          </tr></thead>
          <tbody>
            {statusTanques.map(t => (
              <tr key={t.nome}>
                <td style={{ ...td, textAlign: "left", color: "#fff", fontWeight: 600 }}>{t.nome}</td>
                <td style={td}>{L(t.capacidade)}</td>
                <td style={{ ...td, textAlign: "left" }}>{t.cerveja || <span style={{ color: "#555" }}>—</span>}{t.cerveja && !t.base && <span style={{ color: "#e57373" }}> (sem receita)</span>}</td>
                <td style={td}>{t.diasProd ?? "—"}</td>
                <td style={td}>{t.dataProd ? t.dataProd.toLocaleDateString("pt-BR") : "—"}</td>
                <td style={{ ...td, color: t.situacao === "maturando" ? "#C69700" : "#ddd" }}>{t.diasLiberar ?? "—"}{t.dataProd && !t.diasRec ? "*" : ""}</td>
                <td style={td}>{t.litrosNoTanque ? L(t.litrosNoTanque) : "—"}</td>
                <td style={{ ...td, textAlign: "left" }}>
                  {t.situacao === "vazio" && <span style={{ color: "#4caf6b" }}>🟢 livre</span>}
                  {t.situacao === "maturando" && <span style={{ color: "#C69700" }}>⏳ maturando — libera {fmtDataCurta(t.pronto)}</span>}
                  {t.situacao === "pronta" && <span style={{ color: "#4caf6b" }}>🟢 cerveja pronta{t.litrosNoTanque ? ` (${L(t.litrosNoTanque)} L)` : ""}</span>}
                  {t.situacao === "sem data" && <span style={{ color: "#e57373" }}>informe os dias no tanque</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>
          Dias p/ liberar = dias da receita − dias no tanque. O planejamento começa daqui: tanque ocupado só entra a partir da data em que libera, e os {L(litrosTanques)} L que já estão nos tanques abatem a necessidade do estilo. * receita sem dias: usei {diasPadrao}.
        </div>
      </div>

      {/* premissas */}
      <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#bbb" }}>
        <div><strong style={{ color: "#fff" }}>Cenário usado:</strong> {nomeCenario} ({pcts[cenario]}%) — projeção de cada produto = litros vendidos no <em>mesmo mês do ano anterior</em> × {pcts[cenario]}% (produto sem histórico no ano anterior: média dos 3 últimos meses fechados). Não usa a aba Projeção do app.</div>
        <div><strong style={{ color: "#fff" }}>Divisão do mês:</strong> o volume de cada mês é dividido igualmente entre as suas 4 ou 5 semanas; cada fatia precisa estar pronta no início da sua semana (não tudo no dia 1º). Hoje {labelMes(alvo)} tem {(semanasPorMes[alvo] || []).length} semanas ≈ {L(totNec / Math.max(1, (semanasPorMes[alvo] || []).length))} L por semana.</div>
        <div><strong style={{ color: "#fff" }}>Regras dos tanques:</strong> tanques grandes (8.000 L ou mais) ficam sempre com Helles; os pequenos (1.000, 2.000 e 3.000 L) rodam os outros estilos, sempre cheios (6.000 L de Oktoberfest = 2 lotes de 3.000 L, não 8.000 L). Outro estilo só entra em tanque grande se, com os pequenos, ficaria atrasado.</div>
        <div><strong style={{ color: "#fff" }}>Tanque sempre cheio:</strong> cada lote começa assim que o tanque libera (e a brassagem pode); a cerveja pode ficar mais tempo no tanque. Quando a demanda dos próximos 120 dias já está coberta, o tanque que libera é enchido de novo com <em>reposição de estoque</em>, repartida entre os estilos conforme o peso da demanda.</div>
        <div><strong style={{ color: "#fff" }}>Estoque considerado:</strong> aba <em>estoque</em> da planilha (litros por produto, somados ao estilo). Hoje está <strong>{descontarEstoque ? `LIGADO (${L(Object.values(estoqueAcabado).reduce((a, v) => a + v, 0))} L de produto acabado abatem o consumo das primeiras semanas)` : "DESLIGADO — o planejamento ignora o estoque de produtos acabados"}</strong>. A cerveja que já está nos tanques sempre é considerada.</div>
        <div><strong style={{ color: "#fff" }}>Sem venda recente:</strong> produtos sem nenhuma venda nos últimos {semVendaMeses || "—"} meses fechados são ignorados (0 = não ignorar).</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "#aaa" }}>Mês em destaque (avisos e lista de estilos)<br />
          <select value={alvo} onChange={e => setAlvo(e.target.value)} style={{ ...inputNum, width: 110, textAlign: "left" }}>
            {mesesAlvo.map(m => <option key={m} value={m}>{labelMes(m)}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 12, color: "#aaa" }}>Meses a projetar<br />
          <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            {mesesCandidatos.map(m => {
              const on = m === alvo || !mesesOff[m];
              return <label key={m} title={m === alvo ? "mês em destaque: sempre projetado" : ""} style={{ ...modoBtnStyle(on, "#4caf6b"), display: "inline-flex", gap: 4, alignItems: "center", cursor: m === alvo ? "default" : "pointer" }}>
                <input type="checkbox" checked={on} disabled={m === alvo} onChange={() => setMesesOff(p => ({ ...p, [m]: !p[m] }))} style={{ margin: 0 }} />{labelMes(m)}
              </label>;
            })}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#aaa" }}>Cenário da projeção<br />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            {["min", "base", "max"].map(c => (
              <button key={c} onClick={() => setCenario(c)} style={modoBtnStyle(cenario === c, "#4caf6b")}>
                {c === "min" ? "Mínimo" : c === "base" ? "Base" : "Máximo"} ({pcts[c]}%)
              </button>
            ))}
          </div>
        </div>
        <label style={{ fontSize: 12, color: "#aaa" }}>% do cenário<br />
          <input type="number" value={pcts[cenario]} onChange={e => setPcts(p => ({ ...p, [cenario]: Math.max(0, Number(e.target.value) || 0) }))} style={inputNum} />
        </label>
        <label style={{ fontSize: 12, color: "#aaa" }}>Ignorar sem venda há (meses)<br />
          <input type="number" value={semVendaMeses} onChange={e => setSemVendaMeses(Math.max(0, Number(e.target.value) || 0))} style={inputNum} />
        </label>
        <label style={{ fontSize: 12, color: "#aaa" }}>Limpeza entre lotes (dias)<br />
          <input type="number" value={limpezaDias} onChange={e => setLimpezaDias(Math.max(0, Number(e.target.value) || 0))} style={inputNum} />
        </label>
        <label style={{ fontSize: 12, color: "#aaa" }}>Dias p/ estilo sem prazo<br />
          <input type="number" value={diasPadrao} onChange={e => setDiasPadrao(Math.max(1, Number(e.target.value) || 1))} style={inputNum} />
        </label>
        <label style={{ fontSize: 12, color: "#aaa" }} title="A venda da semana acontece ao longo dos 5 dias úteis, não toda na segunda. Cerveja que fica pronta até este dia da semana de entrega não conta como atraso.">Tolerância na semana (dias após a segunda)<br />
          <input type="number" min="0" max="6" value={toleranciaSemana} onChange={e => setToleranciaSemana(Math.max(0, Math.min(6, Number(e.target.value) || 0)))} style={inputNum} />
        </label>
        <label style={{ fontSize: 12, color: "#ddd", display: "flex", gap: 6, alignItems: "center" }} title="Desligado: só produz quando o consumo previsto passa do estoque (a sobra de cada lote vai para o estoque). Ligado: tanque que libera sem demanda é enchido de qualquer forma (reposição).">
          <input type="checkbox" checked={reporTanques} onChange={e => setReporTanques(e.target.checked)} /> Repor tanques sem demanda (tanque sempre cheio)
        </label>
        <label style={{ fontSize: 12, color: "#ddd", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={descontarEstoque} onChange={e => setDescontarEstoque(e.target.checked)} /> Considerar estoque de produto acabado (aba estoque)
        </label>
      </div>

      <div style={{ marginBottom: 14, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 12, color: "#fff", marginBottom: 6 }}><strong>🚦 Prioridade contra atrasos</strong> <span style={{ color: "#888" }}>— monte a ordem dos estilos que não podem atrasar; na disputa por tanque e brassagem (mesma semana de entrega) o 1º da lista é atendido primeiro.</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
          {prioridade.length === 0 && <div style={{ fontSize: 11, color: "#777" }}>Nenhuma prioridade definida (vale a ordem automática).</div>}
          {prioridade.map((e, i) => {
            const atrasadosE = (lotesExibidos || []).filter(l => l.estilo === e && l.atrasado && !l.reposicao).length;
            return (
              <div key={e} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#ddd" }}>
                <span style={{ width: 22, color: "#C69700" }}>{i + 1}º</span><strong style={{ minWidth: 150 }}>{e}</strong>
                <button style={{ ...btn("#888"), padding: "1px 7px" }} disabled={i === 0} onClick={() => setPrioridade(p => { const a = p.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}>↑</button>
                <button style={{ ...btn("#888"), padding: "1px 7px" }} disabled={i === prioridade.length - 1} onClick={() => setPrioridade(p => { const a = p.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; })}>↓</button>
                <button style={{ ...btn("#c0392b"), padding: "1px 7px" }} onClick={() => setPrioridade(p => p.filter(x => x !== e))}>remover</button>
                <span style={{ color: atrasadosE ? "#e57373" : "#4caf6b" }}>{atrasadosE ? `${atrasadosE} lote(s) atrasado(s)` : "sem atraso"}</span>
              </div>
            );
          })}
        </div>
        <select value="" onChange={ev => { const v = ev.target.value; if (v) setPrioridade(p => [...p, v]); }} style={{ ...inputNum, width: 220, textAlign: "left" }}>
          <option value="">+ adicionar estilo à lista…</option>
          {listaEstilos.filter(e => !prioridade.includes(e.estilo) && !estilosOff[e.estilo]).map(e => <option key={e.estilo} value={e.estilo}>{e.estilo}</option>)}
        </select>
      </div>

      <details style={{ marginBottom: 14, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 12px" }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#fff" }}><strong>🎛️ Instruções por tanque e por estilo</strong> <span style={{ color: "#888" }}>— diga quais estilos cada tanque pode produzir e o tamanho máximo do lote de cada estilo.</span></summary>
        <div style={{ marginTop: 8, fontSize: 12, color: "#ccc" }}>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>Por tanque</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Sem estilo escolhido = regra automática (tanques grandes: Helles; pequenos: demais estilos). Com estilos escolhidos, o tanque só produz esses estilos (ex.: TANQUE 6 e 7 também com Helles, ou só Red Ale). “Não usar” tira o tanque do planejamento.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {statusTanques.map(t => {
              const r = regrasTanque[t.nome] || {};
              const sel = r.estilos || [];
              const set = patch => setRegrasTanque(p => ({ ...p, [t.nome]: { ...(p[t.nome] || {}), ...patch } }));
              return (
                <div key={t.nome} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", opacity: r.bloqueado ? 0.5 : 1 }}>
                  <strong style={{ width: 90, color: "#fff" }}>{t.nome}</strong><span style={{ width: 60, color: "#888" }}>{L(t.capacidade)} L</span>
                  <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={!!r.bloqueado} onChange={e => set({ bloqueado: e.target.checked })} /> não usar</label>
                  {sel.map(e => <span key={e} style={{ background: "#2a2a2a", borderRadius: 10, padding: "1px 8px" }}>{e} <span style={{ cursor: "pointer", color: "#e57373" }} onClick={() => set({ estilos: sel.filter(x => x !== e) })}>×</span></span>)}
                  <select value="" onChange={ev => { const v = ev.target.value; if (v) set({ estilos: [...sel, v] }); }} style={{ ...inputNum, width: 170, textAlign: "left" }}>
                    <option value="">{sel.length ? "+ outro estilo…" : "automático — + restringir a…"}</option>
                    {listaEstilos.filter(e => !sel.includes(e.estilo)).map(e => <option key={e.estilo} value={e.estilo}>{e.estilo}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>➕ Incluir produção (brassagem) à mão</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Use para encher um tanque parado (ex.: TANQUE 6 ou 7 com Helles). A produção entra a partir do dia escolhido, respeitando as regras de brassagem, e a cerveja vira estoque para a demanda. Atenção: se o tanque ainda tem cerveja, ela precisa estar esvaziada até essa data. Sem demanda pendente, com “Repor tanques” ligado o planejador também enche tanques parados sozinho.</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <select value={novoManual.tanque} onChange={e => setNovoManual(p => ({ ...p, tanque: e.target.value }))} style={{ ...inputNum, width: 130, textAlign: "left" }}><option value="">tanque…</option>{statusTanques.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}</select>
            <select value={novoManual.estilo} onChange={e => setNovoManual(p => ({ ...p, estilo: e.target.value }))} style={{ ...inputNum, width: 150, textAlign: "left" }}><option value="">estilo…</option>{listaEstilos.map(e => <option key={e.estilo} value={e.estilo}>{e.estilo}</option>)}</select>
            <input type="date" value={novoManual.inicio} onChange={e => setNovoManual(p => ({ ...p, inicio: e.target.value }))} style={{ ...inputNum, width: 140, textAlign: "left" }} />
            <button style={btn("#4caf6b")} disabled={!novoManual.tanque || !novoManual.estilo || !novoManual.inicio} onClick={() => { setLotesManuais(l => [...l, novoManual]); setNovoManual({ tanque: "", estilo: "", inicio: "" }); }}>incluir</button>
          </div>
          {lotesManuais.map((m, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>🛠️ {m.tanque} · {m.estilo} · a partir de {fmtDataCurta(dataDeChave(m.inicio))} <button style={{ ...btn("#c0392b"), padding: "1px 7px" }} onClick={() => setLotesManuais(l => l.filter((_, j) => j !== i))}>remover</button></div>)}
          <div style={{ color: "#fff", fontWeight: 700, margin: "12px 0 4px" }}>🧴 PET 500ml · envase em lote</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Os 500ml têm volume pequeno por semana. Para não montar a linha toda semana, envasa-se de N em N semanas o volume de N semanas, que vira estoque de produto acabado. 1 = toda semana.</div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>envasar PET 500ml a cada <input type="number" min="1" max="8" value={semanasPet500} onChange={e => setSemanasPet500(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} style={{ ...inputNum, width: 54 }} /> semanas</label>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>Lote máximo por estilo (litros)</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Ex.: Helles sem álcool = 1.000 → sempre lotes de 1.000 L, mesmo em tanque maior (o tanque fica parcialmente cheio). Vazio = tanque cheio.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
            {listaEstilos.map(e => (
              <label key={e.estilo} style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                <span>{e.estilo}</span>
                <input type="number" min="0" step="500" placeholder="cheio" value={loteMax[e.estilo] ?? ""} onChange={ev => setLoteMax(p => ({ ...p, [e.estilo]: ev.target.value }))} style={{ ...inputNum, width: 80, borderColor: (loteMax[e.estilo] ?? "") !== "" ? "#C69700" : "#444" }} />
              </label>
            ))}
          </div>
        </div>
      </details>

      <details style={{ marginBottom: 14, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 12px" }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#fff" }}><strong>🧴 Projeção por produto (PET e chope)</strong> <span style={{ color: "#888" }}>— histórico real de cada produto (últimos 3 meses fechados e mesmo mês do ano anterior) ao lado do campo para digitar os litros/mês. Em cinza no campo está a sugestão automática.</span></summary>
        {(() => {
          const fechadosHist = (produtosPeriodos || []).filter(c => c < mesAtual).slice(-3);
          const valMes = (nome, chave) => { const r = (produtosDados[nome] || []).find(x => x.chave === chave); return r && r.litros > 0 ? r.litros : null; };
          const refAnoDe = c => { const [a, m] = c.split("-").map(Number); return `${a - 1}-${String(m).padStart(2, "0")}`; };
          const refsAno = mesesPlano.map(refAnoDe);
          const nomes = produtosNomes.filter(n => classificarEmbalagem(n) !== "outros").filter(n => classificarEmbalagem(n) === "pet" || fechadosHist.some(c => valMes(n, c)) || refsAno.some(c => valMes(n, c)) || mesesPlano.some(c => (ovProd[`${c}|${n}`] ?? "") !== "")).sort();
          const th2 = { padding: "3px 6px", color: "#888", fontWeight: 600, whiteSpace: "nowrap" };
          return (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, color: "#ddd" }}>
                <thead>
                  <tr>
                    <th style={{ ...th2, textAlign: "left" }} rowSpan={2}>Produto</th>
                    <th style={{ ...th2, textAlign: "center", borderLeft: "1px solid #333" }} colSpan={fechadosHist.length + 1}>Últimos meses fechados (L)</th>
                    {mesesPlano.map(c => <th key={c} style={{ ...th2, textAlign: "center", borderLeft: "1px solid #333" }} colSpan={2}>{labelMes(c)}</th>)}
                  </tr>
                  <tr>
                    {fechadosHist.map((c, k) => <th key={c} style={{ ...th2, borderLeft: k === 0 ? "1px solid #333" : undefined }}>{labelMes(c)}</th>)}
                    <th style={th2}>média</th>
                    {mesesPlano.map(c => <React.Fragment key={c}><th style={{ ...th2, borderLeft: "1px solid #333" }}>{labelMes(refAnoDe(c))}</th><th style={th2}>projetar</th></React.Fragment>)}
                  </tr>
                </thead>
                <tbody>
                  {nomes.map(nome => {
                    const est = estiloDeTexto(nome);
                    const vals = fechadosHist.map(c => valMes(nome, c));
                    const com = vals.filter(v => v !== null);
                    const media = com.length ? com.reduce((a, b) => a + b, 0) / com.length : null;
                    return (
                      <tr key={nome} style={{ borderTop: "1px solid #222" }}>
                        <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>{nome}{!est && <span style={{ color: "#e57373" }}> (sem receita)</span>}</td>
                        {vals.map((v, k) => <td key={k} style={{ padding: "3px 6px", textAlign: "right", color: v === null ? "#555" : "#ddd", borderLeft: k === 0 ? "1px solid #333" : undefined }}>{v === null ? "—" : L(v)}</td>)}
                        <td style={{ padding: "3px 6px", textAlign: "right", color: "#C69700" }}>{media === null ? "—" : L(media)}</td>
                        {mesesPlano.map(c => {
                          const kp = `${c}|${nome}`;
                          const ref = valMes(nome, refAnoDe(c));
                          const d = est && projecoes[c] && projecoes[c].porEstilo[resolverBase(est)] ? projecoes[c].porEstilo[resolverBase(est)].det.find(x => x.produto === nome) : null;
                          return (
                            <React.Fragment key={c}>
                              <td style={{ padding: "3px 6px", textAlign: "right", color: ref === null ? "#555" : "#ddd", borderLeft: "1px solid #333" }}>{ref === null ? "—" : L(ref)}</td>
                              <td style={{ padding: "2px 4px" }}><input type="number" min="0" placeholder={String(Math.round(d ? d.lit : 0))} value={ovProd[kp] ?? ""} onChange={ev => setOvProd(p => ({ ...p, [kp]: ev.target.value }))} style={{ ...inputNum, width: 70, borderColor: (ovProd[kp] ?? "") !== "" ? "#C69700" : "#444" }} /></td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>“—” = sem venda registrada naquele mês. Meses que ainda não aconteceram não aparecem como histórico.</div>
            </div>
          );
        })()}
      </details>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>Estilos que entram no plano ({listaEstilos.filter(e => !estilosOff[e.estilo]).length} de {listaEstilos.length} marcados) — desmarque os que não quer mais produzir</span>
          <button style={{ ...btn("#4caf6b"), padding: "2px 8px" }} onClick={() => setEstilosOff({})}>marcar todos</button>
          <button style={{ ...btn("#888"), padding: "2px 8px" }} onClick={() => { const o = {}; listaEstilos.forEach(e => { o[e.estilo] = true; }); setEstilosOff(o); }}>desmarcar todos</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6 }}>
          {listaEstilos.map(e => (
            <label key={e.estilo} style={{ fontSize: 12, color: estilosOff[e.estilo] ? "#666" : "#ddd", display: "flex", gap: 6, alignItems: "flex-start", background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 8px" }}>
              <input type="checkbox" checked={!estilosOff[e.estilo]} onChange={() => setEstilosOff(p => ({ ...p, [e.estilo]: !p[e.estilo] }))} style={{ marginTop: 2 }} />
              <span>
                <strong>{e.estilo}</strong> <span style={{ color: "#888" }}>· {L(e.vol)} L em {labelMes(alvo)}</span>
                <div style={{ fontSize: 11, color: "#999", marginTop: 3 }} onClick={ev => ev.preventDefault()}>
                  dias até pronto{" "}
                  <input type="number" min="1" placeholder={String(e.dias || diasPadrao)} value={diasEstilo[e.estilo] ?? ""} onChange={ev => setDiasEstilo(p => ({ ...p, [e.estilo]: ev.target.value }))} style={{ ...inputNum, width: 54, padding: "2px 4px", borderColor: diasEstilo[e.estilo] ? "#C69700" : "#444" }} />
                  {diasEstilo[e.estilo] ? <span style={{ color: "#C69700" }}> (receita: {e.dias || "—"})</span> : null}
                </div>
                {e.derivados.length > 0 && <div style={{ fontSize: 10, color: "#777" }}>inclui: {e.derivados.join(", ")}</div>}
              </span>
            </label>
          ))}
        </div>
      </div>

      {planoCalc.naoAgendado && planoCalc.naoAgendado.length > 0 && (
        <div style={{ background: "#2a1212", border: "1px solid #6b1f1f", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#e8a0a0" }}>
          ⚠️ Não coube no horizonte de 120 dias (falta tanque livre): {planoCalc.naoAgendado.join("; ")}.
        </div>
      )}

      {(semDias.length > 0 || semReceitaLista.length > 0 || ignoradosLista.length > 0) && (
        <div style={{ background: "#2a2112", border: "1px solid #6b5300", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#e8c766" }}>
          {semDias.length > 0 && <div>⚠️ Sem “dias até ficar pronto” na aba receitas (usei {diasPadrao} dias): {semDias.join(", ")}.</div>}
          {ignoradosLista.length > 0 && <div>ℹ️ Ignorados por não vender há {semVendaMeses} meses: {ignoradosLista.slice(0, 8).map(([n, v]) => `${n} (${L(v)} L no ano anterior)`).join("; ")}{ignoradosLista.length > 8 ? "…" : ""}.</div>}
          {semReceitaLista.length > 0 && <div>⚠️ Produtos sem receita/trecho cadastrado (fora do plano): {semReceitaLista.slice(0, 8).map(([n, v]) => `${n} (${L(v)} L)`).join("; ")}{semReceitaLista.length > 8 ? "…" : ""}.</div>}
        </div>
      )}

      {/* cenário: um bloco por mês */}
      <h4 style={{ color: "#fff", fontSize: 13, margin: "6px 0" }}>Cenário de vendas por mês (litros) — ajuste à vontade; derivadas somadas ao estilo base</h4>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Os campos ✏️ sobrescrevem a projeção daquele mês e estilo (vazio = projeção). “Dias ✏️” muda o tempo até ficar pronto só para as entregas daquele mês (vazio = o do estilo, ajustável na lista de estilos acima; senão, o da receita). Reduzir a maturação é decisão do cervejeiro — o app só recalcula as datas. Os percentuais por mês ficam no cabeçalho de cada bloco.</div>
      {necPorMes.map(({ chave, nec }) => {
        const tBarril = nec.reduce((s, n) => s + n.barrilProd, 0), tPet = nec.reduce((s, n) => s + n.petProd, 0), tNec = nec.reduce((s, n) => s + n.necessario, 0);
        const nSem = (semanasPorMes[chave] || []).length || 1;
        return (
          <div key={chave} style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 8 }}>
              <strong style={{ color: "#fff", fontSize: 14, minWidth: 70 }}>{labelMes(chave)}</strong>
              <label style={{ fontSize: 12, color: "#aaa" }}>% sobre o ano passado{" "}
                <input type="number" placeholder={String(pcts[cenario])} value={pctMes[chave] ?? ""} onChange={e => setPctMes(p => ({ ...p, [chave]: e.target.value }))} style={{ ...inputNum, width: 64 }} />
              </label>
              <span style={{ fontSize: 12, color: "#C69700" }}>A produzir: <strong>{L(tNec)} L</strong> ({L(tBarril)} barril · {L(tPet)} PET) · {nSem} semanas ≈ {L(tNec / nSem)} L/semana</span>
              <span style={{ fontSize: 12, color: "#888" }}>Envase PET: {(tPet / CAPACIDADE_ENVASE_PET_DIA).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>Estilo base</th>
                  <th style={th}>Barril proj. (L)</th><th style={th}>Barril (L) ✏️</th>
                  <th style={th}>PET proj. (L)</th><th style={th}>PET (L) ✏️</th>
                  <th style={th}>Estoque (L)</th><th style={th}>A produzir (L)</th>
                  <th style={th}>Dias ✏️</th><th style={th}>Envase PET (dias)</th><th style={th}>Origem</th>
                </tr></thead>
                <tbody>
                  {nec.map(n => {
                    const kx = `${chave}|${n.estilo}`;
                    return (
                      <React.Fragment key={kx}>
                        <tr>
                          <td style={{ ...td, textAlign: "left", color: "#fff", fontWeight: 600 }}>{n.estilo}</td>
                          <td style={td}>{L(n.barrilProj)}</td>
                          <td style={td}><input type="number" placeholder={String(Math.round(n.barrilProj))} value={ovBarril[kx] ?? ""} onChange={e => setOvBarril(p => ({ ...p, [kx]: e.target.value }))} style={inputNum} /></td>
                          <td style={td}>{L(n.petProj)}</td>
                          <td style={td}><input type="number" placeholder={String(Math.round(n.petProj))} value={ovPet[kx] ?? ""} onChange={e => setOvPet(p => ({ ...p, [kx]: e.target.value }))} style={inputNum} /></td>
                          <td style={td}>{L(n.estoque)}</td>
                          <td style={{ ...td, color: "#4caf6b", fontWeight: 700 }}>{L(n.necessario)}</td>
                          <td style={td}><input type="number" min="1" placeholder={n.diasEstiloBase ? String(n.diasEstiloBase) : "preencher"} value={diasMes[kx] ?? ""} onChange={e => setDiasMes(p => ({ ...p, [kx]: e.target.value }))} style={{ ...inputNum, width: 54, borderColor: (diasMes[kx] || diasEstilo[n.estilo]) ? "#C69700" : n.dias ? "#444" : "#e57373" }} title={n.diasReceita ? `receita: ${n.diasReceita} dias` : "sem prazo na receita"} /></td>
                          <td style={td}>{(n.petProd / CAPACIDADE_ENVASE_PET_DIA).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                          <td style={td}><button style={{ ...btn("#4a90d9"), padding: "2px 8px" }} onClick={() => setExpandidos(p => ({ ...p, [kx]: !p[kx] }))}>{expandidos[kx] ? "ocultar" : "por quê?"}</button></td>
                        </tr>
                        {expandidos[kx] && (
                          <tr><td colSpan={10} style={{ ...td, textAlign: "left", background: "#101010" }}>
                            {n.det.length === 0 && <span style={{ color: "#777" }}>Sem produtos.</span>}
                            <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>Projeção por produto — digite litros/mês à mão para sobrescrever (a soma dos produtos vira a projeção do estilo).</div>
                            {n.det.slice().sort((x, y) => y.litProj - x.litProj).map((d, i) => {
                              const kp = `${chave}|${d.produto}`;
                              return (
                                <div key={i} style={{ fontSize: 11, color: "#aaa", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "2px 0" }}>
                                  <span style={{ minWidth: 230 }}>• <strong style={{ color: "#ddd" }}>{d.produto}</strong> ({d.emb === "chope" ? "🛢️ barril" : "🧴 PET"})</span>
                                  <input type="number" placeholder={String(Math.round(d.litProj))} value={ovProd[kp] ?? ""} onChange={ev => setOvProd(p => ({ ...p, [kp]: ev.target.value }))} style={{ ...inputNum, width: 80, borderColor: d.manual ? "#C69700" : "#444" }} />
                                  <span>L/mês{d.manual ? " (manual)" : ""} — {d.origem}{d.est > 0 ? ` · estoque ${L(d.est)} L` : ""}</span>
                                </div>
                              );
                            })}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {nec.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: "left", color: "#666" }}>Nenhum estilo marcado com demanda neste mês.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginBottom: 6 }}>Cenários salvos {cenarioCarregado && <span style={{ color: "#C69700", fontWeight: 400 }}>· em uso: {cenarioCarregado}</span>}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input type="text" placeholder="Nome do cenário (ex.: Natal forte)" value={nomeNovoCenario} onChange={e => setNomeNovoCenario(e.target.value)} style={{ ...inputNum, width: 240, textAlign: "left" }} />
          <button style={btn("#4caf6b")} onClick={salvarCenarioComNome}>💾 Salvar cenário futuro</button>
        </div>
        {msgCenario && <div style={{ fontSize: 12, color: "#bbb", marginBottom: 8 }}>{msgCenario}</div>}
        {cenariosSalvos.length === 0 ? <div style={{ fontSize: 12, color: "#666" }}>Nenhum cenário salvo ainda. Ajuste os números acima, dê um nome e salve — dá para guardar quantos quiser e alternar entre eles.</div> : (
          <div style={{ display: "grid", gap: 6 }}>
            {cenariosSalvos.map(c => (
              <div key={c.nome} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "#101010", border: `1px solid ${c.nome === cenarioCarregado ? "#C69700" : "#242424"}`, borderRadius: 6, padding: "6px 8px" }}>
                <strong style={{ color: "#fff", fontSize: 13, minWidth: 140 }}>{c.nome}</strong>
                <span style={{ fontSize: 11, color: "#888" }}>salvo em {new Date(c.salvoEm).toLocaleString("pt-BR")}</span>
                <span style={{ fontSize: 11, color: "#aaa", flex: "1 1 220px" }}>{Object.entries(c.resumo || {}).sort().map(([k, v]) => `${labelMes(k)}: ${L(v)} L`).join(" · ")}</span>
                <button style={{ ...btn("#4a90d9"), padding: "3px 10px" }} onClick={() => carregarCenario(c)}>Carregar</button>
                <button style={{ ...btn("#e57373"), padding: "3px 10px" }} onClick={() => excluirCenario(c)}>Excluir</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: cenarioValidado ? "#12261a" : "#2a2112", border: `1px solid ${cenarioValidado ? "#1f5c35" : "#6b5300"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13, color: cenarioValidado ? "#bfe6cc" : "#e8c766" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={cenarioValidado} onChange={e => setCenarioValidado(e.target.checked)} />
          <strong>Cenário futuro validado</strong> — {cenarioValidado ? "a programação de produção está liberada abaixo." : "marque quando os números acima estiverem ok para montar a programação dos tanques."}
        </label>
      </div>

      {(cenarioValidado || usarSalvo) ? (<>
      {/* brassagem */}
      <h4 style={{ color: "#fff", fontSize: 13, margin: "6px 0" }}>Brassagem · 3 ou 6 bateladas por dia (tanque grande enche em dias de 3 ou 6 bateladas, um por dia; os de 1.000 L entram junto no dia)</h4>
      <div style={{ background: "#12261a", border: "1px solid #1f5c35", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: "#bfe6cc" }}>
        <strong>Recomendação (com os dados atuais): {recomendado} bateladas/dia.</strong> {motivo}
        <div style={{ marginTop: 6, color: "#8fbf9f" }}>
          3/dia: {p3.diasBrassagem} dias de brassagem, {p3.bateladasTotal} bateladas, {p3.atrasados} atraso(s), último lote pronto em {fmtDataCurta(p3.ultimoPronto)}.
          {" "}6/dia: {p6.diasBrassagem} dias de brassagem, {p6.atrasados} atraso(s), último lote pronto em {fmtDataCurta(p6.ultimoPronto)}.
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 12 }}>
        {!usarSalvo && (
          <div style={{ fontSize: 12, color: "#aaa" }}>Ritmo da brassagem<br />
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              {["auto", "3", "6"].map(r => <button key={r} onClick={() => setRitmo(r)} style={modoBtnStyle(ritmo === r, "#C69700")}>{rotuloRitmo(r)}</button>)}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#aaa" }}>Período<br />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            {[["30", "30 dias"], ["mes", "Mês"], ["60", "60 dias"], ["90", "90 dias"]].map(([v, t]) => <button key={v} onClick={() => setVista(v)} style={modoBtnStyle(vista === v, "#4a90d9")}>{t}</button>)}
          </div>
        </div>
        {vista === "mes" && (
          <label style={{ fontSize: 12, color: "#aaa" }}>Mês<br />
            <select value={mesVista} onChange={e => setMesVista(e.target.value)} style={{ ...inputNum, width: 110, textAlign: "left" }}>
              {mesesAlvo.map(m => <option key={m} value={m}>{labelMes(m)}</option>)}
            </select>
          </label>
        )}
        <div style={{ fontSize: 12, color: "#aaa" }}>Detalhe<br />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <button onClick={() => setGranular("dia")} style={modoBtnStyle(granular === "dia", "#4a90d9")}>Dia a dia</button>
            <button onClick={() => setGranular("semana")} style={modoBtnStyle(granular === "semana", "#4a90d9")}>Semana a semana</button>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Mostrando {fmtDataSem(wIni)} até {fmtDataSem(wFim)} · {capDia} bateladas/dia por tanque grande · {plano.atrasados > 0 ? `⚠️ ${plano.atrasados} lote(s) atrasado(s) (em vermelho)` : "todos os lotes no prazo"}.
      </div>

      {plano.atrasados > 0 && (() => {
        const atrasados = lotesExibidos.filter(l => l.atrasado);
        const comDiag = atrasados.filter(l => l.diag);
        const grupos = { maturacao: [], tanque: [], brassagem: [] };
        comDiag.forEach(l => grupos[l.diag.causa].push(l));
        const rotulo = { maturacao: "Maturação não cabe no prazo", tanque: "Tanque ocupado", brassagem: "Fila da brassagem" };
        const explica = {
          maturacao: "Mesmo começando hoje, o tempo de maturação passa da data de entrega — é o início do cenário (nada está pronto ainda). Ajuste: reduzir os dias do estilo (coluna Dias ✏️), cobrir essas semanas com estoque de produto acabado ou aceitar o atraso.",
          tanque: "O tanque ainda está ocupado quando o lote precisaria começar. Ajuste: reduzir os dias do lote anterior, usar outro tanque que libere antes, reduzir a demanda do mês ou liberar um tanque (envasar a cerveja que já está pronta).",
          brassagem: "O tanque estava livre, mas as regras da brassagem empurraram o início (1 tanque grande por dia, 3 ou 6 bateladas, lote na mesma semana). Ajuste: usar 6 bateladas/dia ou reduzir os dias do estilo.",
        };
        return (
          <div style={{ background: "#2a1212", border: "1px solid #6b1f1f", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#e8a0a0" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ {atrasados.length} lote(s) em vermelho — o que está acontecendo e o que dá para ajustar</div>
            {comDiag.length === 0 && <div>Este plano foi salvo antes do diagnóstico existir. Clique em “Replanejar com os dados atuais” para ver as causas.</div>}
            {Object.entries(grupos).filter(([, v]) => v.length).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 6 }}>
                <strong>{rotulo[k]} ({v.length})</strong> — {explica[k]}
              </div>
            ))}
            {comDiag.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>Lote</th><th style={th}>Entrega</th><th style={th}>Pronto</th><th style={th}>Atraso</th><th style={{ ...th, textAlign: "left" }}>O que acontece</th><th style={{ ...th, textAlign: "left" }}>O que ajustar</th>
                  </tr></thead>
                  <tbody>
                    {comDiag.slice().sort((a, b) => b.diag.atrasoDias - a.diag.atrasoDias).slice(0, mostrarTodosAtrasos ? 999 : 25).map((l, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "left", color: "#fff", whiteSpace: "nowrap" }}>{l.tanque} · {l.estilo}</td>
                        <td style={td}>{fmtDataCurta(l.prazo)}</td><td style={td}>{fmtDataCurta(l.pronto)}</td>
                        <td style={{ ...td, color: "#e57373", fontWeight: 700 }}>{l.diag.atrasoDias} d</td>
                        <td style={{ ...td, textAlign: "left", color: "#ddd" }}>{l.diag.texto}</td>
                        <td style={{ ...td, textAlign: "left", color: "#e8c766" }}>{l.diag.ajuste}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comDiag.length > 25 && <div style={{ marginTop: 4, color: "#a77" }}>{mostrarTodosAtrasos ? `Mostrando os ${comDiag.length} lotes.` : `… e mais ${comDiag.length - 25} lote(s) (os de maior atraso estão acima).`} <button style={{ ...btn("#888"), padding: "2px 8px", marginLeft: 6 }} onClick={() => setMostrarTodosAtrasos(v => !v)}>{mostrarTodosAtrasos ? "mostrar só os 25 maiores" : "ver todos"}</button></div>}
              </div>
            )}
          </div>
        );
      })()}


      <h4 style={{ color: "#fff", fontSize: 13, margin: "6px 0" }}>Tanque a tanque, semana a semana</h4>
      <div style={{ overflowX: "auto", marginBottom: 18 }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "#0d0d0d" }}>Tanque</th>
            {semanas.map(s => <th key={s.getTime()} style={{ ...th, textAlign: "left" }}>{fmtDataCurta(s)}–{fmtDataCurta(somarDiasData(s, 4))}</th>)}
          </tr></thead>
          <tbody>
            {tanques.map(t => (
              <tr key={t.nome}>
                <td style={{ ...td, textAlign: "left", whiteSpace: "nowrap", color: "#fff", fontWeight: 600, position: "sticky", left: 0, background: "#0d0d0d" }}>
                  {t.nome} <span style={{ color: "#888", fontWeight: 400 }}>{L(t.capacidade)} L</span>
                </td>
                {semanas.map(s => {
                  const it = fasesTanqueSemana(t, s);
                  return (
                    <td key={s.getTime()} style={{ ...td, textAlign: "left", verticalAlign: "top", minWidth: 150 }}>
                      {it.length === 0 ? <span style={{ color: "#555" }}>livre</span> : it.map((x, i) => <div key={i} style={{ color: x.atrasado ? "#e57373" : "#ddd" }}>{x.txt}</div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ color: "#fff", fontSize: 13, margin: "14px 0 6px" }}>🏭 Visão de cada tanque · o que vai acontecer com ele</h4>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Uma linha por tanque: o que tem hoje, cada produção (datas e volume), quando fica pronto, o que vira estoque ao ficar pronto, em 🛢️ barris de 50 L e 🧴 PET e quando esvazia. Regra: ao ficar pronta, a cerveja vai para barril ou PET (estoque de produto acabado) e o tanque libera na hora; a venda sai do estoque. A divisão barril/PET segue a previsão de vendas do estilo.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {visaoTanques.map(({ t, atual, passos }) => (
          <div key={t.nome} style={{ display: "flex", gap: 10, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ minWidth: 92, color: "#fff", fontWeight: 700, fontSize: 12 }}>{t.nome}<div style={{ color: "#888", fontWeight: 400 }}>{L(t.capacidade)} L</div></div>
            <div style={{ flex: 1, fontSize: 12, color: "#ddd", display: "flex", flexDirection: "column", gap: 4 }}>
              {atual ? (
                <div>
                  <span style={{ color: "#C69700" }}>AGORA</span> · {atual.cerveja} {L(atual.litros)} L · {atual.pronto && atual.pronto > hojeReal ? `⏳ pronta em ${fmtDataCurta(atual.pronto)}` : "🟢 pronta"}
                  {" · "}maturação <input type="number" min="1" placeholder={String(t.diasUsados)} value={diasLote[`${t.nome}|atual`] ?? ""} onChange={ev => setDiasLote(p => ({ ...p, [`${t.nome}|atual`]: ev.target.value }))} style={{ ...inputNum, width: 46, padding: "1px 4px", borderColor: (diasLote[`${t.nome}|atual`] ?? "") !== "" ? "#C69700" : "#444" }} /> dias
                  {(() => { const sh = petShareEstilo(atual.cerveja); const b = atual.litros * (1 - sh), pt = atual.litros * sh; return <> · ao ficar pronta vira estoque: 🛢️ {Math.round(b / 50).toLocaleString("pt-BR")} barris ({L(b)} L) + 🧴 {L(pt)} L PET · tanque livre {atual.pronto && atual.pronto > hojeReal ? `em ${fmtDataCurta(atual.pronto)}` : "agora"}</>; })()}
                </div>
              ) : <div style={{ color: "#4caf6b" }}>AGORA · vazio / livre</div>}
              {passos.map(({ l, barril, pet, vazio }, i) => (
                <div key={i} style={{ color: l.atrasado ? "#e57373" : "#ddd", opacity: feitos[chaveLote(l)] ? 0.5 : 1 }}>
                  ⚙️ <strong>Produção {fmtDataCurta(l.inicio)}{chaveDia(l.inicio) !== chaveDia(l.fim) ? `–${fmtDataCurta(l.fim)}` : ""}</strong> · {l.estilo}{l.reposicao ? " (reposição)" : ""} {L(l.volume)} L ({l.bateladas} bat.) · ⏳ pronto {fmtDataCurta(l.pronto)} · maturação <input type="number" min="1" placeholder={String(l.dias)} value={diasLote[`${t.nome}|${i}`] ?? ""} onChange={ev => setDiasLote(p => ({ ...p, [`${t.nome}|${i}`]: ev.target.value }))} style={{ ...inputNum, width: 46, padding: "1px 4px", borderColor: (diasLote[`${t.nome}|${i}`] ?? "") !== "" ? "#C69700" : "#444" }} /> dias
                  {" · "}ao ficar pronto vira estoque: 🛢️ {Math.round(l.volume * (1 - (l.petPct || 0)) / 50).toLocaleString("pt-BR")} barris ({L(l.volume * (1 - (l.petPct || 0)))} L) + 🧴 {L(l.volume * (l.petPct || 0))} L PET
                  {" · "}tanque livre em {fmtDataCurta(l.pronto)}
                  {l.atrasado ? " · ⚠️ atrasado" : ""}
                </div>
              ))}
              {!passos.length && <div style={{ color: "#666" }}>Sem nova produção no período.</div>}
            </div>
          </div>
        ))}
      </div>

      <h4 style={{ color: "#fff", fontSize: 13, margin: "14px 0 6px" }}>📦 Estoque e reposição por estilo · precisa produzir? com quantos dias de antecedência?</h4>
      {(() => {
        const fim = somarDiasData(hojeReal, 120);
        // consumo diário por estilo = o mesmo da simulação de envase: barril (semana ÷ 5 dias úteis) + PET nos dias de envase
        const consumo = {}; // estilo -> {chaveDia: litros}
        const diasRec = {};
        const soma = (e, d, v) => { (consumo[e] = consumo[e] || {}); consumo[e][chaveDia(d)] = (consumo[e][chaveDia(d)] || 0) + v; };
        necPorMes.forEach(({ nec }) => nec.forEach(n => { diasRec[n.estilo] = n.diasUsados || n.dias || diasPadrao; }));
        Object.keys(envase).forEach(k => {
          const e = envase[k]; const seg = dataDeChave(k);
          e.barril.forEach(b => { const du = diasUteisSemana(seg); du.forEach(dd => soma(b.estilo, dd, b.litros / (du.length || 1))); });
          e.petDias.forEach(d => d.blocos.forEach(b => soma(b.estilo, d.data, b.litros)));
        });
        const estilos = new Set([...Object.keys(consumo), ...Object.keys(suprimentoInicial), ...Object.keys(estoqueAcabado)]);
        const simular = (e, comLotes) => {
          const chegadas = {};
          statusTanques.forEach(t => { if (t.base === e && t.litrosNoTanque > 0) { const q = chaveDia(t.pronto && t.pronto > hojeReal ? t.pronto : hojeReal); chegadas[q] = (chegadas[q] || 0) + t.litrosNoTanque; } });
          if (comLotes) lotesExibidos.filter(l => l.estilo === e).forEach(l => { const q = chaveDia(l.pronto); chegadas[q] = (chegadas[q] || 0) + l.volume; });
          let est = descontarEstoque ? (estoqueAcabado[e] || 0) : 0, ruptura = null, falta = 0;
          for (let d = hojeReal; d <= fim; d = somarDiasData(d, 1)) {
            const k = chaveDia(d);
            est += chegadas[k] || 0;
            const c = (consumo[e] || {})[k] || 0;
            if (c > 0) { if (est < c - 0.5) { if (!ruptura) ruptura = d; falta += c - Math.max(0, est); est = 0; } else est -= c; }
          }
          return { ruptura, falta, final: est };
        };
        const linhas = [...estilos].sort().map(e => {
          const semLote = simular(e, false), comLote = simular(e, true);
          const total = Object.values(consumo[e] || {}).reduce((a, v) => a + v, 0);
          const dias = diasRec[e] || diasPadrao;
          const meus = lotesExibidos.filter(l => l.estilo === e).sort((a, b) => a.inicio - b.inicio);
          const proximo = meus[0] || null;
          const iniciarAte = semLote.ruptura ? somarDiasData(semLote.ruptura, -(dias + 1)) : null; // + 1 dia de brassagem
          const folga = iniciarAte && proximo ? diasEntre(proximo.inicio, iniciarAte) : null;
          return { e, estoque: suprimentoInicial[e] || 0, acabado: descontarEstoque ? (estoqueAcabado[e] || 0) : 0, semana: total / (120 / 7), semLote, comLote, dias, iniciarAte, proximo, folga, precisa: !!semLote.ruptura };
        });
        const th4 = { padding: "3px 6px", color: "#888", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" };
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Lógica: o lote produz o tanque cheio e a sobra vai para o estoque (ex.: lote de 1.000 L com 400 L de consumo → 600 L ficam). O consumo previsto dos meses seguintes sai do estoque primeiro; só se produz quando o estoque não cobre. “Iniciar até” = dia da ruptura − dias de maturação − 1 dia de brassagem, para não faltar cerveja. O consumo é o mesmo da simulação de envase (barril ÷ 5 dias úteis + PET nos dias de envase), próximos 120 dias; o estoque de produto acabado (aba estoque) entra se a opção estiver ligada.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, color: "#ddd", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th4, textAlign: "left" }}>Estilo</th><th style={th4}>Nos tanques</th><th style={th4}>Produto acabado</th><th style={th4}>Consumo/semana</th>
                  <th style={th4}>Sem produzir, acaba em</th><th style={th4}>Maturação (dias)</th><th style={th4}>Iniciar brassagem até</th>
                  <th style={{ ...th4, textAlign: "left" }}>Próxima produção do plano</th><th style={{ ...th4, textAlign: "left" }}>Situação</th><th style={th4}>Estoque ao fim de 120 d</th>
                </tr></thead>
                <tbody>
                  {linhas.map(r => (
                    <tr key={r.e} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: "3px 8px", color: "#fff", whiteSpace: "nowrap" }}>{r.e}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{r.estoque ? L(r.estoque) + " L" : "—"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{r.acabado ? L(r.acabado) + " L" : "—"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{r.semana ? L(r.semana) + " L" : "—"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: r.precisa ? "#C69700" : "#4caf6b" }}>{r.precisa ? fmtDataCurta(r.semLote.ruptura) : "cobre os 120 dias"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{r.dias}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: "#fff", fontWeight: 700 }}>{r.iniciarAte ? fmtDataCurta(r.iniciarAte) : "—"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "left", whiteSpace: "nowrap" }}>{r.proximo ? `${fmtDataCurta(r.proximo.inicio)} → pronto ${fmtDataCurta(r.proximo.pronto)} · ${L(r.proximo.volume)} L (${r.proximo.tanque})` : "—"}</td>
                      <td style={{ padding: "3px 6px", textAlign: "left", color: r.comLote.ruptura ? "#e57373" : r.precisa ? "#4caf6b" : "#4caf6b" }}>
                        {r.comLote.ruptura ? `⚠️ ruptura em ${fmtDataCurta(r.comLote.ruptura)} (faltam ${L(r.comLote.falta)} L)` : !r.precisa ? "🟢 não precisa produzir" : r.folga !== null ? `✅ ${r.folga >= 0 ? `${r.folga} dia(s) de folga` : "no limite"}` : "✅ coberto"}
                      </td>
                      <td style={{ padding: "3px 6px", textAlign: "right", color: r.comLote.final > r.semana * 8 ? "#C69700" : "#ddd" }}>{L(r.comLote.final)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <h4 style={{ color: "#fff", fontSize: 13, margin: "14px 0 6px" }}>⚖️ Produzido × vendido · saldo de cerveja por estilo</h4>
      {(() => {
        const meses = mesesPlano;
        const mesDe = d => chaveDia(d).slice(0, 7);
        const estilos = new Set();
        necPorMes.forEach(({ nec }) => nec.forEach(n => estilos.add(n.estilo)));
        lotesExibidos.forEach(l => estilos.add(l.estilo));
        Object.keys(suprimentoInicial).forEach(e => estilos.add(e));
        const lista = [...estilos].sort();
        const linhas = lista.map(e => {
          let saldo = (suprimentoInicial[e] || 0) + (descontarEstoque ? (estoqueAcabado[e] || 0) : 0);
          const colunas = meses.map(c => {
            const venda = ((necPorMes.find(x => x.chave === c) || { nec: [] }).nec.find(n => n.estilo === e) || { barril: 0, pet: 0 });
            // mês corrente: só conta o que falta vender (semanas de hoje em diante)
            const sems = semanasPorMes[c] || []; const restantes = c === mesAtual ? sems.filter(sm => somarDiasData(sm, 6) >= hojeReal).length : sems.length;
            const vendido = ((venda.barril || 0) + (venda.pet || 0)) * (sems.length ? restantes / sems.length : 1);
            const produzido = lotesExibidos.filter(l => l.estilo === e && mesDe(l.pronto) === c).reduce((a, l) => a + l.volume, 0);
            saldo += produzido - vendido;
            return { produzido, vendido, saldo };
          });
          return { e, inicial: (suprimentoInicial[e] || 0) + (descontarEstoque ? (estoqueAcabado[e] || 0) : 0), colunas };
        }).filter(r => r.inicial > 0 || r.colunas.some(c => c.produzido > 0 || c.vendido > 0));
        const th3 = { padding: "3px 6px", color: "#888", fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" };
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Por mês (mês em que a cerveja fica <em>pronta</em>): quanto os lotes produzem × quanto a previsão vende, e o <strong style={{ color: "#bbb" }}>saldo acumulado</strong> (começa com a cerveja dos tanques e, se ligado, o produto acabado). Saldo alto = sobra de produto; saldo negativo = falta cerveja. O mês corrente conta só as semanas que faltam. “Produz” = lotes que ficam prontos no mês: cerveja que já está nos tanques entra no estoque de hoje, não em “produz”.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, color: "#ddd" }}>
                <thead>
                  <tr>
                    <th style={{ ...th3, textAlign: "left" }} rowSpan={2}>Estilo</th>
                    <th style={th3} rowSpan={2}>Estoque hoje (tanques{descontarEstoque ? " + acabado" : ""})</th>
                    {meses.map(c => <th key={c} colSpan={3} style={{ ...th3, textAlign: "center", borderLeft: "1px solid #333" }}>{labelMes(c)}</th>)}
                  </tr>
                  <tr>{meses.map(c => <React.Fragment key={c}><th style={{ ...th3, borderLeft: "1px solid #333" }}>produz</th><th style={th3}>vende</th><th style={th3}>saldo</th></React.Fragment>)}</tr>
                </thead>
                <tbody>
                  {linhas.map(r => (
                    <tr key={r.e} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: "3px 8px", whiteSpace: "nowrap", color: "#fff" }}>{r.e}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right" }}>{r.inicial ? L(r.inicial) : "—"}</td>
                      {r.colunas.map((c, i) => {
                        const cor = c.saldo < -50 ? "#e57373" : c.vendido > 0 && c.saldo > c.vendido * 2 ? "#C69700" : "#4caf6b";
                        return (
                          <React.Fragment key={i}>
                            <td style={{ padding: "3px 6px", textAlign: "right", borderLeft: "1px solid #333" }}>{c.produzido ? L(c.produzido) : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#aaa" }}>{c.vendido ? L(c.vendido) : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: cor, fontWeight: 700 }}>{L(c.saldo)}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Cores do saldo: verde = coberto; dourado = sobra acima de 2 meses de venda; vermelho = falta cerveja.</div>
          </div>
        );
      })()}

      <h4 style={{ color: "#fff", fontSize: 13, margin: "6px 0" }}>Semana a semana · programação de produção + previsão de vendas (mesmas semanas, uma abaixo da outra)</h4>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8, lineHeight: 1.5 }}>
        <strong style={{ color: "#bbb" }}>Como lemos:</strong> a previsão de vendas da semana é a projeção do mês (cenário acima) dividida igualmente pelas semanas do mês. Ela separa 🛢️ barril (chope) e 🧴 PET, produto a produto.
        O envase PET é montado para a semana toda “na mesma tocada”: cada produto é envasado uma vez, em bloco, agrupado por formato (1L, 2L, 500ml…), até {L(CAPACIDADE_ENVASE_PET_DIA)} L/dia, sem voltar ao formato anterior. Cada 1.000 L = 1 pallet.
        A cerveja sai primeiro dos tanques que ficaram prontos antes. Barril: previsão da semana ÷ 5 dias úteis.
      </div>
      {semanas.map((seg, idx) => {
        const progJSX = (() => {
        const dias = diasDaSemana(seg).filter(d => d >= wIni && d <= wFim);
        if (!dias.length) return null;
        const evs = dias.map(d => ({ d, ...eventosDia(d) }));
        const totBat = evs.reduce((s, e) => s + e.brass.reduce((x, b) => x + b.n, 0), 0);
        const totLitrosSem = evs.reduce((s, e) => s + e.brass.reduce((x, b) => x + b.n * (b.l.capacidade / b.l.bateladas), 0), 0);
        const prontosSem = evs.flatMap(e => e.prontos);
        const petSem = prontosSem.reduce((s, l) => s + l.atende * l.petPct, 0);
        return (
          <div key={seg.getTime()} style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <strong style={{ color: "#fff", fontSize: 13 }}>Semana {fmtDataCurta(seg)} – {fmtDataCurta(somarDiasData(seg, 4))}</strong>
              <span style={{ color: "#C69700", fontSize: 12 }}>
                {totBat} bateladas ({L(totLitrosSem)} L) · {prontosSem.length} lote(s) pronto(s)
                {petSem > 0 ? ` · envase PET ≈ ${L(petSem)} L (${(petSem / CAPACIDADE_ENVASE_PET_DIA).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia)` : ""}
              </span>
            </div>
            {granular === "semana" ? (
              <div style={{ fontSize: 12, color: "#ddd" }}>
                {(() => {
                  const mapa = {};
                  evs.forEach(e => e.brass.forEach(({ l, n }) => {
                    const k = l.tanque + "|" + l.estilo + "|" + l.mes;
                    (mapa[k] = mapa[k] || { l, n: 0, dias: [] });
                    mapa[k].n += n; mapa[k].dias.push(DIAS_SEM[e.d.getDay()]);
                  }));
                  const itens = Object.values(mapa);
                  return itens.length === 0 ? <span style={{ color: "#666" }}>Sem brassagem nesta semana</span> :
                    itens.map((x, i) => <div key={i} style={{ color: x.l.atrasado ? "#e57373" : "#ddd" }}>⚙️ {x.l.tanque}: {x.l.estilo} · {x.n} bat. ({x.dias.join("/")}) · pronto {fmtDataCurta(x.l.pronto)}</div>);
                })()}
                {prontosSem.map((l, i) => <div key={"p" + i} style={{ color: "#4caf6b" }}>🟢 {l.tanque}: {l.estilo} fica pronto ({fmtDataCurta(l.pronto)}) · {L(l.atende)} L</div>)}
              </div>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {evs.map(({ d, brass, prontos }) => {
                    const bat = brass.reduce((s, b) => s + b.n, 0);
                    return (
                      <tr key={d.getTime()}>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "nowrap", color: "#fff", width: 90, verticalAlign: "top" }}>{fmtDataSem(d)}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", width: 80, verticalAlign: "top", color: bat ? "#C69700" : "#555" }}>{bat}/6 bat.</td>
                        <td style={{ ...td, textAlign: "left" }}>
                          {brass.length === 0 && prontos.length === 0 && <span style={{ color: "#555" }}>—</span>}
                          {brass.map(({ l, n }, i) => {
                            const ini = chaveDia(l.inicio) === chaveDia(d), fimL = chaveDia(l.fim) === chaveDia(d);
                            return <div key={i} style={{ color: l.atrasado ? "#e57373" : "#ddd", opacity: feitos[chaveLote(l)] ? 0.5 : 1 }}>⚙️ {l.tanque} · {l.estilo}{l.reposicao ? " (reposição)" : ""} · {n} bat. ({L(n * (l.capacidade / l.bateladas))} L){ini && fimL ? " · tanque completo" : ini ? " · começa o tanque" : fimL ? " · completa o tanque" : ""}</div>;
                          })}
                          {prontos.map((l, i) => <div key={"p" + i} style={{ color: "#4caf6b" }}>🟢 {l.tanque} · {l.estilo}{l.reposicao ? " (reposição)" : ""} {l.existente ? "pronto (já no tanque)" : "pronto"} · {L(l.reposicao ? l.volume : l.atende)} L{l.petPct > 0.01 ? ` (≈${L(l.atende * l.petPct)} L PET)` : ""}</div>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
        })();
        const vendaJSX = (() => {
        const e = envase[chaveDia(seg)];
        if (!e) return null;
        const prodB = e.produtos.filter(p => p.emb === "barril").sort((a, b) => b.litros - a.litros);
        const prodP = e.produtos.filter(p => p.emb === "pet").sort((a, b) => b.litros - a.litros);
        const faltas = [...e.barril.map(b => ({ estilo: b.estilo, falta: b.falta, tipo: "barril" })), ...e.petDias.flatMap(d => d.blocos.map(b => ({ estilo: b.estilo, falta: b.falta, tipo: "PET" })))].filter(x => x.falta > 50);
        const faltaPorEstilo = {}; faltas.forEach(x => { faltaPorEstilo[x.estilo] = (faltaPorEstilo[x.estilo] || 0) + x.falta; });
        const origemTxt = usos => { const m = {}; usos.forEach(u => { m[u.tanque] = (m[u.tanque] || 0) + u.litros; }); const ks = Object.keys(m); return ks.length ? ks.map(k => `${k} (${L(m[k])} L)`).join(" + ") : "—"; };
        return (
          <details key={seg.getTime() + "v"} open style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
            <summary style={{ cursor: "pointer", color: "#fff", fontSize: 13 }}>
              <strong>Semana {fmtDataCurta(seg)} – {fmtDataCurta(somarDiasData(seg, 4))}</strong>
              <span style={{ color: "#C69700", fontSize: 12 }}> · previsão de vendas {L(e.totalBarril + e.totalPet)} L · 🛢️ {L(e.totalBarril)} L barril (≈{Math.round(e.totalBarril / 50).toLocaleString("pt-BR")} barris de 50 L) · 🧴 {L(e.totalPet)} L PET ({(e.totalPet / CAPACIDADE_ENVASE_PET_DIA).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias de envase · {(e.totalPet / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pallets)</span>
            </summary>
            <div style={{ marginTop: 8 }}>
              {Object.keys(faltaPorEstilo).length > 0 && (
                <div style={{ background: "#2a1212", border: "1px solid #6b1f1f", borderRadius: 6, padding: "6px 8px", marginBottom: 8, fontSize: 11, color: "#e8a0a0" }}>
                  ⚠️ Sem cerveja pronta nos tanques para parte da semana: {Object.entries(faltaPorEstilo).map(([k, v]) => `${k} (falta ${L(v)} L)`).join("; ")}. Isso sai do estoque de produto acabado ou fica em falta — veja o diagnóstico dos lotes em vermelho.
                </div>
              )}
              {e.overflow > 50 && <div style={{ fontSize: 11, color: "#e8a0a0", marginBottom: 6 }}>⚠️ {L(e.overflow)} L de PET não cabem nos 5 dias de envase desta semana ({L(CAPACIDADE_ENVASE_PET_DIA)} L/dia).</div>}

              <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, margin: "4px 0" }}>Previsão de vendas da semana, por produto</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Produto</th><th style={{ ...th, textAlign: "left" }}>Estilo base</th><th style={{ ...th, textAlign: "left" }}>Tipo</th><th style={th}>Previsão (L)</th><th style={th}>Pallets (PET) / Barris 50 L</th></tr></thead>
                  <tbody>
                    {[...prodB, ...prodP].map((p, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "left", color: "#fff" }}>{p.produto}</td>
                        <td style={{ ...td, textAlign: "left" }}>{p.estilo}</td>
                        <td style={{ ...td, textAlign: "left" }}>{p.emb === "barril" ? "🛢️ barril" : "🧴 PET"}</td>
                        <td style={td}>{L(p.litros)}</td><td style={td}>{p.emb === "barril" ? `${Math.round(p.litros / 50).toLocaleString("pt-BR")} barris` : `${(p.litros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pallets`}</td>
                      </tr>
                    ))}
                    {prodB.length + prodP.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: "left", color: "#666" }}>Sem previsão de vendas nesta semana.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, margin: "10px 0 4px" }}>🧴 Envase PET dia a dia (pallets = litros ÷ 1.000) e de qual tanque sai</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Dia</th><th style={{ ...th, textAlign: "left" }}>O que envasar</th><th style={th}>Litros</th><th style={th}>Pallets</th><th style={{ ...th, textAlign: "left" }}>Sai do tanque</th></tr></thead>
                  <tbody>
                    {e.petDias.map((d, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "left", color: "#fff", whiteSpace: "nowrap", verticalAlign: "top" }}>{fmtDataSem(d.data)}</td>
                        <td style={{ ...td, textAlign: "left", verticalAlign: "top" }}>{d.blocos.length === 0 ? <span style={{ color: "#555" }}>{diaUtil(d.data) ? "sem envase" : "feriado"}</span> : d.blocos.map((b, j) => <div key={j}>🧴 {b.produto} · {L(b.litros)} L</div>)}</td>
                        <td style={{ ...td, verticalAlign: "top" }}>{d.litros > 0 ? L(d.litros) : "—"}</td>
                        <td style={{ ...td, verticalAlign: "top", color: "#C69700", fontWeight: 700 }}>{d.litros > 0 ? (d.litros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                        <td style={{ ...td, textAlign: "left", verticalAlign: "top" }}>{d.blocos.map((b, j) => <div key={j} style={{ color: b.falta > 50 ? "#e57373" : "#ddd" }}>{origemTxt(b.usos)}{b.falta > 50 ? ` · falta ${L(b.falta)} L` : ""}</div>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, margin: "10px 0 4px" }}>🛢️ Barril (semana) e de qual tanque sai</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Estilo</th><th style={th}>Litros na semana</th><th style={th}>Por dia útil (L)</th><th style={th}>Barris 50 L (semana)</th><th style={th}>Barris por dia</th><th style={{ ...th, textAlign: "left" }}>Sai do tanque</th></tr></thead>
                  <tbody>
                    {e.barril.sort((a, b) => b.litros - a.litros).map((b, i) => (
                      <tr key={i}>
                        <td style={{ ...td, textAlign: "left", color: "#fff" }}>🛢️ {b.estilo}</td>
                        <td style={td}>{L(b.litros)}</td><td style={td}>{L(b.litros / (e.diasUteis || 5))}</td>
                        <td style={td}>{Math.round(b.litros / 50).toLocaleString("pt-BR")}</td>
                        <td style={td}>{Math.round(b.litros / 50 / (e.diasUteis || 5)).toLocaleString("pt-BR")}</td>
                        <td style={{ ...td, textAlign: "left", color: b.falta > 50 ? "#e57373" : "#ddd" }}>{origemTxt(b.usos)}{b.falta > 50 ? ` · falta ${L(b.falta)} L` : ""}</td>
                      </tr>
                    ))}
                    {e.barril.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "left", color: "#666" }}>Sem barril previsto.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        );
        })();
        if (!progJSX && !vendaJSX) return null;
        return (
          <div key={seg.getTime()} style={{ marginBottom: 14, borderLeft: "3px solid #C69700", paddingLeft: 8 }}>
            {progJSX}
            {vendaJSX}
          </div>
        );
      })}

      {/* lotes e acompanhamento */}
      <h4 style={{ color: "#fff", fontSize: 13, margin: "14px 0 6px" }}>Acompanhamento dos lotes {usarSalvo ? "" : "(marque “feito” depois de salvar o plano)"}</h4>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>
            <th style={th}>Feito</th><th style={{ ...th, textAlign: "left" }}>Tanque</th><th style={{ ...th, textAlign: "left" }}>Estilo</th><th style={th}>Entrega (semana de)</th>
            <th style={th}>Bateladas</th><th style={th}>Brassagem</th><th style={th}>Pronto</th><th style={th}>Atende (L)</th><th style={th}>Sobra (L)</th>
          </tr></thead>
          <tbody>
            {lotesExibidos.slice().sort((a, b) => a.inicio - b.inicio).map((l, i) => (
              <tr key={i} style={{ opacity: feitos[chaveLote(l)] ? 0.5 : 1 }}>
                <td style={td}><input type="checkbox" disabled={!usarSalvo} checked={!!feitos[chaveLote(l)]} onChange={() => alternarFeito(l)} /></td>
                <td style={{ ...td, textAlign: "left" }}>{l.tanque}</td>
                <td style={{ ...td, textAlign: "left", color: l.atrasado ? "#e57373" : "#fff" }}>{l.estilo}{l.reposicao ? " (reposição)" : ""}</td>
                <td style={td}>{l.reposicao ? "estoque" : fmtDataSem(l.prazo)}</td><td style={td}>{l.bateladas}</td>
                <td style={td}>{fmtDataSem(l.inicio)}{chaveDia(l.inicio) !== chaveDia(l.fim) ? ` → ${fmtDataSem(l.fim)}` : ""}</td>
                <td style={td}>{fmtDataSem(l.pronto)}{!l.diasPreenchido ? "*" : ""}</td>
                <td style={td}>{L(l.atende)}</td><td style={td}>{L(l.sobra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>* estilo sem prazo cadastrado (usei {diasPadrao} dias). Vermelho = lote que não fica pronto até o início da semana de entrega.</div>
      </>) : (
        <div style={{ color: "#777", fontSize: 12 }}>Valide o cenário acima para ver a programação dos tanques e da brassagem.</div>
      )}
    </div>
  );
}

function ProdutosTab() {
  const { produtosDados, produtosNomes: todosProdutosNomes, produtosPeriodos } = useData();
  const [buscaTipo, setBuscaTipo] = useState("");
  const [expandido, setExpandido] = useState(false);
  const LIMITE_PADRAO = 24;

  // filtro por embalagem: Chope / Pet / Outros (tudo que não é Chope nem Pet)
  const [embalagensSel, setEmbalagensSel] = useState(["chope", "pet", "outros"]);
  function toggleEmbalagem(e) {
    setEmbalagensSel(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }
  const produtosNomes = useMemo(
    () => todosProdutosNomes.filter(nome => embalagensSel.includes(classificarEmbalagem(nome))),
    [todosProdutosNomes, embalagensSel]
  );

  const produtosComComparativo = useMemo(() => {
    return produtosNomes
      .map(nome => ({ nome, comp: calcularComparativoCategoria(produtosDados[nome]) }))
      .sort((a, b) => (b.comp?.fat || 0) - (a.comp?.fat || 0));
  }, [produtosNomes, produtosDados]);

  const produtosExibidos = buscaTipo.trim()
    ? produtosComComparativo.filter(p => p.nome.toLowerCase().includes(buscaTipo.toLowerCase()))
    : produtosComComparativo;

  const produtosVisiveis = expandido ? produtosExibidos : produtosExibidos.slice(0, LIMITE_PADRAO);

  // --- gráfico comparativo: produto x ano, mês a mês (sempre em litros) ---
  // Só os produtos "fixos" aparecem como checkbox (Envasados/Chopes); os demais só pelo
  // buscador - ao adicionar um produto buscado ele vira um "chip" removível à parte, sem
  // entrar na lista fixa. "Marcar/desmarcar todos" mexe só nos fixos, nunca nos buscados.
  const [produtosGrafico, setProdutosGrafico] = useState([]);
  const [buscaGrafico, setBuscaGrafico] = useState("");
  // período (de/até) no mesmo formato "MonthPicker" usado no resto do app - segue a seleção
  // completa (ano E mês de cada ponta): só entram no gráfico os anos dentro do intervalo
  // escolhido, e dentro deles só os meses entre o mês inicial e o mês final.
  const mesAtualRealGrafico = chaveMesAtualReal();
  const [inicioGrafico, setInicioGrafico] = useState(() =>
    produtosPeriodos.includes("2025-01") ? "2025-01" : (produtosPeriodos[0] || "")
  );
  const [fimGrafico, setFimGrafico] = useState(() =>
    produtosPeriodos.includes(mesAtualRealGrafico) ? mesAtualRealGrafico : (produtosPeriodos[produtosPeriodos.length - 1] || "")
  );

  const nomesFixosGrafico = useMemo(
    () => PRODUTOS_FIXOS_GRAFICO.map(def => encontrarProdutoFixo(def, todosProdutosNomes)).filter(Boolean),
    [todosProdutosNomes]
  );
  const envasadosFixosGrafico = useMemo(() => nomesFixosGrafico.filter(n => classificarEmbalagem(n) !== "chope"), [nomesFixosGrafico]);
  const chopesFixosGrafico = useMemo(() => nomesFixosGrafico.filter(n => classificarEmbalagem(n) === "chope"), [nomesFixosGrafico]);
  // produtos selecionados que NÃO fazem parte da lista fixa (vieram da busca) - aparecem
  // como chip removível à parte, embaixo da lista fixa.
  const extrasGrafico = useMemo(() => produtosGrafico.filter(n => !nomesFixosGrafico.includes(n)), [produtosGrafico, nomesFixosGrafico]);

  function toggleProdutoGrafico(nome) {
    setProdutosGrafico(prev => prev.includes(nome) ? prev.filter(p => p !== nome) : [...prev, nome]);
  }
  // "marcar/desmarcar todos" só mexe nos produtos fixos (visíveis) - nunca nos extras
  // adicionados pela busca, que continuam selecionados do jeito que estavam.
  function marcarTodosGrafico() {
    setProdutosGrafico(prev => Array.from(new Set([...prev, ...nomesFixosGrafico])));
  }
  function desmarcarTodosGrafico() {
    setProdutosGrafico(prev => prev.filter(n => !nomesFixosGrafico.includes(n)));
  }

  const candidatosGrafico = useMemo(() => {
    if (!buscaGrafico.trim()) return [];
    const termo = buscaGrafico.toLowerCase();
    return todosProdutosNomes.filter(n => n.toLowerCase().includes(termo) && !produtosGrafico.includes(n)).slice(0, 15);
  }, [buscaGrafico, todosProdutosNomes, produtosGrafico]);

  const anoIniGrafico = inicioGrafico ? Number(inicioGrafico.split("-")[0]) : null;
  const anoFimGrafico = fimGrafico ? Number(fimGrafico.split("-")[0]) : null;
  const mesIniGrafico = inicioGrafico ? Number(inicioGrafico.split("-")[1]) : 1;
  const mesFimGrafico = fimGrafico ? Number(fimGrafico.split("-")[1]) : 12;

  // 1 linha no gráfico por combinação produto + ano (ex: "Helles 1L" selecionado com dado em
  // 2025 e 2026 gera 2 linhas: "Helles 1L 2025" e "Helles 1L 2026"). Valor sempre em litros,
  // independente do toggle litros/pallets usado na tabela acima. Cor por categoria: envasado
  // (tudo que não é chope) em verde clarinho, chope em amarelo clarinho.
  const seriesProdutosGrafico = useMemo(() => {
    if (!produtosGrafico.length) return { linhas: [], dados: [] };
    const linhas = [];
    const anosSet = new Set();
    produtosGrafico.forEach(nome => {
      (produtosDados[nome] || []).forEach(r => {
        if (anoIniGrafico != null && r.ano < anoIniGrafico) return;
        if (anoFimGrafico != null && r.ano > anoFimGrafico) return;
        anosSet.add(r.ano);
      });
    });
    const anos = [...anosSet].sort((a, b) => a - b);
    let idxEnvasado = 0, idxChope = 0;
    produtosGrafico.forEach(nome => {
      const eChope = classificarEmbalagem(nome) === "chope";
      anos.forEach(ano => {
        const cor = eChope ? PALETA_CHOPE_CLARO[idxChope++ % PALETA_CHOPE_CLARO.length] : PALETA_ENVASADO_CLARO[idxEnvasado++ % PALETA_ENVASADO_CLARO.length];
        linhas.push({ key: `${nome}__${ano}`, produto: nome, ano, cor });
      });
    });
    const dadosCompletos = MESES.map((nomeMes, idx) => {
      const linha = { mes: nomeMes, mesIdx: idx + 1 };
      linhas.forEach(l => {
        const row = (produtosDados[l.produto] || []).find(r => r.ano === l.ano && r.mes === idx + 1);
        linha[l.key] = row ? row.litros : null;
      });
      return linha;
    });
    const dados = mesIniGrafico <= mesFimGrafico
      ? dadosCompletos.filter(d => d.mesIdx >= mesIniGrafico && d.mesIdx <= mesFimGrafico)
      : dadosCompletos.filter(d => d.mesIdx >= mesIniGrafico || d.mesIdx <= mesFimGrafico);
    return { linhas, dados };
  }, [produtosGrafico, produtosDados, mesIniGrafico, mesFimGrafico, anoIniGrafico, anoFimGrafico]);

  // --- heatmap mês a mês por produto ---
  const [metricaHeatmap, setMetricaHeatmap] = useState("faturamento"); // 'faturamento' | 'litros'
  const [unidadeExibicao, setUnidadeExibicao] = useState("litros"); // 'litros' | 'pallets' (só aplica quando metricaHeatmap === 'litros')
  const [modoDataHeatmap, setModoDataHeatmap] = useState("mes"); // 'mes' | 'periodo'
  const [expandidoHeatmap, setExpandidoHeatmap] = useState(false);
  const LIMITE_HEATMAP = 20;

  const mesAtualRealProdutos = chaveMesAtualReal();
  const [mesHeatmap, setMesHeatmap] = useState(() =>
    produtosPeriodos.includes(mesAtualRealProdutos) ? mesAtualRealProdutos : (produtosPeriodos[produtosPeriodos.length - 1] || "")
  );
  const [inicioHeatmap, setInicioHeatmap] = useState(() =>
    produtosPeriodos.includes("2025-01") ? "2025-01" : (produtosPeriodos[0] || "")
  );
  const [fimHeatmap, setFimHeatmap] = useState(() =>
    produtosPeriodos.includes(mesAtualRealProdutos) ? mesAtualRealProdutos : (produtosPeriodos[produtosPeriodos.length - 1] || "")
  );

  const chavesHeatmap = useMemo(() => {
    if (modoDataHeatmap === "mes") return mesHeatmap ? [mesHeatmap] : [];
    if (!inicioHeatmap || !fimHeatmap) return [];
    return produtosPeriodos.filter(p => p >= inicioHeatmap && p <= fimHeatmap);
  }, [modoDataHeatmap, mesHeatmap, inicioHeatmap, fimHeatmap, produtosPeriodos]);

  const linhasHeatmap = useMemo(() => {
    if (!chavesHeatmap.length) return [];
    return produtosNomes
      .map(nome => {
        const rows = produtosDados[nome] || [];
        const valores = chavesHeatmap.map(chave => {
          const row = rows.find(r => r.chave === chave);
          return { periodo: chave, valor: row ? row[metricaHeatmap] : 0 };
        });
        const total = valores.reduce((s, v) => s + v.valor, 0);
        return { categoria: nome, valores, total };
      })
      .filter(l => l.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [produtosNomes, produtosDados, chavesHeatmap, metricaHeatmap]);

  // histórico INTEIRO por produto (não só a janela selecionada) - pra dar pra comparar com
  // mês anterior/mesmo mês ano anterior mesmo quando a janela mostrada for só 1 mês
  const dadosCompletosHeatmap = useMemo(() => {
    const mapa = {};
    produtosNomes.forEach(nome => {
      const porChave = {};
      (produtosDados[nome] || []).forEach(r => { porChave[r.chave] = r[metricaHeatmap]; });
      mapa[nome] = porChave;
    });
    return mapa;
  }, [produtosNomes, produtosDados, metricaHeatmap]);

  // se estiver em modo pallets, converte litros -> pallets por produto (cada um tem seu
  // próprio "litros por pallet" de acordo com o tamanho da embalagem no nome). Produto sem
  // tamanho reconhecido (garrafa/lata/chope) mantém o valor em litros mesmo.
  const emModoPallets = unidadeExibicao === "pallets" && metricaHeatmap === "litros";

  // TODAS as linhas (já convertidas se for pallets) - base da projeção e da exportação pro Excel
  const linhasHeatmapConvertidas = useMemo(() => {
    if (!emModoPallets) return linhasHeatmap;
    return linhasHeatmap.map(linha => {
      const porPallet = litrosPorPallet(linha.categoria);
      if (!porPallet) return linha;
      return { ...linha, valores: linha.valores.map(v => ({ ...v, valor: v.valor / porPallet })) };
    });
  }, [linhasHeatmap, emModoPallets]);

  // o que aparece na tela: as 20 primeiras, até clicar em "Ver todos"
  const linhasHeatmapExibidas = useMemo(
    () => (expandidoHeatmap ? linhasHeatmapConvertidas : linhasHeatmapConvertidas.slice(0, LIMITE_HEATMAP)),
    [linhasHeatmapConvertidas, expandidoHeatmap]
  );

  const dadosCompletosExibidos = useMemo(() => {
    if (!emModoPallets) return dadosCompletosHeatmap;
    const mapa = {};
    Object.keys(dadosCompletosHeatmap).forEach(nome => {
      const porPallet = litrosPorPallet(nome);
      if (!porPallet) { mapa[nome] = dadosCompletosHeatmap[nome]; return; }
      const porChave = {};
      Object.keys(dadosCompletosHeatmap[nome]).forEach(chave => { porChave[chave] = dadosCompletosHeatmap[nome][chave] / porPallet; });
      mapa[nome] = porChave;
    });
    return mapa;
  }, [dadosCompletosHeatmap, emModoPallets]);

  const unidadeAtual = metricaHeatmap === "litros" ? (emModoPallets ? "pal" : "L") : undefined;

  // --- projeção (tabela separada, abaixo da tabela de dados reais) ---
  const [incluirProjecao, setIncluirProjecao] = useState(false);
  const [modoProjecao, setModoProjecao] = useState("anoAnterior"); // 'anoAnterior' | 'mediaRecente'
  const [pctMin, setPctMin] = useState(80);
  const [pctBase, setPctBase] = useState(100);
  const [pctMax, setPctMax] = useState(120);

  // modo "mesmo período do ano anterior": você escolhe o período de referência, ele projeta
  // os mesmos meses 1 ano depois. Bom pra produto com histórico/sazonal (ex: Oktoberfest).
  const [inicioProjecao, setInicioProjecao] = useState(() =>
    produtosPeriodos.includes("2025-01") ? "2025-01" : (produtosPeriodos[0] || "")
  );
  const [fimProjecao, setFimProjecao] = useState(() =>
    produtosPeriodos.includes(mesAtualRealProdutos) ? mesAtualRealProdutos : (produtosPeriodos[produtosPeriodos.length - 1] || "")
  );
  // se marcado, pula os meses-alvo que já têm dado real (ex: usar o ano 2025 inteiro de
  // referência, mas só projetar de fato os meses de 2026 que ainda não aconteceram)
  const [somenteMesesFuturos, setSomenteMesesFuturos] = useState(true);

  const paresAnoAnterior = useMemo(() => {
    if (!inicioProjecao || !fimProjecao) return [];
    const referencia = produtosPeriodos.filter(p => p >= inicioProjecao && p <= fimProjecao);
    const pares = referencia.map(c => {
      const [ano, mes] = c.split("-").map(Number);
      return { referencia: c, alvo: `${ano + 1}-${String(mes).padStart(2, "0")}` };
    });
    return somenteMesesFuturos ? pares.filter(p => !produtosPeriodos.includes(p.alvo)) : pares;
  }, [inicioProjecao, fimProjecao, produtosPeriodos, somenteMesesFuturos]);

  const chavesReferenciaProjecao = useMemo(() => paresAnoAnterior.map(p => p.referencia), [paresAnoAnterior]);
  const chavesProjecaoAnoAnterior = useMemo(() => paresAnoAnterior.map(p => p.alvo), [paresAnoAnterior]);

  // modo "média recente + sazonalidade geral": bom pra produto novo, sem ano anterior pra
  // comparar. Pega a média dos últimos N meses do próprio produto como "nível base", e projeta
  // pra frente M meses, variando cada mês pela sazonalidade AGREGADA dos produtos filtrados
  // (embalagem selecionada) - ou seja, usa o comportamento sazonal do grupo pra estimar como
  // um produto sem histórico deve se comportar mês a mês.
  const [mesesBaseMedia, setMesesBaseMedia] = useState(3);
  const [mesesProjetarFrente, setMesesProjetarFrente] = useState(6);

  const periodosFechadosProdutos = useMemo(() => produtosPeriodos.filter(p => p !== mesAtualRealProdutos), [produtosPeriodos, mesAtualRealProdutos]);
  const ultimoFechadoProdutos = periodosFechadosProdutos[periodosFechadosProdutos.length - 1] || "";

  const chavesBaseMedia = useMemo(() => periodosFechadosProdutos.slice(-mesesBaseMedia), [periodosFechadosProdutos, mesesBaseMedia]);

  const chavesProjecaoMediaRecente = useMemo(() => {
    if (!ultimoFechadoProdutos) return [];
    const chaves = [];
    let atual = ultimoFechadoProdutos;
    for (let i = 0; i < mesesProjetarFrente; i++) {
      const [ano, mes] = atual.split("-").map(Number);
      atual = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
      chaves.push(atual);
    }
    return chaves;
  }, [ultimoFechadoProdutos, mesesProjetarFrente]);

  // índice de sazonalidade (1 posição por mês-calendário, 1 a 12): total de cada mês somado
  // em todos os anos, dividido pela média mensal geral - só com os produtos do filtro atual
  // (embalagem selecionada), pra não misturar sazonalidade de chope com pet, por exemplo.
  const indiceSazonal = useMemo(() => {
    const somaPorMes = Array(13).fill(0);
    produtosNomes.forEach(nome => {
      (produtosDados[nome] || []).forEach(r => { somaPorMes[r.mes] += r[metricaHeatmap] || 0; });
    });
    const mediaGeral = somaPorMes.slice(1).reduce((a, b) => a + b, 0) / 12;
    if (!mediaGeral) return null;
    return somaPorMes.map(v => v / mediaGeral);
  }, [produtosNomes, produtosDados, metricaHeatmap]);

  // linhas da tabela de projeção (formato separado, {categoria, valores:[{periodo,valor}]})
  const linhasProjecao = useMemo(() => {
    if (!incluirProjecao) return [];

    if (modoProjecao === "anoAnterior") {
      if (!chavesReferenciaProjecao.length) return [];
      return linhasHeatmapConvertidas.map(linha => {
        const completos = dadosCompletosExibidos[linha.categoria] || {};
        const valores = chavesReferenciaProjecao.map((chaveRef, idx) => {
          const valorRef = completos[chaveRef] || 0;
          return {
            periodo: chavesProjecaoAnoAnterior[idx],
            base: valorRef * (pctBase / 100),
            min: valorRef * (pctMin / 100),
            max: valorRef * (pctMax / 100),
          };
        });
        return { categoria: linha.categoria, valores };
      });
    }

    // modo "mediaRecente"
    if (!indiceSazonal || !chavesBaseMedia.length || !chavesProjecaoMediaRecente.length) return [];
    return linhasHeatmapConvertidas.map(linha => {
      const completos = dadosCompletosExibidos[linha.categoria] || {};
      const baseValores = chavesBaseMedia.map(c => completos[c] || 0);
      const baseMedia = baseValores.reduce((a, b) => a + b, 0) / baseValores.length;
      const valores = chavesProjecaoMediaRecente.map(chave => {
        const mes = Number(chave.split("-")[1]);
        const indice = indiceSazonal[mes] ?? 1;
        const valorSazonal = baseMedia * indice;
        return {
          periodo: chave,
          base: valorSazonal * (pctBase / 100),
          min: valorSazonal * (pctMin / 100),
          max: valorSazonal * (pctMax / 100),
        };
      });
      return { categoria: linha.categoria, valores };
    });
  }, [incluirProjecao, modoProjecao, linhasHeatmapConvertidas, dadosCompletosExibidos, chavesReferenciaProjecao, chavesProjecaoAnoAnterior,
      pctMin, pctBase, pctMax, indiceSazonal, chavesBaseMedia, chavesProjecaoMediaRecente]);

  if (!todosProdutosNomes.length) {
    return (
      <div style={{ color: "#888", textAlign: "center", padding: "60px 20px", fontSize: 14 }}>
        Nenhum dado de produtos encontrado ainda. Crie as abas <strong style={{ color: "#C69700" }}>produtos_faturamento</strong> e{" "}
        <strong style={{ color: "#C69700" }}>produtos_litros</strong> na planilha (mesmo formato "largo" dos relatórios de
        faturamento/litros por cliente, com a coluna "Produto" e "Descrição" e uma coluna por mês) pra essa aba passar a mostrar dados.
      </div>
    );
  }

  return (
    <div>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <BotaoExcel nomeAba="Produtos" gerar={() => {
          const unid = metricaHeatmap === "litros" ? (emModoPallets ? "pallets" : "litros") : "R$";
          const abas = abasDeHeatmap("Mês a mês", "% vs ano anterior", `Produto (${unid})`, linhasHeatmapConvertidas, dadosCompletosExibidos, { media7d: true });
          if (incluirProjecao && linhasProjecao.length) {
            const per = linhasProjecao[0].valores.map(v => v.periodo);
            const n = per.length || 1;
            const cab = [`Produto (${unid})`];
            per.forEach(p => cab.push(`${labelMes(p)} Base`, `${labelMes(p)} Mín`, `${labelMes(p)} Máx`));
            cab.push("Total Base", "Total Mín", "Total Máx", "Média/mês Base", "Média/mês Mín", "Média/mês Máx");
            const soma3 = l => [l.valores.reduce((s, v) => s + (v.base || 0), 0), l.valores.reduce((s, v) => s + (v.min || 0), 0), l.valores.reduce((s, v) => s + (v.max || 0), 0)];
            const corpo = linhasProjecao.map(l => {
              const [tb, tm, tx] = soma3(l);
              return [l.categoria, ...l.valores.flatMap(v => [nx(v.base), nx(v.min), nx(v.max)]), nx(tb), nx(tm), nx(tx), nx(tb / n), nx(tm / n), nx(tx / n)];
            });
            const colTot = per.flatMap((p, i) => {
              let b = 0, mi = 0, ma = 0;
              linhasProjecao.forEach(l => { const v = l.valores[i]; if (v) { b += v.base || 0; mi += v.min || 0; ma += v.max || 0; } });
              return [nx(b), nx(mi), nx(ma)];
            });
            let gb = 0, gm = 0, gx = 0;
            linhasProjecao.forEach(l => { const [tb, tm, tx] = soma3(l); gb += tb; gm += tm; gx += tx; });
            abas.push({ nome: "Projeção", linhas: [cab, ...corpo, ["TOTAL", ...colTot, nx(gb), nx(gm), nx(gx), nx(gb / n), nx(gm / n), nx(gx / n)]] });
          }
          abas.push({ nome: "Por tipo (último mês)", linhas: [
            ["Produto", "Último mês fechado", "Faturamento (R$)", "Fat. Var. vs mês ant. (%)", "Fat. Var. vs mesmo mês ano ant. (%)", "Litros", "Litros Var. vs mês ant. (%)", "Litros Var. vs mesmo mês ano ant. (%)", "Preço (R$/L)"],
            ...produtosExibidos.map(({ nome, comp }) => comp
              ? [nome, comp.mesTexto, nx(comp.fat), pctX(comp.varFatMes), pctX(comp.varFatAno), nx(comp.lit), pctX(comp.varLitMes), pctX(comp.varLitAno), nx(comp.precoLitro)]
              : [nome]),
          ] });
          return abas;
        }} />
        <BotaoImprimir label="Imprimir Produtos (comparação + projeção)" />
      </div>
      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Package size={13} /> Embalagem ({produtosNomes.length} de {todosProdutosNomes.length} produtos):
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={embalagensSel.includes("chope")} onChange={() => toggleEmbalagem("chope")} />
            🍺 Chope
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={embalagensSel.includes("pet")} onChange={() => toggleEmbalagem("pet")} />
            🧴 Pet
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={embalagensSel.includes("outros")} onChange={() => toggleEmbalagem("outros")} />
            📦 Outros (garrafa, lata, etc.)
          </label>
        </div>
      </div>

      {produtosNomes.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 20px", fontSize: 14 }}>
          Nenhum produto nas embalagens selecionadas. Marque pelo menos uma opção acima.
        </div>
      )}

      {produtosNomes.length > 0 && (
      <>
      <Section title="Comparação Mês a Mês por Produto" icon={<AlertTriangle size={16} color="#C69700" />}>
        <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setMetricaHeatmap("faturamento")} style={modoBtnStyle(metricaHeatmap === "faturamento", "#02601D")}>
              <TrendingUp size={13} /> Faturamento
            </button>
            <button onClick={() => setMetricaHeatmap("litros")} style={modoBtnStyle(metricaHeatmap === "litros", "#C69700")}>
              <Droplets size={13} /> Litros
            </button>
          </div>

          {metricaHeatmap === "litros" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button onClick={() => setUnidadeExibicao("litros")} style={modoBtnStyle(unidadeExibicao === "litros", "#4a90d9")}>
                <Droplets size={13} /> Litros
              </button>
              <button onClick={() => setUnidadeExibicao("pallets")} style={modoBtnStyle(unidadeExibicao === "pallets", "#4a90d9")}>
                <Package size={13} /> Pallets
              </button>
            </div>
          )}
          {emModoPallets && (
            <div style={{ color: "#666", fontSize: 11, marginBottom: 12 }}>
              Conversão: PET 1L = 1.080 L/pallet · PET 2L = 1.152 L/pallet · 500ml = 1.050 L/pallet. Garrafa, lata e chope não têm pallet definido — continuam em litros.
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setModoDataHeatmap("mes")} style={modoBtnStyle(modoDataHeatmap === "mes", "#4a90d9")}>
              <Calendar size={13} /> Mês único
            </button>
            <button onClick={() => setModoDataHeatmap("periodo")} style={modoBtnStyle(modoDataHeatmap === "periodo", "#4a90d9")}>
              <Calendar size={13} /> Período
            </button>
          </div>

          {modoDataHeatmap === "mes" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#888", fontSize: 12 }}>Mês:</span>
              <MonthPicker periodosDisponiveis={produtosPeriodos} valor={mesHeatmap} onSelecionar={setMesHeatmap} placeholder="Selecionar mês" />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: "#888", fontSize: 12 }}>Período:</span>
              <MonthPicker periodosDisponiveis={produtosPeriodos} valor={inicioHeatmap} onSelecionar={setInicioHeatmap} placeholder="Início" />
              <span style={{ color: "#666" }}>até</span>
              <MonthPicker periodosDisponiveis={produtosPeriodos} valor={fimHeatmap} onSelecionar={setFimHeatmap} placeholder="Fim" />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid #333", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={incluirProjecao} onChange={e => setIncluirProjecao(e.target.checked)} />
              📈 Incluir projeção
            </label>
          </div>

          {incluirProjecao && (
            <div style={{ marginTop: 10, background: "rgba(198,151,0,0.06)", border: "1px solid rgba(198,151,0,0.25)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button onClick={() => setModoProjecao("anoAnterior")} style={modoBtnStyle(modoProjecao === "anoAnterior", "#C69700")}>
                  Mesmo período do ano anterior
                </button>
                <button onClick={() => setModoProjecao("mediaRecente")} style={modoBtnStyle(modoProjecao === "mediaRecente", "#C69700")}>
                  Média recente + sazonalidade
                </button>
              </div>

              {modoProjecao === "anoAnterior" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ color: "#888", fontSize: 12 }}>Período de referência pra projetar:</span>
                    <MonthPicker periodosDisponiveis={produtosPeriodos} valor={inicioProjecao} onSelecionar={setInicioProjecao} placeholder="Início" />
                    <span style={{ color: "#666" }}>até</span>
                    <MonthPicker periodosDisponiveis={produtosPeriodos} valor={fimProjecao} onSelecionar={setFimProjecao} placeholder="Fim" />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", cursor: "pointer", marginBottom: 10 }}>
                    <input type="checkbox" checked={somenteMesesFuturos} onChange={e => setSomenteMesesFuturos(e.target.checked)} />
                    Pular meses que já têm dado real (útil pra usar um ano inteiro de referência e projetar só o restante do ano em andamento)
                  </label>
                  {chavesReferenciaProjecao.length > 0 ? (
                    <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>
                      Vai projetar: {labelMes(chavesProjecaoAnoAnterior[0])} a {labelMes(chavesProjecaoAnoAnterior[chavesProjecaoAnoAnterior.length - 1])}
                      {" "}(com base em {labelMes(chavesReferenciaProjecao[0])} a {labelMes(chavesReferenciaProjecao[chavesReferenciaProjecao.length - 1])}, mesmos meses 1 ano antes)
                    </div>
                  ) : (
                    <div style={{ color: "#e0645a", fontSize: 11, marginBottom: 10 }}>
                      Nenhum mês-alvo sobrou pra projetar (todos os meses 1 ano depois já têm dado real). Desmarque a opção acima, ou escolha outro período de referência.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>
                    Pra produto sem "ano anterior" pra comparar (ex: lançamento recente) — pega a média dos últimos meses do próprio
                    produto como base, e projeta pra frente variando mês a mês pela sazonalidade agregada dos produtos marcados no
                    filtro de embalagem (Chope/Pet/Outros) lá em cima.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#888", fontSize: 12 }}>Base: média dos últimos</span>
                      <input type="number" min="1" max="24" value={mesesBaseMedia} onChange={e => setMesesBaseMedia(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                        style={{ width: 50, background: "#141412", border: "1px solid #444", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                      <span style={{ color: "#888", fontSize: 12 }}>meses</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#888", fontSize: 12 }}>Projetar: próximos</span>
                      <input type="number" min="1" max="24" value={mesesProjetarFrente} onChange={e => setMesesProjetarFrente(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                        style={{ width: 50, background: "#141412", border: "1px solid #444", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                      <span style={{ color: "#888", fontSize: 12 }}>meses</span>
                    </div>
                  </div>
                  {chavesBaseMedia.length > 0 && chavesProjecaoMediaRecente.length > 0 && (
                    <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>
                      Base: {labelMes(chavesBaseMedia[0])} a {labelMes(chavesBaseMedia[chavesBaseMedia.length - 1])} → projeta
                      {" "}{labelMes(chavesProjecaoMediaRecente[0])} a {labelMes(chavesProjecaoMediaRecente[chavesProjecaoMediaRecente.length - 1])}
                    </div>
                  )}
                </>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#e0645a", fontSize: 12 }}>% mínimo:</span>
                  <input type="number" min="0" max="300" value={pctMin} onChange={e => setPctMin(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                    style={{ width: 65, background: "#141412", border: "1px solid #e0645a", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#C69700", fontSize: 12 }}>% igual ano passado:</span>
                  <input type="number" min="0" max="300" value={pctBase} onChange={e => setPctBase(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                    style={{ width: 65, background: "#141412", border: "1px solid #C69700", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#4caf6b", fontSize: 12 }}>% máximo:</span>
                  <input type="number" min="0" max="300" value={pctMax} onChange={e => setPctMax(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                    style={{ width: 65, background: "#141412", border: "1px solid #4caf6b", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                </div>
              </div>
              <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>
                100% = repete exatamente o valor da base calculada (ano anterior ou média recente, conforme o modo). Os 3 valores aparecem juntos em cada célula da tabela de projeção abaixo.
              </div>
            </div>
          )}
        </div>

        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 acima de +10% · 🟡 0% a +10% · 🟠 0% a -10% · 🔴 abaixo de -10% (cor de fundo = vs mês anterior). O % entre parênteses ao lado de cada
          valor (mês a mês e na Média/mês) compara com o mesmo mês/período do ano anterior. Passe o mouse numa célula pra ver a diferença em número
          também. Ordenado do maior pro menor total no período selecionado.
        </div>

        {linhasHeatmap.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Nenhum produto com dado no período selecionado.
          </div>
        )}

        {linhasHeatmap.length > 0 && (
          <>
            <TabelaHeatmapCategoria linhas={linhasHeatmapExibidas} rotuloColuna="Produto" unidade={unidadeAtual} dadosCompletos={dadosCompletosExibidos} mostrarMedia7d />
            {linhasHeatmap.length > LIMITE_HEATMAP && (
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button onClick={() => setExpandidoHeatmap(e => !e)} style={chipBtnStyle}>
                  {expandidoHeatmap ? "Mostrar menos" : `Ver todos (${linhasHeatmap.length} produtos)`}
                </button>
              </div>
            )}

            {incluirProjecao && linhasProjecao.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ color: "#C69700", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  📈 Projeção (estimativa — colunas com * não são dado real)
                </div>
                <TabelaProjecao linhas={expandidoHeatmap ? linhasProjecao : linhasProjecao.slice(0, LIMITE_HEATMAP)} rotuloColuna="Produto" unidade={unidadeAtual} />
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Comparação entre Produtos · Mês a Mês (Litros, por ano)" icon={<TrendingUp size={18} color="#02601D" />}>
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <BotaoExcel nomeAba="Grafico Produtos" gerar={() => {
            if (!seriesProdutosGrafico.linhas.length) return [{ nome: "Gráfico", linhas: [["Selecione produtos no app antes de exportar."]] }];
            const cab = ["Mês", ...seriesProdutosGrafico.linhas.map(l => `${l.produto} ${l.ano}`)];
            const corpo = seriesProdutosGrafico.dados.map(d => [d.mes, ...seriesProdutosGrafico.linhas.map(l => nx(d[l.key]))]);
            return [{ nome: "Gráfico por produto", linhas: [cab, ...corpo] }];
          }} />
        </div>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>
          Marque os produtos que quer comparar. Cada combinação produto + ano vira uma linha (ex: "Helles 1L" com dados em 2025 e
          2026 gera "Helles 1L 2025" e "Helles 1L 2026"). Envasados em verde clarinho, chopes em amarelo clarinho. Valores sempre
          em litros.
        </div>

        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
          <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Período:</span>
          <MonthPicker periodosDisponiveis={produtosPeriodos} valor={inicioGrafico} onSelecionar={setInicioGrafico} placeholder="Início" />
          <span style={{ color: "#666" }}>até</span>
          <MonthPicker periodosDisponiveis={produtosPeriodos} valor={fimGrafico} onSelecionar={setFimGrafico} placeholder="Fim" />
          <span style={{ color: "#666", fontSize: 11 }}>(segue a seleção - só entram os anos dentro do intervalo, nos meses entre o início e o fim)</span>
        </div>

        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Package size={13} /> Produtos no gráfico ({produtosGrafico.length} selecionados):
        </div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={marcarTodosGrafico} style={chipBtnStyle}>Marcar todos (fixos)</button>
          <button onClick={desmarcarTodosGrafico} style={chipBtnStyle}>Desmarcar todos (fixos)</button>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ color: "#4caf6b", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🟢 Envasados ({envasadosFixosGrafico.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {envasadosFixosGrafico.map(nome => (
                <label key={nome} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", cursor: "pointer" }}>
                  <input type="checkbox" checked={produtosGrafico.includes(nome)} onChange={() => toggleProdutoGrafico(nome)} />
                  {nome}
                </label>
              ))}
              {envasadosFixosGrafico.length === 0 && <div style={{ color: "#555", fontSize: 12 }}>Nenhum desses produtos foi encontrado na planilha.</div>}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ color: "#C69700", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🟡 Chopes ({chopesFixosGrafico.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {chopesFixosGrafico.map(nome => (
                <label key={nome} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", cursor: "pointer" }}>
                  <input type="checkbox" checked={produtosGrafico.includes(nome)} onChange={() => toggleProdutoGrafico(nome)} />
                  {nome}
                </label>
              ))}
              {chopesFixosGrafico.length === 0 && <div style={{ color: "#555", fontSize: 12 }}>Nenhum desses produtos foi encontrado na planilha.</div>}
            </div>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, background: "#1D1D1B", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
          <Search size={14} color="#C69700" />
          <input placeholder="Buscar outro produto (fora da lista fixa) pra adicionar ao gráfico..." value={buscaGrafico} onChange={e => setBuscaGrafico(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
        </div>

        {candidatosGrafico.length > 0 && (
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {candidatosGrafico.map(nome => (
              <button key={nome} onClick={() => { toggleProdutoGrafico(nome); setBuscaGrafico(""); }} style={chipBtnStyle}>
                + {nome}
              </button>
            ))}
          </div>
        )}

        {extrasGrafico.length > 0 && (
          <div className="no-print" style={{ marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>Adicionados pela busca:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {extrasGrafico.map(nome => (
                <span key={nome} style={{
                  display: "flex", alignItems: "center", gap: 6, background: "rgba(198,151,0,0.12)",
                  border: "1px solid #C69700", borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 12, color: "#fff",
                }}>
                  {nome}
                  <button onClick={() => toggleProdutoGrafico(nome)} style={{ background: "transparent", border: "none", color: "#C69700", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 4px" }}>×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {produtosGrafico.length === 0 ? (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Marque pelo menos um produto acima pra ver o gráfico.
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 8px 4px" }}>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={seriesProdutosGrafico.dados}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 13 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 13 }} tickFormatter={v => rotuloCompactoGeral(v, "L")} />
                <Tooltip formatter={(v, name) => [v == null ? "-" : rotuloCompactoGeral(v, "L"), name]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                {seriesProdutosGrafico.linhas.map(l => (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={`${l.produto} ${l.ano}`} stroke={l.cor} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title={`Por Tipo de Produto (${produtosExibidos.length}${buscaTipo.trim() ? ` de ${produtosComComparativo.length}` : ""})`} icon={<TrendingUp size={18} color="#02601D" />}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1D1D1B", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>
          <Search size={14} color="#C69700" />
          <input placeholder="Buscar um tipo de produto específico..." value={buscaTipo} onChange={e => setBuscaTipo(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
        </div>

        {produtosExibidos.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Nenhum produto encontrado para essa busca.
          </div>
        )}

        {produtosExibidos.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {produtosVisiveis.map(({ nome, comp }) => (
                <CardCategoriaProduto key={nome} nome={nome} comp={comp} cor="#4caf6b" />
              ))}
            </div>

            {produtosExibidos.length > LIMITE_PADRAO && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button onClick={() => setExpandido(e => !e)} style={chipBtnStyle}>
                  {expandido ? "Mostrar menos" : `Ver todos (${produtosExibidos.length} produtos)`}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
      </>
      )}
    </div>
  );
}

export default function App() {
  const [logado, setLogado] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginDigitado, setLoginDigitado] = useState("");
  const veSomentePlanejamento = loginDigitado === "henrique"; // aba Planejamento restrita ao login henrique
  const [tab, setTab] = useState("cliente");

  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [erroMsg, setErroMsg] = useState("");
  const [contexto, setContexto] = useState(null);

  function carregarDados() {
    setStatus("loading");
    setErroMsg("");

    if (!GAS_URL) {
      setStatus("error");
      setErroMsg("VITE_GAS_URL não configurada. Defina a URL do Apps Script no arquivo .env.");
      return;
    }

    fetch(GAS_URL)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.erro || "Erro desconhecido ao ler a planilha.");
        setContexto(processarDados(json.dados, json.produtosPorTipo || [], json.estoque || [], json.tanques || [], json.receitas || [], json.planoSalvo || "", json.cenariosSalvos || ""));
        setStatus("ready");
      })
      .catch(err => {
        setErroMsg(`Não foi possível carregar os dados: ${err.message}`);
        setStatus("error");
      });
  }

  useEffect(() => {
    carregarDados();
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#141412", minHeight: 600, padding: 20, borderRadius: 14 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {!logado && <LoginScreen onLogin={(u, admin, loginDigitado) => { setUsuario(u); setIsAdmin(admin); setLoginDigitado(String(loginDigitado || "").trim().toLowerCase()); setLogado(true); }} />}

      {logado && (
        <div>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1 }}>
              HBIER <span style={{ color: "#C69700" }}>BI</span>
              <span style={{ color: "#555", fontSize: 12, marginLeft: 10, fontFamily: "system-ui" }}>{APP_VERSION}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#888", fontSize: 13 }}>{usuario}</span>
              <button onClick={() => { setLogado(false); setIsAdmin(false); }} style={{
                background: "transparent", border: "1px solid #444", color: "#888",
                borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <LogOut size={13} /> Sair
              </button>
            </div>
          </div>

          {status !== "ready" && (
            <CarregandoDados onRetry={carregarDados} mensagem={status === "error" ? erroMsg : null} />
          )}

          {status === "ready" && contexto && (
            <DataContext.Provider value={contexto}>
              <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 22, borderBottom: "1px solid #2a2a28" }}>
                <button onClick={() => setTab("cliente")} style={tabStyle(tab === "cliente")}>
                  <Search size={14} /> Cliente
                </button>
                <button onClick={() => setTab("comparacao")} style={tabStyle(tab === "comparacao")}>
                  <GitCompareArrows size={14} /> Comparação
                </button>
                <button onClick={() => setTab("dashboard")} style={tabStyle(tab === "dashboard")}>
                  <LayoutDashboard size={14} /> Canais
                </button>
                <button onClick={() => setTab("mes")} style={tabStyle(tab === "mes")}>
                  <Calendar size={14} /> Top Clientes
                </button>
                <button onClick={() => setTab("produtos")} style={tabStyle(tab === "produtos")}>
                  <Package size={14} /> Produtos
                </button>
                {veSomentePlanejamento && (
                <button onClick={() => setTab("planejamento")} style={tabStyle(tab === "planejamento")}>
                  <Factory size={14} /> Planejamento
                </button>)}
                <button onClick={() => setTab("positivacao")} style={tabStyle(tab === "positivacao")}>
                  <Trophy size={14} /> Positivação
                </button>
                <button onClick={() => setTab("estoque")} style={tabStyle(tab === "estoque")}>
                  <Boxes size={14} /> Estoque
                </button>
                <button onClick={() => setTab("projecao")} style={tabStyle(tab === "projecao")}>
                  <TrendingUp size={14} /> Projeção
                </button>
                {isAdmin && (
                  <button onClick={() => setTab("global")} style={tabStyle(tab === "global")}>
                    <Globe size={14} /> Global
                  </button>
                )}
              </div>

              {tab === "cliente" && <ClienteDashboard />}
              {tab === "comparacao" && <ComparacaoTab />}
              {tab === "dashboard" && <DashboardTab />}
              {tab === "mes" && <MesTab />}
              {tab === "produtos" && <ProdutosTab />}
              {tab === "planejamento" && veSomentePlanejamento && <PlanejamentoProducao />}
              {tab === "positivacao" && <PositivacaoTab />}
              {tab === "estoque" && <EstoqueTab />}
              {tab === "projecao" && <ProjecaoVendasTab />}
              {tab === "global" && isAdmin && <GlobalTab />}
            </DataContext.Provider>
          )}
        </div>
      )}
    </div>
  );
}

function tabStyle(ativo) {
  return {
    background: "transparent", border: "none", cursor: "pointer",
    color: ativo ? "#C69700" : "#888", fontSize: 14, fontWeight: 600,
    padding: "8px 4px", display: "flex", alignItems: "center", gap: 6,
    borderBottom: ativo ? "2px solid #C69700" : "2px solid transparent",
    marginBottom: -1,
  };
}
