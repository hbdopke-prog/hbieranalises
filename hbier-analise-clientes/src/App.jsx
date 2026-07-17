import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Search, LogIn, TrendingUp, Droplets, GitCompareArrows, LogOut, Users, Layers, RefreshCw, AlertTriangle, Calendar, Table as TableIcon } from "lucide-react";

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

const APP_VERSION = "v1.4";
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
function StatCard({ label, value, icon }) {
  return (
    <div style={{
      background: "#1D1D1B", borderRadius: 10, padding: "14px 16px",
      flex: "1 1 160px", minWidth: 160, border: "1px solid #33332f",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#C69700", fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {icon}{label}
      </div>
      <div style={{ color: "#fff", fontSize: 19, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{
        color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 22,
        letterSpacing: 1, display: "flex", alignItems: "center", gap: 8,
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

  const ultimos3 = todasRows ? todasRows.slice(-3) : [];
  const ultimos6 = todasRows ? todasRows.slice(-6) : [];
  const ultimos12 = todasRows ? todasRows.slice(-12) : [];

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
          <h2 style={{ color: "#C69700", fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1, marginBottom: 14 }}>
            {clienteSel}
          </h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 22, background: "#1D1D1B", border: "1px solid #333", borderRadius: 8, padding: 12 }}>
            <span style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Calendar size={13} /> Período:</span>
            <button onClick={() => setInicio(primeiroPeriodo)} style={chipBtnStyle}>Desde o início</button>
            <select value={inicio} onChange={e => setInicio(e.target.value)} style={selectStyle}>
              {periodos.filter(p => todasRows.some(r => r.chave === p)).map(p => <option key={p} value={p}>{labelMes(p)}</option>)}
            </select>
            <span style={{ color: "#666" }}>até</span>
            <select value={fim} onChange={e => setFim(e.target.value)} style={selectStyle}>
              {periodos.filter(p => todasRows.some(r => r.chave === p)).map(p => <option key={p} value={p}>{labelMes(p)}</option>)}
            </select>
            <button onClick={() => setFim(ultimoPeriodo)} style={chipBtnStyle}>Até hoje</button>
          </div>

          <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <StatCard label="Média 3 meses" value={fmtMoeda(media(ultimos3, "faturamento"))} icon={<TrendingUp size={14} />} />
              <StatCard label="Média 6 meses" value={fmtMoeda(media(ultimos6, "faturamento"))} icon={<TrendingUp size={14} />} />
              <StatCard label="Média anual" value={fmtMoeda(media(ultimos12, "faturamento"))} icon={<TrendingUp size={14} />} />
            </div>
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
              <StatCard label="Média 3 meses" value={fmtLitros(media(ultimos3, "litros"))} icon={<Droplets size={14} />} />
              <StatCard label="Média 6 meses" value={fmtLitros(media(ultimos6, "litros"))} icon={<Droplets size={14} />} />
              <StatCard label="Média anual" value={fmtLitros(media(ultimos12, "litros"))} icon={<Droplets size={14} />} />
            </div>
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

function SeletorPeriodo({ ativo, inicio, fim, onInicio, onFim }) {
  const { periodos } = useData();
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <select value={inicio} onChange={e => onInicio(e.target.value)} style={selectStyle} disabled={!ativo}>
        <option value="">Início</option>
        {periodos.map(c => <option key={c} value={c}>{labelMes(c)}</option>)}
      </select>
      <select value={fim} onChange={e => onFim(e.target.value)} style={selectStyle} disabled={!ativo}>
        <option value="">Fim</option>
        {periodos.map(c => <option key={c} value={c}>{labelMes(c)}</option>)}
      </select>
    </div>
  );
}

function ColunaComparacao({ titulo, cor, modo, setModo, selecionados, setSelecionados, grupoSel, setGrupoSel, inicio, setInicio, fim, setFim }) {
  const { nomes, grupos, clientesPorGrupo } = useData();

  function toggleCliente(nome) {
    setSelecionados(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]);
  }
  function selecionarGrupo(g) {
    setGrupoSel(g);
    setSelecionados(g ? clientesPorGrupo[g] : []);
  }

  const ativo = selecionados.length > 0;

  return (
    <div style={{ flex: 1, minWidth: 280, background: "#1D1D1B", borderRadius: 10, padding: 16, border: `1px solid ${cor}` }}>
      <div style={{ color: cor, fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 0.5, marginBottom: 10 }}>
        {titulo}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={() => { setModo("clientes"); setGrupoSel(""); setSelecionados([]); }} style={modoBtnStyle(modo === "clientes", cor)}>
          <Users size={13} /> Clientes
        </button>
        <button onClick={() => { setModo("grupo"); setSelecionados([]); }} style={modoBtnStyle(modo === "grupo", cor)}>
          <Layers size={13} /> Grupo
        </button>
      </div>

      {modo === "grupo" && (
        <select value={grupoSel} onChange={e => selecionarGrupo(e.target.value)} style={selectStyle}>
          <option value="">Selecionar grupo</option>
          {grupos.map(g => <option key={g} value={g}>{g} ({clientesPorGrupo[g].length})</option>)}
        </select>
      )}

      {modo === "clientes" && (
        <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid #333", borderRadius: 6, padding: "6px 8px" }}>
          {nomes.map(nome => (
            <label key={nome} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "#fff", cursor: "pointer" }}>
              <input type="checkbox" checked={selecionados.includes(nome)} onChange={() => toggleCliente(nome)} />
              {nome}
            </label>
          ))}
        </div>
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

function ComparacaoTab() {
  const { dados, periodos } = useData();
  const [modoA, setModoA] = useState("clientes");
  const [selA, setSelA] = useState([]);
  const [grupoA, setGrupoA] = useState("");
  const [inicioA, setInicioA] = useState("");
  const [fimA, setFimA] = useState("");

  const [modoB, setModoB] = useState("clientes");
  const [selB, setSelB] = useState([]);
  const [grupoB, setGrupoB] = useState("");
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

  const labelA = modoA === "grupo" && grupoA ? `Grupo: ${grupoA}` : (selA.length > 1 ? `${selA.length} clientes (A)` : (selA[0] || "A"));
  const labelB = modoB === "grupo" && grupoB ? `Grupo: ${grupoB}` : (selB.length > 1 ? `${selB.length} clientes (B)` : (selB[0] || "B"));

  const maxLen = Math.max(rowsA.length, rowsB.length);
  const chartFat = [], chartLit = [];
  for (let i = 0; i < maxLen; i++) {
    chartFat.push({ periodo: `M${i + 1}`, [`${labelA} - Faturamento`]: rowsA[i]?.faturamento ?? null, [`${labelB} - Faturamento`]: rowsB[i]?.faturamento ?? null });
    chartLit.push({ periodo: `M${i + 1}`, [`${labelA} - Litros`]: rowsA[i]?.litros ?? null, [`${labelB} - Litros`]: rowsB[i]?.litros ?? null });
  }

  const totFatA = rowsA.reduce((s,r)=>s+r.faturamento,0);
  const totFatB = rowsB.reduce((s,r)=>s+r.faturamento,0);
  const totLitA = rowsA.reduce((s,r)=>s+r.litros,0);
  const totLitB = rowsB.reduce((s,r)=>s+r.litros,0);

  const pronto = rowsA.length > 0 && rowsB.length > 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <ColunaComparacao titulo="Cenário A" cor="#02601D"
          modo={modoA} setModo={setModoA} selecionados={selA} setSelecionados={setSelA}
          grupoSel={grupoA} setGrupoSel={setGrupoA} inicio={inicioA} setInicio={setInicioA} fim={fimA} setFim={setFimA} />
        <ColunaComparacao titulo="Cenário B" cor="#C69700"
          modo={modoB} setModo={setModoB} selecionados={selB} setSelecionados={setSelB}
          grupoSel={grupoB} setGrupoSel={setGrupoB} inicio={inicioB} setInicio={setInicioB} fim={fimB} setFim={setFimB} />
      </div>

      {!pronto && (
        <div style={{ color: "#888", textAlign: "center", padding: "30px 0", fontSize: 14 }}>
          Selecione cliente(s) ou grupo, e período (início/fim), para os dois cenários.
        </div>
      )}

      {pronto && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label={`${labelA} · Faturamento total`} value={fmtMoeda(totFatA)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelB} · Faturamento total`} value={fmtMoeda(totFatB)} icon={<TrendingUp size={14} />} />
            <StatCard label={`${labelA} · Litros total`} value={fmtLitros(totLitA)} icon={<Droplets size={14} />} />
            <StatCard label={`${labelB} · Litros total`} value={fmtLitros(totLitB)} icon={<Droplets size={14} />} />
          </div>

          <Section title="Faturamento" icon={<TrendingUp size={18} color="#02601D" />}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartFat}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => v == null ? "-" : fmtMoeda(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={`${labelA} - Faturamento`} fill="#02601D" radius={[4,4,0,0]} />
                <Bar dataKey={`${labelB} - Faturamento`} fill="#C69700" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Litros" icon={<Droplets size={18} color="#C69700" />}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartLit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="periodo" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                <Tooltip formatter={v => v == null ? "-" : fmtLitros(v)} contentStyle={{ background: "#1D1D1B", border: "1px solid #333" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey={`${labelA} - Litros`} stroke="#02601D" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={`${labelB} - Litros`} stroke="#C69700" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
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
              </div>

              {tab === "cliente" ? <ClienteDashboard /> : <ComparacaoTab />}
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
