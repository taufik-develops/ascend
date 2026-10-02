/* app.js — all browser-side logic.
   Progress (XP, tasks, streak) is saved in localStorage, so it survives refreshes
   but lives only on this device. Swap this for a real database later. */

function esc(s){return String(s ?? '').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------------- rank ladder ---------------- */
const RANKS = [
  { name: 'Kickoff',   xp: 0,     icon: '🚀', note: 'Day one energy.' },
  { name: 'Bronze',    xp: 150,   icon: '🛡️', note: 'First reps in.' },
  { name: 'Silver',    xp: 500,   icon: '⚪', note: 'Momentum building.' },
  { name: 'Gold',      xp: 1200,  icon: '🥇', note: 'Systems clicking.' },
  { name: 'Pro',       xp: 2500,  icon: '💠', note: 'Precision mode on.' },
  { name: 'Elite',     xp: 5000,  icon: '👑', note: 'Consistent execution.' },
  { name: 'Prime',     xp: 9000,  icon: '🔷', note: 'Habits drive culture.' },
  { name: 'Titan',     xp: 15000, icon: '🔵', note: 'Compounding mastery.' },
  { name: 'Mythic',    xp: 25000, icon: '🌀', note: 'OPS-grade rituals.' },
  { name: 'Legendary', xp: 52000, icon: '🏆', note: 'One-year consistency.' }
];

/* ---------------- daily plan template ---------------- */
const PLAN = [
  { id: 'skincare',  slot: 'morning',   title: 'Morning Skincare',        sub: 'Gentle cleanse and moisturize.',        xp: 10 },
  { id: 'water',     slot: 'morning',   title: 'Hydrate',                 sub: 'Drink a full glass of water.',          xp: 5  },
  { id: 'journal',   slot: 'morning',   title: 'Journal: Daily Goals',    sub: 'Set three intentions for today.',       xp: 15 },
  { id: 'social',    slot: 'afternoon', title: 'Social: Casual Chat',     sub: 'Start a conversation with someone.',    xp: 20 },
  { id: 'move',      slot: 'afternoon', title: 'Move for 20 minutes',     sub: 'Walk, lift, stretch — anything.',       xp: 25 },
  { id: 'breathing', slot: 'afternoon', title: 'Deep Breathing',          sub: 'Practice diaphragmatic breathing.',     xp: 10 },
  { id: 'posture',   slot: 'evening',   title: 'Posture Reset',           sub: 'Two minutes against a wall.',           xp: 10 },
  { id: 'reflect',   slot: 'evening',   title: 'Evening Reflection',      sub: 'What went well today?',                 xp: 15 }
];

/* ---------------- saved state ---------------- */
const todayKey = () => new Date().toISOString().slice(0, 10);
const DEFAULT = { xp: 0, scans: 0, streak: 0, lastDay: null, days: {}, week: 1, history: [] };

let state = load();
function load() {
  try {
    const s = { ...DEFAULT, ...JSON.parse(localStorage.getItem('critique') || '{}') };
    // Streak bookkeeping
    const t = todayKey();
    if (s.lastDay && s.lastDay !== t) {
      const gap = (new Date(t) - new Date(s.lastDay)) / 86400000;
      if (gap > 1) s.streak = 0;
    }
    return s;
  } catch { return { ...DEFAULT }; }
}
const save = () => localStorage.setItem('critique', JSON.stringify(state));

function todayTasks() {
  if (!state.days[todayKey()]) state.days[todayKey()] = {};
  return state.days[todayKey()];
}

function addXp(n) {
  if (!n) return;
  const before = rankOf(state.xp).name;
  state.xp += n;
  state.lastDay = todayKey();
  save();
  render();
  const after = rankOf(state.xp).name;
  toast(after !== before ? `🎉 Rank up — ${after}!` : `+${n} XP`);
}

function rankOf(xp) {
  let r = RANKS[0], i = 0;
  RANKS.forEach((rank, idx) => { if (xp >= rank.xp) { r = rank; i = idx; } });
  return { ...r, level: i + 1, index: i };
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 2200);
}

/* ---------------- navigation ---------------- */
$$('.nav-btn').forEach((btn) => {
  btn.onclick = () => {
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.screen').forEach((s) => (s.hidden = s.dataset.screen !== btn.dataset.go));
    window.scrollTo(0, 0);
  };
});

