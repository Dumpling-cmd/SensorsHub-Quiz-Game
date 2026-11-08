// PF101 Knowledge Monitor — questions live in questions.js
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const shuffle = a => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const pad = (n, len = 2) => String(n).padStart(len, '0');
const hex = () => Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

const ROUNDS = 10;
const TOPICS = [
  { label: 'Strings', category: 'Sequences and Strings' },
  { label: 'Lists, Tuples, and Sets', category: 'Lists, Tuples, and Sets' },
  { label: 'Functions', category: 'Functions' },
  { label: 'Recursion, Iterators, and Imports', category: 'Recursion, Iterators, and Modules' }
];
const TIME = { Easy: 20, Medium: 15, Hard: 12 };

let game = null, timer = null, mode = 'solo', sound = load('pf101.sound', true), ac = null;

/* ---------- sound ---------- */
function tone(freq, dur = .14) {
  if (!sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(.1, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch {}
}
const showSound = () => $('#snd').textContent = sound ? 'SND ON' : 'SND OFF';
$('#snd').onclick = () => { sound = !sound; save('pf101.sound', sound); showSound(); tone(660); };
showSound();

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#theme').textContent = t === 'dark' ? 'LIGHT' : 'DARK';
}
let stored; try { stored = localStorage.getItem('pf101.theme'); } catch {}
applyTheme(stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
$('#theme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem('pf101.theme', t); } catch {}
};

/* ---------- wall clock ---------- */
const wall = document.querySelector('[data-clock]');
function tickClock() {
  if (!wall) return;
  const d = new Date();
  wall.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
tickClock(); setInterval(tickClock, 1000);

/* ---------- personal bests (one per difficulty) ---------- */
try {
  if (!localStorage.getItem('pf101.bests')) {
    const bs = {};
    load('pf101Scores', []).forEach(x => { const d = x.diff || 'Medium'; bs[d] = Math.max(bs[d] || 0, x.score); });
    save('pf101.bests', bs);
  }
} catch {}

/* ---------- question count ---------- */
const countEl = document.querySelector('[data-count]');
if (countEl) countEl.textContent = pad(QUESTIONS.length);

/* ---------- log ---------- */
function logMsg(text, cls = '') {
  const log = $('#log');
  if (!log) return;
  const d = new Date();
  const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const line = document.createElement('div');
  line.innerHTML = `<span class="t">${stamp}</span><span class="${cls}">${text}</span>`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 40) log.removeChild(log.firstChild);
}

/* ---------- navigation ---------- */
function show(id) {
  clearInterval(timer);
  $('#sheet').hidden = true;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  window.scrollTo(0, 0);
  if (id === 'bank') drawBank('All');
}

function openSetup(m) {
  mode = m;
  $('#s-title').textContent = m === 'solo' ? 'SOLO RUN' : 'DUAL RUN';
  $('#p2').hidden = m === 'solo';
  $('#n2').required = m === 'pvp';
  $('#n1-label').textContent = m === 'solo' ? 'Your name' : 'Player 1 name';
  const b = load('pf101.bests', {}), f = v => v ? pad(v, 4) : '—';
  $('#best').textContent = m === 'pvp'
    ? 'Players take turns on one screen. Questions do not repeat.'
    : `YOUR BEST · EASY ${f(b.Easy)} · MEDIUM ${f(b.Medium)} · HARD ${f(b.Hard)}`;
  updateDifficultyHint();
  show('setup');
}

/* ---------- round building ---------- */
function topicForQuestion(question) {
  const topic = TOPICS.find(item => item.category === question.cat);
  if (!topic) throw new Error(`Question has an unknown topic: ${question.cat}`);
  return topic;
}

function updateDifficultyHint() {
  const difficulty = $('input[name=diff]:checked').value;
  const players = mode === 'pvp' ? 2 : 1;
  const available = QUESTIONS.filter(q => q.d === difficulty).length;
  const rounds = Math.min(ROUNDS, Math.floor(available / players));
  const levelDescription = {
    Easy: 'Easy questions cover the basics.',
    Medium: 'Medium questions ask you to use what you learned.',
    Hard: 'Hard questions take more thought.'
  };
  const roundDescription = rounds === ROUNDS
    ? `Each player gets ${ROUNDS} questions.`
    : `Each player gets ${rounds} questions so no question repeats.`;
  $('#difficulty-hint').textContent = `${levelDescription[difficulty]} ${roundDescription}`;
}

$$('input[name=diff]').forEach(input => input.addEventListener('change', updateDifficultyHint));

function pick(diff, count) {
  const groups = TOPICS.map(topic => shuffle(
    QUESTIONS.filter(q => q.d === diff && q.cat === topic.category)
  ));
  const out = [];
  while (out.length < count) {
    let added = false;
    for (const group of groups) {
      if (group.length && out.length < count) {
        out.push(group.pop());
        added = true;
      }
    }
    if (!added) break;
  }
  return shuffle(out).map(q => ({ ...q, a: shuffle(q.a.map((t, i) => ({ t, ok: i === q.c }))) }));
}

$('#form').onsubmit = e => {
  e.preventDefault();
  const names = [$('#n1').value.trim()];
  if (mode === 'pvp') names.push($('#n2').value.trim());
  if (names.some(n => !n)) return;
  save('pf101.name', names[0]);
  const diff = $('input[name=diff]:checked').value;
  const available = QUESTIONS.filter(q => q.d === diff).length;
  const rounds = Math.min(ROUNDS, Math.floor(available / names.length));

  game = {
    mode, diff, rounds, runId: hex(),
    players: names.map(name => ({ name, score: 0, correct: 0, streak: 0, best: 0, history: [0] })),
    items: pick(diff, names.length * rounds),
    i: 0, log: [], locked: false, left: 0, qStart: 0, deadline: 0
  };

  show('quiz');
  $('#log').innerHTML = '';
  $('#run-id').textContent = game.runId;
  logMsg(`SESSION INIT · ${mode.toUpperCase()} · ${diff.toUpperCase()}`, 'accent');
  render();
};

/* ---------- quiz ---------- */
const current = () => game.players[game.i % game.players.length];

function segsHTML(pi, cur) {
  const mine = game.log.filter(x => x.pi === pi);
  return Array.from({ length: game.rounds }, (_, k) => {
    let cls = '';
    if (mine[k]) cls = mine[k].ok ? 'ok' : 'no';
    else if (k === cur) cls = 'now';
    return `<i class="${cls}"></i>`;
  }).join('');
}

function setClock(left, limit) {
  const el = $('#clock');
  el.innerHTML = `${left.toFixed(1)}<span class="unit">s</span>`;
  el.classList.toggle('low', left <= 5);
  const d = $('#drain');
  d.style.width = (left / limit * 100) + '%';
  d.classList.toggle('low', left <= 5);

  // signal strength: 4 → 0 bars as time depletes
  const sig = Math.max(0, Math.min(4, Math.ceil((left / limit) * 4)));
  const signal = $('#signal');
  if (signal) signal.className = 'signal s' + sig;
}

function animateNumber(el, from, to, dur = 400) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = pad(Math.round(from + (to - from) * eased), 4);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function drawSpark() {
  const spark = $('#score-spark');
  if (!spark) return;
  const p = current();
  const hist = p.history || [0];
  if (hist.length < 2) { spark.innerHTML = ''; return; }

  const w = 100, h = 16, padTop = 2, padBot = 2;
  const max = Math.max(...hist, 1);
  const step = w / (hist.length - 1);

  const points = hist.map((v, i) => {
    const x = i * step;
    const y = h - padBot - (v / max) * (h - padTop - padBot);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = points.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;

  spark.innerHTML = `
    <polyline points="${area}" fill="var(--accent)" fill-opacity="0.12" stroke="none"/>
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
  `;
}

function updateTelemetry(animateScore = false) {
  const n = game.players.length;
  const p = current();
  const round = Math.floor(game.i / n) + 1;

  $('#prog-cur').textContent = pad(round);
  $('#prog-max').textContent = pad(game.rounds);
  $('#prog-bar').style.width = ((round - 1) / game.rounds * 100) + '%';

  $('#streak').textContent = p.streak;
  const sBar = $('#streak-bar');
  sBar.style.width = (Math.min(p.streak / 5, 1) * 100) + '%';
  sBar.style.background = p.streak > 0 ? 'var(--lime)' : '';

  const scoreEl = $('#score');
  const prev = parseInt(scoreEl.textContent, 10) || 0;
  if (animateScore && p.score !== prev) {
    animateNumber(scoreEl, prev, p.score);
  } else {
    scoreEl.textContent = pad(p.score, 4);
  }

  $('#q-num').textContent = pad(round);
  drawSpark();
}

function renderHeader() {
  const n = game.players.length, p = current();
  $('#who').innerHTML = esc(p.name.toUpperCase()) + (p.streak > 1 ? `<em>STREAK ×${p.streak}</em>` : '');
  $('#board').innerHTML = game.players.map((q) =>
    `<span>${n > 1 ? esc(q.name.toUpperCase()) : 'SCORE'} ${pad(q.score, 4)}</span>`
  ).join(' · ');
}

function spawnScorePop(text) {
  const host = $('#who');
  const pop = document.createElement('span');
  pop.className = 'score-pop';
  pop.textContent = text;
  host.style.position = 'relative';
  host.appendChild(pop);
  setTimeout(() => pop.remove(), 1100);
}

function render() {
  clearInterval(timer);
  const q = game.items[game.i];
  const n = game.players.length;
  const limit = TIME[game.diff];

  game.left = limit;
  game.locked = false;
  game.qStart = performance.now();
  game.deadline = game.qStart + limit * 1000;
  $('#sheet').hidden = true;

  $('#cat').textContent = topicForQuestion(q).label.toUpperCase();
  $('#diff').textContent = q.d.toUpperCase();
  $('#q-id').textContent = hex();
  updateTelemetry();

  const qt = $('#qtext');
  qt.textContent = q.q;
  qt.style.animation = 'none';
  void qt.offsetWidth;
  qt.style.animation = '';

  $('#segs').innerHTML = segsHTML(game.i % n, Math.floor(game.i / n));
  $('#answers').innerHTML = q.a.map((a, k) =>
    `<button class="answer" data-k="${k}"><b>${'ABCD'[k]}</b><span>${esc(a.t)}</span></button>`
  ).join('');

  renderHeader();
  setClock(limit, limit);
  logMsg(`SIG ${pad(Math.floor(game.i / n) + 1)} ACQUIRED · ${topicForQuestion(q).label.toUpperCase()}`, '');

  timer = setInterval(() => {
    game.left = Math.max(0, (game.deadline - performance.now()) / 1000);
    setClock(game.left, limit);
    if (game.left <= 0) answer(-1);
  }, 100);
}

function answer(k) {
  if (game.locked) return;
  game.locked = true;
  clearInterval(timer);

  const n = game.players.length;
  const q = game.items[game.i];
  const p = current();
  const ok = k >= 0 && q.a[k].ok;
  game.left = Math.max(0, (game.deadline - performance.now()) / 1000);
  const rt = Math.max(0, (performance.now() - game.qStart) / 1000);

  $$('#answers .answer').forEach((b, j) => {
    b.disabled = true;
    if (q.a[j].ok) b.classList.add('correct');
    else if (j === k) b.classList.add('wrong');
  });

  let head, pts = 0;
  const ch = k >= 0 ? 'ABCD'[k] : '—';

  if (ok) {
    p.streak++; p.correct++; p.best = Math.max(p.best, p.streak);
    const speed = Math.round(game.left) * 5;
    const streak = Math.min(p.streak - 1, 4) * 20;
    pts = 100 + speed + streak;
    p.score += pts;
    tone(660); setTimeout(() => tone(880), 110);
    head = `<strong>✓ CORRECT · +${pts}</strong>
            <small>100 BASE · ${speed} SPEED · ${streak} STREAK · RT ${rt.toFixed(1)}s</small>`;
    logMsg(`CH-${ch} RESPONSE · ✓ CORRECT · +${pts} · RT ${rt.toFixed(1)}s`, 'ok');
  } else {
    p.streak = 0;
    tone(190, .25);
    head = `<strong>${k < 0 ? '✕ TIMEOUT' : '✕ INCORRECT'}</strong>
            <small>ANSWER: ${esc(q.a.find(a => a.ok).t)} · RT ${rt.toFixed(1)}s</small>`;
    logMsg(`CH-${ch} RESPONSE · ✕ ${k < 0 ? 'TIMEOUT' : 'INCORRECT'} · RT ${rt.toFixed(1)}s`, 'bad');
  }

  // record response time into player history for the sparkline
  p.history = p.history || [0];
  p.history.push(p.score);

  game.log.push({ q, who: p.name, pi: game.i % n, ok, picked: k < 0 ? 'no answer' : q.a[k].t, rt });

  $('#feedback').innerHTML = `${head}<span>${esc(q.e)}</span>`;
  $('#sheet').className = 'sheet ' + (ok ? 'ok' : 'no');
  $('#segs').innerHTML = segsHTML(game.i % n, Math.floor(game.i / n));
  updateTelemetry(true);
  renderHeader();

  if (ok) spawnScorePop(`+${pts}`);

  const last = game.i === game.items.length - 1;
  $('#next').textContent = last
    ? 'SESSION REPORT →'
    : n > 1 ? `PASS TO ${game.players[(game.i + 1) % n].name.toUpperCase()} →` : 'NEXT SIGNAL →';

  $('#sheet').hidden = false;
  $('#next').focus();
}

$('#answers').addEventListener('click', e => {
  const b = e.target.closest('.answer');
  if (b) answer(+b.dataset.k);
});

$('#next').onclick = () => {
  game.i++;
  if (game.i >= game.items.length) return results();
  if (game.players.length > 1) {
    $('#h-name').textContent = `${current().name.toUpperCase()}, CHANNEL ACTIVE`;
    $('#h-round').textContent = `ROUND ${pad(Math.floor(game.i / game.players.length) + 1)} / ${pad(game.rounds)}`;
    show('handoff');
    $('#ready').focus();
  } else render();
};

$('#ready').onclick = () => { show('quiz'); render(); };
$('#quit').onclick = () => { if (confirm('Abort session? All progress will be lost.')) show('home'); };

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (!$('#quiz').classList.contains('on') || !game || game.locked) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = 'abcd'.indexOf(e.key.toLowerCase());
  const d = '1234'.indexOf(e.key);
  const idx = k >= 0 ? k : d;
  if (idx >= 0 && idx < game.items[game.i].a.length) answer(idx);
});

/* ---------- results ---------- */
function countUp(el, target, dur = 750) {
  if (!Number.isFinite(target)) return;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = pad(Math.round(target * eased), 4);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function histogramHTML() {
  const log = game.log;
  if (!log.length) return '';

  const w = 100, h = 80;
  const maxRt = Math.max(...log.map(x => x.rt || 0), 1);
  const n = log.length;
  const gap = 0.6;
  const barW = (w - (n - 1) * gap) / n;

  // gridlines
  const grid = [0, .25, .5, .75, 1].map(g =>
    `<line x1="0" y1="${(h * g).toFixed(2)}" x2="${w}" y2="${(h * g).toFixed(2)}" stroke="var(--line)" stroke-width="0.2"/>`
  ).join('');

  // bars
  const bars = log.map((x, i) => {
    const bh = Math.max(((x.rt || 0) / maxRt) * (h - 2), 0.6);
    const x0 = i * (barW + gap);
    const color = x.ok ? 'var(--ok)' : 'var(--bad)';
    return `<rect x="${x0.toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" fill="${color}" opacity="0.85"/>`;
  }).join('');

  return `
    <h3>▸ RESPONSE TIMES</h3>
    <div class="hist-wrap">
      <div class="hist-axis-y"><span>${maxRt.toFixed(1)}s</span><span>0s</span></div>
      <svg class="hist" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${bars}</svg>
      <div class="hist-axis-x"><span>Q1</span><span>Q${log.length}</span></div>
    </div>
  `;
}

function results() {
  const ps = game.players, solo = ps.length === 1;
  let title, stats, badge = '';

  if (solo) {
    const p = ps[0], pct = Math.round(p.correct / game.rounds * 100);
    const bests = load('pf101.bests', {}), prev = bests[game.diff] || 0;
    if (p.score > prev) {
      bests[game.diff] = p.score; save('pf101.bests', bests);
      badge = `<p class="good" style="margin-top:0">${prev ? `▸ NEW PERSONAL BEST ON ${game.diff.toUpperCase()} · +${p.score - prev}` : `▸ FIRST ${game.diff.toUpperCase()} SCORE SAVED`}</p>`;
    } else {
      badge = `<p style="margin-top:0;color:var(--ink-2)">▸ YOUR ${game.diff.toUpperCase()} BEST: ${pad(prev, 4)} · THIS RUN: ${pad(p.score, 4)}</p>`;
    }

    title = pct >= 70 ? 'STABLE READINGS.' : 'PRACTICE RECOMMENDED.';
    stats = `<div class="stats" style="--n:3">
      <div><b data-count="${p.score}">0000</b>SCORE<small>${p.correct}/${game.rounds} SIGNALS</small></div>
      <div><b>${pct}%</b>ACCURACY<small>${p.correct}/${game.rounds} CORRECT</small></div>
      <div><b data-count="${p.best}">00</b>BEST STREAK<small>PEAK CONSISTENCY</small></div>
    </div>`;
  } else {
    const [a, b] = ps;
    const w = a.score === b.score ? null : a.score > b.score ? a : b;
    title = w ? `${w.name.toUpperCase()} WINS.` : 'TIE.';
    stats = `<div class="stats" style="--n:2">${ps.map(p => `
      <div><b data-count="${p.score}">0000</b>${esc(p.name.toUpperCase())}
        <small>${p.correct}/${game.rounds} SIGNALS · STREAK ${p.best}</small>
      </div>`).join('')}</div>`;
  }

  const strips = ps.map((p, k) =>
    `<div class="strip"><span>${esc(p.name.toUpperCase())}</span><div class="segs">${segsHTML(k, -1)}</div></div>`
  ).join('');

  const missed = game.log.filter(x => !x.ok);
  const review = missed.length
    ? '<h3>▸ ANOMALIES DETECTED</h3>' + missed.map(x => `
        <details>
          <summary>${esc(x.q.q)}</summary>
          <p>${solo ? 'You' : esc(x.who)} answered <b>${esc(x.picked)}</b>.
             Correct: <b>${esc(x.q.a.find(a => a.ok).t)}</b>. ${esc(x.q.e)}</p>
        </details>`).join('')
    : '<p class="good" style="margin-top:24px">▸ NO ANOMALIES. CLEAN RUN.</p>';

  $('#r-title').textContent = title;
  $('#r-body').innerHTML = badge + stats + strips + histogramHTML() + review;

  $$('#r-body .stats b[data-count]').forEach(b => {
    const target = parseInt(b.dataset.count, 10);
    if (Number.isFinite(target)) countUp(b, target);
  });

  $('#again').onclick = () => openSetup(game.mode);
  show('results');
}

/* ---------- in-app question bank ---------- */
let bankDifficulty = 'All';

function drawBank(level) {
  bankDifficulty = level;
  const qs = QUESTIONS.filter(q => level === 'All' || q.d === level);
  const bc = $('#bank-count');
  if (bc) bc.innerHTML = `<b>${pad(qs.length)}</b> / ${pad(QUESTIONS.length)}`;
  $('#difficulty-filters').innerHTML = ['All','Easy','Medium','Hard'].map(difficulty =>
    `<button class="${difficulty === level ? 'on' : ''}" data-level="${difficulty}">${difficulty.toUpperCase()}</button>`
  ).join('');
  $('#blist').innerHTML = qs.map(q => `
    <details>
      <summary>${esc(q.q)}<small>${esc(topicForQuestion(q).label)} · ${q.d.toUpperCase()}</small></summary>
      <ol type="A">${q.a.map((a, k) =>
        `<li class="${k === q.c ? 'ok' : ''}">${esc(a)}${k === q.c ? ' ✓' : ''}</li>`
      ).join('')}</ol>
      <p>${esc(q.e)}</p>
    </details>`).join('');
}
$('#difficulty-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-level]');
  if (b) drawBank(b.dataset.level);
});

/* ---------- modal ---------- */
function openModal(kind) {
  if (kind === 'rules') {
    $('#modal-content').innerHTML = `<h2>OPERATOR MANUAL</h2><ul>
      <li>Each player answers up to ${ROUNDS} questions. The chosen difficulty sets how challenging they are.</li>
      <li>Correct response: 100 points + 5 per second remaining in sample window.</li>
      <li>Consecutive correct responses add up to 80 streak bonus points.</li>
      <li>Dual run uses channel switch: two operators, one terminal, no repeated signals.</li>
      <li>Time per question: 20s on Easy, 15s on Medium, 12s on Hard.</li>
      <li>Your best solo score on each level is saved on this device.</li></ul>`;
  }
  $('#modal').classList.add('show');
  $('#modal').setAttribute('aria-hidden', 'false');
}
const closeModal = () => {
  $('#modal').classList.remove('show');
  $('#modal').setAttribute('aria-hidden', 'true');
};
$('#modal-close').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

/* ---------- global click wiring ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-mode],[data-modal]');
  if (!t) return;
  if (t.dataset.go) show(t.dataset.go);
  else if (t.dataset.mode) openSetup(t.dataset.mode);
  else openModal(t.dataset.modal);
});

try { $('#n1').value = JSON.parse(localStorage.getItem('pf101.name')) || ''; } catch {}