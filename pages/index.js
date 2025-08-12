import { useEffect, useMemo, useState } from "react";

// Tiny CSV parser (no dependencies). Assumes simple, comma-separated with header.
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const cols = l.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h.trim()] = (cols[i] || "").trim()));
    return row;
  });
}

async function fetchCsv(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  return parseCSV(text);
}

export default function Home() {
  const [hosts, setHosts] = useState([]);
  const [guests, setGuests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [comms, setComms] = useState([]);
  const [tab, setTab] = useState("hosts");
  const [filters, setFilters] = useState({ gender: "all", allergy: "all", access: "all" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [h, g, m, i, c] = await Promise.all([
        fetchCsv("/data/hosts.csv"),
        fetchCsv("/data/guests.csv"),
        fetchCsv("/data/matches.csv"),
        fetchCsv("/data/incidents.csv"),
        fetchCsv("/data/comms.csv"),
      ]);
      setHosts(h); setGuests(g); setMatches(m); setIncidents(i); setComms(c);
    })();
  }, []);

  const metrics = useMemo(() => {
    const hostsConfirmed = hosts.filter(h => String(h.confirmed||"").toLowerCase()==="yes").length;
    const guestsConfirmed = guests.filter(g => String(g.confirmed||"").toLowerCase()==="yes").length;
    const openIncidents = incidents.filter(i => String(i.status||"").toLowerCase()!=="closed").length;
    const pct = (part, total) => Math.round(100 * (total ? part/total : 0));
    return {
      hostsConfirmedPct: pct(hostsConfirmed, hosts.length),
      guestsConfirmedPct: pct(guestsConfirmed, guests.length),
      matchesMade: matches.length,
      openIncidents
    };
  }, [hosts, guests, incidents, matches]);

  const filteredRows = useMemo(() => {
    const src = tab === "hosts" ? hosts : guests;
    const q = search.toLowerCase();
    return src.filter((r) => {
      const g = String(r.gender_comfort || r.gender || "").toLowerCase();
      const a = String(r.allergies || "").toLowerCase();
      const ac = String(r.accessibility || "").toLowerCase();
      const okG = filters.gender === "all" || g.includes(filters.gender);
      const okA = filters.allergy === "all" || a.includes(filters.allergy);
      const okAc = filters.access === "all" || ac.includes(filters.access);
      const okQ = !q || String(r.name||"").toLowerCase().includes(q);
      return okG && okA && okAc && okQ;
    });
  }, [tab, hosts, guests, filters, search]);

  const suggestions = useMemo(() => {
    // very simple scoring
    const out = [];
    guests.forEach(g => {
      hosts.forEach(h => {
        const pref = String(h.gender_comfort||"").toLowerCase();
        const gg = String(g.gender||"").toLowerCase();
        const genderOk = !pref || pref==="any" || (pref.includes("female") && gg.startsWith("f")) || (pref.includes("male") && gg.startsWith("m")) || (pref.includes("nonbinary") && gg.startsWith("n"));
        if (!genderOk) return;
        const ga = String(g.allergies||"").toLowerCase();
        const ha = String(h.allergies||"").toLowerCase();
        const allergyOk = !ga || !ha || !ha.split(/[;,\s]+/).some(x => x && ga.includes(x));
        let score = 0; const reasons = [];
        if (genderOk){ score+=10; reasons.push("Gender comfort ok"); }
        if (allergyOk){ score+=5; reasons.push("Allergies compatible"); }
        if (String(g.accessibility||"").toLowerCase().includes("wheelchair") && String(h.accessibility||"").toLowerCase().includes("elevator")){ score+=3; reasons.push("Accessibility"); }
        if (String(g.confirmed||"").toLowerCase()==="yes" && String(h.confirmed||"").toLowerCase()==="yes"){ score+=2; reasons.push("Both confirmed"); }
        if (score>0) out.push({ guest_id: g.id, host_id: h.id, score, reasons });
      });
    });
    return out.sort((a,b)=>b.score-a.score).slice(0,50);
  }, [hosts, guests]);

  // incidents add/export (client-side only)
  const [addedIncidents, setAddedIncidents] = useState([]);
  const incidentRows = useMemo(() => [...addedIncidents, ...incidents], [addedIncidents, incidents]);
  function addIncident(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const row = {
      time: fd.get("time") || new Date().toISOString(),
      type: fd.get("type") || "",
      person: fd.get("person") || "",
      status: fd.get("status") || "Open",
      notes: fd.get("notes") || "",
    };
    setAddedIncidents([row, ...addedIncidents]);
    e.currentTarget.reset();
  }
  function exportIncidents() {
    if (!incidentRows.length) return;
    const headers = Object.keys(incidentRows[0]);
    const esc = (v) => `"${String(v??"").replace(/"/g,'""')}"`;
    const csv = [headers.join(",")].concat(incidentRows.map(r => headers.map(h => esc(r[h])).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "incidents.csv";
    a.click();
  }

  return (
    <main style={styles.wrap}>
      <header style={styles.header}>
        <div style={styles.title}>Hosting Ops Dashboard</div>
        <div style={{opacity:.8}}>Carleton</div>
      </header>

      {/* metrics */}
      <section style={styles.metrics}>
        <MetricCard label="Hosts Confirmed" value={metrics.hostsConfirmedPct + "%"} />
        <MetricCard label="Guests Confirmed" value={metrics.guestsConfirmedPct + "%"} />
        <MetricCard label="Matches Made" value={String(metrics.matchesMade)} />
        <MetricCard label="Open Incidents" value={String(metrics.openIncidents)} alert={metrics.openIncidents>0} />
      </section>

      {/* tiles */}
      <section style={styles.grid2}>
        <div style={{display:"grid", gap:16}}>
          <h2 style={styles.sectionH}>Setup & Infrastructure</h2>
          <Tile href="#hosts">Host &amp; Guest Data</Tile>
          <Tile href="#matching" subtitle="We’re almost ready — keep going.">Matching Board</Tile>
          <Tile href="#comms">Comms &amp; Training Tracker</Tile>
          <Tile href="#logistics">Logistics Setup</Tile>
        </div>
        <div style={{display:"grid", gap:16}}>
          <h2 style={styles.sectionH}>Day-of Ease</h2>
          <div style={styles.tile}>
            <input placeholder="Search guest or host" value={search} onChange={(e)=>setSearch(e.target.value)} style={styles.input} />
          </div>
          <Tile href="#comms">Live Comms Feed</Tile>
          <Tile href="#incidents">Add Incident</Tile>
          <Tile href="#transport">Transportation Tracker</Tile>
          <Tile href="#resources">Resource Library</Tile>
        </div>
      </section>

      {/* hosts/guests */}
      <section id="hosts" style={{display:"grid", gap:16, paddingTop:16}}>
        <h2 style={styles.h1}>Host &amp; Guest Data</h2>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <button onClick={()=>setTab("hosts")} style={tab==="hosts"?styles.btnGold:styles.btnOutline}>Hosts</button>
          <button onClick={()=>setTab("guests")} style={tab==="guests"?styles.btnGold:styles.btnOutline}>Guests</button>
          <div style={{marginLeft:"auto", display:"flex", gap:8, fontSize:14}}>
            <select onChange={(e)=>setFilters({...filters, gender:e.target.value})} style={styles.select}>
              <option value="all">Gender: all</option>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="nonbinary">nonbinary</option>
            </select>
            <select onChange={(e)=>setFilters({...filters, allergy:e.target.value})} style={styles.select}>
              <option value="all">Allergy: all</option>
              <option value="gluten">gluten</option>
              <option value="peanuts">peanuts</option>
            </select>
            <select onChange={(e)=>setFilters({...filters, access:e.target.value})} style={styles.select}>
              <option value="all">Access: all</option>
              <option value="wheelchair">wheelchair</option>
              <option value="elevator">elevator</option>
            </select>
          </div>
        </div>
        <DataTable rows={filteredRows} columns={tab==="hosts"
          ? ["id","name","gender_comfort","allergies","accessibility","confirmed","room_building","room_number"]
          : ["id","name","gender","allergies","accessibility","confirmed","arrival_time","departure_time"]} />
      </section>

      {/* matching */}
      <section id="matching" style={{display:"grid", gap:16, paddingTop:16}}>
        <h2 style={styles.h1}>Matching Board (Preview)</h2>
        <div style={styles.cardGrid}>
          {suggestions.map((s,i)=>(
            <button key={i} style={styles.card} onClick={()=>alert(`Confirm ${s.guest_id} → ${s.host_id} (stub for v1.1 write).`)}>
              <div style={{fontWeight:600}}>{s.guest_id} → {s.host_id}</div>
              <div style={{opacity:.8, fontSize:14}}>Score {s.score} · {s.reasons.join(", ")}</div>
            </button>
          ))}
        </div>
      </section>

      {/* incidents */}
      <section id="incidents" style={{display:"grid", gap:16, paddingTop:16}}>
        <h2 style={styles.h1}>Incident Log</h2>
        <form onSubmit={addIncident} style={styles.incidentForm}>
          <input name="time" placeholder="Time (optional)" style={styles.input} />
          <input name="type" placeholder="Type" style={styles.input} />
          <input name="person" placeholder="Person" style={styles.input} />
          <select name="status" defaultValue="Open" style={styles.input}><option>Open</option><option>Closed</option></select>
          <input name="notes" placeholder="Notes" style={styles.input} />
          <div style={{gridColumn:"1 / -1", display:"flex", gap:8}}>
            <button type="submit" style={styles.btnGold}>Add Incident</button>
            <button type="button" onClick={exportIncidents} style={styles.btnOutline}>Export incidents.csv</button>
          </div>
        </form>
        <DataTable rows={incidentRows} columns={["time","type","person","status","notes"]} />
        <div style={{opacity:.8, fontSize:14}}>Note: In v1.1 we’ll post to a Netlify Function to persist to Git.</div>
      </section>

      {/* comms */}
      <section id="comms" style={{display:"grid", gap:16, paddingTop:16}}>
        <h2 style={styles.h1}>Live Comms Feed</h2>
        <DataTable rows={comms} columns={["date","type","owner","status","notes"]} />
      </section>

      {/* transport */}
      <section id="transport" style={{display:"grid", gap:16, paddingTop:16}}>
        <h2 style={styles.h1}>Transportation Tracker</h2>
        <div style={styles.cardGrid}>
          {guests.map((g,i)=>{
            const t = Date.parse(g.arrival_time||"");
            const now = Date.now();
            let status = "Unknown";
            if (!isNaN(t)) status = t < now - 3600000 ? "Arrived" : (t < now + 1800000 ? "Landing soon" : "In transit");
            return (
              <div key={i} style={styles.card}>
                <div style={{fontWeight:600}}>{g.name}</div>
                <div style={{opacity:.8, fontSize:14}}>{g.arrival_time || "—"}</div>
                <div style={{marginTop:4}}>{status}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* placeholders */}
      <section id="logistics" style={{display:"grid", gap:8, paddingTop:16}}>
        <h2 style={styles.h1}>Logistics Setup</h2>
        <div style={{opacity:.7}}>Coming soon.</div>
      </section>
      <section id="resources" style={{display:"grid", gap:8, paddingTop:16}}>
        <h2 style={styles.h1}>Resource Library</h2>
        <div style={{opacity:.7}}>Coming soon.</div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, alert }){
  return (
    <div style={{...styles.metric, borderColor: alert? "#ef4444":"#F2C14E"}}>
      <div style={{fontSize:12, opacity:.75}}>{label}</div>
      <div style={{fontSize:24, fontWeight:600}}>{value}</div>
    </div>
  );
}

function Tile({ href, children, subtitle }){
  return (
    <a href={href} style={styles.tile}>
      <div style={{fontSize:18, fontWeight:500}}>{children}</div>
      {subtitle ? <div style={{opacity:.7, fontSize:14, marginTop:4}}>{subtitle}</div> : null}
    </a>
  );
}

function DataTable({ rows, columns }){
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead><tr>{columns.map((c)=><th key={c} style={styles.th}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} style={{background: i%2 ? "rgba(13,27,42,.2)":"transparent"}}>
              {columns.map((c)=><td key={c} style={styles.td}>{r[c] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 1200, margin: "0 auto", padding: 24, display: "grid", gap: 24, color: "white", background: "#1B263B" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 24, fontWeight: 600, letterSpacing: .25 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 },
  metric: { border: "1px solid #F2C14E", background: "rgba(13,27,42,.4)", borderRadius: 12, padding: 16 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 24 },
  sectionH: { color: "#F2C14E", fontSize: 18, fontWeight: 600 },
  tile: { display:"block", border:"1px solid rgba(242,193,78,.6)", background:"rgba(13,27,42,.4)", borderRadius: 16, padding: 20, textDecoration:"none", color:"inherit" },
  input: { width:"100%", padding:"10px 12px", border:"1px solid rgba(242,193,78,.6)", borderRadius: 12, background:"rgba(13,27,42,.4)", color:"white" },
  tableWrap: { overflowX:"auto", border:"1px solid rgba(242,193,78,.4)", borderRadius: 12 },
  table: { minWidth: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign:"left", padding:"8px 12px", background:"rgba(13,27,42,.6)" },
  td: { padding:"8px 12px" },
  h1: { fontSize: 20, fontWeight: 600 },
  cardGrid: { display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap: 12 },
  card: { border:"1px solid rgba(242,193,78,.5)", background:"rgba(13,27,42,.4)", borderRadius: 12, padding: 12, textAlign:"left" },
  btnGold: { background:"#F2C14E", color:"#111", borderRadius:12, padding:"8px 12px", border:"none", cursor:"pointer", fontSize:14 },
  btnOutline: { background:"transparent", color:"white", borderRadius:12, padding:"8px 12px", border:"1px solid #F2C14E", cursor:"pointer", fontSize:14 },
  select: { background:"transparent", color:"white", borderRadius:8, padding:"6px 8px", border:"1px solid rgba(242,193,78,.6)" },
  incidentForm: { display:"grid", gridTemplateColumns:"repeat(5, minmax(0,1fr))", gap: 8 },
};