/* ---------------- rendering ---------------- */
function render() {
  const done = todayTasks();
  const total = PLAN.length;
  const count = PLAN.filter((t) => done[t.id]).length;
  const pct = Math.round((count / total) * 100);

  $('#todayDate').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  $('#progressRing').style.setProperty('--pct', pct);
  $('#progressPct').textContent = pct + '%';

  const rank = rankOf(state.xp);
  $('#heroRankIcon').textContent = rank.icon;
  $('#heroRankName').textContent = rank.name;
  $('#heroXp').textContent = state.xp.toLocaleString();
  $('#heroWeek').textContent = 'Week ' + state.week;

  // week dots
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayIdx = new Date().getDay();
  const start = new Date(); start.setDate(start.getDate() - todayIdx);
  $('#weekDots').innerHTML = names.map((n, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const any = state.days[key] && Object.values(state.days[key]).some(Boolean);
    const cls = i === todayIdx ? 'dot today' : any ? 'dot on' : 'dot';
    return `<span class="${cls}">${n}</span>`;
  }).join('');

  // task lists
  ['morning', 'afternoon', 'evening'].forEach((slot) => {
    const el = $('#list' + slot[0].toUpperCase() + slot.slice(1));
    el.innerHTML = '';
    PLAN.filter((t) => t.slot === slot).forEach((t) => {
      const b = document.createElement('button');
      b.className = 'row task' + (done[t.id] ? ' done' : '');
      b.innerHTML = `<span class="check">${done[t.id] ? '✓' : ''}</span>
        <span class="body"><span class="ttl">${t.title}</span>
        <span class="sub">${t.sub}</span></span>
        <span class="chev">+${t.xp} XP</span>`;
      b.onclick = () => {
        const tasks = todayTasks();
        if (tasks[t.id]) { tasks[t.id] = false; state.xp = Math.max(0, state.xp - t.xp); save(); render(); }
        else {
          tasks[t.id] = true;
          if (state.lastDay !== todayKey()) { state.streak += 1; }
          addXp(t.xp);
        }
      };
      el.appendChild(b);
    });
  });

  // ranks screen
  $('#shieldIcon').textContent = rank.icon;
  $('#rankLevelPill').textContent = `LEVEL ${rank.level} • ${rank.name.toUpperCase()}`;
  $('#xpBig').textContent = state.xp.toLocaleString();
  const next = RANKS[rank.index + 1];
  if (next) {
    const span = next.xp - rank.xp;
    const p = Math.min(100, Math.round(((state.xp - rank.xp) / span) * 100));
    $('#xpBar').style.width = p + '%';
    $('#xpToNext').textContent = `${(next.xp - state.xp).toLocaleString()} XP to ${next.name}`;
    $('#xpPct').textContent = p + '%';
  } else {
    $('#xpBar').style.width = '100%';
    $('#xpToNext').textContent = 'Max rank reached';
    $('#xpPct').textContent = '100%';
  }

  $('#ladderList').innerHTML = [...RANKS].reverse().map((r) => {
    const cur = r.name === rank.name;
    const cleared = state.xp >= r.xp && !cur;
    return `<div class="rank-item ${cur ? 'active' : cleared ? '' : 'locked'}">
      <span class="rank-chip">${r.icon}</span>
      <div><div class="rank-name">${r.name}${cur ? ' <small>(Current)</small>' : ''}</div>
      <div class="muted small">${r.note} • ${r.xp.toLocaleString()} XP total</div></div>
      <span class="tag">${cur ? 'Active' : cleared ? 'Cleared' : 'Locked'}</span></div>`;
  }).join('');

  // profile
  $('#pStreak').textContent = state.streak;
  $('#pXp').textContent = state.xp.toLocaleString();
  $('#pScans').textContent = state.scans;
  $('#pRank').textContent = rank.name;
}

$('#exportBtn').onclick = exportBackup;
$('#importInput').onchange = (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); };

$('#resetBtn').onclick = () => {
  if (confirm('Erase all XP, streaks and completed tasks?')) {
    state = { ...DEFAULT }; save(); render(); toast('Progress reset');
  }
};

