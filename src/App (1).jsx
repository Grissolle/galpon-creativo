import React, { useState, useEffect, useRef } from "react";
import { Plus, Link as LinkIcon, Image as ImageIcon, LogOut, Eye, EyeOff, Trash2, FolderOpen, LayoutGrid, ShieldCheck, Send, Stamp, Download } from "lucide-react";
import { supabase } from "./supabaseClient";
import { LOGO_URI } from "./logo";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

const ROLES = [
  { id: "admin", label: "Admin / Cuentas", desc: "Crea briefs" },
  { id: "director", label: "Director Creativo", desc: "Depura y aprueba ideas" },
  { id: "equipo", label: "Equipo", desc: "Aporta ideas" },
];
const ESTADOS = ["Pendiente", "En revisión", "Aprobada", "Descartada"];
const ESTADO_COLOR = { "Pendiente": "#9C8B6B", "En revisión": "#F2A900", "Aprobada": "#14173B", "Descartada": "#A83B32" };

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [briefs, setBriefs] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("briefs");
  const [selectedBriefId, setSelectedBriefId] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data || null);
    })();
  }, [session]);

  async function loadData() {
    setLoading(true);
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase.from("briefs").select("*").order("created_at", { ascending: false }),
      supabase.from("ideas").select("*, autor:profiles(nombre)").order("created_at", { ascending: false }),
    ]);
    setBriefs(b || []);
    setIdeas(i || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!profile) return;
    loadData();
    const channel = supabase
      .channel("realtime-galpon")
      .on("postgres_changes", { event: "*", schema: "public", table: "briefs" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, loadData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile]);

  if (!session || !profile) {
    return (
      <>
        <style>{FONTS}</style>
        <AuthGate session={session} onProfileReady={setProfile} showToast={showToast} />
      </>
    );
  }

  return (
    <div style={styles.app}>
      <style>{FONTS}</style>
      <Header profile={profile} view={view} setView={setView} ideas={ideas} briefs={briefs} showToast={showToast} />
      <main style={styles.main}>
        {loading ? (
          <div style={styles.loading}>Cargando mesa de trabajo…</div>
        ) : view === "briefs" ? (
          <BriefsView profile={profile} briefs={briefs} onReload={loadData} onOpenBrief={(id) => { setSelectedBriefId(id); setView("board"); }} showToast={showToast} />
        ) : view === "board" ? (
          <BoardView profile={profile} briefs={briefs} ideas={ideas} onReload={loadData} selectedBriefId={selectedBriefId} setSelectedBriefId={setSelectedBriefId} showToast={showToast} />
        ) : (
          <DirectorPanel briefs={briefs} ideas={ideas} onReload={loadData} showToast={showToast} />
        )}
      </main>
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

/* ---------------- AUTH ---------------- */
function AuthGate({ session, onProfileReady, showToast }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("equipo");
  const [busy, setBusy] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (session) setNeedsProfile(true);
  }, [session]);

  async function handleAuth() {
    setErrorMsg("");
    if (!email.trim() || !password.trim()) return setErrorMsg("Falta correo o contraseña");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setErrorMsg(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setErrorMsg(error.message);
        else showToast("Cuenta creada. Ahora completa tu perfil.");
      }
    } catch (err) {
      setErrorMsg("Error de conexión: " + (err?.message || String(err)));
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!nombre.trim()) return showToast("Escribe tu nombre");
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").insert({ id: userData.user.id, nombre: nombre.trim(), rol });
    setBusy(false);
    if (error) return showToast(error.message);
    const { data } = await supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();
    onProfileReady(data);
  }

  if (session && needsProfile) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginCard}>
          <img src={LOGO_URI} alt="El Galpón Creativo" style={styles.loginLogo} />
          <h1 style={styles.loginTitle}>Completa tu perfil</h1>
          <p style={styles.loginSub}>Ya tienes cuenta. Ahora dinos tu nombre y tu rol dentro de la agencia.</p>
          <label style={styles.label}>Tu nombre</label>
          <input style={styles.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Camila Reyes" />
          <label style={{ ...styles.label, marginTop: 18 }}>Tu rol</label>
          <div style={styles.roleGrid}>
            {ROLES.map((r) => (
              <button key={r.id} onClick={() => setRol(r.id)} style={{ ...styles.roleBtn, ...(rol === r.id ? styles.roleBtnActive : {}) }}>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div style={styles.roleDesc}>{r.desc}</div>
              </button>
            ))}
          </div>
          <button disabled={busy} onClick={saveProfile} style={{ ...styles.primaryBtn, marginTop: 24, width: "100%", justifyContent: "center" }}>
            Entrar a la mesa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginCard}>
        <img src={LOGO_URI} alt="El Galpón Creativo" style={styles.loginLogo} />
        <h1 style={styles.loginTitle}>{mode === "login" ? "Entrar" : "Crear cuenta"}</h1>
        <p style={styles.loginSub}>Acceso solo para el equipo de la agencia.</p>
        <label style={styles.label}>Correo</label>
        <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        <label style={{ ...styles.label, marginTop: 12 }}>Contraseña</label>
        <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <button disabled={busy} onClick={handleAuth} style={{ ...styles.primaryBtn, marginTop: 20, width: "100%", justifyContent: "center" }}>
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
        {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}
        <button onClick={() => setMode(mode === "login" ? "signup" : "login")} style={styles.linkBtn}>
          {mode === "login" ? "¿No tienes cuenta? Créala aquí" : "¿Ya tienes cuenta? Entra aquí"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- HEADER ---------------- */
function Header({ profile, view, setView, ideas, briefs, showToast }) {
  const roleObj = ROLES.find((r) => r.id === profile.rol);
  const tabs = [
    { id: "briefs", label: "Briefs", icon: FolderOpen },
    { id: "board", label: "Tablero de ideas", icon: LayoutGrid },
  ];
  if (profile.rol === "director" || profile.rol === "admin") tabs.push({ id: "director", label: "Panel del director", icon: ShieldCheck });
  const canExport = profile.rol === "admin" || profile.rol === "director";

  async function exportToExcel() {
    try {
      const XLSX = await import("xlsx");
      const briefMap = Object.fromEntries(briefs.map((b) => [b.id, b]));
      const ideasSheet = ideas.map((i) => ({
        Proyecto: briefMap[i.brief_id]?.titulo || "", Idea: i.idea_texto, Link: i.link,
        "Tiene imagen": i.imagen_url ? "Sí" : "No", Estado: i.estado, "Nota del director": i.nota_director,
        "Nombre visible": i.mostrar_nombre ? "Sí" : "No", Fecha: new Date(i.created_at).toLocaleString("es-CO"),
      }));
      const briefsSheet = briefs.map((b) => ({
        Título: b.titulo, Cliente: b.cliente, Descripción: b.descripcion, "Fecha límite": b.fecha_limite,
        "Link al brief": b.link_brief || "", Fecha: new Date(b.created_at).toLocaleString("es-CO"),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ideasSheet), "Ideas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(briefsSheet), "Briefs");
      XLSX.writeFile(wb, `galpon-creativo-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      showToast("No se pudo exportar");
    }
  }

  return (
    <header style={styles.header}>
      <div style={styles.headerLeft}>
        <div style={styles.logoRow}>
          <img src={LOGO_URI} alt="logo" style={styles.logoMark} />
          <div style={styles.logo}>el galpón <span style={{ color: "#D91169" }}>creativo</span></div>
        </div>
      </div>
      <nav style={styles.nav}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ ...styles.navTab, ...(view === t.id ? styles.navTabActive : {}) }}>
            <t.icon size={15} style={{ marginRight: 6 }} />{t.label}
          </button>
        ))}
      </nav>
      <div style={styles.headerRight}>
        {canExport && (
          <button style={styles.exportBtn} onClick={exportToExcel}><Download size={14} /> Exportar</button>
        )}
        <div style={styles.userChip}>
          <div style={styles.userName}>{profile.nombre}</div>
          <div style={styles.userRole}>{roleObj.label}</div>
        </div>
        <button style={styles.logoutBtn} onClick={() => supabase.auth.signOut()} title="Cerrar sesión">
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}

/* ---------------- BRIEFS ---------------- */
function BriefsView({ profile, briefs, onReload, onOpenBrief, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: "", cliente: "", descripcion: "", fecha: "", linkBrief: "" });
  const [busy, setBusy] = useState(false);
  const canCreate = profile.rol === "admin";

  async function submitBrief() {
    if (!form.titulo.trim() || !form.cliente.trim()) return showToast("Falta el título o el cliente");
    setBusy(true);
    const { error } = await supabase.from("briefs").insert({
      titulo: form.titulo.trim(), cliente: form.cliente.trim(), descripcion: form.descripcion,
      fecha_limite: form.fecha || null, link_brief: form.linkBrief || null, creado_por: profile.id,
    });
    setBusy(false);
    if (error) return showToast(error.message);
    setForm({ titulo: "", cliente: "", descripcion: "", fecha: "", linkBrief: "" });
    setShowForm(false);
    showToast("Brief publicado");
    onReload();
  }

  return (
    <div>
      <div style={styles.sectionHead}>
        <div>
          <h2 style={styles.h2}>Briefs activos</h2>
          <p style={styles.sectionSub}>Los proyectos que están entrando a la agencia.</p>
        </div>
        {canCreate && <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Nuevo brief</button>}
      </div>

      {showForm && (
        <div style={styles.folderForm}>
          <div style={styles.formRow2}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Título del proyecto</label>
              <input style={styles.input} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Cliente</label>
              <input style={styles.input} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </div>
          </div>
          <label style={styles.label}>Descripción / objetivo</label>
          <textarea style={styles.textarea} rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          <div style={styles.formRow2}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Fecha límite</label>
              <input type="date" style={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}><LinkIcon size={12} /> Link al brief completo</label>
              <input style={styles.input} value={form.linkBrief} onChange={(e) => setForm({ ...form, linkBrief: e.target.value })} placeholder="https://drive.google.com/…" />
            </div>
          </div>
          <button type="button" disabled={busy} onClick={submitBrief} style={{ ...styles.primaryBtn, marginTop: 4 }}>Publicar brief</button>
        </div>
      )}

      {briefs.length === 0 ? (
        <EmptyState text={canCreate ? "Aún no hay briefs. Crea el primero." : "Todavía no hay briefs publicados."} />
      ) : (
        <div style={styles.folderGrid}>
          {briefs.map((b) => (
            <div key={b.id} style={styles.folderCard} onClick={() => onOpenBrief(b.id)}>
              <div style={styles.folderTab}>{b.cliente}</div>
              <div style={styles.folderTitle}>{b.titulo}</div>
              <div style={styles.folderDesc}>{b.descripcion || "Sin descripción adicional."}</div>
              {b.link_brief && (
                <a href={b.link_brief} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={styles.folderLink}>
                  <LinkIcon size={11} /> Ver brief completo
                </a>
              )}
              <div style={styles.folderMeta}>{b.fecha_limite ? `LÍMITE ${b.fecha_limite}` : "SIN FECHA LÍMITE"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- BOARD ---------------- */
function BoardView({ profile, briefs, ideas, onReload, selectedBriefId, setSelectedBriefId, showToast }) {
  const [form, setForm] = useState({ briefId: selectedBriefId || "", mostrarNombre: false, ideaTexto: "", link: "", imagen: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (selectedBriefId) setForm((f) => ({ ...f, briefId: selectedBriefId })); }, [selectedBriefId]);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1_500_000) return showToast("La imagen es muy pesada. Usa un link en su lugar.");
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imagen: reader.result }));
    reader.readAsDataURL(file);
  }

  async function submitIdea() {
    if (!form.briefId) return showToast("Selecciona a qué proyecto pertenece la idea");
    if (!form.ideaTexto.trim() && !form.link.trim() && !form.imagen) return showToast("Agrega al menos texto, un link o una imagen");
    setBusy(true);
    const { error } = await supabase.from("ideas").insert({
      brief_id: form.briefId, autor_id: profile.id, mostrar_nombre: form.mostrarNombre,
      idea_texto: form.ideaTexto.trim(), link: form.link.trim(), imagen_url: form.imagen, estado: "Pendiente",
    });
    setBusy(false);
    if (error) return showToast(error.message);
    setForm({ briefId: form.briefId, mostrarNombre: false, ideaTexto: "", link: "", imagen: "" });
    if (fileRef.current) fileRef.current.value = "";
    showToast("Idea enviada a la mesa");
    onReload();
  }

  const filtered = selectedBriefId ? ideas.filter((i) => i.brief_id === selectedBriefId) : ideas;
  const briefMap = Object.fromEntries(briefs.map((b) => [b.id, b]));

  return (
    <div>
      <div style={styles.sectionHead}>
        <div>
          <h2 style={styles.h2}>Tablero de ideas</h2>
          <p style={styles.sectionSub}>Cada quien aporta lo que se le ocurra. Nombre visible es opcional.</p>
          {selectedBriefId && (
            <button type="button" onClick={() => setSelectedBriefId(null)} style={styles.backLink}>
              ← Ver todos los proyectos
            </button>
          )}
        </div>
        <select style={styles.select} value={selectedBriefId || ""} onChange={(e) => setSelectedBriefId(e.target.value || null)}>
          <option value="">Todos los proyectos</option>
          {briefs.map((b) => <option key={b.id} value={b.id}>{b.titulo}</option>)}
        </select>
      </div>

      <div style={styles.ideaForm}>
        <div style={styles.ideaFormTitle}><Send size={14} /> Aportar una idea</div>
        <div style={styles.formRow2}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Proyecto</label>
            <select style={styles.select} value={form.briefId} onChange={(e) => setForm({ ...form, briefId: e.target.value })}>
              <option value="">Selecciona un proyecto…</option>
              {briefs.map((b) => <option key={b.id} value={b.id}>{b.titulo}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={form.mostrarNombre} onChange={(e) => setForm({ ...form, mostrarNombre: e.target.checked })} />
              Mostrar mi nombre ({profile.nombre}) en el tablero
            </label>
          </div>
        </div>
        <label style={styles.label}>Idea</label>
        <textarea style={styles.textarea} rows={3} value={form.ideaTexto} onChange={(e) => setForm({ ...form, ideaTexto: e.target.value })} />
        <div style={styles.formRow2}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}><LinkIcon size={12} /> Link de referencia</label>
            <input style={styles.input} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}><ImageIcon size={12} /> Imagen (opcional, &lt;1.5MB)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={styles.fileInput} />
          </div>
        </div>
        {form.imagen && <img src={form.imagen} alt="preview" style={styles.imgPreview} />}
        <button type="button" disabled={busy} onClick={submitIdea} style={{ ...styles.primaryBtn, marginTop: 6 }}>Enviar idea</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Todavía no hay ideas para este proyecto. Sé el primero." />
      ) : (
        <div style={styles.cardGrid}>
          {filtered.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} brief={briefMap[idea.brief_id]} showAuthorName={idea.mostrar_nombre || profile.rol === "director" || profile.rol === "admin"} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, brief, showAuthorName, footer }) {
  return (
    <div style={styles.ideaCard}>
      <div style={styles.tape} />
      {brief && <div style={styles.ideaCardBrief}>{brief.titulo}</div>}
      {idea.idea_texto && <p style={styles.ideaCardText}>{idea.idea_texto}</p>}
      {idea.imagen_url && <img src={idea.imagen_url} alt="" style={styles.ideaCardImg} />}
      {idea.link && <a href={idea.link} target="_blank" rel="noreferrer" style={styles.ideaCardLink}><LinkIcon size={12} /> {idea.link}</a>}
      <div style={styles.ideaCardFooter}>
        <span style={showAuthorName ? styles.authorName : styles.stampAnon}>
          {showAuthorName ? idea.autor?.nombre || "—" : (<><Stamp size={11} /> Anónimo</>)}
        </span>
        {footer}
      </div>
    </div>
  );
}

/* ---------------- DIRECTOR ---------------- */
function DirectorPanel({ briefs, ideas, onReload, showToast }) {
  const briefMap = Object.fromEntries(briefs.map((b) => [b.id, b]));
  const [filterBrief, setFilterBrief] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

  async function updateIdea(id, patch) {
    const { error } = await supabase.from("ideas").update(patch).eq("id", id);
    if (error) return showToast(error.message);
    onReload();
  }
  async function deleteIdea(id) {
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) return showToast(error.message);
    onReload();
  }

  const filtered = ideas.filter((i) => (!filterBrief || i.brief_id === filterBrief) && (!filterEstado || i.estado === filterEstado));

  return (
    <div>
      <div style={styles.sectionHead}>
        <div>
          <h2 style={styles.h2}>Panel del director</h2>
          <p style={styles.sectionSub}>Aquí siempre se ve quién escribió cada idea.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select style={styles.select} value={filterBrief} onChange={(e) => setFilterBrief(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {briefs.map((b) => <option key={b.id} value={b.id}>{b.titulo}</option>)}
          </select>
          <select style={styles.select} value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState text="No hay ideas que coincidan con este filtro." /> : (
        <div style={styles.cardGrid}>
          {filtered.map((idea) => (
            <div key={idea.id} style={styles.ideaCard}>
              <div style={{ ...styles.tape, background: ESTADO_COLOR[idea.estado] }} />
              {briefMap[idea.brief_id] && <div style={styles.ideaCardBrief}>{briefMap[idea.brief_id].titulo}</div>}
              {idea.idea_texto && <p style={styles.ideaCardText}>{idea.idea_texto}</p>}
              {idea.imagen_url && <img src={idea.imagen_url} alt="" style={styles.ideaCardImg} />}
              {idea.link && <a href={idea.link} target="_blank" rel="noreferrer" style={styles.ideaCardLink}><LinkIcon size={12} /> {idea.link}</a>}
              <div style={styles.directorAuthorRow}>
                {idea.mostrar_nombre ? <Eye size={12} /> : <EyeOff size={12} />}
                <b>{idea.autor?.nombre || "…"}</b>
                <span style={{ opacity: 0.55 }}>{idea.mostrar_nombre ? "(visible)" : "(anónima en tablero)"}</span>
              </div>
              <select style={{ ...styles.select, marginTop: 8 }} value={idea.estado} onChange={(e) => updateIdea(idea.id, { estado: e.target.value })}>
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <textarea style={{ ...styles.textarea, marginTop: 8 }} rows={2} placeholder="Nota interna…" defaultValue={idea.nota_director} onBlur={(e) => updateIdea(idea.id, { nota_director: e.target.value })} />
              <button style={styles.deleteBtn} onClick={() => deleteIdea(idea.id)}><Trash2 size={13} /> Eliminar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) { return <div style={styles.empty}>{text}</div>; }

/* ---------------- STYLES ---------------- */
const paper = "#EDE6D6", card = "#F7F3EA", ink = "#1C2521", teal = "#14173B", mustard = "#D91169", stampRed = "#A83B32", line = "#D9CFB8";

const styles = {
  app: { minHeight: "100vh", background: paper, color: ink, fontFamily: "'IBM Plex Sans', sans-serif" },
  loading: { padding: 60, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", color: teal, fontSize: 13 },
  loginWrap: { minHeight: "100vh", background: teal, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  loginCard: { background: card, borderRadius: 4, padding: "36px 32px", width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", textAlign: "center" },
  loginLogo: { width: 76, height: 76, borderRadius: 10, marginBottom: 14 },
  loginTitle: { fontFamily: "'Fraunces', serif", fontSize: 26, margin: "4px 0 6px", textAlign: "left" },
  loginSub: { fontSize: 13, lineHeight: 1.5, color: "#5B564A", marginBottom: 20, textAlign: "left" },
  label: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 0.5, color: "#6B6553", marginBottom: 6, textAlign: "left", textTransform: "uppercase" },
  input: { width: "100%", padding: "10px 12px", border: `1px solid ${line}`, borderRadius: 3, background: "#fff", fontSize: 14.5, boxSizing: "border-box", color: ink },
  textarea: { width: "100%", padding: "10px 12px", border: `1px solid ${line}`, borderRadius: 3, background: "#fff", fontSize: 14, boxSizing: "border-box", resize: "vertical", color: ink },
  select: { padding: "9px 10px", border: `1px solid ${line}`, borderRadius: 3, background: "#fff", fontSize: 13.5, color: ink },
  fileInput: { fontSize: 12.5, width: "100%" },
  roleGrid: { display: "grid", gap: 8 },
  roleBtn: { textAlign: "left", padding: "10px 14px", border: `1px solid ${line}`, borderRadius: 3, background: "#fff", cursor: "pointer" },
  roleBtnActive: { borderColor: teal, background: "#EAF1EF", boxShadow: `inset 3px 0 0 ${teal}` },
  roleDesc: { fontSize: 12, color: "#7A7462", marginTop: 2 },
  primaryBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: mustard, color: "#fff", border: "none", padding: "10px 18px", borderRadius: 3, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  linkBtn: { marginTop: 14, background: "none", border: "none", color: teal, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" },
  errorBox: { marginTop: 12, padding: "10px 12px", background: "#FBE9E7", border: `1px solid ${stampRed}`, color: stampRed, borderRadius: 3, fontSize: 12.5, textAlign: "left" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${line}`, background: card, flexWrap: "wrap", gap: 12 },
  headerLeft: { display: "flex", flexDirection: "column" },
  logoRow: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { width: 34, height: 34, borderRadius: 6, objectFit: "cover", boxShadow: `0 0 0 1px ${line}` },
  logo: { fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 600 },
  nav: { display: "flex", gap: 4 },
  navTab: { display: "flex", alignItems: "center", padding: "8px 12px", background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "#6B6553", fontSize: 13.5, cursor: "pointer" },
  navTabActive: { color: teal, borderBottom: `2px solid ${teal}`, fontWeight: 600 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  userChip: { textAlign: "right" },
  userName: { fontSize: 13.5, fontWeight: 600 },
  userRole: { fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", color: teal },
  logoutBtn: { background: "transparent", border: `1px solid ${line}`, borderRadius: 3, padding: "8px 9px", cursor: "pointer", color: "#6B6553" },
  exportBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${teal}`, color: teal, borderRadius: 3, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  main: { maxWidth: 1080, margin: "0 auto", padding: "32px 24px 80px" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14, marginBottom: 22 },
  h2: { fontFamily: "'Fraunces', serif", fontSize: 26, margin: 0 },
  sectionSub: { fontSize: 13, color: "#6B6553", marginTop: 4 },
  backLink: { background: "none", border: "none", color: "#14173B", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 8, display: "block" },
  folderForm: { background: card, border: `1px solid ${line}`, borderRadius: 4, padding: 20, marginBottom: 24 },
  formRow2: { display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" },
  folderGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 },
  folderCard: { textAlign: "left", background: card, border: `1px solid ${line}`, borderRadius: "2px 10px 4px 4px", padding: "18px 16px 14px", cursor: "pointer", position: "relative" },
  folderTab: { position: "absolute", top: -11, left: 16, background: teal, color: "#fff", fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace", padding: "4px 9px", borderRadius: "2px 2px 0 0" },
  folderTitle: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: "8px 0 6px" },
  folderDesc: { fontSize: 12.5, color: "#6B6553", lineHeight: 1.4, minHeight: 34 },
  folderLink: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: teal, textDecoration: "none", marginTop: 8, fontWeight: 600 },
  folderMeta: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: mustard, marginTop: 10 },
  ideaForm: { background: card, border: `1px solid ${line}`, borderRadius: 4, padding: 20, marginBottom: 26 },
  ideaFormTitle: { display: "flex", alignItems: "center", gap: 7, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: teal, marginBottom: 14, textTransform: "uppercase" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#5B564A" },
  imgPreview: { maxWidth: 160, borderRadius: 3, border: `1px solid ${line}`, marginBottom: 12, display: "block" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 },
  ideaCard: { position: "relative", background: card, border: `1px solid ${line}`, borderRadius: 3, padding: "18px 16px 14px", boxShadow: "1px 2px 6px rgba(0,0,0,0.05)" },
  tape: { position: "absolute", top: -8, left: "50%", transform: "translateX(-50%) rotate(-2deg)", width: 46, height: 14, background: mustard, opacity: 0.85, borderRadius: 1 },
  ideaCardBrief: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: teal, marginBottom: 8, textTransform: "uppercase" },
  ideaCardText: { fontSize: 14, lineHeight: 1.5, margin: "0 0 10px" },
  ideaCardImg: { width: "100%", borderRadius: 3, marginBottom: 10, display: "block" },
  ideaCardLink: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: teal, textDecoration: "none", marginBottom: 10, wordBreak: "break-all" },
  ideaCardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px dashed ${line}`, paddingTop: 10, marginTop: 4 },
  authorName: { fontSize: 12, fontWeight: 600 },
  stampAnon: { display: "flex", alignItems: "center", gap: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: stampRed, border: `1px solid ${stampRed}`, borderRadius: 2, padding: "2px 6px" },
  directorAuthorRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, borderTop: `1px dashed ${line}`, paddingTop: 10, marginTop: 4 },
  deleteBtn: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, background: "transparent", border: `1px solid ${stampRed}`, color: stampRed, borderRadius: 3, padding: "6px 10px", fontSize: 12, cursor: "pointer" },
  empty: { textAlign: "center", padding: "50px 20px", color: "#8A8368", fontSize: 13.5, border: `1px dashed ${line}`, borderRadius: 4 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: ink, color: paper, padding: "10px 18px", borderRadius: 4, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" },
};
