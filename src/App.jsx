import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const PAL = [
  { a: "#2563EB", bg: "#DBEAFE", soft: "#EFF6FF", dark: "#1E40AF" },
  { a: "#DB2777", bg: "#FCE7F3", soft: "#FDF2F8", dark: "#9D174D" },
  { a: "#7C3AED", bg: "#EDE9FE", soft: "#F5F3FF", dark: "#5B21B6" },
  { a: "#D97706", bg: "#FEF3C7", soft: "#FFFBEB", dark: "#92400E" },
];

const CHORE_LIST = [
  { name: "Make bed", amt: 0.25 },
  { name: "Clean room", amt: 1.00 },
  { name: "Set table", amt: 0.50 },
  { name: "Empty trash", amt: 0.75 },
  { name: "Unload dishwasher", amt: 0.75 },
  { name: "Feed pet", amt: 0.50 },
  { name: "Help w/ laundry", amt: 1.50 },
  { name: "Vacuum", amt: 2.00 },
  { name: "Sweep", amt: 1.00 },
  { name: "Yard work", amt: 5.00 },
  { name: "Wash car", amt: 3.00 },
  { name: "Wipe counters", amt: 0.50 },
];

const DEFAULT_DATA = {
  kids: [
    { id: 1, name: "Kid 1", emoji: "🦁", pi: 0, age: 9, balance: 0, goals: [], txns: [], chores: [] },
    { id: 2, name: "Kid 2", emoji: "🦋", pi: 1, age: 8, balance: 0, goals: [], txns: [], chores: [] },
    { id: 3, name: "Kid 3", emoji: "🌸", pi: 2, age: 6, balance: 0, goals: [], txns: [], chores: [] },
    { id: 4, name: "Kid 4", emoji: "🐻", pi: 3, age: 5, balance: 0, goals: [], txns: [], chores: [] },
  ],
  pin: null,
};

const FAMILY_DOC = "shared/family-data";