/* ---------------- feature list (Coach tab) ---------------- */

// Built-in copy of the feature list. The app renders THIS immediately, so the
// Coach tab always works even if the server call fails or the page was cached.
const FALLBACK_SCANNERS = [
  { id: 'physique', label: 'Physique Scan',    emoji: '🏋️', blurb: 'Get personalized feedback on your physique and improvement suggestions' },
  { id: 'food',     label: 'Food Scanner',     emoji: '🥗', blurb: 'Analyze your food to get nutritional information and health insights' },
  { id: 'posture',  label: 'Posture Analysis', emoji: '🧍', blurb: 'Analyze your posture and receive correction guidance' },
  { id: 'outfit',   label: 'Rate My Outfit',   emoji: '👕', blurb: 'Get style feedback and outfit recommendations from a fashion expert' }
];

let SCANNERS = FALLBACK_SCANNERS;

function renderFeatures(scanners) {
  const list = $('#featureList');
  if (!list) return;
  list.innerHTML = '';

  const addRow = (emoji, title, sub, handler) => {
    const b = document.createElement('button');
    b.className = 'row';
    b.innerHTML = `<span class="ico">${emoji}</span><span class="body">
      <span class="ttl">${esc(title)}</span><span class="sub">${esc(sub)}</span></span>
      <span class="chev">›</span>`;
    b.onclick = handler;
    list.appendChild(b);
  };

  scanners.forEach((s) => addRow(s.emoji, s.label, s.blurb, () => openScan(s)));

  addRow('🎙️', 'Voice Coach', 'Practice speaking with a random prompt and get feedback',
    () => $$('.nav-btn').find((b) => b.dataset.go === 'voice').click());

  addRow('💬', 'Chat with Coach', 'Talk through anything on your mind, any time', openChat);
}

// Draw it right away — no waiting on the network.
renderFeatures(SCANNERS);

// Then refresh from the server (keeps it in sync if you edit prompts.js).
fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg.keyConfigured) $('#keyWarning').hidden = false;

    // Brand comes from brand.js on the server — rename there and it updates everywhere.
    if (cfg.brand) {
      const b = cfg.brand;
      document.title = `${b.NAME} — ${b.TAGLINE}`;
      const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      set('#brandName', b.NAME);
      set('#brandTag', b.TAGLINE);
      set('#brandFooter', b.NAME);
      set('#disclaimerText', '⚠️ ' + b.DISCLAIMER);
    }

    if (Array.isArray(cfg.scanners) && cfg.scanners.length) {
      SCANNERS = cfg.scanners;
      renderFeatures(SCANNERS);
    }
  })
  .catch((e) => {
    console.warn('Could not reach /api/config:', e);
    const w = $('#keyWarning');
    w.innerHTML = '<strong>Server unreachable.</strong> The app is showing its built-in menu. ' +
      'Make sure <code>npm start</code> is still running, then refresh.';
    w.hidden = false;
  });

/* ---------------- scanner modal ---------------- */
let activeScanner = null, chosenFile = null;

function openScan(s) {
  activeScanner = s;
  chosenFile = null;
  $('#scanTitle').textContent = `${s.emoji} ${s.label}`;
  $('#scanBlurb').textContent = s.blurb;
  $('#preview').hidden = true;
  $('#dropHint').hidden = false;
  $('#analyzeBtn').disabled = true;
  $('#scanResult').innerHTML = '';
  $('#fileInput').value = '';
  $('#scanModal').hidden = false;
}
$('#scanClose').onclick = () => ($('#scanModal').hidden = true);
$('#dropzone').onclick = () => $('#fileInput').click();

$('#fileInput').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  chosenFile = f;
  const img = $('#preview');
  img.src = URL.createObjectURL(f);
  img.hidden = false;
  $('#dropHint').hidden = true;
  $('#analyzeBtn').disabled = false;
};

