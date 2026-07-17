import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList, ReferenceLine, Cell,
} from "recharts";
import { Search, LogIn, TrendingUp, Droplets, GitCompareArrows, LogOut, Users, Layers, RefreshCw, AlertTriangle, Calendar, Table as TableIcon, ArrowUp, ArrowDown, Minus, LayoutDashboard, Trophy } from "lucide-react";

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

const APP_VERSION = "v1.9";
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

// -------------------- Contexto de dados --------------------
const DataContext = createContext(null);
function useData() {
  return useContext(DataContext);
}

// Transforma a lista plana vinda do GAS em estruturas prontas pro app
function processarDados(linhas) {
  const porCliente = {};
  const grupoDoCliente = {};

  linhas.forEach(r => {
    const chave = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    porCliente[r.cliente] = porCliente[r.cliente] || [];
    porCliente[r.cliente].push({
      ano: r.ano, mes: r.mes, chave,
      faturamento: Number(r.faturamento) || 0,
      litros: Number(r.litros) || 0,
    });
    if (r.grupo) grupoDoCliente[r.cliente] = r.grupo;
  });

  Object.keys(porCliente).forEach(cliente => {
    porCliente[cliente].sort((a, b) => a.chave.localeCompare(b.chave));
  });

  const nomes = Object.keys(porCliente).sort((a, b) => a.localeCompare(b));
  const grupos = [...new Set(Object.values(grupoDoCliente))].sort();
  const clientesPorGrupo = Object.fromEntries(
    grupos.map(g => [g, nomes.filter(n => grupoDoCliente[n] === g)])
  );

  // união de todas as chaves de período existentes (ordenada)
  const periodosSet = new Set();
  Object.values(porCliente).forEach(rows => rows.forEach(r => periodosSet.add(r.chave)));
  const periodos = [...periodosSet].sort();

  return { dados: porCliente, nomes, grupos, clientesPorGrupo, periodos, grupoDoCliente };
}

// -------------------- Componentes visuais --------------------
// Calcula diferença/variação percentual entre dois valores (atual vs anterior)
function calcularVariacao(atual, anterior) {
  if (anterior == null) return null;
  const diff = atual - anterior;
  const pct = anterior !== 0 ? (diff / Math.abs(anterior)) * 100 : (atual === 0 ? 0 : 100);
  return { diff, pct };
}

