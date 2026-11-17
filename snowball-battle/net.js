/* net.js – חיבור בין שני המחשבים דרך Supabase Realtime (בלי טבלאות) */
window.Net = (function () {
  let client = null, channel = null, me = null, handlers = {};

  function init(cfg) {
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      realtime: { params: { eventsPerSecond: 40 } }
    });
  }

  function playersFromPresence() {
    const st = channel.presenceState();
    const list = [];
    Object.keys(st).forEach(k => { if (st[k] && st[k][0]) list.push(st[k][0]); });
    list.sort((a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1));
    return list;
  }

  /* מצטרפים לחדר. h = { onPlayers(list), onMessage(type, data), onError(msg) } */
  function join(code, meta, h) {
    leave();
    me = meta; handlers = h;
    channel = client.channel('snowball-' + code, {
      config: { broadcast: { self: false, ack: false }, presence: { key: meta.id, enabled: true } }
    });
    channel.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (!payload || typeof payload.k !== 'string' || payload.f === me.id) return;
      handlers.onMessage && handlers.onMessage(payload.k, payload.d || {}, payload.f);
    });
    channel.on('presence', { event: 'sync' }, () => {
      handlers.onPlayers && handlers.onPlayers(playersFromPresence());
    });
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        channel.track(meta);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        handlers.onError && handlers.onError(status);
      }
    });
  }

  function send(type, data) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: 'm', payload: { k: type, d: data, f: me.id } });
  }

  function leave() {
    if (channel) {
      try { channel.untrack(); } catch (e) {}
      try { client.removeChannel(channel); } catch (e) {}
    }
    channel = null;
  }

  /* ---------- לובי: רשימת החדרים הפתוחים (משותפת לכל מי שפתח את המשחק) ---------- */
  let lobby = null, lobbyReady = false, announced = null;
  const lobbyKey = Math.random().toString(36).slice(2, 10);

  function watchLobby(onRooms) {
    // enabled: true – כדי לקבל את הרשימה גם בלי לפתוח חדר בעצמך
    lobby = client.channel('snowball-lobby', { config: { presence: { key: lobbyKey, enabled: true } } });
    lobby.on('presence', { event: 'sync' }, () => {
      const st = lobby.presenceState(), byCode = {};
      Object.keys(st).forEach(k => (st[k] || []).forEach(m => {
        if (m && /^\d{4}$/.test(m.code)) byCode[m.code] = m;
      }));
      onRooms(Object.values(byCode));
    });
    lobby.subscribe(status => {
      if (status === 'SUBSCRIBED') { lobbyReady = true; if (announced) lobby.track(announced); }
    });
  }
  // החדר שלי מופיע ברשימה (רק מי שפתח את החדר מודיע עליו)
  function announce(info) {
    const same = announced && JSON.stringify(announced) === JSON.stringify(info);
    announced = info;
    if (lobbyReady && !same) lobby.track(info);
  }
  function unannounce() {
    if (announced && lobbyReady) { try { lobby.untrack(); } catch (e) {} }
    announced = null;
  }

  return { init, join, send, leave, watchLobby, announce, unannounce, get client() { return client; } };
})();
