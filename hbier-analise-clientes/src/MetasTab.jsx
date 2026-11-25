import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

/*
  Aba METAS — análise de metas x realizado e projeção de metas futuras.
  Acesso: só o login "henrique" (a tela é escondida no App e o Apps Script só entrega os dados
  para esse login — ação "metas" em Code.gs).
  Dados: aba "metas" da planilha (ano, mes, grupo, vendedor, meta, realizado), vindos dos
  relatórios de metas do BeerSales. Histórico de faturamento: o mesmo que o app já carregou.
*/

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FAMILIAS = [
  { id: "1", nome: "Varejo" },
  { id: "2", nome: "PDVs" },
  { id: "3", nome: "HBier Go SCS" },
  { id: "4", nome: "PDVs Delivery (Pub/Box)" },
  { id: "5", nome: "Consumidor final" },
  { id: "6", nome: "Eventos próprios" },
];
const VERDE = "#3FAE5F", OURO = "#C99700", VERMELHO = "#E10600";

const fmtMoeda = v => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const fmtPct = v => (v == null || !isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);
const fmtK = v => `R$${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
const pad2 = n => String(n).padStart(2, "0");
const chaveDe = (ano, mes) => `${ano}-${pad2(mes)}`;
const labelMes = ch => { const [a, m] = ch.split("-"); return `${MESES[+m - 1]}/${a.slice(2)}`; };
function somaMeses(ch, k) {
  const [a, m] = ch.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return chaveDe(Math.floor(t / 12), (t % 12) + 1);
}
const famDoGrupo = g => { const m = String(g || "").trim().match(/^(\d)/); return m ? m[1] : null; };
const nomeFam = id => (FAMILIAS.find(f => f.id === id) || { nome: `Grupo ${id}` }).nome;
const corAting = p => (p == null ? "transparent" : p >= 1 ? "rgba(63,174,95,0.35)" : p >= 0.7 ? "rgba(201,151,0,0.30)" : "rgba(225,6,0,0.28)");

/* ---------- projeção ---------- */
// serie: { "AAAA-MM": valor } só de meses FECHADOS, até ultimaChave.
function modeloProjecao(serie, ultimaChave) {
  const v = ch => serie[ch] || 0;
  const ult12 = Array.from({ length: 12 }, (_, i) => somaMeses(ultimaChave, -i));
  const ant12 = Array.from({ length: 12 }, (_, i) => somaMeses(ultimaChave, -12 - i));
  const s12 = ult12.reduce((s, c) => s + v(c), 0);
  const sAnt = ant12.reduce((s, c) => s + v(c), 0);
  const temHist = ant12.some(c => serie[c] != null);
  let tendencia = temHist && sAnt > 0 ? s12 / sAnt - 1 : 0;
  tendencia = Math.max(-0.3, Math.min(0.6, tendencia));
  // sazonalidade SEM o efeito do crescimento: cada mês dividido pela média móvel centrada de 12 meses
  // (assim um ano que cresce o tempo todo não "infla" os meses do fim do ano)
  const chavesSerie = Object.keys(serie).sort();
  const obs = Array.from({ length: 12 }, () => []);
  chavesSerie.forEach(c => {
    const ini = somaMeses(c, -6), fim = somaMeses(c, 6);
    if (serie[ini] == null || serie[fim] == null || fim > ultimaChave) return;
    let ma = 0.5 * v(ini) + 0.5 * v(fim);
    for (let k = -5; k <= 5; k++) ma += v(somaMeses(c, k));
    ma /= 12;
    if (ma > 0) obs[+c.split("-")[1] - 1].push(v(c) / ma);
  });
  const idx = obs.map(o => (o.length ? o.reduce((s2, x) => s2 + x, 0) / o.length : 1));
  const mediaIdx = idx.reduce((s2, x) => s2 + x, 0) / 12 || 1;
  for (let i = 0; i < 12; i++) idx[i] /= mediaIdx;
  const anos = Math.max(...obs.map(o => o.length), 0); // quantas observações por mês sustentam a sazonalidade
  return { base: s12 / 12, tendencia, idx, anosSazonais: anos };
}
const preverMes = (modelo, cresc, ultimaChave, chave) => {
  const k = (() => { const [a1, m1] = ultimaChave.split("-").map(Number); const [a2, m2] = chave.split("-").map(Number); return (a2 * 12 + m2) - (a1 * 12 + m1); })();
  const m = +chave.split("-")[1] - 1;
  return modelo.base * Math.pow(1 + cresc, (k + 6) / 12) * modelo.idx[m];
};

/* ---------- visual ---------- */
const painel = { background: "#15201A", border: "1px solid #2E3831", borderRadius: 10, padding: "14px 16px", marginBottom: 18 };
const th = { textAlign: "right", padding: "7px 8px", color: OURO, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid #2E3831", whiteSpace: "nowrap", background: "#111812" };
const td = { textAlign: "right", padding: "6px 8px", color: "#ddd", fontSize: 13, borderBottom: "1px solid #232D26", whiteSpace: "nowrap" };
const tdL = { ...td, textAlign: "left" };
const btn = { background: "transparent", border: "1px solid #444", color: OURO, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 };

function Secao({ titulo, sub, children }) {
  return (
    <div style={painel}>
      <div style={{ color: "#fff", fontFamily: "'HB Titulo','Barlow Condensed',sans-serif", fontSize: 22, letterSpacing: 0.6, textTransform: "uppercase" }}>{titulo}</div>
      {sub && <div style={{ color: "#8a948d", fontSize: 12, margin: "2px 0 12px" }}>{sub}</div>}
      {!sub && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}
function Cartao({ rotulo, valor, nota, cor }) {
  return (
    <div style={{ background: "#15201A", borderRadius: 10, padding: "14px 16px", flex: "1 1 170px", minWidth: 170, border: "1px solid #2E3831" }}>
      <div style={{ color: OURO, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{rotulo}</div>
      <div style={{ color: cor || "#fff", fontSize: 24, fontWeight: 800 }}>{valor}</div>
      {nota && <div style={{ color: "#8a948d", fontSize: 12, marginTop: 4 }}>{nota}</div>}
    </div>
  );
}
const Tabela = ({ children }) => <div style={{ overflowX: "auto", border: "1px solid #2E3831", borderRadius: 8 }}><table style={{ borderCollapse: "collapse", width: "100%" }}>{children}</table></div>;

async function baixarExcel(abas) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  abas.forEach(a => {
    const ws = XLSX.utils.aoa_to_sheet(a.linhas);
    const nc = Math.max(...a.linhas.map(l => l.length));
    ws["!cols"] = Array.from({ length: nc }, (_, c) => ({ wch: Math.min(40, Math.max(10, ...a.linhas.map(l => String(l[c] == null ? "" : l[c]).length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  });
  XLSX.writeFile(wb, `HBier_Metas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
