import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList, ReferenceLine, Cell,
  PieChart, Pie,
} from "recharts";
import { Search, LogIn, TrendingUp, Droplets, GitCompareArrows, LogOut, Users, Layers, RefreshCw, AlertTriangle, Calendar, Table as TableIcon, ArrowUp, ArrowDown, Minus, LayoutDashboard, Trophy, Globe, Package } from "lucide-react";

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

const APP_VERSION = "v6.1";
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
function processarDados(linhas, produtosPorTipo) {
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

  return {
    dados: porCliente, nomes, nomesVisiveis, grupos, clientesPorGrupo, periodos, grupoDoCliente,
    labelDoCliente, razaoSocialDoCliente, dataCriacaoDoCliente,
    produtosDados: porProduto, produtosNomes, produtosPeriodos,
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
function CardJanelaDetalhada({ titulo, icon, rowsAtual, rowsAnterior, campo, formatador }) {
  const totalAtual = soma(rowsAtual, campo);
  const mediaAtual = media(rowsAtual, campo);
  const totalAnterior = rowsAnterior.length ? soma(rowsAnterior, campo) : null;
  const mediaAnterior = rowsAnterior.length ? media(rowsAnterior, campo) : null;
  const variacao = rowsAnterior.length ? calcularVariacao(totalAtual, totalAnterior) : null;

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

      <BadgeTendencia variacao={variacao} formatador={formatador} periodoTexto="" />

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
    </div>
  );
}

// Card de ano-calendário mostrando Faturamento e Litros juntos (total + média/mês),
// com crescimento/queda vs o ano anterior (baseado na média/mês, justo mesmo com ano parcial)
function CardAnualCompleto({ dados, projecao }) {
  const { ano, meses, totalFat, totalLit, mediaFat, mediaLit, variacaoFat, variacaoLit } = dados;
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
          <BadgeTendencia variacao={variacaoFat} formatador={fmtMoeda} periodoTexto={variacaoFat ? `média/mês vs ${ano - 1}` : ""} />
        </div>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Litros total</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{fmtLitros(totalLit)}</div>
          <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Média/mês: {fmtLitros(mediaLit)}</div>
          <BadgeTendencia variacao={variacaoLit} formatador={fmtLitros} periodoTexto={variacaoLit ? `média/mês vs ${ano - 1}` : ""} />
        </div>
        <div>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 2 }}>Preço médio/L</div>
          <div style={{ color: "#C69700", fontSize: 18, fontWeight: 800 }}>{fmtPrecoLitro(precoMedioLitro(totalFat, totalLit))}</div>
        </div>
      </div>

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
        onLogin(json.nome || usuario, !!json.admin);
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
      return {
        ano, meses: rowsDoAno.length,
        totalFat: soma(rowsDoAno, "faturamento"), totalLit: soma(rowsDoAno, "litros"),
        mediaFat: mediaFatAno, mediaLit: mediaLitAno,
        // variação calculada em cima da MÉDIA mensal (não do total), pra ser justa mesmo quando
        // o ano corrente ainda não fechou todos os 12 meses
        variacaoFat: rowsAnoAnterior.length ? calcularVariacao(mediaFatAno, media(rowsAnoAnterior, "faturamento")) : null,
        variacaoLit: rowsAnoAnterior.length ? calcularVariacao(mediaLitAno, media(rowsAnoAnterior, "litros")) : null,
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
                    <CardAnualCompleto key={m.ano} dados={m} />
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
  const { dados, periodos, labelDoCliente } = useData();
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

// linhas: [{ categoria, valores: [{periodo, valor}] }] - só as colunas visíveis (janela escolhida)
// dadosCompletos (opcional): { categoria: { chave: valor } } - histórico INTEIRO de cada categoria,
// usado pra calcular as comparações mesmo quando só 1 mês (ou uma janela curta) está sendo exibido.
// Sem dadosCompletos, cai pra buscar dentro da própria janela visível (funciona quando ela já
// cobre o histórico todo, como no heatmap de grupos do Dashboard).
function TabelaHeatmapCategoria({ linhas, rotuloColuna, unidade, dadosCompletos, colunasProjecao }) {
  function formatador(v) { return rotuloCompactoGeral(v, unidade); }
  const ehProjecao = periodo => colunasProjecao && colunasProjecao.has(periodo);

  function buscarValor(linha, chave) {
    if (dadosCompletos && dadosCompletos[linha.categoria]) {
      return dadosCompletos[linha.categoria][chave];
    }
    const item = linha.valores.find(v => v.periodo === chave);
    return item ? item.valor : undefined;
  }

  function textoVariacao(rotulo, variacao) {
    if (!variacao) return "";
    const sinalPct = variacao.pct >= 0 ? "+" : "";
    const sinalDiff = variacao.diff >= 0 ? "+" : "";
    return `\n${rotulo}: ${sinalPct}${variacao.pct.toFixed(1)}% (${sinalDiff}${formatador(variacao.diff)})`;
  }

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
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => (
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
                    {valor ? formatador(valor) : "-"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => (
            <tr key={linha.categoria}>
              <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "#1D1D1B", position: "sticky", left: 0 }}>{linha.categoria}</td>
              {linha.valores.map(v => (
                <td key={v.periodo} style={{ ...tdStyle, color: "#C69700", fontStyle: "italic" }}>{v.valor ? formatador(v.valor) : "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
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

  // Top 10 maiores crescimentos e maiores quedas (faturamento e litros, vs mês anterior e vs mesmo mês ano anterior)
  const top10FatMesCresc = topN(clientesComMetricas, c => c.ultimoMesFechado?.varFat, 10, "desc");
  const top10FatMesQueda = topN(clientesComMetricas, c => c.ultimoMesFechado?.varFat, 10, "asc");
  const top10FatAnoCresc = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varFat, 10, "desc");
  const top10FatAnoQueda = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varFat, 10, "asc");
  const top10LitMesCresc = topN(clientesComMetricas, c => c.ultimoMesFechado?.varLit, 10, "desc");
  const top10LitMesQueda = topN(clientesComMetricas, c => c.ultimoMesFechado?.varLit, 10, "asc");
  const top10LitAnoCresc = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varLit, 10, "desc");
  const top10LitAnoQueda = topN(clientesComMetricas, c => c.comparacaoAno?.m1?.varLit, 10, "asc");

  // novos clientes cadastrados por mês, no período selecionado
  const novosClientesPorMes = useMemo(() => {
    if (!inicioNovos || !fimNovos) return [];
    const mesesRange = periodos.filter(p => p >= inicioNovos && p <= fimNovos);
    return mesesRange.map(mes => {
      const clientesDoMes = nomes.filter(codigo => (dataCriacaoDoCliente[codigo] || "").slice(0, 7) === mes);
      return { mes, quantidade: clientesDoMes.length, clientes: clientesDoMes.map(c => labelDoCliente[c]) };
    });
  }, [inicioNovos, fimNovos, periodos, nomes, dataCriacaoDoCliente, labelDoCliente]);

  const totalNovosClientes = novosClientesPorMes.reduce((s, m) => s + m.quantidade, 0);
  const temDataCriacao = Object.keys(dataCriacaoDoCliente).length > 0;

  const [metricaHeatmapGrupo, setMetricaHeatmapGrupo] = useState("faturamento"); // 'faturamento' | 'litros'

  const linhasHeatmap = useMemo(() => {
    const nomesComGrupo = new Set(grupos.flatMap(g => clientesPorGrupo[g] || []));
    const semGrupo = nomes.filter(n => !nomesComGrupo.has(n));
    const categorias = [...grupos];
    if (semGrupo.length) categorias.push("Sem grupo");

    return categorias.map(cat => {
      const clientesCat = cat === "Sem grupo" ? semGrupo : clientesPorGrupo[cat];
      const valores = periodos.map(p => {
        let fat = 0, lit = 0;
        clientesCat.forEach(nome => {
          const row = (dados[nome] || []).find(r => r.chave === p);
          if (row) { fat += row.faturamento; lit += row.litros; }
        });
        return { periodo: p, valor: metricaHeatmapGrupo === "litros" ? lit : fat };
      });
      return { categoria: cat, valores };
    });
  }, [grupos, clientesPorGrupo, nomes, periodos, dados, metricaHeatmapGrupo]);

  return (
    <div>
      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Filtrar por grupo ({clientesFiltrados.length} clientes selecionados):
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
        </Section>
      )}

      <Section title={`Comparação mês a mês por grupo · ${metricaHeatmapGrupo === "litros" ? "Litros" : "Faturamento"}`} icon={<AlertTriangle size={16} color="#C69700" />}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button onClick={() => setMetricaHeatmapGrupo("faturamento")} style={modoBtnStyle(metricaHeatmapGrupo === "faturamento", "#02601D")}>
            <TrendingUp size={13} /> Faturamento
          </button>
          <button onClick={() => setMetricaHeatmapGrupo("litros")} style={modoBtnStyle(metricaHeatmapGrupo === "litros", "#C69700")}>
            <Droplets size={13} /> Litros
          </button>
        </div>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 acima de +10% · 🟡 0% a +10% · 🟠 0% a -10% · 🔴 abaixo de -10% (tudo vs mês anterior). Passe o mouse numa célula pra ver a diferença
          em número e % vs mês anterior e vs mesmo mês do ano anterior. A última coluna pode ser um mês ainda em andamento — compare com cautela.
        </div>
        <TabelaHeatmapCategoria linhas={linhasHeatmap} rotuloColuna="Grupo" unidade={metricaHeatmapGrupo === "litros" ? "L" : undefined} />
      </Section>

      <Section title="Top 10 · Maiores Crescimentos" icon={<ArrowUp size={18} color="#4caf6b" />}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ListaTop10 titulo="Faturamento vs mês anterior" itens={top10FatMesCresc} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Faturamento vs mesmo mês ano anterior" itens={top10FatAnoCresc} formatador={fmtMoeda} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mês anterior" itens={top10LitMesCresc} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
          <ListaTop10 titulo="Litros vs mesmo mês ano anterior" itens={top10LitAnoCresc} formatador={fmtLitros} labelDoCliente={labelDoCliente} />
        </div>
      </Section>

      <Section title="Top 10 · Maiores Quedas" icon={<ArrowDown size={18} color="#e0645a" />}>
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

  const janelasAno = useMemo(() => {
    if (!rowsFechadas.length || !mesRefAno) return null;
    return {
      m1: janelaAnoAnterior(rowsFechadas, mesRefAno, 1),
      m3: janelaAnoAnterior(rowsFechadas, mesRefAno, 3),
      m6: janelaAnoAnterior(rowsFechadas, mesRefAno, 6),
      m12: janelaAnoAnterior(rowsFechadas, mesRefAno, 12),
    };
  }, [rowsFechadas, mesRefAno]);

  const mediasPorAno = useMemo(() => {
    if (!rowsFechadas.length) return [];
    const anos = [...new Set(rowsFechadas.map(r => r.ano))].sort((a, b) => a - b);
    return anos.map((ano, idx) => {
      const rowsDoAno = rowsFechadas.filter(r => r.ano === ano);
      const rowsAnoAnterior = idx > 0 ? rowsFechadas.filter(r => r.ano === anos[idx - 1]) : [];
      const mediaFatAno = media(rowsDoAno, "faturamento");
      const mediaLitAno = media(rowsDoAno, "litros");
      return {
        ano, meses: rowsDoAno.length,
        totalFat: soma(rowsDoAno, "faturamento"), totalLit: soma(rowsDoAno, "litros"),
        mediaFat: mediaFatAno, mediaLit: mediaLitAno,
        variacaoFat: rowsAnoAnterior.length ? calcularVariacao(mediaFatAno, media(rowsAnoAnterior, "faturamento")) : null,
        variacaoLit: rowsAnoAnterior.length ? calcularVariacao(mediaLitAno, media(rowsAnoAnterior, "litros")) : null,
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
            <MonthPicker periodosDisponiveis={rowsFechadas.map(r => r.chave)} valor={mesRefAno} onSelecionar={setMesRefAno} placeholder="Selecionar mês" />
          </div>

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
              <CardAnualCompleto key={m.ano} dados={m} projecao={idx === mediasPorAno.length - 1 ? projecaoAnoParcial : null} />
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

function MesTab() {
  const { dados, nomes, nomesVisiveis, grupos, clientesPorGrupo, periodos, labelDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState(() => gruposPadrao(grupos));
  const [buscaCliente, setBuscaCliente] = useState("");
  const [ordenacao, setOrdenacao] = useState("litros"); // 'litros' | 'faturamento' | 'precoLitro'
  const [expandido, setExpandido] = useState(false);
  const [modo, setModo] = useState("mes"); // 'mes' | 'periodo'

  // comparação entre clientes específicos selecionados (gráficos mês a mês)
  const [buscaComparar, setBuscaComparar] = useState("");
  const [clientesComparar, setClientesComparar] = useState([]);

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

  const sugestoesComparar = useMemo(() => {
    if (!buscaComparar.trim()) return [];
    return nomesVisiveis
      .filter(c => !clientesComparar.includes(c) && (labelDoCliente[c] || "").toLowerCase().includes(buscaComparar.toLowerCase()))
      .slice(0, 6);
  }, [buscaComparar, nomesVisiveis, labelDoCliente, clientesComparar]);

  function adicionarClienteComparar(codigo) {
    setClientesComparar(prev => prev.includes(codigo) ? prev : [...prev, codigo]);
    setBuscaComparar("");
  }
  function removerClienteComparar(codigo) {
    setClientesComparar(prev => prev.filter(c => c !== codigo));
  }

  // valor de cada cliente selecionado, mês a mês (todo o histórico) + diferença vs mês anterior
  const [inicioComparar, setInicioComparar] = useState(() => periodos[0] || "");
  const [fimComparar, setFimComparar] = useState(() => periodos[periodos.length - 1] || "");

  const periodosComparar = useMemo(() => {
    if (!inicioComparar || !fimComparar) return periodos;
    return periodos.filter(p => p >= inicioComparar && p <= fimComparar);
  }, [periodos, inicioComparar, fimComparar]);

  const seriesComparacao = useMemo(() => {
    if (!clientesComparar.length) return [];
    return periodosComparar.map((chave) => {
      const idxGlobal = periodos.indexOf(chave);
      const linha = { mes: labelMes(chave) };
      clientesComparar.forEach(codigo => {
        const rows = dados[codigo] || [];
        const atual = rows.find(r => r.chave === chave);
        const anteriorChave = idxGlobal > 0 ? periodos[idxGlobal - 1] : null;
        const anterior = anteriorChave ? rows.find(r => r.chave === anteriorChave) : null;
        linha[`fat_${codigo}`] = atual ? atual.faturamento : null;
        linha[`lit_${codigo}`] = atual ? atual.litros : null;
        linha[`fatDiff_${codigo}`] = (atual && anterior) ? (atual.faturamento - anterior.faturamento) : null;
        linha[`litDiff_${codigo}`] = (atual && anterior) ? (atual.litros - anterior.litros) : null;
      });
      return linha;
    });
  }, [clientesComparar, dados, periodos, periodosComparar]);

  // resumo acumulado (total litros/faturamento) de cada cliente selecionado, dentro do período
  const resumoComparacao = useMemo(() => {
    if (!clientesComparar.length) return [];
    const chaves = new Set(periodosComparar);
    return clientesComparar.map(codigo => {
      let fat = 0, lit = 0;
      (dados[codigo] || []).forEach(r => { if (chaves.has(r.chave)) { fat += r.faturamento; lit += r.litros; } });
      return { codigo, fat, lit };
    });
  }, [clientesComparar, dados, periodosComparar]);

  return (
    <div>
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

      <Section title="Comparar Clientes Específicos (mês a mês)" icon={<GitCompareArrows size={18} color="#4a90d9" />}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1D1D1B", borderRadius: 8, padding: "10px 14px", border: "1px solid #333" }}>
            <Search size={16} color="#C69700" />
            <input placeholder="Buscar cliente... (pode adicionar vários, ex: as 5 lojas Miller)" value={buscaComparar}
              onChange={e => setBuscaComparar(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14 }} />
            {clientesComparar.length > 0 && (
              <button onClick={() => { setClientesComparar([]); setBuscaComparar(""); }} style={{ background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                Limpar seleção
              </button>
            )}
          </div>
          {sugestoesComparar.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
              {sugestoesComparar.map(c => (
                <div key={c} onClick={() => adicionarClienteComparar(c)}
                  style={{ padding: "10px 14px", color: "#fff", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #2a2a28" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#02601D"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {labelDoCliente[c]}
                </div>
              ))}
            </div>
          )}
        </div>

        {clientesComparar.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {clientesComparar.map(c => (
              <div key={c} style={{
                display: "flex", alignItems: "center", gap: 6, background: "#1D1D1B", border: "1px solid #4a90d9",
                borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 12, color: "#fff",
              }}>
                {labelDoCliente[c]}
                <button onClick={() => removerClienteComparar(c)} style={{
                  background: "#4a90d9", border: "none", color: "#fff", borderRadius: "50%",
                  width: 18, height: 18, cursor: "pointer", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
              </div>
            ))}
          </div>
        )}

        {clientesComparar.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Período:</span>
            <MonthPicker periodosDisponiveis={periodos} valor={inicioComparar} onSelecionar={setInicioComparar} placeholder="Início" />
            <span style={{ color: "#666" }}>até</span>
            <MonthPicker periodosDisponiveis={periodos} valor={fimComparar} onSelecionar={setFimComparar} placeholder="Fim" />
          </div>
        )}

        {clientesComparar.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Busque e adicione clientes acima pra ver os gráficos de comparação mês a mês (ex: as 5 lojas Miller).
          </div>
        )}

        {clientesComparar.length > 0 && (
          <>
            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 8 }}>Faturamento</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesComparacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => v == null ? "-" : fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                {clientesComparar.map((codigo, idx) => (
                  <Line key={codigo} type="monotone" dataKey={`fat_${codigo}`} name={labelDoCliente[codigo]} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 20 }}>Diferença mês a mês · Faturamento</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seriesComparacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => v == null ? "-" : (v >= 0 ? "+" : "") + fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                <ReferenceLine y={0} stroke="#666" />
                {clientesComparar.map((codigo, idx) => (
                  <Bar key={codigo} dataKey={`fatDiff_${codigo}`} name={labelDoCliente[codigo]} fill={corDoAno(idx)} radius={[3,3,3,3]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 24 }}>Litros</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesComparacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                <Tooltip formatter={v => v == null ? "-" : fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                {clientesComparar.map((codigo, idx) => (
                  <Line key={codigo} type="monotone" dataKey={`lit_${codigo}`} name={labelDoCliente[codigo]} stroke={corDoAno(idx)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, marginTop: 20 }}>Diferença mês a mês · Litros</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={seriesComparacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
                <YAxis tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                <Tooltip formatter={v => v == null ? "-" : (v >= 0 ? "+" : "") + fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend content={<LegendaBranca />} />
                <ReferenceLine y={0} stroke="#666" />
                {clientesComparar.map((codigo, idx) => (
                  <Bar key={codigo} dataKey={`litDiff_${codigo}`} name={labelDoCliente[codigo]} fill={corDoAno(idx)} radius={[3,3,3,3]} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10, marginTop: 28 }}>
              Resumo do período ({periodosComparar.length ? `${labelMes(periodosComparar[0])}–${labelMes(periodosComparar[periodosComparar.length - 1])}` : "-"})
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {resumoComparacao.map(({ codigo, fat, lit }, idx) => (
                <div key={codigo} style={{ background: "#1D1D1B", border: `1px solid ${corDoAno(idx)}`, borderRadius: 10, padding: 14, flex: "1 1 220px", minWidth: 220 }}>
                  <div style={{ color: corDoAno(idx), fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{labelDoCliente[codigo]}</div>
                  <div style={{ color: "#666", fontSize: 10 }}>Litros (total do período)</div>
                  <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{fmtLitros(lit)}</div>
                  <div style={{ color: "#666", fontSize: 10 }}>Faturamento (total do período)</div>
                  <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>{fmtMoeda(fat)}</div>
                </div>
              ))}
            </div>
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

  // --- heatmap mês a mês por produto ---
  const [metricaHeatmap, setMetricaHeatmap] = useState("faturamento"); // 'faturamento' | 'litros'
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

  const linhasHeatmapVisiveis = expandidoHeatmap ? linhasHeatmap : linhasHeatmap.slice(0, LIMITE_HEATMAP);

  // --- projeção (tabela separada, abaixo da tabela de dados reais) ---
  const [incluirProjecao, setIncluirProjecao] = useState(false);
  const [modoProjecao, setModoProjecao] = useState("anoAnterior"); // 'anoAnterior' | 'mediaRecente'
  const [pctProjecao, setPctProjecao] = useState(100);

  // modo "mesmo período do ano anterior": você escolhe o período de referência, ele projeta
  // os mesmos meses 1 ano depois. Bom pra produto com histórico/sazonal (ex: Oktoberfest).
  const [inicioProjecao, setInicioProjecao] = useState(() =>
    produtosPeriodos.includes("2025-01") ? "2025-01" : (produtosPeriodos[0] || "")
  );
  const [fimProjecao, setFimProjecao] = useState(() =>
    produtosPeriodos.includes(mesAtualRealProdutos) ? mesAtualRealProdutos : (produtosPeriodos[produtosPeriodos.length - 1] || "")
  );

  const chavesReferenciaProjecao = useMemo(() => {
    if (!inicioProjecao || !fimProjecao) return [];
    return produtosPeriodos.filter(p => p >= inicioProjecao && p <= fimProjecao);
  }, [inicioProjecao, fimProjecao, produtosPeriodos]);

  const chavesProjecaoAnoAnterior = useMemo(() => {
    return chavesReferenciaProjecao.map(c => {
      const [ano, mes] = c.split("-").map(Number);
      return `${ano + 1}-${String(mes).padStart(2, "0")}`;
    });
  }, [chavesReferenciaProjecao]);

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
      return linhasHeatmapVisiveis.map(linha => {
        const completos = dadosCompletosHeatmap[linha.categoria] || {};
        const valores = chavesReferenciaProjecao.map((chaveRef, idx) => ({
          periodo: chavesProjecaoAnoAnterior[idx],
          valor: (completos[chaveRef] || 0) * (pctProjecao / 100),
        }));
        return { categoria: linha.categoria, valores };
      });
    }

    // modo "mediaRecente"
    if (!indiceSazonal || !chavesBaseMedia.length || !chavesProjecaoMediaRecente.length) return [];
    return linhasHeatmapVisiveis.map(linha => {
      const completos = dadosCompletosHeatmap[linha.categoria] || {};
      const baseValores = chavesBaseMedia.map(c => completos[c] || 0);
      const baseMedia = baseValores.reduce((a, b) => a + b, 0) / baseValores.length;
      const valores = chavesProjecaoMediaRecente.map(chave => {
        const mes = Number(chave.split("-")[1]);
        const indice = indiceSazonal[mes] ?? 1;
        return { periodo: chave, valor: baseMedia * indice * (pctProjecao / 100) };
      });
      return { categoria: linha.categoria, valores };
    });
  }, [incluirProjecao, modoProjecao, linhasHeatmapVisiveis, dadosCompletosHeatmap, chavesReferenciaProjecao, chavesProjecaoAnoAnterior,
      pctProjecao, indiceSazonal, chavesBaseMedia, chavesProjecaoMediaRecente]);

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
                  {chavesReferenciaProjecao.length > 0 && (
                    <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>
                      Vai projetar: {labelMes(chavesReferenciaProjecao[0])} a {labelMes(chavesReferenciaProjecao[chavesReferenciaProjecao.length - 1])} do
                      período de referência → {labelMes(chavesProjecaoAnoAnterior[0])} a {labelMes(chavesProjecaoAnoAnterior[chavesProjecaoAnoAnterior.length - 1])} (mesmos meses, 1 ano depois)
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

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#888", fontSize: 12 }}>Ajuste:</span>
                <input type="number" min="0" max="300" value={pctProjecao} onChange={e => setPctProjecao(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                  style={{ width: 70, background: "#141412", border: "1px solid #444", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }} />
                <span style={{ color: "#666", fontSize: 11 }}>% (100% = sem ajuste sobre a base calculada)</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 acima de +10% · 🟡 0% a +10% · 🟠 0% a -10% · 🔴 abaixo de -10% (vs mês anterior). Passe o mouse numa célula pra ver a diferença em
          número e % vs mês anterior e vs mesmo mês do ano anterior. Ordenado do maior pro menor total no período selecionado.
        </div>

        {linhasHeatmap.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "20px 0", fontSize: 14 }}>
            Nenhum produto com dado no período selecionado.
          </div>
        )}

        {linhasHeatmap.length > 0 && (
          <>
            <TabelaHeatmapCategoria linhas={linhasHeatmapVisiveis} rotuloColuna="Produto" unidade={metricaHeatmap === "litros" ? "L" : undefined} dadosCompletos={dadosCompletosHeatmap} />
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
                <TabelaProjecao linhas={linhasProjecao} rotuloColuna="Produto" unidade={metricaHeatmap === "litros" ? "L" : undefined} />
              </div>
            )}
          </>
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
        setContexto(processarDados(json.dados, json.produtosPorTipo || []));
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

      {!logado && <LoginScreen onLogin={(u, admin) => { setUsuario(u); setIsAdmin(admin); setLogado(true); }} />}

      {logado && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
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
              <div style={{ display: "flex", gap: 8, marginBottom: 22, borderBottom: "1px solid #2a2a28" }}>
                <button onClick={() => setTab("cliente")} style={tabStyle(tab === "cliente")}>
                  <Search size={14} /> Cliente
                </button>
                <button onClick={() => setTab("comparacao")} style={tabStyle(tab === "comparacao")}>
                  <GitCompareArrows size={14} /> Comparação
                </button>
                <button onClick={() => setTab("dashboard")} style={tabStyle(tab === "dashboard")}>
                  <LayoutDashboard size={14} /> Dashboard
                </button>
                <button onClick={() => setTab("mes")} style={tabStyle(tab === "mes")}>
                  <Calendar size={14} /> Mês
                </button>
                <button onClick={() => setTab("produtos")} style={tabStyle(tab === "produtos")}>
                  <Package size={14} /> Produtos
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