$('#analyzeBtn').onclick = async () => {
  if (!chosenFile || !activeScanner) return;
  const out = $('#scanResult');
  out.innerHTML = '<div class="spinner"></div><p class="muted small center">Coach is analysing…</p>';
  $('#analyzeBtn').disabled = true;

  const fd = new FormData();
  fd.append('image', chosenFile);
  try {
    const res = await fetch(`/api/scan/${activeScanner.id}`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) { out.innerHTML = `<div class="err">${data.error || 'Analysis failed.'}</div>`; }
    else {
      out.innerHTML = resultHtml(data);
      state.scans += 1;
      saveToHistory(activeScanner.label, activeScanner.emoji, data);
      addXp(data.xp || 15);
    }
  } catch {
    out.innerHTML = '<div class="err">Network error — is the server still running?</div>';
  }
  $('#analyzeBtn').disabled = false;
};

function resultHtml(d) {
  const stats = (d.stats || []).map((s) => `<div class="chip"><b>${esc(s.label)}</b>${esc(s.value)}</div>`).join('');
  const good = (d.strengths || []).map((s) => `<li class="good">${esc(s)}</li>`).join('');
  const fix = (d.improvements || []).map((s) => `<li class="fix">${esc(s)}</li>`).join('');
  return `<div class="result card">
    <div class="score-head">
      ${d.score != null ? `<div class="score-num">${d.score}</div>` : ''}
      <div><div style="font-weight:700">${esc(d.title || 'Result')}</div>
      <div class="muted small">${esc(d.score_label || '')}</div></div>
    </div>
    <p>${esc(d.summary || '')}</p>
    ${stats ? `<div class="chips">${stats}</div>` : ''}
    ${good ? `<h3>What's working</h3><ul class="points">${good}</ul>` : ''}
    ${fix ? `<h3 style="margin-top:14px">Focus next</h3><ul class="points">${fix}</ul>` : ''}
    <span class="xp-badge">+${d.xp || 15} XP earned</span>
    ${d.provider === 'openrouter'
      ? '<div class="muted small" style="margin-top:10px">⚡ Gemini was busy — analysed by the backup model.</div>'
      : ''}
  </div>`;
}

/* ---------------- chat ---------------- */
const chatHistory = [];
function openChat() {
  $('#chatModal').hidden = false;
  if (!chatHistory.length) {
    pushMsg('bot', "Hey — I'm your coach. What are we working on today?");
    chatHistory.push({ role: 'assistant', content: "Hey — I'm your coach. What are we working on today?" });
  }
  $('#chatInput').focus();
}
$('#chatClose').onclick = () => ($('#chatModal').hidden = true);

function pushMsg(who, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.textContent = text;
  $('#chatLog').appendChild(d);
  $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
  return d;
}

$('#chatForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  pushMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  const bubble = pushMsg('bot', '…');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });
    const data = await res.json();
    bubble.textContent = data.reply || data.error || 'No reply.';
    if (data.reply) chatHistory.push({ role: 'assistant', content: data.reply });
  } catch {
    bubble.textContent = 'Network error — is the server running?';
  }
  $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
};

/* ---------------- scan history ---------------- */
/* Every result is kept so you can scroll back and see whether you're actually
   improving — the whole point of using this on yourself. Capped at 100 so
   localStorage never fills up. */

function saveToHistory(label, emoji, data) {
  if (!state.history) state.history = [];
  state.history.unshift({
    at: Date.now(),
    label,
    emoji,
    score: typeof data.score === 'number' ? data.score : null,
    title: data.title || label,
    summary: data.summary || '',
    improvements: (data.improvements || []).slice(0, 3)
  });
  state.history = state.history.slice(0, 100);
  save();
  renderHistory();
}

function renderHistory() {
  const wrap = $('#historyList');
  if (!wrap) return;
  const h = state.history || [];

  if (!h.length) {
    wrap.innerHTML = '<p class="muted small">No scans yet. Run one from the Coach tab and ' +
      'your results will collect here so you can track progress over time.</p>';
    $('#trendBox').hidden = true;
    return;
  }

  // Trend: compare your average score this week vs the previous one.
  const scored = h.filter((x) => x.score != null);
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = scored.filter((x) => x.at >= weekAgo).map((x) => x.score);
  const older = scored.filter((x) => x.at < weekAgo).map((x) => x.score);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, n) => s + n, 0) / a.length) : null);

  const rNow = avg(recent), rPrev = avg(older);
  const box = $('#trendBox');
  if (rNow != null) {
    box.hidden = false;
    let delta = '';
    if (rPrev != null) {
      const d = rNow - rPrev;
      delta = d === 0 ? 'same as before'
        : d > 0 ? `<span style="color:var(--green)">▲ ${d} vs last week</span>`
                : `<span style="color:var(--gold)">▼ ${Math.abs(d)} vs last week</span>`;
    } else {
      delta = 'first week of data';
    }
    box.innerHTML = `<div class="muted small">7-DAY AVERAGE SCORE</div>
      <div class="xp-big">${rNow}</div><div class="small">${delta}</div>`;
  } else {
    box.hidden = true;
  }

  wrap.innerHTML = h.slice(0, 25).map((x) => {
    const when = new Date(x.at).toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="row" style="cursor:default">
      <span class="ico">${x.emoji || '•'}</span>
      <span class="body"><span class="ttl">${esc(x.label)}${x.score != null ? ` — ${x.score}` : ''}</span>
      <span class="sub">${esc(x.summary || x.title)}</span>
      <span class="sub" style="opacity:.6">${when}</span></span></div>`;
  }).join('');
}

