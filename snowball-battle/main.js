/* main.js – מסכים, חדרים (2–3 שחקנים) וחיבור בין הממשק למשחק */
(function () {
  // שלוש הבובות: אדומה, כחולה, ירוקה – מחולקות באקראי
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e'];
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
    /* ---------- מטבעות וחנות ---------- */
    setCoins(n, bump) {
      const c = $('coins'); c.querySelector('.ctext').textContent = n;
      if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    },
    openShop() {
      const P = Arena.persist, price = Arena.shopPrices;
      const items = [
        { id: 'boots', icon: '👢', name: 'מגפי ריצה', desc: 'רצים מהר יותר (‎+15%) – לכל המשחק', owned: P.boots },
        { id: 'bag', icon: '🎒', name: 'תיק גדול', desc: '15 כדורים במקום 10 – לכל המשחק', owned: P.bag },
        { id: 'shield', icon: '🛡️', name: 'מגן', desc: '5 שניות שאף כדור לא פוגע בך', owned: false }
      ];
      overlay(`
        <div class="card shop-card">
          <div class="shop-head"><h2>🏠 החנות של הבקתה</h2><div class="shop-coins">❄ <b>${P.coins}</b></div></div>
          <div class="shop-items" id="shop-items"></div>
          <button class="btn ghost shop-exit" id="btn-shop-exit">⬇ יציאה מהבקתה</button>
        </div>`);
      const box = $('shop-items');
      items.forEach(it => {
        const can = !it.owned && P.coins >= price[it.id].price;
        const b = el('button', 'shop-item' + (it.owned ? ' owned' : '') + (can ? '' : ' cant'));
        b.type = 'button'; b.disabled = !can;
        b.append(el('span', 'si-icon', it.icon), el('span', 'si-name', it.name), el('span', 'si-desc', it.desc),
          el('span', 'si-price', it.owned ? '✓ יש לך' : '❄ ' + price[it.id].price));
        b.onclick = () => { if (Arena.buy(it.id)) UI.openShop(); };
        box.appendChild(b);
      });
      $('btn-shop-exit').onclick = () => { Sfx.click(); Arena.closeShop(); };
    },
    closeShop() { if (document.querySelector('.shop-card')) overlay(null); },

    setAmmo(n, max) {
      const box = $('ammo'), balls = box.querySelector('.aballs');
      if (balls.children.length !== max) { balls.innerHTML = ''; for (let i = 0; i < max; i++) balls.appendChild(el('i')); }
      [...balls.children].forEach((b, i) => b.classList.toggle('on', i < n));
      box.querySelector('.atext').textContent = n + '/' + max;
      box.classList.toggle('empty', n === 0);
      box.classList.toggle('low', n > 0 && n <= 3);
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
        if (S.botMode) return startBotMatch();
        if (S.players.length < 2) return toast('אין עוד שחקנים בחדר');
        if (S.isHost) startMatch();
        else { Net.send('rematch', {}); $('btn-again').disabled = true; $('again-msg').textContent = 'ממתינים לשאר השחקנים…'; }
      };
      $('btn-exit').onclick = () => { Sfx.click(); leaveRoom(); };
    }
  };

  /* ---------- מסך פתיחה ---------- */
  const nameInput = $('name');
  nameInput.value = S.me.name;
  // אין בחירת דמות: כל סיבוב הבובות מחולקות באקראי
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  S.me.color = COLORS[Math.floor(Math.random() * COLORS.length)];

  /* ---------- בחירת זירה ---------- */
  const ARENA_INFO = {
    classic: { name: 'הקלאסית', icon: '❄', thumb: 'arena.png' },
    mountains: { name: 'בהרים', icon: '⛰️', thumb: 'arena-mountains.jpg' },
    shops: { name: 'רחוב החנויות', icon: '🏪', thumb: 'arena-shops.jpg' }
  };
  const validArena = (k) => (ARENA_INFO[k] ? k : 'classic');
  S.arena = 'classic';
  try { S.arena = validArena(localStorage.getItem('sb-arena')); } catch (e) {}
  // כמה נקודות צריך כדי לפתוח כל זירה (2 נקודות על כל פגיעה)
  const UNLOCK = { classic: 0, mountains: 0, shops: 0 }; // כל הזירות פתוחות
  const myPoints = () => (window.Accounts && Accounts.state().loggedIn ? Accounts.state().points : 0);
  const isOpen = (k) => UNLOCK[k] === 0;
  const arenasEl = $('arenas');
  Object.keys(ARENA_INFO).forEach(k => {
    const a = ARENA_INFO[k], b = el('button', 'arena-opt');
    b.type = 'button'; b.dataset.k = k;
    b.style.backgroundImage = 'url(' + a.thumb + '?v=20261117r)';
    b.append(el('span', 'ao-lock'), el('span', 'ao-name', a.icon + ' ' + a.name));
    b.onclick = () => {
      Sfx.unlock(); Sfx.click();
      if (!isOpen(k)) {
        toast(window.Accounts && Accounts.state().loggedIn
          ? '🔒 הזירה נפתחת ב-' + UNLOCK[k] + ' נקודות – חסרות לך עוד ' + (UNLOCK[k] - myPoints())
          : '🔒 כדי לפתוח זירות צריך להיכנס עם שם וסיסמה ולצבור נקודות');
        return;
      }
      S.arena = k; markArena();
      try { localStorage.setItem('sb-arena', k); } catch (e) {}
      Arena.setArena(k);
    };
    arenasEl.appendChild(b);
  });
  function markArena() {
    if (!isOpen(S.arena)) { S.arena = 'classic'; Arena.setArena('classic'); }
    [...arenasEl.children].forEach(b => {
      const k = b.dataset.k, open = isOpen(k);
      b.classList.toggle('sel', k === S.arena);
      b.classList.toggle('locked', !open);
      b.querySelector('.ao-lock').textContent = open ? '' : '🔒 ' + (window.Accounts && Accounts.state().loggedIn ? 'עוד ' + (UNLOCK[k] - myPoints()) : UNLOCK[k]) + ' נק׳';
    });
  }
  markArena();
  Arena.arenaKey = S.arena;


  function readName() {
    const n = nameInput.value.trim().slice(0, 12);
    if (!n) { $('home-msg').textContent = 'רגע, איך קוראים לך? 🙂'; nameInput.focus(); return null; }
    S.me.name = n;
    try { localStorage.setItem('sb-name', n); } catch (e) {}
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
        n + '/' + MAX_PLAYERS + ' שחקנים · ' + (ARENA_INFO[r.arena] ? ARENA_INFO[r.arena].icon + ' ' + ARENA_INFO[r.arena].name : 'קוד ' + r.code) + (r.playing ? ' · באמצע משחק' : ''));
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
        code: S.code, host: cleanName(S.me.name), color: S.me.color, arena: S.arena,
        n: Math.max(1, S.players.length), playing: !!S.inMatch, t: S.joinedAt
      });
    } else Net.unannounce();
  }

  $('btn-create').onclick = () => {
    Sfx.unlock(); Sfx.click();
    if (!configured || !readName()) return;
    enterRoom(String(1000 + Math.floor(Math.random() * 9000)), 'host');
  };

  /* ---------- חדר ---------- */
  function enterRoom(code, role) {
    $('home-msg').textContent = '';
    Object.assign(S, { code, role, players: [], roster: null, inMatch: false, matchBusy: false, isHost: false, botMode: false, joinedAt: Date.now() });
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
    const colors = shuffle(COLORS); // בובה אקראית לכל שחקן, בלי כפילויות
    const roster = S.players.slice(0, MAX_PLAYERS).map((p, i) => ({ id: p.id, name: cleanName(p.name), color: colors[i] }));
    Net.send('start', { r: roster, arena: S.arena });
    beginMatch(roster, S.arena);
  }

  function beginMatch(roster, arena) {
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
      meId: S.me.id, isHost: S.isHost, send: Net.send, arena: validArena(arena)
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
      if (r.length >= 2) beginMatch(r, d.arena);
      return;
    }
    if (type === 'rematch') { if (S.isHost) startMatch(); return; }
    if (type === 'busy') { if (!S.inMatch) { S.matchBusy = true; renderLobby(); } return; }
    if (S.inMatch) Arena.onMessage(type, d, from);
  }

  function leaveRoom() {
    Net.unannounce();
    Net.leave(); Arena.stop(); overlay(null);
    Arena.resetShop(); // מטבעות וציוד מתאפסים כשיוצאים מהחדר
    Object.assign(S, { players: [], roster: null, inMatch: false, matchBusy: false, code: null, isHost: false, botMode: false });
    show('home');
  }

  /* ---------- אימון נגד המחשב (בלי אינטרנט, בלי חדר) ---------- */
  const BOT_ID = 'bot';
  function startBotMatch() {
    Net.unannounce(); Net.leave();
    const [myColor, botColor] = shuffle(COLORS);
    const roster = [
      { id: S.me.id, name: cleanName(S.me.name), color: myColor },
      { id: BOT_ID, name: 'רובוט השלג 🤖', color: botColor }
    ];
    Object.assign(S, { botMode: true, code: null, players: [], roster, inMatch: true, matchBusy: false, isHost: true });
    overlay(null);
    Arena.setupMatch({
      roster: roster.map(r => ({ id: r.id, name: r.name, colorNum: parseInt(r.color.slice(1), 16) })),
      meId: S.me.id, isHost: true, send: () => {}, bot: BOT_ID, arena: S.arena
    });
    buildHud(roster);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    show('game');
    Sfx.startMusic();
    Arena.startRound();
  }
  $('btn-bot').onclick = () => {
    Sfx.unlock(); Sfx.click();
    if (!readName()) return;
    $('home-msg').textContent = '';
    Arena.resetShop();
    startBotMatch();
  };

  $('btn-start').onclick = () => { Sfx.click(); startMatch(); };

  // יציאה מהחנות במקש Esc, וטעינה מוקדמת של תמונת הבקתה
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.shop-card')) Arena.closeShop(); });
  new Image().src = 'cabin-inside.png?v=20261117r';

  // חלון הוראות המשחק
  $('btn-rules').onclick = () => {
    Sfx.unlock(); Sfx.click();
    overlay($('rules-tpl').innerHTML);
    $('btn-rules-close').onclick = () => { Sfx.click(); overlay(null); };
    $('btn-rules-close').focus();
  };
  $('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay' && $('btn-rules-close')) overlay(null); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('btn-rules-close')) overlay(null); });
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
