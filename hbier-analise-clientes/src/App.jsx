import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList, ReferenceLine, Cell,
} from "recharts";
import { Search, LogIn, TrendingUp, Droplets, GitCompareArrows, LogOut, Users, Layers, RefreshCw, AlertTriangle, Calendar, Table as TableIcon, ArrowUp, ArrowDown, Minus, LayoutDashboard, Trophy, Globe } from "lucide-react";

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

const APP_VERSION = "v3.8";
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
function corDoAno(idx) {
  return PALETA_ANOS[idx % PALETA_ANOS.length];
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
function processarDados(linhas) {
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

  return { dados: porCliente, nomes, grupos, clientesPorGrupo, periodos, grupoDoCliente, labelDoCliente, razaoSocialDoCliente, dataCriacaoDoCliente };
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
function CardAnualCompleto({ dados }) {
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
          HBIER <span style={{ color: "#C69700" }}>ANÁLISE</span>
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
  const { dados, nomes, periodos, labelDoCliente, razaoSocialDoCliente } = useData();
  const [busca, setBusca] = useState("");
  const [clientesSel, setClientesSel] = useState([]);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [mesRefAno, setMesRefAno] = useState("");

  const sugestoes = useMemo(() => {
    if (!busca.trim()) return [];
    return nomes
      .filter(c => !clientesSel.includes(c) && (labelDoCliente[c] || "").toLowerCase().includes(busca.toLowerCase()))
      .slice(0, 6);
  }, [busca, nomes, labelDoCliente, clientesSel]);

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
                  <Legend wrapperStyle={{ fontSize: 13 }} />
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
                  <Legend wrapperStyle={{ fontSize: 13 }} />
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
  const { nomes, grupos, clientesPorGrupo, labelDoCliente } = useData();
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
    ? nomes.filter(n => (labelDoCliente[n] || "").toLowerCase().includes(buscaCliente.toLowerCase()))
    : nomes;

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
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={gruposSel.includes(g)} onChange={() => toggleGrupo(g)} />
              {g} ({clientesPorGrupo[g].length})
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
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
      fat, lit, precoLitro: precoMedioLitro(fat, lit),
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
      fat: atual.faturamento, lit: atual.litros, precoLitro: precoMedioLitro(atual.faturamento, atual.litros),
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

function JanelaMetrica({ label, fat, lit, precoLitro, varFat, varLit, periodoTexto: pTexto, periodoAnteriorTexto }) {
  return (
    <div style={{ minWidth: 175, flex: "1 1 175px" }}>
      <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>
        {label}{pTexto && <span style={{ textTransform: "none", color: "#555" }}> ({pTexto})</span>}
      </div>
      <div style={{ color: "#666", fontSize: 9, marginBottom: 2 }}>Total no período</div>
      <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>{fmtMoeda(fat)}</div>
      <BadgeTendencia variacao={varFat} formatador={fmtMoeda} periodoTexto={periodoAnteriorTexto ? `vs ${periodoAnteriorTexto}` : ""} />
      <div style={{ color: "#ddd", fontSize: 13, fontWeight: 700, marginTop: 6 }}>{fmtLitros(lit)}</div>
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
          <JanelaMetrica label={`Último mês fechado`} periodoTexto={metricas.ultimoMesFechado.mesTexto}
            fat={metricas.ultimoMesFechado.fat} lit={metricas.ultimoMesFechado.lit} precoLitro={metricas.ultimoMesFechado.precoLitro}
            varFat={metricas.ultimoMesFechado.varFat} varLit={metricas.ultimoMesFechado.varLit} periodoAnteriorTexto="mês anterior" />
        )}
        <JanelaMetrica label="Últimos 3 meses" periodoTexto={metricas.j3.periodoTexto} periodoAnteriorTexto={metricas.j3.periodoAnteriorTexto}
          fat={metricas.j3.fat} lit={metricas.j3.lit} precoLitro={metricas.j3.precoLitro} varFat={metricas.j3.varFat} varLit={metricas.j3.varLit} />
        <JanelaMetrica label="Últimos 6 meses" periodoTexto={metricas.j6.periodoTexto} periodoAnteriorTexto={metricas.j6.periodoAnteriorTexto}
          fat={metricas.j6.fat} lit={metricas.j6.lit} precoLitro={metricas.j6.precoLitro} varFat={metricas.j6.varFat} varLit={metricas.j6.varLit} />
        <JanelaMetrica label="Últimos 12 meses" periodoTexto={metricas.j12.periodoTexto} periodoAnteriorTexto={metricas.j12.periodoAnteriorTexto}
          fat={metricas.j12.fat} lit={metricas.j12.lit} precoLitro={metricas.j12.precoLitro} varFat={metricas.j12.varFat} varLit={metricas.j12.varLit} />
      </div>

      {metricas.comparacaoAno && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #2a2a28" }}>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>vs mesmo período do ano anterior</div>
          <div style={{ background: "rgba(224,101,90,0.06)", border: "1px solid rgba(224,101,90,0.22)", borderRadius: 10, padding: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <JanelaMetrica label="Este mês" periodoTexto={metricas.comparacaoAno.m1.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m1.periodoAnteriorTexto}
              fat={metricas.comparacaoAno.m1.fat} lit={metricas.comparacaoAno.m1.lit} precoLitro={metricas.comparacaoAno.m1.precoLitro} varFat={metricas.comparacaoAno.m1.varFat} varLit={metricas.comparacaoAno.m1.varLit} />
            <JanelaMetrica label="Últimos 3 meses" periodoTexto={metricas.comparacaoAno.m3.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m3.periodoAnteriorTexto}
              fat={metricas.comparacaoAno.m3.fat} lit={metricas.comparacaoAno.m3.lit} precoLitro={metricas.comparacaoAno.m3.precoLitro} varFat={metricas.comparacaoAno.m3.varFat} varLit={metricas.comparacaoAno.m3.varLit} />
            <JanelaMetrica label="Últimos 6 meses" periodoTexto={metricas.comparacaoAno.m6.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m6.periodoAnteriorTexto}
              fat={metricas.comparacaoAno.m6.fat} lit={metricas.comparacaoAno.m6.lit} precoLitro={metricas.comparacaoAno.m6.precoLitro} varFat={metricas.comparacaoAno.m6.varFat} varLit={metricas.comparacaoAno.m6.varLit} />
            <JanelaMetrica label="Últimos 12 meses" periodoTexto={metricas.comparacaoAno.m12.periodoTexto} periodoAnteriorTexto={metricas.comparacaoAno.m12.periodoAnteriorTexto}
              fat={metricas.comparacaoAno.m12.fat} lit={metricas.comparacaoAno.m12.lit} precoLitro={metricas.comparacaoAno.m12.precoLitro} varFat={metricas.comparacaoAno.m12.varFat} varLit={metricas.comparacaoAno.m12.varLit} />
          </div>
        </div>
      )}
    </div>
  );
}

// Heatmap: linhas = grupos (+ "Sem grupo"), colunas = meses, cor da célula = crescimento/queda vs mês anterior
function TabelaHeatmapGrupos({ linhas }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 2 }}>Grupo</th>
            {linhas[0]?.valores.map(v => <th key={v.periodo} style={thStyle}>{labelMes(v.periodo)}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map(linha => (
            <tr key={linha.categoria}>
              <td style={{ ...tdStyle, fontWeight: 700, color: "#fff", background: "#1D1D1B", position: "sticky", left: 0 }}>{linha.categoria}</td>
              {linha.valores.map((v, idx) => {
                const anterior = idx > 0 ? linha.valores[idx - 1].fat : null;
                const variacao = anterior != null ? calcularVariacao(v.fat, anterior) : null;
                const bg = variacao ? classificarTendencia(variacao.pct).corFundo : "transparent";
                return <td key={v.periodo} style={{ ...tdStyle, background: bg }}>{v.fat ? rotuloCompactoGeral(v.fat) : "-"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardTab() {
  const { dados, nomes, grupos, clientesPorGrupo, periodos, labelDoCliente, dataCriacaoDoCliente } = useData();
  const [gruposSel, setGruposSel] = useState([]);
  const [todos, setTodos] = useState(true);
  const [buscaCliente, setBuscaCliente] = useState("");
  const periodosFechados = periodos.filter(p => p !== chaveMesAtualReal());
  const [mesRefAno, setMesRefAno] = useState(() => periodosFechados[periodosFechados.length - 1] || "");
  const [inicioNovos, setInicioNovos] = useState(() => periodos.includes("2025-01") ? "2025-01" : (periodos[0] || ""));
  const [fimNovos, setFimNovos] = useState(() => periodosFechados[periodosFechados.length - 1] || "");

  function toggleGrupoFiltro(g) {
    setTodos(false);
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  const clientesFiltrados = todos ? nomes : [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  const clientesComMetricas = useMemo(() => {
    return clientesFiltrados
      .map(nome => ({ nome, metricas: calcularMetricasCliente(dados[nome] || [], mesRefAno) }))
      .sort((a, b) => b.metricas.j12.fat - a.metricas.j12.fat)
      .map((c, idx) => ({ ...c, posicao: idx + 1 }));
  }, [clientesFiltrados, dados, mesRefAno]);

  const clientesExibidos = buscaCliente.trim()
    ? clientesComMetricas.filter(c => (labelDoCliente[c.nome] || "").toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientesComMetricas;

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

  const linhasHeatmap = useMemo(() => {
    const nomesComGrupo = new Set(grupos.flatMap(g => clientesPorGrupo[g] || []));
    const semGrupo = nomes.filter(n => !nomesComGrupo.has(n));
    const categorias = [...grupos];
    if (semGrupo.length) categorias.push("Sem grupo");

    return categorias.map(cat => {
      const clientesCat = cat === "Sem grupo" ? semGrupo : clientesPorGrupo[cat];
      const valores = periodos.map(p => {
        let fat = 0;
        clientesCat.forEach(nome => {
          const row = (dados[nome] || []).find(r => r.chave === p);
          if (row) fat += row.faturamento;
        });
        return { periodo: p, fat };
      });
      return { categoria: cat, valores };
    });
  }, [grupos, clientesPorGrupo, nomes, periodos, dados]);

  return (
    <div>
      <div style={{ background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 20 }}>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <Layers size={13} /> Filtrar por grupo:
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={todos} onChange={() => { setTodos(true); setGruposSel([]); }} />
            Todos ({nomes.length})
          </label>
          {grupos.map(g => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={!todos && gruposSel.includes(g)} onChange={() => toggleGrupoFiltro(g)} />
              {g} ({clientesPorGrupo[g].length})
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

      <Section title="Comparação mês a mês por grupo · Faturamento" icon={<AlertTriangle size={16} color="#C69700" />}>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 acima de +10% · 🟡 0% a +10% · 🟠 0% a -10% · 🔴 abaixo de -10% (tudo vs mês anterior). A última coluna pode ser um mês ainda em andamento — compare com cautela.
        </div>
        <TabelaHeatmapGrupos linhas={linhasHeatmap} />
      </Section>

      <Section title={`Melhores Clientes (${clientesExibidos.length} de ${clientesComMetricas.length})`} icon={<Trophy size={18} color="#C69700" />}>
        {clientesComMetricas.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
            Selecione ao menos um grupo, ou marque "Todos".
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

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Faturamento (12 meses)" value={fmtMoeda(soma(ultimos12, "faturamento"))} icon={<TrendingUp size={14} />} />
        <StatCard label="Litros (12 meses)" value={fmtLitros(soma(ultimos12, "litros"))} icon={<Droplets size={14} />} />
        <StatCard label="Preço médio geral/L (12 meses)" value={fmtPrecoLitro(precoLitroGeral12m)} icon={<Droplets size={14} />} />
        <StatCard label={`Clientes ativos (${ultimoMesFechado ? labelMes(ultimoMesFechado.chave) : "-"})`} value={String(clientesAtivos)} icon={<Users size={14} />} />
        <StatCard label="Total de clientes cadastrados" value={String(nomes.length)} icon={<Users size={14} />} />
        {novosClientes12m != null && (
          <StatCard label="Novos clientes (12 meses)" value={String(novosClientes12m)} icon={<Users size={14} />} />
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
              <Legend wrapperStyle={{ fontSize: 13 }} />
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
              <Legend wrapperStyle={{ fontSize: 13 }} />
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mediasPorAno.map(m => <CardAnualCompleto key={m.ano} dados={m} />)}
          </div>
        </Section>
      )}

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
        setContexto(processarDados(json.dados));
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
              HBIER <span style={{ color: "#C69700" }}>ANÁLISE</span>
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
                {isAdmin && (
                  <button onClick={() => setTab("global")} style={tabStyle(tab === "global")}>
                    <Globe size={14} /> Global
                  </button>
                )}
              </div>

              {tab === "cliente" && <ClienteDashboard />}
              {tab === "comparacao" && <ComparacaoTab />}
              {tab === "dashboard" && <DashboardTab />}
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