const n2 = v => (v == null || isNaN(v) ? "" : Number(Number(v).toFixed(2)));

/* ---------- componente ---------- */
export default function MetasTab({ contexto, usuario, senha, gasUrl, chaveMesAtual }) {
  const [estado, setEstado] = useState("carregando"); // carregando | ok | erro
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [ambicao, setAmbicao] = useState(10);          // % acima da previsão
  const [crescEdit, setCrescEdit] = useState({});      // família -> % ao ano digitado

  function carregar() {
    setEstado("carregando");
    fetch(gasUrl, { method: "POST", body: JSON.stringify({ action: "metas", usuario, senha }) })
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.erro || "Erro ao ler as metas.");
        setLinhas(j.linhas || []); setEstado("ok");
      })
      .catch(e => { setErro(String(e.message || e)); setEstado("erro"); });
  }
  useEffect(() => { carregar(); }, []);

  /* --- metas e realizado do arquivo de metas --- */
  const M = useMemo(() => {
    const porMes = {}, porFam = {}, porVend = {};
    linhas.forEach(r => {
      const ch = chaveDe(r.ano, r.mes), f = famDoGrupo(r.grupo) || "?";
      porMes[ch] = porMes[ch] || { meta: 0, real: 0 }; porMes[ch].meta += r.meta; porMes[ch].real += r.realizado;
      porFam[f] = porFam[f] || {}; porFam[f][ch] = porFam[f][ch] || { meta: 0, real: 0 };
      porFam[f][ch].meta += r.meta; porFam[f][ch].real += r.realizado;
      porVend[f] = porVend[f] || {}; porVend[f][r.vendedor] = porVend[f][r.vendedor] || { meta: 0, real: 0 };
      porVend[f][r.vendedor].meta += r.meta; porVend[f][r.vendedor].real += r.realizado;
    });
    const chaves = Object.keys(porMes).sort();
    const tot = chaves.reduce((a, c) => ({ meta: a.meta + porMes[c].meta, real: a.real + porMes[c].real }), { meta: 0, real: 0 });
    const donos = {};
    Object.keys(porVend).forEach(f => {
      const es = Object.entries(porVend[f]).sort((a, b) => b[1].meta - a[1].meta);
      donos[f] = es[0] && es[0][1].meta > 0 ? es[0][0] : null;
    });
    return { porMes, porFam, porVend, chaves, tot, donos };
  }, [linhas]);

  /* --- histórico do faturamento (já carregado no app) --- */
  const H = useMemo(() => {
    const { dados, periodos, clientesPorGrupo } = contexto;
    const total = {}, fam = {};
    Object.keys(clientesPorGrupo || {}).forEach(g => {
      const f = famDoGrupo(g) || "?";
      fam[f] = fam[f] || {};
      (clientesPorGrupo[g] || []).forEach(cod => (dados[cod] || []).forEach(r => {
        fam[f][r.chave] = (fam[f][r.chave] || 0) + r.faturamento;
        total[r.chave] = (total[r.chave] || 0) + r.faturamento;
      }));
    });
    const ult = periodos[periodos.length - 1];
    const emAndamento = ult === chaveMesAtual ? ult : null;
    const ultimaChave = emAndamento ? periodos[periodos.length - 2] : ult;
    const fechado = s => { const o = {}; Object.keys(s).forEach(c => { if (c <= ultimaChave) o[c] = s[c]; }); return o; };
    return { total, fam, ultimaChave, emAndamento, totalFechado: fechado(total), famFechado: Object.fromEntries(Object.keys(fam).map(f => [f, fechado(fam[f])])) };
  }, [contexto, chaveMesAtual]);

  /* --- projeção --- */
  const P = useMemo(() => {
    if (!H.ultimaChave) return null;
    const horizonte = Array.from({ length: 14 }, (_, i) => somaMeses(H.ultimaChave, i + 1)); // 14 meses a partir do último fechado
    const modelos = {}, cresc = {};
    FAMILIAS.forEach(f => {
      modelos[f.id] = modeloProjecao(H.famFechado[f.id] || {}, H.ultimaChave);
      const ed = crescEdit[f.id];
      cresc[f.id] = ed !== undefined && ed !== "" && !isNaN(Number(ed)) ? Number(ed) / 100 : modelos[f.id].tendencia;
    });
    const prev = {}, meta = {};
    horizonte.forEach(ch => {
      prev[ch] = {}; meta[ch] = {};
      FAMILIAS.forEach(f => {
        const p = Math.max(0, preverMes(modelos[f.id], cresc[f.id], H.ultimaChave, ch));
        prev[ch][f.id] = p; meta[ch][f.id] = p * (1 + ambicao / 100);
      });
    });
    return { horizonte, modelos, cresc, prev, meta };
  }, [H, crescEdit, ambicao]);

  if (estado === "carregando") return <div style={{ ...painel, color: "#aaa" }}>Carregando metas…</div>;
  if (estado === "erro") {
    const precisaAtualizar = /desconhecida/i.test(erro);
    return (
      <div style={{ ...painel, borderColor: OURO }}>
        <div style={{ color: OURO, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar as metas</div>
        <div style={{ color: "#ccc", fontSize: 13, marginBottom: 10 }}>
          {precisaAtualizar ? "O Apps Script ainda não tem a ação das metas. Cole o novo Code.gs no Apps Script e publique uma nova versão da implantação." : erro}
        </div>
        <button style={btn} onClick={carregar}>Tentar novamente</button>
      </div>
    );
  }
  if (!M.chaves.length) return <div style={{ ...painel, color: "#aaa" }}>A aba "metas" da planilha está vazia.</div>;

  const { porMes, porFam, porVend, chaves, tot, donos } = M;
  const atingTot = tot.meta > 0 ? tot.real / tot.meta : null;
  const mesesBateu = chaves.filter(c => porMes[c].meta > 0 && porMes[c].real >= porMes[c].meta).length;
  const melhor = chaves.reduce((b, c) => (porMes[c].real / porMes[c].meta > (b ? porMes[b].real / porMes[b].meta : -1) ? c : b), null);
  const pior = chaves.reduce((b, c) => (porMes[c].real / porMes[c].meta < (b ? porMes[b].real / porMes[b].meta : 9e9) ? c : b), null);
  const dadosGraf = chaves.map(c => ({ mes: labelMes(c), Meta: Math.round(porMes[c].meta), Realizado: Math.round(porMes[c].real), pct: porMes[c].meta ? Math.round((porMes[c].real / porMes[c].meta) * 100) : null }));

  // calibragem: meta do mês x ritmo (média) dos 3 meses anteriores
  const calib = chaves.map(c => {
    const ant = [1, 2, 3].map(k => H.total[somaMeses(c, -k)]).filter(x => x != null);
    const ritmo = ant.length === 3 ? ant.reduce((s, x) => s + x, 0) / 3 : null;
    const mesmoMesAnt = H.total[somaMeses(c, -12)];
    return { c, meta: porMes[c].meta, real: porMes[c].real, ritmo, razao: ritmo ? porMes[c].meta / ritmo : null, mesmoMesAnt, cresc: mesmoMesAnt ? porMes[c].real / mesmoMesAnt - 1 : null };
  });

  // vendedor dono da meta x quem fatura
  const alertas = FAMILIAS.map(f => {
    const dono = donos[f.id]; const vs = porVend[f.id] || {};
    const totReal = Object.values(vs).reduce((s, x) => s + x.real, 0);
    const donoReal = dono && vs[dono] ? vs[dono].real : 0;
    const top = Object.entries(vs).sort((a, b) => b[1].real - a[1].real)[0];
    return { f, dono, totReal, donoReal, pctDono: totReal ? donoReal / totReal : null, top };
  });

  const totPrev = P ? P.horizonte.map(c => ({ c, prev: FAMILIAS.reduce((s, f) => s + P.prev[c][f.id], 0), meta: FAMILIAS.reduce((s, f) => s + P.meta[c][f.id], 0), ano: H.total[somaMeses(c, -12)] })) : [];
  const porDono = {};
  if (P) FAMILIAS.forEach(f => { const d = donos[f.id] || "SEM DONO"; porDono[d] = porDono[d] || {}; P.horizonte.forEach(c => { porDono[d][c] = (porDono[d][c] || 0) + P.meta[c][f.id]; }); });

  function exportar() {
    const a1 = [["Mês", "Meta", "Realizado", "% atingido", "Gap"], ...chaves.map(c => [labelMes(c), n2(porMes[c].meta), n2(porMes[c].real), n2(porMes[c].real / porMes[c].meta), n2(porMes[c].meta - porMes[c].real)])];
    const a2 = [["Tipo de cliente", ...chaves.map(c => `${labelMes(c)} meta`), ...chaves.map(c => `${labelMes(c)} real`), "Meta total", "Realizado total", "% atingido"],
      ...FAMILIAS.map(f => { const mt = chaves.reduce((s, c) => s + ((porFam[f.id] || {})[c] ? porFam[f.id][c].meta : 0), 0); const rt = chaves.reduce((s, c) => s + ((porFam[f.id] || {})[c] ? porFam[f.id][c].real : 0), 0); return [f.nome, ...chaves.map(c => n2((porFam[f.id] || {})[c] ? porFam[f.id][c].meta : 0)), ...chaves.map(c => n2((porFam[f.id] || {})[c] ? porFam[f.id][c].real : 0)), n2(mt), n2(rt), mt ? n2(rt / mt) : ""]; })];
    const a3 = [["Mês", "Meta", "Média realizada 3 meses anteriores", "Meta ÷ ritmo", "Mesmo mês ano anterior", "Realizado vs ano anterior"], ...calib.map(x => [labelMes(x.c), n2(x.meta), n2(x.ritmo), n2(x.razao), n2(x.mesmoMesAnt), n2(x.cresc)])];
    const a4 = P ? [["Mês", ...FAMILIAS.map(f => `${f.nome} previsão`), "Previsão total", ...FAMILIAS.map(f => `${f.nome} meta sugerida`), "Meta sugerida total", `Ambição ${ambicao}%`],
      ...P.horizonte.map(c => [labelMes(c), ...FAMILIAS.map(f => n2(P.prev[c][f.id])), n2(FAMILIAS.reduce((s, f) => s + P.prev[c][f.id], 0)), ...FAMILIAS.map(f => n2(P.meta[c][f.id])), n2(FAMILIAS.reduce((s, f) => s + P.meta[c][f.id], 0)), ""])] : [["sem dados"]];
    baixarExcel([{ nome: "Meta x Realizado", linhas: a1 }, { nome: "Por tipo de cliente", linhas: a2 }, { nome: "Calibragem", linhas: a3 }, { nome: "Projecao de metas", linhas: a4 }]);
  }

  const ult = chaves[chaves.length - 1];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div style={{ color: "#8a948d", fontSize: 12 }}>
          Metas e realizado de {labelMes(chaves[0])} a {labelMes(ult)} (relatórios do BeerSales) · acesso restrito
        </div>
        <button style={btn} onClick={exportar}>📊 Exportar Excel</button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Cartao rotulo="Meta acumulada" valor={fmtMoeda(tot.meta)} nota={`${chaves.length} meses`} />
        <Cartao rotulo="Realizado" valor={fmtMoeda(tot.real)} nota={`Gap de ${fmtMoeda(tot.meta - tot.real)}`} />
        <Cartao rotulo="Atingimento" valor={fmtPct(atingTot)} cor={atingTot >= 1 ? VERDE : atingTot >= 0.7 ? OURO : VERMELHO} nota="realizado ÷ meta" />
        <Cartao rotulo="Meses que bateu a meta" valor={`${mesesBateu} de ${chaves.length}`} nota={melhor ? `Melhor: ${labelMes(melhor)} (${fmtPct(porMes[melhor].real / porMes[melhor].meta)})` : ""} />
        <Cartao rotulo="Pior mês" valor={pior ? labelMes(pior) : "—"} nota={pior ? fmtPct(porMes[pior].real / porMes[pior].meta) : ""} cor={VERMELHO} />
      </div>

      <Secao titulo="Meta × Realizado por mês" sub="Barras: meta e realizado. Linha: % atingido (eixo da direita).">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={dadosGraf} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2E3831" />
            <XAxis dataKey="mes" tick={{ fill: "#fff", fontSize: 12 }} />
            <YAxis yAxisId="v" tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={fmtK} />
            <YAxis yAxisId="p" orientation="right" tick={{ fill: "#ccc", fontSize: 12 }} tickFormatter={v => `${v}%`} domain={[0, "dataMax + 20"]} />
            <Tooltip contentStyle={{ background: "#15201A", border: "1px solid #333" }} formatter={(v, n) => (n === "% atingido" ? `${v}%` : fmtMoeda(v))} />
            <Legend />
            <Bar yAxisId="v" dataKey="Meta" fill={OURO} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="v" dataKey="Realizado" fill="#025F1D" radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" type="monotone" dataKey="pct" name="% atingido" stroke="#fff" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ height: 10 }} />
        <Tabela>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Mês</th><th style={th}>Meta</th><th style={th}>Realizado</th><th style={th}>% atingido</th><th style={th}>Gap</th></tr></thead>
          <tbody>
            {chaves.map(c => { const x = porMes[c]; const p = x.meta ? x.real / x.meta : null; return (
              <tr key={c}><td style={tdL}>{labelMes(c)}</td><td style={td}>{fmtMoeda(x.meta)}</td><td style={td}>{fmtMoeda(x.real)}</td>
                <td style={{ ...td, background: corAting(p), fontWeight: 700 }}>{fmtPct(p)}</td>
                <td style={{ ...td, color: x.meta - x.real > 0 ? "#ff8a80" : VERDE }}>{fmtMoeda(x.meta - x.real)}</td></tr>); })}
            <tr><td style={{ ...tdL, fontWeight: 800, color: "#fff" }}>Total</td><td style={{ ...td, fontWeight: 800 }}>{fmtMoeda(tot.meta)}</td><td style={{ ...td, fontWeight: 800 }}>{fmtMoeda(tot.real)}</td>
              <td style={{ ...td, fontWeight: 800, background: corAting(atingTot) }}>{fmtPct(atingTot)}</td><td style={{ ...td, fontWeight: 800 }}>{fmtMoeda(tot.meta - tot.real)}</td></tr>
          </tbody>
        </Tabela>
      </Secao>

      <Secao titulo="Atingimento por tipo de cliente" sub="As metas são fixadas no grupo principal (1 a 6); o realizado soma os subgrupos (1.2, 1.3…). Verde ≥ 100%, amarelo 70–99%, vermelho < 70%.">
        <Tabela>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Tipo de cliente</th>{chaves.map(c => <th key={c} style={th}>{labelMes(c)}</th>)}<th style={th}>Meta total</th><th style={th}>Realizado</th><th style={th}>% acum.</th></tr></thead>
          <tbody>
            {FAMILIAS.map(f => {
              const d = porFam[f.id] || {};
              const mt = chaves.reduce((s, c) => s + (d[c] ? d[c].meta : 0), 0), rt = chaves.reduce((s, c) => s + (d[c] ? d[c].real : 0), 0);
              return (
                <tr key={f.id}>
                  <td style={tdL}>{f.id}. {f.nome}</td>
                  {chaves.map(c => { const x = d[c]; const p = x && x.meta ? x.real / x.meta : null; return <td key={c} style={{ ...td, background: corAting(p) }}>{p == null ? "—" : fmtPct(p)}</td>; })}
                  <td style={td}>{fmtMoeda(mt)}</td><td style={td}>{fmtMoeda(rt)}</td>
                  <td style={{ ...td, background: corAting(mt ? rt / mt : null), fontWeight: 700 }}>{mt ? fmtPct(rt / mt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      </Secao>

      <Secao titulo="Calibragem das metas" sub="Compara cada meta com o ritmo real da empresa: média de faturamento dos 3 meses anteriores. Meta ÷ ritmo acima de 1,2 costuma ser difícil de bater.">
        <Tabela>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Mês</th><th style={th}>Meta</th><th style={th}>Média 3 meses anteriores</th><th style={th}>Meta ÷ ritmo</th><th style={th}>Mesmo mês ano anterior</th><th style={th}>Realizado vs ano ant.</th></tr></thead>
          <tbody>
            {calib.map(x => (
              <tr key={x.c}><td style={tdL}>{labelMes(x.c)}</td><td style={td}>{fmtMoeda(x.meta)}</td><td style={td}>{fmtMoeda(x.ritmo)}</td>
                <td style={{ ...td, fontWeight: 700, color: x.razao == null ? "#ddd" : x.razao > 1.2 ? "#ff8a80" : x.razao >= 0.95 ? VERDE : OURO }}>{x.razao == null ? "—" : `${x.razao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`}</td>
                <td style={td}>{fmtMoeda(x.mesmoMesAnt)}</td>
                <td style={{ ...td, color: x.cresc == null ? "#ddd" : x.cresc >= 0 ? VERDE : "#ff8a80" }}>{x.cresc == null ? "—" : `${x.cresc >= 0 ? "+" : ""}${(x.cresc * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}</td></tr>
            ))}
          </tbody>
        </Tabela>
      </Secao>

      <Secao titulo="Dono da meta × quem fatura" sub="A meta está lançada em um vendedor, mas o faturamento pode sair em outro — aí o atingimento por vendedor fica distorcido. Aqui está a conferência por tipo de cliente.">
        <Tabela>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Tipo de cliente</th><th style={{ ...th, textAlign: "left" }}>Vendedor com a meta</th><th style={th}>Realizado nele</th><th style={th}>% do realizado</th><th style={{ ...th, textAlign: "left" }}>Quem mais fatura</th></tr></thead>
          <tbody>
            {alertas.map(a => {
              const diverge = a.pctDono != null && a.pctDono < 0.5;
              return (
                <tr key={a.f.id}>
                  <td style={tdL}>{a.f.id}. {a.f.nome}</td>
                  <td style={tdL}>{a.dono || "—"}</td>
                  <td style={td}>{fmtMoeda(a.donoReal)}</td>
                  <td style={{ ...td, fontWeight: 700, color: diverge ? "#ff8a80" : VERDE }}>{fmtPct(a.pctDono)}</td>
                  <td style={tdL}>{a.top ? `${a.top[0]} (${fmtMoeda(a.top[1].real)})` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
        {alertas.some(a => a.pctDono != null && a.pctDono < 0.5) && (
          <div style={{ color: OURO, fontSize: 12, marginTop: 10 }}>
            ⚠ Onde "% do realizado" está em vermelho, a maior parte do faturamento entra em outro vendedor. Vale lançar a meta no mesmo vendedor/carteira que fatura (ou medir por tipo de cliente, como nesta aba).
          </div>
        )}
      </Secao>

      {P && (
        <Secao titulo="Projeção de metas" sub={`Previsão = ritmo dos últimos 12 meses fechados (até ${labelMes(H.ultimaChave)}) × tendência de crescimento × sazonalidade histórica de cada tipo de cliente. Meta sugerida = previsão + ambição.`}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div style={{ color: OURO, fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Ambição sobre a previsão: {ambicao}%</div>
              <input type="range" min={0} max={40} step={1} value={ambicao} onChange={e => setAmbicao(Number(e.target.value))} style={{ width: 220, accentColor: "#025F1D" }} />
            </div>
            <div style={{ color: "#8a948d", fontSize: 12, maxWidth: 480 }}>
              Dica: com ambição 0% a meta é a previsão (≈50% de chance de bater). Em 2026 você realizou {fmtPct(atingTot)} das metas fixadas — por isso a ambição alta tende a gerar meta que não fecha.
            </div>
          </div>

          <div style={{ color: "#ccc", fontSize: 12, marginBottom: 6 }}>Crescimento anual por tipo de cliente (calculado dos últimos 12 meses vs. 12 anteriores — pode ajustar):</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {FAMILIAS.map(f => (
              <label key={f.id} style={{ color: "#ddd", fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                {f.nome}
                <span>
                  <input type="number" step="1" value={crescEdit[f.id] !== undefined ? crescEdit[f.id] : Math.round(P.modelos[f.id].tendencia * 100)}
                    onChange={e => setCrescEdit(s => ({ ...s, [f.id]: e.target.value }))}
                    style={{ width: 70, background: "#0E1510", color: "#fff", border: "1px solid #444", borderRadius: 6, padding: "5px 6px" }} /> % a.a.
                </span>
              </label>
            ))}
          </div>

          <Tabela>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Mês</th>
                {FAMILIAS.map(f => <th key={f.id} style={th}>{f.nome}</th>)}
                <th style={th}>Meta sugerida</th><th style={th}>Previsão</th><th style={th}>Mesmo mês ano ant.</th><th style={th}>Meta vs ano ant.</th>
              </tr>
            </thead>
            <tbody>
              {totPrev.map(x => {
                const emAnd = H.emAndamento === x.c;
                return (
                  <tr key={x.c}>
                    <td style={tdL}>{labelMes(x.c)}{emAnd && <span style={{ color: OURO, fontSize: 11 }}> · em andamento</span>}</td>
                    {FAMILIAS.map(f => <td key={f.id} style={td}>{fmtMoeda(P.meta[x.c][f.id])}</td>)}
                    <td style={{ ...td, fontWeight: 800, color: "#fff" }}>{fmtMoeda(x.meta)}</td>
                    <td style={td}>{fmtMoeda(x.prev)}</td>
                    <td style={td}>{fmtMoeda(x.ano)}</td>
                    <td style={{ ...td, color: x.ano ? (x.meta / x.ano - 1 >= 0 ? VERDE : "#ff8a80") : "#ddd" }}>{x.ano ? `${x.meta / x.ano - 1 >= 0 ? "+" : ""}${((x.meta / x.ano - 1) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
          {H.emAndamento && (
            <div style={{ color: "#8a948d", fontSize: 12, marginTop: 8 }}>
              {labelMes(H.emAndamento)} ainda está em andamento: faturado até a última atualização da base: {fmtMoeda(H.total[H.emAndamento])}.
            </div>
          )}

          <div style={{ color: "#ccc", fontSize: 12, margin: "16px 0 6px" }}>Meta sugerida por vendedor (a meta de cada tipo de cliente vai para quem hoje é o dono dela):</div>
          <Tabela>
            <thead><tr><th style={{ ...th, textAlign: "left" }}>Vendedor</th>{P.horizonte.slice(0, 6).map(c => <th key={c} style={th}>{labelMes(c)}</th>)}</tr></thead>
            <tbody>
              {Object.keys(porDono).sort().map(d => (
                <tr key={d}><td style={tdL}>{d}</td>{P.horizonte.slice(0, 6).map(c => <td key={c} style={td}>{fmtMoeda(porDono[d][c])}</td>)}</tr>
              ))}
            </tbody>
          </Tabela>
          <div style={{ color: "#8a948d", fontSize: 12, marginTop: 10 }}>
            Como ler: a sazonalidade de cada mês é medida contra a média móvel de 12 meses (isso tira o efeito do crescimento) e usa até {P.modelos["1"].anosSazonais} ano(s) de histórico por mês. É uma previsão estatística simples — não considera novos clientes, aumentos de preço ou eventos que ainda não aconteceram; ajuste o crescimento e a ambição conforme o plano comercial.
          </div>
        </Secao>
      )}
    </div>
  );
}
