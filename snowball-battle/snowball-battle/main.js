/* main.js – מסכים, חדרים (2–3 שחקנים) וחיבור בין הממשק למשחק */
(function () {
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#eab308', '#14b8a6'];
  const MAX_PLAYERS = 3;
  const $ = (id) => document.getElementById(id);
  const rid = () => Math.random().toString(36).slice(2, 10);
  const cleanName = (n) => String(n || 'שחקן').slice(0, 12);

  const S = {
    me: { id: rid(), name: '', color: COLORS[0] },
    role: null, code: null, joinedAt: 0,
    players: [],      // מי שבחדר עכשיו
    roster: null,     // מי שמשחק בסיבוב הנוכחי
    inMatch: false, matchBusy: false, isHost: false
  };

  try {
    S.me.name = localStorage.getItem('sb-name') || '';
    const c = localStorage.getItem('sb-color'); if (COLORS.includes(c)) S.me.color = c;
  } catch (e) {}

  /* ---------- כלים למסכים ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.body.classList.toggle('playing', id === 'game');
  }
  function overlay(html) {
    const o = $('overlay');
    if (!html) { o.classList.remove('active'); o.innerHTML = ''; return; }
    o.innerHTML = html; o.classList.add('active');
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- UI שהמשחק קורא לו ---------- */
  window.UI = {
    setScores(scores) {
      (S.roster || []).forEach(p => {
        const card = document.querySelector('.pcard[data-id="' + p.id + '"]');
        if (!card) return;
        const n = scores[p.id];
        card.classList.toggle('gone', n == null);
        [...card.querySelector('.pips').children].forEach((pip, i) => pip.classList.toggle('on', i < (n || 0)));
      });
    },
    countdown(txt) {
      const e = $('countdown');
      e.textContent = txt; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
    },
    setPower(p) {
      const e = $('power');
      if (!p) { e.classList.remove('show'); return; }
      const names = { big: 'כדור ענק', triple: 'זריקה משולשת', shield: 'מגן קרח פעיל' };
      e.querySelector('.ptext').textContent = names[p.type] + (p.n ? ' × ' + p.n : '');
      e.dataset.type = p.type; e.classList.add('show');
    },
    showHint() {
      if (UI._hinted) return; UI._hinted = true;
      const h = $('hint'); h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 6500);
    },
    showWin(iWon, winnerName, scores) {
      overlay(`
        <div class="card win-card ${iWon ? 'won' : 'lost'}">
          <div class="trophy">${iWon ? '🏆' : '⛄'}</div>
          <h2>${iWon ? 'ניצחת!' : 'הפעם הניצחון של <span class="wname"></span>'}</h2>
          <ol class="ranking" id="ranking"></ol>
          <div class="btns">
            <button class="btn primary" id="btn-again">עוד סיבוב</button>
            <button class="btn ghost" id="btn-exit">יציאה לתפריט</button>
          </div>
          <p class="msg" id="again-msg"></p>
        </div>`);
      const wn = document.querySelector('.wname'); if (wn) wn.textContent = winnerName;
      const list = (S.roster || []).filter(p => scores[p.id] != null).sort((a, b) => scores[b.id] - scores[a.id]);
      list.forEach(p => {
        const li = el('li', p.id === S.me.id ? 'mine' : '');
        li.style.setProperty('--c', p.color);
        li.append(el('span', 'dot'), el('span', 'rname', p.name), el('span', 'rscore', scores[p.id]));
        $('ranking').appendChild(li);
      });
      $('btn-again').onclick = () => {
        Sfx.click();
        if (S.players.length < 2) return toast('אין עוד שחקנים בחדר');
        if (S.isHost) startMatch();
        else { Net.send('rematch', {}); $('btn-again').disabled = true; $('again-msg').textContent = 'ממתינים לשאר השחקנים…'; }
      };
      $('btn-exit').onclick = () => { Sfx.click(); leaveRoom(); };
    }
  };

  /* ---------- מסך פתיחה ---------- */
  const nameInput = $('name'), codeInput = $('code');
  nameInput.value = S.me.name;
  const colorsEl = $('colors');
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c', c);
    b.setAttribute('aria-label', 'צבע ' + c);
    b.onclick = () => { S.me.color = c; Sfx.unlock(); Sfx.click(); markColor(); };
    colorsEl.appendChild(b);
  });
  function markColor() {
    [...colorsEl.children].forEach((b, i) => b.classList.toggle('sel', COLORS[i] === S.me.color));
  }
  markColor();

  const params = new URLSearchParams(location.search);
  const urlRoom = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
  if (urlRoom.length === 4) { codeInput.value = urlRoom; $('join-hint').textContent = 'קיבלת הזמנה לחדר ' + urlRoom + ' – רק לכתוב שם וללחוץ "הצטרפות"'; }
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4); });

  function readName() {
    const n = nameInput.value.trim().slice(0, 12);
    if (!n) { $('home-msg').textContent = 'רגע, איך קוראים לך? 🙂'; nameInput.focus(); return null; }
    S.me.name = n;
    try { localStorage.setItem('sb-name', n); localStorage.setItem('sb-color', S.me.color); } catch (e) {}
    return n;
  }

  const cfg = window.SUPABASE_CONFIG;
  const configured = cfg && cfg.url && cfg.url.indexOf('YOUR-') === -1 && window.supabase;
  if (!configured) $('home-msg').textContent = 'חסר חיבור ל-Supabase (קובץ config.js). צריך להשלים אותו לפני שמשחקים.';
  else { Net.init(cfg); Net.watchLobby(renderRooms); }

  /* ---------- רשימת החדרים הפתוחים בדף הפתיחה ---------- */
  function renderRooms(rooms) {
    const ul = $('rooms');
    ul.innerHTML = '';
    const list = rooms.filter(r => r.code !== S.code).sort((a, b) => (a.t || 0) - (b.t || 0));
    if (!list.length) {
      ul.appendChild(el('li', 'rooms-empty', 'אין כרגע חדרים פתוחים – אפשר ליצור אחד! ⛄'));
      return;
    }
    list.forEach(r => {
      const n = Math.max(1, Math.min(MAX_PLAYERS, +r.n || 1));
      const full = n >= MAX_PLAYERS;
      const li = el('li');
      li.style.setProperty('--c', COLORS.includes(r.color) ? r.color : COLORS[1]);
      const info = el('span', 'rinfo');
      info.append(el('span', 'rhost', 'החדר של ' + cleanName(r.host)));
      const meta = el('span', 'rmeta' + (r.playing ? ' busy' : ''),
        n + '/' + MAX_PLAYERS + ' שחקנים · קוד ' + r.code + (r.playing ? ' · באמצע משחק' : ''));
      info.append(meta);
      const btn = el('button', 'btn' + (full ? '' : ' primary'), full ? 'מלא' : 'הצטרפות');
      btn.type = 'button';
      btn.disabled = full;
      btn.onclick = () => {
        Sfx.unlock(); Sfx.click();
        if (!readName()) return;
        enterRoom(r.code, 'guest');
      };
      li.append(el('span', 'dot'), info, btn);
      ul.appendChild(li);
    });
  }

  // מי שפתח את החדר מודיע עליו ברשימה של כולם
  function announceRoom() {
    if (!configured) return;
    if (S.code && S.isHost) {
      Net.announce({
        code: S.code, host: cleanName(S.me.name), color: S.me.color,
        n: Math.max(1, S.players.length), playing: !!S.inMatch, t: S.joinedAt
      });
    } else Net.unannounce();
  }

  $('btn-create').onclick = () => {
    Sfx.unlock(); Sfx.click();
    if (!configured || !readName()) return;
    enterRoom(String(1000 + Math.floor(Math.random() * 9000)), 'host');
  };
  $('btn-join').onclick = () => {
    Sfx.unlock(); Sfx.click();
    if (!configured || !readName()) return;
    const code = codeInput.value;
    if (code.length !== 4) { $('home-msg').textContent = 'קוד החדר הוא 4 ספרות'; codeInput.focus(); return; }
    enterRoom(code, 'guest');
  };
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });

  /* ---------- חדר ---------- */
  function enterRoom(code, role) {
    $('home-msg').textContent = '';
    Object.assign(S, { code, role, players: [], roster: null, inMatch: false, matchBusy: false, isHost: false, joinedAt: Date.now() });
    $('room-code').textContent = code;
    $('wait-title').textContent = role === 'host' ? 'החדר שלך מוכן!' : 'נכנסים לחדר ' + code;
    $('btn-copy').hidden = !/^https?:/.test(location.protocol);
    renderLobby();
    show('waiting');
    Sfx.startMusic();
    Net.join(code, { id: S.me.id, name: S.me.name, color: S.me.color, role, joinedAt: S.joinedAt }, {
      onPlayers, onMessage,
      onError: () => toast('יש בעיה בחיבור. כדאי לבדוק את האינטרנט ולנסות שוב.')
    });
  }

  function computeHost(list) {
    const h = list.find(p => p.role === 'host') || list[0];
    return h ? h.id : null;
  }

  function onPlayers(list) {
    if (list.length > MAX_PLAYERS) {
      const idx = list.findIndex(p => p.id === S.me.id);
      if (idx >= MAX_PLAYERS) { leaveRoom(); $('home-msg').textContent = 'החדר ' + S.code + ' כבר מלא (יש בו ' + MAX_PLAYERS + ' שחקנים)'; return; }
      list = list.slice(0, MAX_PLAYERS);
    }
    const before = S.players.map(p => p.id);
    const now = list.map(p => p.id);
    S.players = list;

    const wasHost = S.isHost;
    S.isHost = computeHost(list) === S.me.id;
    if (S.isHost && !wasHost && S.inMatch) { Arena.setHost(true); }

    // מי נכנס / מי יצא
    list.filter(p => !before.includes(p.id) && p.id !== S.me.id).forEach(p => {
      if (before.length) toast('👋 ' + cleanName(p.name) + ' נכנסו לחדר');
      if (S.isHost && S.roster && !S.roster.some(r => r.id === p.id)) Net.send('busy', {});
    });
    before.filter(id => !now.includes(id)).forEach(id => {
      const r = S.roster && S.roster.find(x => x.id === id);
      if (r && S.inMatch) {
        toast(r.name + ' כבר לא במשחק');
        Arena.removePlayer(id);
      }
    });

    if (S.inMatch) {
      const stillHere = S.roster.filter(r => now.includes(r.id));
      if (stillHere.length < 2) endMatchAlone();
    }
    renderLobby();
    announceRoom();
  }

  function renderLobby() {
    const ul = $('plist');
    ul.innerHTML = '';
    S.players.forEach(p => {
      const li = el('li', p.id === S.me.id ? 'mine' : '');
      li.style.setProperty('--c', p.color);
      li.append(el('span', 'dot'), el('span', 'rname', cleanName(p.name) + (p.id === S.me.id ? ' (אני)' : '')));
      if (p.id === computeHost(S.players)) li.append(el('span', 'badge', '👑 פותח/ת החדר'));
      ul.appendChild(li);
    });
    for (let i = S.players.length; i < MAX_PLAYERS; i++) ul.appendChild(el('li', 'empty', 'מקום פנוי…'));

    const n = S.players.length, start = $('btn-start');
    start.hidden = !S.isHost;
    start.disabled = n < 2;
    start.textContent = n < 2 ? 'צריך לפחות 2 שחקנים' : 'התחלת משחק (' + n + ' שחקנים)';
    let sub;
    if (S.matchBusy && !S.inMatch) sub = 'יש משחק באמצע – תיכנסו בסיבוב הבא 🙂';
    else if (S.isHost) sub = n < 2 ? 'החדר מופיע עכשיו אצל כולם בדף הפתיחה – החברים פשוט לוחצים "הצטרפות" (עד 3 שחקנים)' : 'כשכולם בפנים – לוחצים "התחלת משחק"';
    else sub = n < 2 ? 'ממתינים לשחקנים נוספים…' : 'ממתינים להתחלת המשחק…';
    $('wait-sub').textContent = sub;
  }

  /* המארח מתחיל סיבוב עם כל מי שבחדר */
  function startMatch() {
    if (!S.isHost || S.players.length < 2) return;
    const used = [];
    const roster = S.players.slice(0, MAX_PLAYERS).map(p => {
      let color = COLORS.includes(p.color) ? p.color : COLORS[0];
      if (used.includes(color)) color = COLORS.find(c => !used.includes(c));
      used.push(color);
      return { id: p.id, name: cleanName(p.name), color };
    });
    Net.send('start', { r: roster });
    beginMatch(roster);
  }

  function beginMatch(roster) {
    overlay(null);
    S.roster = roster;
    if (!roster.some(r => r.id === S.me.id)) {
      // לא חלק מהסיבוב הזה – מחכים לבא
      S.inMatch = false; S.matchBusy = true; Arena.stop(); show('waiting'); renderLobby();
      return;
    }
    S.inMatch = true; S.matchBusy = true;
    Arena.setupMatch({
      roster: roster.map(r => ({ id: r.id, name: r.name, colorNum: parseInt(r.color.slice(1), 16) })),
      meId: S.me.id, isHost: S.isHost, send: Net.send
    });
    buildHud(roster);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    show('game');
    Arena.startRound();
    announceRoom();
  }

  function buildHud(roster) {
    const hud = $('hud');
    hud.innerHTML = '';
    const mine = roster.filter(r => r.id === S.me.id), rest = roster.filter(r => r.id !== S.me.id);
    mine.concat(rest).forEach((r, i) => {
      const card = el('div', 'pcard' + (r.id === S.me.id ? ' me' : ''));
      card.dataset.id = r.id; card.style.setProperty('--c', r.color);
      const pips = el('span', 'pips');
      for (let k = 0; k < 5; k++) pips.appendChild(el('i'));
      card.append(el('span', 'dot'), el('span', 'pname', r.name), pips);
      hud.appendChild(card);
      if (i === 0) hud.appendChild(el('div', 'goal', 'ראשון ל-5 מנצח'));
    });
  }

  function endMatchAlone() {
    S.inMatch = false; S.matchBusy = false; S.roster = null;
    Arena.stop();
    announceRoom();
    overlay(`
      <div class="card">
        <div class="trophy">🔌</div>
        <h2>נשארת לבד בחדר</h2>
        <p class="sub">שאר השחקנים יצאו. אפשר לחכות בחדר ${S.code} שמישהו יצטרף, או לחזור לתפריט.</p>
        <div class="btns">
          <button class="btn primary" id="btn-wait">לחכות בחדר</button>
          <button class="btn ghost" id="btn-exit2">יציאה לתפריט</button>
        </div>
      </div>`);
    $('btn-wait').onclick = () => { overlay(null); show('waiting'); renderLobby(); };
    $('btn-exit2').onclick = () => leaveRoom();
  }

  function onMessage(type, d, from) {
    if (type === 'start') {
      const r = Array.isArray(d.r) ? d.r.slice(0, MAX_PLAYERS).filter(x => x && typeof x.id === 'string' && /^#[0-9a-f]{6}$/i.test(x.color)).map(x => ({ id: x.id, name: cleanName(x.name), color: x.color })) : [];
      if (r.length >= 2) beginMatch(r);
      return;
    }
    if (type === 'rematch') { if (S.isHost) startMatch(); return; }
    if (type === 'busy') { if (!S.inMatch) { S.matchBusy = true; renderLobby(); } return; }
    if (S.inMatch) Arena.onMessage(type, d, from);
  }

  function leaveRoom() {
    Net.unannounce();
    Net.leave(); Arena.stop(); overlay(null);
    Object.assign(S, { players: [], roster: null, inMatch: false, matchBusy: false, code: null, isHost: false });
    show('home');
  }

  $('btn-start').onclick = () => { Sfx.click(); startMatch(); };
  $('btn-back').onclick = () => { Sfx.click(); leaveRoom(); };
  $('btn-copy').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + S.code;
    const done = () => toast('הקישור הועתק – אפשר להדביק ולשלוח');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => toast(url)); else toast(url);
  };

  /* ---------- השתקה ---------- */
  const muteBtn = $('mute');
  const paintMute = () => { muteBtn.textContent = Sfx.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', Sfx.muted ? 'הפעלת צלילים' : 'השתקה'); };
  muteBtn.onclick = () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); paintMute(); muteBtn.blur(); };
  paintMute();
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) $('touch-note').hidden = false;

  /* ---------- טעינת המשחק ---------- */
  const fontsReady = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('700 18px Rubik'), document.fonts.load('900 28px Rubik')]).catch(() => {}) : Promise.resolve();
  fontsReady.then(() => Arena.init(() => { document.body.classList.add('ready'); }));
  window.addEventListener('beforeunload', () => Net.leave());
})();
