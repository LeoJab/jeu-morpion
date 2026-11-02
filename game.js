/* Morpion – ChadGangGames
   Mode : duel en ligne à 2 (salle du hub) + mode « même écran » de secours.
   Classement : victoires (ChadGang.finPartie à la fin de chaque manche). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const EMOJIS = ['😂', '🔥', '😱', '👏', '💀', '🤡'];
  const HUB = !!window.ChadGang;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  let moi = { id: 'local', name: 'Joueur 1', avatar: null };
  let mode = null;            // 'online' | 'local'
  let salle = null, code = '', myId = 'local', players = [];
  let S = null;               // état complet de la partie (versionné)
  let reported = '';          // dernière manche envoyée au classement
  let cells = [];

  /* ================= Sons ================= */
  let actx = null, muted = false;
  try { muted = localStorage.getItem('morpion-mute') === '1'; } catch (e) {}
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, t0, d, type = 'sine', vol = .15, slide) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + t0;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
  }
  const sfx = {
    X: () => tone(520, 0, .12, 'square', .07, 240),
    O: () => tone(300, 0, .18, 'sine', .2, 560),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .09, .28, 'triangle', .18)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * .16, .3, 'sawtooth', .06)),
    draw: () => { tone(330, 0, .2, 'sine', .15); tone(330, .22, .35, 'sine', .15, 250); },
    start: () => { tone(440, 0, .1, 'triangle', .12); tone(660, .1, .18, 'triangle', .12); },
    click: () => tone(700, 0, .05, 'square', .05),
    emo: () => tone(880, 0, .1, 'sine', .1, 1300),
  };
  function syncMute() { $('#mute').textContent = muted ? '🔇' : '🔊'; }
  $('#mute').onclick = () => {
    muted = !muted;
    try { localStorage.setItem('morpion-mute', muted ? '1' : '0'); } catch (e) {}
    syncMute(); sfx.click();
  };
  syncMute();

  /* ================= Effets visuels ================= */
  const fx = $('#fx'), ctx = fx.getContext('2d');
  let parts = [], raf = 0;
  function sizeFx() {
    const d = devicePixelRatio || 1;
    fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  addEventListener('resize', () => { sizeFx(); drawWinLine(true); });
  sizeFx();

  const COLORS = ['#ffd426', '#ff3d6e', '#ffffff', '#2433f2', '#3be8b0'];
  function burst(x, y, n, o = {}) {
    if (calm) n = Math.ceil(n / 4);
    const cols = o.colors || COLORS;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 6) * (.4 + Math.random());
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? .22, life: 1,
        decay: .01 + Math.random() * .014, s: 4 + Math.random() * (o.size || 6), c: cols[i % cols.length],
        rot: Math.random() * 6, vr: (Math.random() - .5) * .4, shape: o.shape || (Math.random() < .5 ? 'r' : 'c'),
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function rain() {
    if (calm) return;
    for (let k = 0; k < 5; k++) setTimeout(() => {
      for (let i = 0; i < 22; i++) parts.push({
        x: Math.random() * innerWidth, y: -10, vx: (Math.random() - .5) * 3, vy: 1 + Math.random() * 3, g: .06,
        life: 1, decay: .005, s: 6 + Math.random() * 6, c: COLORS[i % COLORS.length],
        rot: Math.random() * 6, vr: (Math.random() - .5) * .3, shape: 'r',
      });
      if (!raf) raf = requestAnimationFrame(tick);
    }, k * 250);
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += p.g; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.fillStyle = p.c;
      if (p.shape === 'c') { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, 7); ctx.fill(); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function shake() {
    if (calm) return;
    const s = $('.stage'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
  }
  function flash() {
    if (calm) return;
    const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function banner(text, sub) {
    $('#banner').innerHTML = `<div><b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  }
  function floatEmoji(e) {
    if (!EMOJIS.includes(e)) return;
    sfx.emo();
    const el = document.createElement('div');
    el.className = 'float'; el.textContent = e;
    el.style.left = (15 + Math.random() * 70) + '%';
    el.style.setProperty('--r', (Math.random() * 50 - 25) + 'deg');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }
  function cellCenter(i) {
    const r = cells[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  (function bgSymbols() {
    const bg = $('#bg');
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('i');
      el.textContent = i % 2 ? 'O' : 'X';
      el.style.left = Math.random() * 100 + '%';
      el.style.fontSize = (40 + Math.random() * 90) + 'px';
      el.style.animationDuration = (16 + Math.random() * 22) + 's';
      el.style.animationDelay = (-Math.random() * 30) + 's';
      bg.appendChild(el);
    }
  })();

  /* ================= Plateau ================= */
  const X_SVG = '<svg class="mk x" viewBox="0 0 100 100"><path class="s1" d="M24 24L76 76" pathLength="1"/><path class="s2" d="M76 24L24 76" pathLength="1"/></svg>';
  const O_SVG = '<svg class="mk o" viewBox="0 0 100 100"><circle cx="50" cy="50" r="27" pathLength="1"/></svg>';
  const GHOSTS =
    '<svg class="ghost gx" viewBox="0 0 100 100"><path d="M24 24L76 76M76 24L24 76" stroke="#ff3d6e" stroke-width="15" stroke-linecap="round" fill="none"/></svg>' +
    '<svg class="ghost go" viewBox="0 0 100 100"><circle cx="50" cy="50" r="27" stroke="#2433f2" stroke-width="15" fill="none"/></svg>';
  const coord = i => 'ABC'[i % 3] + (Math.floor(i / 3) + 1);

  const bd = $('#board');
  bd.innerHTML = Array.from({ length: 9 }, (_, i) => `<button class="cell" data-i="${i}" aria-label="Case ${coord(i)}">${GHOSTS}</button>`).join('') +
    '<svg class="winline" id="wl"></svg>';
  cells = [...bd.querySelectorAll('.cell')];
  bd.addEventListener('click', e => {
    const c = e.target.closest('.cell');
    if (c) play(+c.dataset.i);
  });
  // petit effet 3D qui suit la souris
  const stage = $('.stage');
  stage.addEventListener('pointermove', e => {
    if (calm || e.pointerType === 'touch') return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    bd.style.transform = `rotateX(${(-y * 9).toFixed(1)}deg) rotateY(${(x * 9).toFixed(1)}deg)`;
  });
  stage.addEventListener('pointerleave', () => { bd.style.transform = ''; });

  function resetBoard() {
    cells.forEach(c => { c.dataset.m = ''; c.innerHTML = GHOSTS; c.className = 'cell'; });
    $('#wl').innerHTML = ''; $('#banner').innerHTML = '';
    bd.classList.remove('can'); bd.dataset.ghost = '';
  }

  function drawWinLine(instant) {
    const svg = $('#wl');
    if (!S || !S.line) { svg.innerHTML = ''; return; }
    const w = bd.offsetWidth, h = bd.offsetHeight;
    const pts = S.line.map(i => ({ x: cells[i].offsetLeft + cells[i].offsetWidth / 2, y: cells[i].offsetTop + cells[i].offsetHeight / 2 }));
    const a = pts[0], z = pts[2];
    const len = Math.hypot(z.x - a.x, z.y - a.y) || 1, ux = (z.x - a.x) / len, uy = (z.y - a.y) / len, ext = w * .08;
    const at = `x1="${a.x - ux * ext}" y1="${a.y - uy * ext}" x2="${z.x + ux * ext}" y2="${z.y + uy * ext}" pathLength="1"`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<line class="wl bg" ${at}/><line class="wl fg" ${at}/>`;
    svg.classList.toggle('instant', !!instant);
  }

  /* ================= Règles ================= */
  function winnerOf(b) {
    return LINES.find(([x, y, z]) => b[x] && b[x] === b[y] && b[x] === b[z]) || null;
  }
  const sideOf = id => !S ? '' : S.X.id === id ? 'X' : S.O.id === id ? 'O' : '';
  const me = () => mode === 'local' ? (S ? S.turn : '') : sideOf(myId);
  function bothHere() {
    if (!S) return false;
    if (mode === 'local') return true;
    const ids = players.map(p => p.id);
    return ids.includes(S.X.id) && ids.includes(S.O.id);
  }
  const makeGid = (t0, n) => `${code || 'local'}-${t0.toString(36)}-${n}`;
  const seat = p => ({ id: p.id, name: p.name, avatar: p.id === moi.id ? moi.avatar : (p.avatar || null) });

  function newState(px, po) {
    const t0 = Date.now();
    return {
      v: 1, t0, n: 1, gid: makeGid(t0, 1), board: Array(9).fill(''), turn: 'X', first: 'X',
      status: 'play', winner: '', line: null, X: px, O: po,
      score: { X: 0, O: 0, N: 0 }, streak: { side: '', count: 0 }, moves: [],
    };
  }
  // Même résultat chez tous les joueurs (deux clics simultanés ne se contredisent pas).
  function rematchState(p) {
    const first = p.first === 'X' ? 'O' : 'X';
    return Object.assign(clone(p), {
      v: p.v + 1, n: p.n + 1, gid: makeGid(p.t0, p.n + 1), board: Array(9).fill(''),
      turn: first, first, status: 'play', winner: '', line: null, moves: [],
    });
  }

  function play(i) {
    if (!S || S.status !== 'play' || S.board[i]) return;
    const side = me();
    if (!side || side !== S.turn || !bothHere()) return;
    const n = clone(S);
    n.v++; n.board[i] = side; n.moves.push(i);
    const line = winnerOf(n.board);
    if (line) {
      n.status = 'win'; n.winner = side; n.line = line; n.score[side]++;
      n.streak = S.streak.side === side ? { side, count: S.streak.count + 1 } : { side, count: 1 };
    } else if (n.board.every(Boolean)) {
      n.status = 'draw'; n.score.N++; n.streak = { side: '', count: 0 };
    } else {
      n.turn = side === 'X' ? 'O' : 'X';
    }
    commit(n);
  }

  function commit(n) {
    adopt(n);
    if (mode === 'online' && salle) salle.send({ t: 'state', s: n }, { keep: true });
  }
  function adopt(n) {
    if (!n || !Array.isArray(n.board) || n.board.length !== 9 || !n.X || !n.O) return;
    if (S && n.v <= S.v) return;
    const prev = S;
    S = n;
    render(prev);
    report();
  }

  // L'hôte (premier de la liste) lance la partie et remplace un joueur parti.
  function maintain() {
    if (mode !== 'online') return;
    const host = players[0] && players[0].id === myId;
    if (host) {
      if (!S && players.length >= 2) { commit(newState(seat(players[0]), seat(players[1]))); return; }
      if (S) {
        const ids = players.map(p => p.id);
        const gone = ['X', 'O'].filter(s => !ids.includes(S[s].id));
        const free = players.filter(p => p.id !== S.X.id && p.id !== S.O.id);
        if (gone.length && free.length) {
          const n = rematchState(S);
          n[gone[0]] = seat(free[0]);
          n.first = n.turn = 'X';
          n.score = { X: 0, O: 0, N: 0 }; n.streak = { side: '', count: 0 };
          commit(n); return;
        }
      }
    }
    render(S);
  }

  /* ================= Classement du hub ================= */
  function report() {
    if (mode !== 'online' || !HUB || !window.ChadGang.finPartie || !S || S.status === 'play') return;
    const side = sideOf(myId);
    if (!side || reported === S.gid) return;
    reported = S.gid;
    try {
      Promise.resolve(window.ChadGang.finPartie({ gagne: S.winner === side, partie: S.gid }))
        .then(() => setTimeout(refreshLB, 600)).catch(() => {});
    } catch (e) {}
  }
  async function refreshLB() {
    const boxes = [$('#lb1'), $('#lb2')];
    if (!HUB || !window.ChadGang.classement) { boxes.forEach(b => b.classList.add('hidden')); return; }
    try {
      const c = await window.ChadGang.classement();
      const rows = (c.rows || []).slice(0, 5);
      let html = '<h3>🏆 Classement des victoires</h3>';
      if (!rows.length) html += '<p>Personne n’a encore gagné… à toi l’honneur !</p>';
      html += rows.map((r, i) => `<div class="lbrow ${r.you ? 'you' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><em>${esc(r.best)}</em></div>`).join('');
      if (c.me && c.me.rank > rows.length && !rows.some(r => r.you)) {
        html += `<div class="lbrow you"><b>${esc(c.me.rank)}</b><span>${esc(c.me.name || 'Toi')}</span><em>${esc(c.me.best)}</em></div>`;
      }
      boxes.forEach(b => { b.innerHTML = html; b.classList.remove('hidden'); });
    } catch (e) { boxes.forEach(b => b.classList.add('hidden')); }
  }

  /* ================= Affichage ================= */
  const initial = n => (String(n || '?').trim()[0] || '?').toUpperCase();
  function setChip(side, p) {
    const el = $('#pl-' + side);
    const key = p ? `${p.id}|${p.name}|${p.avatar || ''}` : '-';
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const av = p && p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(p ? initial(p.name) : '?');
    el.innerHTML = `<span class="av"${p ? ` data-chadgang-id="${esc(p.id)}"` : ''}>${av}</span>` +
      `<span class="nm">${esc(p ? p.name : 'En attente…')}</span><span class="sym ${side.toLowerCase()}">${side}</span>` +
      '<span class="sc">0</span><span class="fire"></span>';
  }
  function chipState(side, score, active, off, fire) {
    const el = $('#pl-' + side);
    el.classList.toggle('active', active); el.classList.toggle('off', off);
    $('.sc', el).textContent = score; $('.fire', el).textContent = fire;
  }

  function statusText() {
    if (!S) return mode === 'online' ? '⏳ En attente d’un adversaire… envoie-lui le code !' : '';
    const nm = s => S[s].name;
    if (S.status === 'win') {
      const m = mode === 'online' ? sideOf(myId) : '';
      if (m) return m === S.winner ? '🏆 Tu as gagné, GG !' : `💀 ${nm(S.winner)} t’a battu…`;
      return `🏆 ${nm(S.winner)} gagne la manche !`;
    }
    if (S.status === 'draw') return '🤝 Match nul ! Revanche ?';
    if (!bothHere()) {
      const ids = players.map(p => p.id);
      const gone = ['X', 'O'].find(s => !ids.includes(S[s].id));
      return `⏳ ${nm(gone)} est parti… on l’attend`;
    }
    if (mode === 'local') return `Au tour de ${nm(S.turn)} (${S.turn})`;
    const m = sideOf(myId);
    if (!m) return `👀 Tu regardes : au tour de ${nm(S.turn)}`;
    return S.turn === m ? '🔥 À toi de jouer !' : `Au tour de ${nm(S.turn)}…`;
  }

  function render(prev) {
    $('#roomcode').classList.toggle('hidden', mode !== 'online');
    $('#roomcode').textContent = `Salle ${code} 📋`;

    if (!S) {                                   // salle d'attente
      setChip('X', { id: myId, name: moi.name, avatar: moi.avatar });
      setChip('O', null);
      chipState('X', 0, false, false, ''); chipState('O', 0, false, true, '');
      $('#draws').textContent = '';
      $('#status').textContent = statusText();
      $('#btn-rematch').classList.add('hidden');
      $('#history').innerHTML = '';
      return;
    }

    const quiet = prev === null;                // 1re réception (arrivée / rechargement) : pas d'effets
    const sameGame = !!prev && prev.gid === S.gid;
    const newGame = !prev || prev.gid !== S.gid;
    const both = bothHere();
    const here = id => mode === 'local' || players.some(p => p.id === id);

    setChip('X', S.X); setChip('O', S.O);
    ['X', 'O'].forEach(s => chipState(
      s, S.score[s], S.status === 'play' && both && S.turn === s, !here(S[s].id),
      S.streak.side === s && S.streak.count >= 2 ? '🔥' + S.streak.count : ''));
    $('#draws').textContent = S.score.N ? `nuls : ${S.score.N}` : '';

    // cases
    const placed = [];
    bd.classList.toggle('quiet', quiet);
    cells.forEach((c, i) => {
      const m = S.board[i];
      if (c.dataset.m !== m) {
        c.dataset.m = m;
        c.innerHTML = m === 'X' ? X_SVG : m === 'O' ? O_SVG : GHOSTS;
        c.classList.toggle('filled', !!m);
        if (m && sameGame && !quiet) placed.push(i);
      }
      c.classList.toggle('win', !!S.line && S.line.includes(i));
    });
    const can = S.status === 'play' && both && !!me() && me() === S.turn;
    bd.classList.toggle('can', can);
    bd.dataset.ghost = can ? me() : '';

    if (newGame) { $('#wl').innerHTML = ''; $('#banner').innerHTML = ''; }
    if (newGame && !S.moves.length) { banner('C’EST PARTI !', `${S[S.first].name} commence`); sfx.start(); }

    placed.forEach(i => {
      const p = cellCenter(i), m = S.board[i];
      sfx[m]();
      burst(p.x, p.y, 14, { speed: 4, colors: m === 'X' ? ['#ff3d6e', '#ffd426', '#fff'] : ['#2433f2', '#3be8b0', '#fff'] });
    });

    const ended = S.status !== 'play' && !quiet && !(sameGame && prev.status !== 'play') ? true : false;
    if (S.status === 'win') { drawWinLine(!ended); if (ended) winFx(); }
    else if (S.status === 'draw' && ended) drawFx();

    // historique
    $('#history').innerHTML = S.moves.map((m, k) => {
      const side = (k % 2 === 0) === (S.first === 'X') ? 'X' : 'O';
      return `<span class="hm ${side.toLowerCase()}${k === S.moves.length - 1 ? ' last' : ''}"><b>${side}</b> ${coord(m)}</span>`;
    }).join('');

    $('#status').textContent = statusText();
    const seated = mode === 'local' || !!sideOf(myId);
    $('#btn-rematch').classList.toggle('hidden', !(S.status !== 'play' && seated && both));
  }

  function winFx() {
    const w = S.winner;
    const mine = mode === 'online' ? sideOf(myId) : '';
    const lost = !!mine && mine !== w;
    S.line.forEach((i, k) => setTimeout(() => {
      const p = cellCenter(i); burst(p.x, p.y, 36, { speed: 8, size: 8 });
    }, k * 140));
    flash(); shake();
    const sub = S.streak.count >= 2 ? `🔥 Série de ${S.streak.count} victoires` : `${S.X.name} ${S.score.X} – ${S.score.O} ${S.O.name}`;
    if (lost) { sfx.lose(); banner('DÉFAITE…', sub); }
    else {
      sfx.win(); rain();
      banner(mine ? 'VICTOIRE !' : `${S[w].name} GAGNE !`, sub);
    }
  }
  function drawFx() {
    sfx.draw(); shake();
    const r = bd.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 40, { colors: ['#cfcfe0', '#9a98b5', '#ffffff'], shape: 'c', g: -.03, speed: 3, size: 14 });
    banner('ÉGALITÉ !', 'Personne ne cède 🤝');
  }

  /* ================= Écrans, salles ================= */
  function show(which) {
    $('#lobby').classList.toggle('hidden', which !== 'lobby');
    $('#game').classList.toggle('hidden', which !== 'game');
    if (which === 'game') { drawWinLine(true); refreshLB(); }
  }
  const lobbyMsg = t => { $('#lobby-msg').textContent = t || ''; };
  const randomCode = () => {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  };

  function resetAll() {
    S = null; players = []; reported = ''; code = '';
    $('#pl-X').dataset.key = ''; $('#pl-O').dataset.key = '';
    resetBoard();
  }
  function leave() {
    if (salle) { try { salle.leave(); } catch (e) {} }
    salle = null; mode = null; resetAll();
    show('lobby'); refreshLB();
  }

  function enterRoom(c, create) {
    resetAll(); lobbyMsg('');
    code = c; mode = 'online'; myId = moi.id;
    try { salle = window.ChadGang.join(c, { create }); }
    catch (e) { leave(); lobbyMsg('Impossible de rejoindre : ' + (e.message || e)); return; }
    show('game'); render(null);
    salle.on('ready', info => {
      myId = info.me || myId; players = info.players || [];
      const l = info.last;
      if (l) adopt(l.s || (l.board ? l : null));
      maintain();
    });
    salle.on('players', list => { players = list || []; maintain(); });
    salle.on('message', d => {
      if (!d) return;
      if (d.t === 'state') adopt(d.s);
      else if (d.t === 'emo') floatEmoji(d.e);
    });
    salle.on('error', msg => { leave(); lobbyMsg(String(msg || 'Salle introuvable.')); });
  }

  function startLocal() {
    resetAll(); lobbyMsg('');
    mode = 'local'; myId = 'a';
    show('game');
    adopt(newState({ id: 'a', name: HUB ? moi.name : 'Joueur 1' }, { id: 'b', name: 'Joueur 2' }));
  }

  function joinFromInput() {
    const c = $('#code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) { lobbyMsg('Le code fait au moins 4 caractères.'); return; }
    enterRoom(c, false);
  }

  /* ================= Boutons ================= */
  $('#btn-create').onclick = () => { sfx.click(); enterRoom(randomCode(), true); };
  $('#btn-join').onclick = () => { sfx.click(); joinFromInput(); };
  $('#btn-local').onclick = () => { sfx.click(); startLocal(); };
  $('#btn-quit').onclick = () => { sfx.click(); leave(); };
  $('#code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') joinFromInput(); });
  $('#btn-rematch').onclick = () => {
    if (!S || S.status === 'play' || !bothHere()) return;
    sfx.click(); commit(rematchState(S));
  };
  $('#roomcode').onclick = () => {
    const el = $('#roomcode');
    try { navigator.clipboard.writeText(code); el.textContent = 'Code copié ✔'; setTimeout(() => { el.textContent = `Salle ${code} 📋`; }, 1200); } catch (e) {}
  };
  $('#emos').innerHTML = EMOJIS.map(e => `<button class="emo" data-e="${e}">${e}</button>`).join('');
  $('#emos').addEventListener('click', ev => {
    const b = ev.target.closest('.emo'); if (!b) return;
    if (mode === 'online' && salle) salle.send({ t: 'emo', e: b.dataset.e });
    else floatEmoji(b.dataset.e);
  });

  /* ================= Démarrage ================= */
  (async function init() {
    if (!HUB) {
      $('#online-box').classList.add('hidden');
      $('#hello').textContent = 'Hors du hub : seul le mode « même écran » est dispo.';
      $('#lb1').classList.add('hidden');
      return;
    }
    try { moi = await window.ChadGang.me(); myId = moi.id; } catch (e) {}
    $('#hello').textContent = `Salut ${moi.name} 👋 Prêt à aligner trois symboles ?`;
    refreshLB();
    const r = window.ChadGang.room && window.ChadGang.room();
    if (r) {
      const c = String(r).toUpperCase().replace(/[^A-Z0-9]/g, '');
      $('#code').value = c;
      if (c.length >= 4) enterRoom(c, false);
    }
  })();
})();