const $$ = (n) => `$${Number(n || 0).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Numpad({ value, onChange, onSubmit, error }) {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "⌫"];
  const press = (k) => {
    if (k === null) return;
    if (k === "⌫") { onChange((v) => v.slice(0, -1)); return; }
    if (value.length >= 4) return;
    const next = value + k;
    onChange(next);
    if (next.length === 4) setTimeout(() => onSubmit(next), 100);
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: error ? 10 : 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: value.length > i ? "#1F2937" : "#E5E7EB", transition: "background 0.12s" }} />
        ))}
      </div>
      {error && <div style={{ textAlign: "center", color: "#DC2626", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Wrong PIN — try again</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => press(k)} style={{
            background: k === null ? "transparent" : k === "⌫" ? "#F3F4F6" : "white",
            border: k === null ? "none" : "2px solid #E5E7EB",
            borderRadius: 14, padding: "18px 0",
            fontFamily: "'Fredoka One', cursive", fontSize: 22, color: "#1F2937",
            cursor: k === null ? "default" : "pointer",
            boxShadow: k !== null && k !== "⌫" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
          }}>
            {k === null ? "" : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, pal, btn, children }) {
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 16, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: 18, color: "#1F2937" }}>{title}</span>
        {btn && <button onClick={btn.fn} style={{ background: pal.bg, color: pal.dark, border: "none", borderRadius: 10, padding: "6px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{btn.label}</button>}
      </div>
      {children}
    </div>
  );
}

export default function FamilyBank() {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // ── App state ─────────────────────────────────────────────────────────────
  const [data, setData] = useState(DEFAULT_DATA);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [screen, setScreen] = useState("dash");
  const [kidId, setKidId] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [pm, setPm] = useState(false);

  const [pinModal, setPinModal] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinTemp, setPinTemp] = useState("");
  const [pinError, setPinError] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Listen for data changes from Firestore (live sync!)
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, FAMILY_DOC);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      } else {
        setDoc(ref, DEFAULT_DATA);
      }
      setDataLoaded(true);
    });
  }, [user]);

  const save = async (d) => {
    setData(d);
    try { await setDoc(doc(db, FAMILY_DOC), d); } catch (e) { console.error(e); }
  };

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError(""); setAuthBusy(true);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPass);
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPass);
      }
    } catch (e) {
      const msg = e.code === "auth/wrong-password" || e.code === "auth/invalid-credential" ? "Wrong email or password"
        : e.code === "auth/user-not-found" ? "No account with that email"
        : e.code === "auth/email-already-in-use" ? "Email already registered — try Sign In"
        : e.code === "auth/weak-password" ? "Password must be at least 6 characters"
        : e.code === "auth/invalid-email" ? "That doesn't look like a valid email"
        : "Something went wrong — try again";
      setAuthError(msg);
    }
    setAuthBusy(false);
  };

  const handleSignOut = async () => { await signOut(auth); setPm(false); };

  // ── PIN logic ─────────────────────────────────────────────────────────────
  const openParentMode = () => {
    setPinInput(""); setPinError(false);
    setPinModal(data.pin ? "enter" : "set");
  };
  const lockApp = () => { setPm(false); setModal(null); };

  const handlePinSubmit = (val) => {
    if (pinModal === "enter" || pinModal === "change-verify") {
      if (val === data.pin) {
        setPinError(false);
        if (pinModal === "change-verify") { setPinInput(""); setPinModal("change-new"); }
        else { setPinModal(null); setPm(true); }
      } else { setPinError(true); setPinInput(""); }
    } else if (pinModal === "set" || pinModal === "change-new") {
      setPinTemp(val); setPinInput(""); setPinError(false);
      setPinModal(pinModal === "set" ? "set2" : "change-new2");
    } else if (pinModal === "set2" || pinModal === "change-new2") {
      if (val === pinTemp) {
        save({ ...data, pin: val });
        setPinModal(null);
        if (pinModal === "set2") setPm(true);
      } else { setPinError(true); setPinInput(""); }
    }
  };

  const kid = data.kids.find((k) => k.id === kidId);
  const pal = kid ? PAL[kid.pi] : PAL[0];
  const updateKid = (id, fn) => save({ ...data, kids: data.kids.map((k) => (k.id === id ? fn(k) : k)) });
  const addTxn = (k, amt, desc, type) => ({
    ...k,
    balance: +(k.balance + (type === "in" ? amt : -amt)).toFixed(2),
    txns: [{ id: uid(), date: today(), desc, amt, type }, ...k.txns].slice(0, 50),
  });

  const doDeposit = () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    updateKid(kidId, (k) => {
      let nk = addTxn(k, amt, form.desc || "Deposit", "in");
      if (form.gid) nk = { ...nk, goals: nk.goals.map((g) => (g.id === form.gid ? { ...g, saved: +Math.min(g.saved + amt, g.target).toFixed(2) } : g)) };
      return nk;
    });
    setModal(null); setForm({});
  };
  const doWithdraw = () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0 || amt > kid.balance) return;
    updateKid(kidId, (k) => addTxn(k, amt, form.desc || "Withdrawal", "out"));
    setModal(null); setForm({});
  };
  const doGoal = () => {
    if (!form.gname || !parseFloat(form.gtarget)) return;
    updateKid(kidId, (k) => ({ ...k, goals: [...k.goals, { id: uid(), name: form.gname, target: parseFloat(form.gtarget), saved: 0 }] }));
    setModal(null); setForm({});
  };
  const doChore = () => {
    if (!form.cname || !parseFloat(form.camt)) return;
    updateKid(kidId, (k) => ({ ...k, chores: [...k.chores, { id: uid(), name: form.cname, amount: parseFloat(form.camt) }] }));
    setModal(null); setForm({});
  };
  const doRename = () => {
    if (!form.rname) return;
    updateKid(kidId, (k) => ({ ...k, name: form.rname, emoji: form.remoji || k.emoji }));
    setModal(null); setForm({});
  };
  const earnChore = (c) => updateKid(kidId, (k) => addTxn(k, c.amount, `✅ ${c.name}`, "in"));
  const delGoal = (gid) => updateKid(kidId, (k) => ({ ...k, goals: k.goals.filter((g) => g.id !== gid) }));
  const delChore = (cid) => updateKid(kidId, (k) => ({ ...k, chores: k.chores.filter((c) => c.id !== cid) }));

  const GF = `@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');`;
  const wrap = { background: "#FFFDF0", minHeight: "100vh", fontFamily: "'Nunito', sans-serif", maxWidth: 480, margin: "0 auto" };

  // ── LOADING SCREEN ─────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <style>{GF}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏦</div>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 22, color: "#1E40AF" }}>Family Bank</div>
          <div style={{ color: "#6B7280", fontSize: 13, marginTop: 8 }}>Loading...</div>
        </div>
      </div>
    );
  }

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minHeight: "100vh" }}>
        <style>{GF}</style>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🏦</div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 30, color: "#1E40AF" }}>Family Bank</div>
            <div style={{ color: "#6B7280", fontSize: 13, marginTop: 4 }}>{authMode === "signup" ? "Create your family account" : "Sign in to continue"}</div>
          </div>
          <input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
            style={{ width: "100%", border: "2px solid #DBEAFE", borderRadius: 12, padding: "14px 16px", fontSize: 16, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
          <input type="password" placeholder="Password (6+ characters)" value={authPass} onChange={(e) => setAuthPass(e.target.value)}
            style={{ width: "100%", border: "2px solid #DBEAFE", borderRadius: 12, padding: "14px 16px", fontSize: 16, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none", marginBottom: 16, boxSizing: "border-box" }} />
          {authError && <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>{authError}</div>}
          <button onClick={handleAuth} disabled={authBusy || !authEmail || !authPass}
            style={{ width: "100%", background: authBusy ? "#9CA3AF" : "#1E40AF", color: "white", border: "none", borderRadius: 14, padding: 16, fontFamily: "'Fredoka One', cursive", fontSize: 18, cursor: "pointer", marginBottom: 14 }}>
            {authBusy ? "..." : authMode === "signup" ? "Create Account" : "Sign In"}
          </button>
          <button onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); }}
            style={{ width: "100%", background: "transparent", color: "#1E40AF", border: "none", padding: 8, fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {authMode === "signup" ? "Already have an account? Sign In" : "Need an account? Create one"}
          </button>
          <div style={{ marginTop: 24, fontSize: 11, color: "#9CA3AF", textAlign: "center", lineHeight: 1.6 }}>
            All adults in your family use the same email & password<br />OR each person creates their own account.<br />Either way, you all see the same data.
          </div>
        </div>
      </div>
    );
  }

  // ── DATA LOADING ──────────────────────────────────────────────────────────
  if (!dataLoaded) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <style>{GF}</style>
        <div style={{ textAlign: "center", color: "#6B7280" }}>Loading family data...</div>
      </div>
    );
  }

  const PIN_TITLE = { enter: "🔐 Enter PIN", set: "🔑 Create a PIN", set2: "🔑 Confirm PIN", "change-verify": "Current PIN", "change-new": "🔑 New PIN", "change-new2": "🔑 Confirm New PIN" };
  const PIN_SUB = { enter: "Enter your 4-digit parent PIN", set: "Choose a PIN — share it with adults only", set2: "Re-enter to confirm", "change-verify": "Verify your current PIN first", "change-new": "Choose your new 4-digit PIN", "change-new2": "Re-enter new PIN to confirm" };

  const PinOverlay = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }}>
      <div style={{ background: "white", borderRadius: 28, padding: "32px 28px 36px", width: "100%", maxWidth: 340, position: "relative" }}>
        <button onClick={() => { setPinModal(null); setPinInput(""); setPinError(false); }} style={{ position: "absolute", top: 14, right: 18, background: "none", border: "none", fontSize: 24, color: "#9CA3AF", cursor: "pointer" }}>×</button>
        <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 6, textAlign: "center" }}>{PIN_TITLE[pinModal]}</div>
        <div style={{ fontSize: 13, color: "#6B7280", fontWeight: 600, textAlign: "center", marginBottom: 28 }}>{PIN_SUB[pinModal]}</div>
        <Numpad value={pinInput} onChange={setPinInput} onSubmit={handlePinSubmit} error={pinError} />
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  if (screen === "dash") {
    const total = data.kids.reduce((s, k) => s + k.balance, 0);
    return (
      <div style={wrap}>
        <style>{GF}</style>
        <div style={{ background: "linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)", padding: "28px 20px 40px", color: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 26 }}>🏦 Family Bank</div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>{user.email}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {pm
                ? <button onClick={lockApp} style={{ background: "rgba(255,255,255,0.3)", border: "1.5px solid rgba(255,255,255,0.5)", borderRadius: 20, padding: "7px 13px", color: "white", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 800, cursor: "pointer" }}>🔓 Lock</button>
                : <button onClick={openParentMode} style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "7px 13px", color: "white", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 800, cursor: "pointer" }}>🔐 Parent</button>
              }
              <button onClick={handleSignOut} style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "7px 13px", color: "white", fontSize: 12, fontFamily: "'Nunito', sans-serif", fontWeight: 800, cursor: "pointer" }}>↩</button>
            </div>
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Total saved</div>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 44 }}>{$$(total)}</div>
        </div>

        <div style={{ padding: "20px 16px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {data.kids.map((k) => {
            const kp = PAL[k.pi];
            const tg = k.goals[0];
            const pct = tg ? Math.min(100, Math.round((tg.saved / tg.target) * 100)) : 0;
            return (
              <div key={k.id} onClick={() => { setKidId(k.id); setScreen("kid"); }}
                style={{ background: kp.bg, borderRadius: 22, padding: "16px 14px 18px", cursor: "pointer", border: `2px solid ${kp.a}20`, boxShadow: "0 3px 14px rgba(0,0,0,0.07)", userSelect: "none" }}>
                <div style={{ fontSize: 38, marginBottom: 8 }}>{k.emoji}</div>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 19, color: kp.dark }}>{k.name}</div>
                <div style={{ fontSize: 11, color: kp.a, fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>Age {k.age}</div>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 26, color: kp.dark, marginBottom: tg ? 10 : 0 }}>{$$(k.balance)}</div>
                {tg && <>
                  <div style={{ fontSize: 10, color: kp.a, fontWeight: 800, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase" }}>🎯 {tg.name}</div>
                  <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 99, height: 7, overflow: "hidden" }}>
                    <div style={{ background: kp.a, height: "100%", width: `${pct}%`, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: kp.dark, marginTop: 3, fontWeight: 700 }}>{pct}% · {$$(tg.saved)} of {$$(tg.target)}</div>
                </>}
              </div>
            );
          })}
        </div>

        {!pm && (
          <div style={{ margin: "12px 16px 24px", background: "#FFF7ED", borderRadius: 16, padding: "14px 16px", border: "1px solid #FED7AA" }}>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 14, color: "#92400E", marginBottom: 4 }}>👀 View Only Mode</div>
            <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.7 }}>Tap 🔐 Parent and enter your PIN to make changes. ☁️ Live synced across all devices.</div>
          </div>
        )}
        {pinModal && <PinOverlay />}
      </div>
    );
  }

  // ── KID VIEW ──────────────────────────────────────────────────────────────
  if (screen === "kid" && kid) {
    const inp = { width: "100%", border: `2px solid ${pal.bg}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, fontFamily: "'Nunito', sans-serif", fontWeight: 600, outline: "none", marginBottom: 12, boxSizing: "border-box", color: "#1F2937" };
    const bigBtn = (bg) => ({ width: "100%", background: bg, color: "white", border: "none", borderRadius: 14, padding: 16, fontFamily: "'Fredoka One', cursive", fontSize: 20, cursor: "pointer" });

    return (
      <div style={wrap}>
        <style>{GF}</style>
        <div style={{ background: `linear-gradient(135deg, ${pal.dark} 0%, ${pal.a} 100%)`, padding: "20px 20px 48px", color: "white" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            <button onClick={() => setScreen("dash")} style={{ background: "rgba(255,255,255,0.22)", border: "none", borderRadius: 12, padding: "8px 14px", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}>← Back</button>
            {pm && <button onClick={() => { setForm({ rname: kid.name, remoji: kid.emoji }); setModal("rename"); }} style={{ background: "rgba(255,255,255,0.22)", border: "none", borderRadius: 12, padding: "8px 14px", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}>✏️ Edit</button>}
            {pm && <button onClick={() => { setPinInput(""); setPinError(false); setPinModal("change-verify"); }} style={{ background: "rgba(255,255,255,0.22)", border: "none", borderRadius: 12, padding: "8px 14px", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}>🔑 PIN</button>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 56 }}>{kid.emoji}</div>
            <div>
              <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 30 }}>{kid.name}</div>
              <div style={{ opacity: 0.75, fontSize: 14, fontWeight: 600 }}>Age {kid.age}</div>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 18, padding: "14px 20px", display: "inline-block" }}>
            <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Saved</div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 38 }}>{$$(kid.balance)}</div>
          </div>
        </div>

        <div style={{ padding: "0 16px 80px", marginTop: -28 }}>
          {pm && (
            <div style={{ background: "white", borderRadius: 20, padding: 16, marginBottom: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setForm({}); setModal("deposit"); }} style={{ background: pal.a, color: "white", border: "none", borderRadius: 14, padding: 14, fontFamily: "'Fredoka One', cursive", fontSize: 17, cursor: "pointer" }}>💰 Add Money</button>
              <button onClick={() => { setForm({}); setModal("withdraw"); }} style={{ background: pal.bg, color: pal.dark, border: `2px solid ${pal.a}44`, borderRadius: 14, padding: 14, fontFamily: "'Fredoka One', cursive", fontSize: 17, cursor: "pointer" }}>💸 Approve Spend</button>
            </div>
          )}

          <Section title="🎯 Savings Goals" pal={pal} btn={pm ? { label: "+ Add Goal", fn: () => { setForm({}); setModal("goal"); } } : null}>
            {kid.goals.length === 0
              ? <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>No goals yet — add something to save for!</div>
              : kid.goals.map((g) => {
                  const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
                  return (
                    <div key={g.id} style={{ background: pal.soft, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, color: pal.dark, fontSize: 15 }}>{g.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: pal.a, fontWeight: 800 }}>{$$(g.saved)} / {$$(g.target)}</span>
                          {pm && <button onClick={() => delGoal(g.id)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9CA3AF", lineHeight: 1 }}>×</button>}
                        </div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.65)", borderRadius: 99, height: 10, overflow: "hidden" }}>
                        <div style={{ background: pct === 100 ? "#10B981" : pal.a, height: "100%", width: `${pct}%`, borderRadius: 99, transition: "width 0.4s" }} />
                      </div>
                      <div style={{ fontSize: 12, color: pct === 100 ? "#059669" : pal.dark, marginTop: 5, fontWeight: 700 }}>
                        {pct === 100 ? "🎉 Goal reached!" : `${pct}% · ${$$(Math.max(0, +(g.target - g.saved).toFixed(2)))} to go`}
                      </div>
                    </div>
                  );
                })}
          </Section>

          <Section title="⭐ Chore Board" pal={pal} btn={pm ? { label: "+ Add Chore", fn: () => { setForm({}); setModal("chore"); } } : null}>
            {kid.chores.length === 0
              ? <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>No chores set up yet — add tasks to earn money!</div>
              : kid.chores.map((c) => (
                  <div key={c.id} style={{ background: pal.soft, borderRadius: 14, padding: "12px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800, color: pal.dark, fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: pal.a, fontWeight: 800 }}>Earn {$$(c.amount)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {pm && <button onClick={() => earnChore(c)} style={{ background: "#10B981", color: "white", border: "none", borderRadius: 10, padding: "8px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✓ Done!</button>}
                      {pm && <button onClick={() => delChore(c.id)} style={{ background: "none", border: "none", fontSize: 18, color: "#D1D5DB", cursor: "pointer" }}>×</button>}
                    </div>
                  </div>
                ))}
          </Section>

          <Section title="📋 History" pal={pal}>
            {kid.txns.length === 0
              ? <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>No transactions yet.</div>
              : kid.txns.slice(0, 15).map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${pal.bg}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{t.desc}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{t.date}</div>
                    </div>
                    <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16, color: t.type === "in" ? "#059669" : "#DC2626" }}>
                      {t.type === "in" ? "+" : "−"}{$$(t.amt)}
                    </div>
                  </div>
                ))}
          </Section>
        </div>

        {modal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setModal(null)}>
            <div style={{ background: "white", borderRadius: "24px 24px 0 0", padding: "28px 20px 48px", width: "100%", maxWidth: 480, position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setModal(null)} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", fontSize: 26, color: "#9CA3AF", cursor: "pointer", lineHeight: 1 }}>×</button>

              {modal === "deposit" && <>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 20 }}>💰 Add Money</div>
                <input style={inp} type="number" min="0.01" step="0.25" placeholder="Amount ($)" value={form.amount || ""} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                <input style={inp} type="text" placeholder="Reason (Allowance, Birthday...)" value={form.desc || ""} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} />
                {kid.goals.length > 0 && <>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Apply to a goal?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setForm((f) => ({ ...f, gid: null }))} style={{ background: !form.gid ? pal.a : pal.bg, color: !form.gid ? "white" : pal.dark, border: "none", borderRadius: 10, padding: "6px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>None</button>
                    {kid.goals.map((g) => <button key={g.id} onClick={() => setForm((f) => ({ ...f, gid: g.id }))} style={{ background: form.gid === g.id ? pal.a : pal.bg, color: form.gid === g.id ? "white" : pal.dark, border: "none", borderRadius: 10, padding: "6px 12px", fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{g.name}</button>)}
                  </div>
                </>}
                <button onClick={doDeposit} style={bigBtn(pal.a)}>Add {form.amount ? $$(+form.amount) : "Money"} →</button>
              </>}

              {modal === "withdraw" && <>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 20 }}>💸 Approve Purchase</div>
                <div style={{ background: pal.bg, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontFamily: "'Fredoka One', cursive", fontSize: 15, color: pal.dark }}>Available: {$$(kid.balance)}</div>
                <input style={inp} type="number" min="0.01" step="0.25" placeholder="Amount ($)" value={form.amount || ""} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                <input style={inp} type="text" placeholder="What are they buying?" value={form.desc || ""} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} />
                <button onClick={doWithdraw} style={bigBtn(form.amount && +form.amount <= kid.balance ? "#DC2626" : "#D1D5DB")}>Approve {form.amount ? $$(+form.amount) : ""} →</button>
              </>}

              {modal === "goal" && <>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 20 }}>🎯 New Savings Goal</div>
                <input style={inp} type="text" placeholder="Goal name (e.g. LEGO Set, Bike)" value={form.gname || ""} onChange={(e) => setForm((f) => ({ ...f, gname: e.target.value }))} />
                <input style={inp} type="number" min="1" step="1" placeholder="Target amount ($)" value={form.gtarget || ""} onChange={(e) => setForm((f) => ({ ...f, gtarget: e.target.value }))} />
                <button onClick={doGoal} style={bigBtn(pal.a)}>Set Goal →</button>
              </>}

              {modal === "chore" && <>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 16 }}>⭐ Add a Chore</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6B7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Quick picks:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                  {CHORE_LIST.map((c) => (
                    <button key={c.name} onClick={() => setForm((f) => ({ ...f, cname: c.name, camt: String(c.amt) }))}
                      style={{ background: form.cname === c.name ? pal.a : pal.bg, color: form.cname === c.name ? "white" : pal.dark, border: "none", borderRadius: 10, padding: "5px 10px", fontSize: 11, fontFamily: "'Nunito', sans-serif", fontWeight: 800, cursor: "pointer" }}>
                      {c.name} {$$(c.amt)}
                    </button>
                  ))}
                </div>
                <input style={inp} type="text" placeholder="Chore name" value={form.cname || ""} onChange={(e) => setForm((f) => ({ ...f, cname: e.target.value }))} />
                <input style={inp} type="number" min="0.01" step="0.25" placeholder="Pay amount ($)" value={form.camt || ""} onChange={(e) => setForm((f) => ({ ...f, camt: e.target.value }))} />
                <button onClick={doChore} style={bigBtn(pal.a)}>Add Chore →</button>
              </>}

              {modal === "rename" && <>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#1F2937", marginBottom: 20 }}>✏️ Edit Name & Emoji</div>
                <input style={inp} type="text" placeholder="Name" value={form.rname || ""} onChange={(e) => setForm((f) => ({ ...f, rname: e.target.value }))} />
                <input style={inp} type="text" placeholder="Emoji (e.g. 🦊 🐯 🐸 🦄)" value={form.remoji || ""} onChange={(e) => setForm((f) => ({ ...f, remoji: e.target.value }))} />
                <button onClick={doRename} style={bigBtn(pal.a)}>Save →</button>
              </>}
            </div>
          </div>
        )}

        {pinModal && <PinOverlay />}
      </div>
    );
  }

  return null;
}