// Badge colorido de crescimento/queda/estável (verde/vermelho/amarelo), com texto opcional do período avaliado
function BadgeTendencia({ variacao, formatador, periodoTexto }) {
  if (!variacao) return null;
  const { diff, pct } = variacao;
  let cor = "#C69700", Icon = Minus, texto = "Estável";
  if (pct > 1) { cor = "#4caf6b"; Icon = ArrowUp; texto = "Crescimento"; }
  else if (pct < -1) { cor = "#e0645a"; Icon = ArrowDown; texto = "Queda"; }
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

  function tentarEntrar() {
    if (!usuario.trim() || !senha.trim()) {
      setErro("Preencha usuário e senha.");
      return;
    }
    setErro("");
    onLogin(usuario);
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
        <input placeholder="Usuário" value={usuario} onKeyDown={handleKeyDown} onChange={e => setUsuario(e.target.value)} style={inputStyle} />
        <input placeholder="Senha" type="password" value={senha} onKeyDown={handleKeyDown} onChange={e => setSenha(e.target.value)} style={inputStyle} />
        {erro && <div style={{ color: "#e0645a", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <button type="button" onClick={tentarEntrar} style={{
          width: "100%", background: "#02601D", color: "#fff", border: "none",
          borderRadius: 8, padding: "10px 0", fontSize: 15, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <LogIn size={16} /> Entrar
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
  const { dados, nomes, periodos } = useData();
  const [busca, setBusca] = useState("");
  const [clienteSel, setClienteSel] = useState(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const sugestoes = useMemo(() => {
    if (!busca.trim()) return [];
    return nomes.filter(c => c.toLowerCase().includes(busca.toLowerCase())).slice(0, 6);
  }, [busca, nomes]);

  const todasRows = clienteSel ? (dados[clienteSel] || []) : null;

  function selecionarCliente(nome) {
    setClienteSel(nome);
    setBusca(nome);
    const rows = dados[nome] || [];
    setInicio(rows[0]?.chave || "");
    setFim(rows[rows.length - 1]?.chave || "");
  }

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

  const variacaoFat3 = anteriores3.length ? calcularVariacao(media(ultimos3, "faturamento"), media(anteriores3, "faturamento")) : null;
  const variacaoLit3 = anteriores3.length ? calcularVariacao(media(ultimos3, "litros"), media(anteriores3, "litros")) : null;
  const variacaoFat6 = anteriores6.length ? calcularVariacao(media(ultimos6, "faturamento"), media(anteriores6, "faturamento")) : null;
  const variacaoLit6 = anteriores6.length ? calcularVariacao(media(ultimos6, "litros"), media(anteriores6, "litros")) : null;

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
        mediaFat: mediaFatAno, mediaLit: mediaLitAno,
        variacaoFat: rowsAnoAnterior.length ? calcularVariacao(mediaFatAno, media(rowsAnoAnterior, "faturamento")) : null,
        variacaoLit: rowsAnoAnterior.length ? calcularVariacao(mediaLitAno, media(rowsAnoAnterior, "litros")) : null,
      };
    });
  }, [rowsFechadas]);

  const chartData = rowsFiltradas.map(r => ({ mes: labelMes(r.chave), Faturamento: r.faturamento, Litros: r.litros }));
  const primeiroPeriodo = todasRows && todasRows.length ? todasRows[0].chave : "";
  const ultimoPeriodo = todasRows && todasRows.length ? todasRows[todasRows.length - 1].chave : "";

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1D1D1B", borderRadius: 8, padding: "10px 14px", border: "1px solid #333" }}>
          <Search size={16} color="#C69700" />
          <input placeholder="Buscar cliente..." value={busca}
            onChange={e => { setBusca(e.target.value); setClienteSel(null); }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14 }} />
        </div>
        {sugestoes.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
            {sugestoes.map(c => (
              <div key={c} onClick={() => selecionarCliente(c)}
                style={{ padding: "10px 14px", color: "#fff", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #2a2a28" }}
                onMouseEnter={e => e.currentTarget.style.background = "#02601D"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {c}
              </div>
            ))}
          </div>
        )}
      </div>

      {!clienteSel && (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
          Busque um cliente para visualizar faturamento e litros.
        </div>
      )}

      {clienteSel && todasRows && todasRows.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
          Nenhum dado encontrado para este cliente.
        </div>
      )}

      {clienteSel && todasRows && todasRows.length > 0 && (
        <>
          <h2 style={{ color: "#C69700", fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1, marginBottom: 8 }}>
            {clienteSel}
          </h2>

          {emAndamento && (
            <div style={{ color: "#888", fontSize: 12, marginBottom: 14, background: "#1D1D1B", border: "1px dashed #444", borderRadius: 6, padding: "8px 12px", display: "inline-block" }}>
              ⏳ {labelMes(emAndamento.chave)} ainda está em andamento (mês não fechou): {fmtMoeda(emAndamento.faturamento)} · {fmtLitros(emAndamento.litros)} até o momento — os cálculos de média e crescimento abaixo usam só meses já fechados, pra não distorcer a comparação.
            </div>
          )}

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
              <StatCard label="Últimos 3 meses" value={fmtPrecoLitro(precoMedioLitro(soma(ultimos3, "faturamento"), soma(ultimos3, "litros")))} icon={<Droplets size={14} />} />
              <StatCard label="Últimos 6 meses" value={fmtPrecoLitro(precoMedioLitro(soma(ultimos6, "faturamento"), soma(ultimos6, "litros")))} icon={<Droplets size={14} />} />
              <StatCard label="Últimos 12 meses" value={fmtPrecoLitro(precoMedioLitro(soma(ultimos12, "faturamento"), soma(ultimos12, "litros")))} icon={<Droplets size={14} />} />
            </div>
          </Section>

          <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <StatCard label="Média 3 meses" value={fmtMoeda(media(ultimos3, "faturamento"))} icon={<TrendingUp size={14} />}
                badge={<BadgeTendencia variacao={variacaoFat3} formatador={fmtMoeda} periodoTexto={anteriores3.length ? `${periodoTexto(ultimos3)} vs ${periodoTexto(anteriores3)}` : ""} />} />
              <StatCard label="Média 6 meses" value={fmtMoeda(media(ultimos6, "faturamento"))} icon={<TrendingUp size={14} />}
                badge={<BadgeTendencia variacao={variacaoFat6} formatador={fmtMoeda} periodoTexto={anteriores6.length ? `${periodoTexto(ultimos6)} vs ${periodoTexto(anteriores6)}` : ""} />} />
              <StatCard label="Média 12 meses" value={fmtMoeda(media(ultimos12, "faturamento"))} icon={<TrendingUp size={14} />} />
            </div>

            {mediasPorAno.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Médias anuais</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {mediasPorAno.map(m => (
                    <StatCard key={m.ano} label={`Média anual ${m.ano}${m.meses < 12 ? ` (${m.meses} meses)` : ""}`} value={fmtMoeda(m.mediaFat)} icon={<Calendar size={14} />}
                      badge={<BadgeTendencia variacao={m.variacaoFat} formatador={fmtMoeda} periodoTexto={m.variacaoFat ? `vs ${m.ano - 1}` : ""} />} />
                  ))}
                </div>
              </div>
            )}

            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" stroke="#888" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Line type="monotone" dataKey="Faturamento" stroke="#02601D" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Litros" icon={<Droplets size={18} color="#C69700" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <StatCard label="Média 3 meses" value={fmtLitros(media(ultimos3, "litros"))} icon={<Droplets size={14} />}
                badge={<BadgeTendencia variacao={variacaoLit3} formatador={fmtLitros} periodoTexto={anteriores3.length ? `${periodoTexto(ultimos3)} vs ${periodoTexto(anteriores3)}` : ""} />} />
              <StatCard label="Média 6 meses" value={fmtLitros(media(ultimos6, "litros"))} icon={<Droplets size={14} />}
                badge={<BadgeTendencia variacao={variacaoLit6} formatador={fmtLitros} periodoTexto={anteriores6.length ? `${periodoTexto(ultimos6)} vs ${periodoTexto(anteriores6)}` : ""} />} />
              <StatCard label="Média 12 meses" value={fmtLitros(media(ultimos12, "litros"))} icon={<Droplets size={14} />} />
            </div>

            {mediasPorAno.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Médias anuais</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {mediasPorAno.map(m => (
                    <StatCard key={m.ano} label={`Média anual ${m.ano}${m.meses < 12 ? ` (${m.meses} meses)` : ""}`} value={fmtLitros(m.mediaLit)} icon={<Calendar size={14} />}
                      badge={<BadgeTendencia variacao={m.variacaoLit} formatador={fmtLitros} periodoTexto={m.variacaoLit ? `vs ${m.ano - 1}` : ""} />} />
                  ))}
                </div>
              </div>
            )}

            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" stroke="#888" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(1)}k L`} />
                <Tooltip formatter={v => fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Line type="monotone" dataKey="Litros" stroke="#C69700" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Tabela" icon={<TableIcon size={18} color="#888" />}>
            <TabelaClienteMeses cliente={clienteSel} rows={rowsFiltradas} />
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
  const { nomes, grupos, clientesPorGrupo } = useData();
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
    ? nomes.filter(n => n.toLowerCase().includes(buscaCliente.toLowerCase()))
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
                {nome}
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
  const { dados, periodos } = useData();
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

  const labelA = modoA === "grupo" && gruposA.length ? `Grupo: ${gruposA.join(" + ")}` : (selA.length > 1 ? `${selA.length} clientes (A)` : (selA[0] || "A"));
  const labelB = modoB === "grupo" && gruposB.length ? `Grupo: ${gruposB.join(" + ")}` : (selB.length > 1 ? `${selB.length} clientes (B)` : (selB[0] || "B"));

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

          <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartFat} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [v == null ? "-" : fmtMoeda(v), n]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="faturamentoA" name={labelA} fill="#02601D" radius={[4,4,0,0]}>
                  <LabelList dataKey="faturamentoA" position="top" formatter={rotuloCompactoMoeda} style={{ fontSize: 10, fill: "#8fd19e" }} />
                </Bar>
                <Bar dataKey="faturamentoB" name={labelB} fill="#C69700" radius={[4,4,0,0]}>
                  <LabelList dataKey="faturamentoB" position="top" formatter={rotuloCompactoMoeda} style={{ fontSize: 10, fill: "#e8c67a" }} />
                </Bar>
                <ReferenceLine y={mediaFatA} stroke="#4caf6b" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média A: ${rotuloCompactoMoeda(mediaFatA)}`, position: "top", fill: "#4caf6b", fontSize: 12, fontWeight: 700 }} />
                <ReferenceLine y={mediaFatB} stroke="#e8c67a" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média B: ${rotuloCompactoMoeda(mediaFatB)}`, position: "bottom", fill: "#e8c67a", fontSize: 12, fontWeight: 700 }} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Diferença mês a mês (A − B) · Faturamento" icon={<GitCompareArrows size={16} color="#888" />}>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={chartFat} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={11} interval="preserveStartEnd" />
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

          <Section title="Litros" icon={<Droplets size={18} color="#C69700" />}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartLit} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                <Tooltip formatter={(v, n) => [v == null ? "-" : fmtLitros(v), n]} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="litrosA" name={labelA} stroke="#02601D" strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="litrosA" position="top" formatter={rotuloCompactoLitros} style={{ fontSize: 10, fill: "#8fd19e" }} />
                </Line>
                <Line type="monotone" dataKey="litrosB" name={labelB} stroke="#C69700" strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="litrosB" position="top" formatter={rotuloCompactoLitros} style={{ fontSize: 10, fill: "#e8c67a" }} />
                </Line>
                <ReferenceLine y={mediaLitA} stroke="#4caf6b" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média A: ${rotuloCompactoLitros(mediaLitA)}`, position: "top", fill: "#4caf6b", fontSize: 12, fontWeight: 700 }} />
                <ReferenceLine y={mediaLitB} stroke="#e8c67a" strokeWidth={2} strokeDasharray="5 3" ifOverflow="extendDomain" label={{ value: `Média B: ${rotuloCompactoLitros(mediaLitB)}`, position: "bottom", fill: "#e8c67a", fontSize: 12, fontWeight: 700 }} />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Diferença mês a mês (A − B) · Litros" icon={<GitCompareArrows size={16} color="#888" />}>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={chartLit} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={11} interval="preserveStartEnd" />
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

function calcularMetricasCliente(rowsBrutas) {
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

  return {
    ultimoMesFechado: atual ? {
      fat: atual.faturamento, lit: atual.litros, precoLitro: precoMedioLitro(atual.faturamento, atual.litros),
      varFat: anterior ? calcularVariacao(atual.faturamento, anterior.faturamento) : null,
      varLit: anterior ? calcularVariacao(atual.litros, anterior.litros) : null,
      mesTexto: labelMes(atual.chave),
    } : null,
    emAndamento: emAndamento ? {
      fat: emAndamento.faturamento, lit: emAndamento.litros, precoLitro: precoMedioLitro(emAndamento.faturamento, emAndamento.litros),
      mesTexto: labelMes(emAndamento.chave),
    } : null,
    j3: janela(j3, j3Prev),
    j6: janela(j6, j6Prev),
    j12: janela(j12, j12Prev),
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
      {metricas.emAndamento && (
        <div style={{ color: "#888", fontSize: 11, marginBottom: 10, background: "#141412", border: "1px dashed #444", borderRadius: 6, padding: "5px 8px", display: "inline-block" }}>
          {metricas.emAndamento.mesTexto} em andamento (mês ainda não fechou): {fmtMoeda(metricas.emAndamento.fat)} · {fmtLitros(metricas.emAndamento.lit)} · {fmtPrecoLitro(metricas.emAndamento.precoLitro)} — parcial, não comparado
        </div>
      )}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
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
                let bg = "transparent";
                if (variacao) {
                  if (variacao.pct > 1) bg = "rgba(76,175,107,0.25)";
                  else if (variacao.pct < -1) bg = "rgba(224,101,90,0.25)";
                  else bg = "rgba(198,151,0,0.2)";
                }
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
  const { dados, nomes, grupos, clientesPorGrupo, periodos } = useData();
  const [gruposSel, setGruposSel] = useState([]);
  const [todos, setTodos] = useState(true);
  const [buscaCliente, setBuscaCliente] = useState("");

  function toggleGrupoFiltro(g) {
    setTodos(false);
    setGruposSel(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  const clientesFiltrados = todos ? nomes : [...new Set(gruposSel.flatMap(g => clientesPorGrupo[g] || []))];

  const clientesComMetricas = useMemo(() => {
    return clientesFiltrados
      .map(nome => ({ nome, metricas: calcularMetricasCliente(dados[nome] || []) }))
      .sort((a, b) => b.metricas.j12.fat - a.metricas.j12.fat)
      .map((c, idx) => ({ ...c, posicao: idx + 1 }));
  }, [clientesFiltrados, dados]);

  const clientesExibidos = buscaCliente.trim()
    ? clientesComMetricas.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()))
    : clientesComMetricas;

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#141412", border: "1px solid #333", borderRadius: 6, padding: "8px 12px" }}>
          <Search size={14} color="#C69700" />
          <input placeholder="Buscar um cliente específico dentro do ranking..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
        </div>
      </div>

      <Section title="Comparação mês a mês por grupo · Faturamento" icon={<AlertTriangle size={16} color="#C69700" />}>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>
          🟢 crescimento vs mês anterior · 🔴 queda vs mês anterior · 🟡 estável (±1%). A última coluna pode ser um mês ainda em andamento — compare com cautela.
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
          <CardClienteDashboard key={c.nome} posicao={c.posicao} nome={c.nome} metricas={c.metricas} />
        ))}
      </Section>
    </div>
  );
}

export default function App() {
  const [logado, setLogado] = useState(false);
  const [usuario, setUsuario] = useState("");
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

      {!logado && <LoginScreen onLogin={u => { setUsuario(u); setLogado(true); }} />}

      {logado && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1 }}>
              HBIER <span style={{ color: "#C69700" }}>ANÁLISE</span>
              <span style={{ color: "#555", fontSize: 12, marginLeft: 10, fontFamily: "system-ui" }}>{APP_VERSION}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#888", fontSize: 13 }}>{usuario}</span>
              <button onClick={() => setLogado(false)} style={{
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
              </div>

              {tab === "cliente" && <ClienteDashboard />}
              {tab === "comparacao" && <ComparacaoTab />}
              {tab === "dashboard" && <DashboardTab />}
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