/* ---------------- backup: never lose your progress ---------------- */

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ascend-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (typeof incoming.xp !== 'number') throw new Error('not an Ascend backup');
      state = { ...DEFAULT, ...incoming };
      save();
      render();
      renderHistory();
      toast('Progress restored');
    } catch (e) {
      alert('That file does not look like an Ascend backup.');
    }
  };
  reader.readAsText(file);
}

/* ---------------- modal safety nets ---------------- */
// Make sure nothing is left open on load, whatever the browser restored.
$$('.modal').forEach((m) => (m.hidden = true));

// Esc closes any open modal.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$('.modal').forEach((m) => (m.hidden = true));
});

// Clicking the dark area outside the panel closes it.
$$('.modal').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
});

/* ---------------- voice coach ---------------- */
let recorder = null, chunks = [], timerId = null, seconds = 0;

async function newPrompt() {
  try {
    const r = await fetch('/api/voice/prompt');
    const d = await r.json();
    $('#voicePrompt').textContent = d.prompt;
  } catch { $('#voicePrompt').textContent = 'Describe your perfect Saturday.'; }
}
$('#newPromptBtn').onclick = newPrompt;
newPrompt();

$('#micBtn').onclick = async () => {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }

  if (!navigator.mediaDevices?.getUserMedia) {
    $('#voiceResult').innerHTML = '<div class="err">This browser cannot record audio. Try Chrome.</div>';
    return;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch {
    $('#voiceResult').innerHTML =
      '<div class="err">Microphone permission denied. Note: browsers only allow mic access on localhost or an https:// address.</div>';
    return;
  }

  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(timerId);
    $('#micBtn').classList.remove('rec');
    $('#micBtn').textContent = '🎙️';
    $('#micStatus').textContent = 'Tap to start recording';
    $('#micTimer').hidden = true;

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const out = $('#voiceResult');
    out.innerHTML = '<div class="spinner"></div><p class="muted small center">Listening back…</p>';

    const fd = new FormData();
    fd.append('audio', blob, 'take.webm');
    fd.append('prompt', $('#voicePrompt').textContent);
    try {
      const res = await fetch('/api/voice', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) out.innerHTML = `<div class="err">${data.error || 'Analysis failed.'}</div>`;
      else {
        out.innerHTML = resultHtml(data);
        saveToHistory('Voice Coach', '🎙️', data);
        addXp(data.xp || 20);
      }
    } catch { out.innerHTML = '<div class="err">Network error.</div>'; }
  };

  recorder.start();
  seconds = 0;
  $('#micBtn').classList.add('rec');
  $('#micBtn').textContent = '⏹';
  $('#micStatus').textContent = 'Recording — tap to stop';
  $('#micTimer').hidden = false;
  $('#micTimer').textContent = '0:00';
  timerId = setInterval(() => {
    seconds++;
    $('#micTimer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds >= 90) recorder.stop(); // keep uploads small
  }, 1000);
};

render();
renderHistory();

/* ---------------- installable app (PWA) ---------------- */
// Registers the service worker so Android/desktop offer "Install app".
// Only works over https or localhost — that's a browser rule, not a bug.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW failed:', e));
  });
}
