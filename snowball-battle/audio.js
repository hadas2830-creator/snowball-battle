/* audio.js – צלילים ומוזיקה שנוצרים בקוד (בלי קבצי שמע) */
window.Sfx = (function () {
  let ctx = null, master = null, musicBus = null, reverbSend = null, noiseBuf = null;
  let muted = false, musicOn = false, musicTimer = null, nextNoteTime = 0, step = 0;

  try { muted = localStorage.getItem('sb-muted') === '1'; } catch (e) {}

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(master);
      // הד של אולם למוזיקה
      const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const verb = ctx.createConvolver(); verb.buffer = ir;
      reverbSend = ctx.createGain(); reverbSend.gain.value = 0.28;
      reverbSend.connect(verb); verb.connect(musicBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.bus || master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(dur, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.3 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  /* ---------- מוזיקת רקע: מתח זורם (רה מינור, קצב 116, צלילים מחוברים) ---------- */
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const STEP = 60 / 116 / 2; // שמיניות
  // 8 תיבות: Dm Dm Bb C Dm Dm Bb A
  const CHORDS = [
    { root: 38, n: [50, 53, 57] }, { root: 38, n: [50, 53, 57] }, { root: 34, n: [46, 50, 53] }, { root: 36, n: [48, 52, 55] },
    { root: 38, n: [50, 53, 57] }, { root: 38, n: [50, 53, 57] }, { root: 34, n: [46, 50, 53] }, { root: 33, n: [45, 49, 52] }
  ];
  // מלודיה: [מיקום בתיבה (0–7), צליל, אורך בשמיניות]
  const LEAD = [
    [[0, 74, 3], [3, 77, 3], [6, 76, 2]], [[0, 74, 4], [4, 72, 2], [6, 69, 2]],
    [[0, 70, 3], [3, 74, 3], [6, 77, 2]], [[0, 76, 6], [6, 72, 2]],
    [[0, 74, 3], [3, 77, 3], [6, 81, 2]], [[0, 79, 3], [3, 77, 3], [6, 76, 2]],
    [[0, 74, 4], [4, 77, 4]], [[0, 76, 4], [4, 73, 4]]
  ];

  function voice(type, freq, t, { vol, attack = 0.02, dur, release = 0.25, wet = 0.3, filter = null, detune = 0, vibrato = 0 }) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
    if (vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vibrato, t + 0.4);
      lfo.connect(lg); lg.connect(osc.detune); lfo.start(t); lfo.stop(t + dur + release + 0.1);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    let out = osc;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = 0.7; osc.connect(f); out = f; }
    out.connect(g); g.connect(musicBus);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(reverbSend); }
    osc.start(t); osc.stop(t + dur + release + 0.1);
  }
  function noiseHit(t, { vol, dur, type = 'highpass', freq = 6000, to = null, attack = 0.003, wet = 0.2 }) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(musicBus);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(reverbSend); }
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  // כינורות ארוכים – אקורד שמתנגן כל התיבה ונכנס בהדרגה
  function strings(notes, t, dur) {
    notes.forEach(m => [-9, 9].forEach(dt => voice('sawtooth', mf(m), t, { vol: 0.011, attack: 0.35, dur, release: 0.6, wet: 0.7, filter: 1500, detune: dt, vibrato: 6 })));
  }
  // בס רך ומחובר – שמיניות שנוגעות אחת בשנייה
  function bass(m, t) {
    voice('triangle', mf(m), t, { vol: 0.11, attack: 0.015, dur: STEP * 0.95, release: 0.08, wet: 0 });
    voice('sawtooth', mf(m), t, { vol: 0.025, attack: 0.015, dur: STEP * 0.95, release: 0.08, wet: 0, filter: 420 });
  }
  // ארפג'ו עדין (פעמונים)
  function arp(m, t) { voice('sine', mf(m), t, { vol: 0.022, attack: 0.008, dur: STEP * 0.6, release: 0.5, wet: 0.6 }); }
  // מלודיה – צליל חם עם ויברטו
  function lead(m, t, len) {
    voice('triangle', mf(m), t, { vol: 0.045, attack: 0.04, dur: STEP * len, release: 0.35, wet: 0.55, vibrato: 12 });
    voice('sawtooth', mf(m), t, { vol: 0.012, attack: 0.05, dur: STEP * len, release: 0.35, wet: 0.55, filter: 1800, vibrato: 12 });
  }
  function kick(t) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g); g.connect(musicBus); osc.start(t); osc.stop(t + 0.45);
  }
  const snare = (t) => noiseHit(t, { vol: 0.05, dur: 0.25, type: 'bandpass', freq: 1700, wet: 0.6 });
  const shaker = (t, v) => noiseHit(t, { vol: v, dur: 0.06, freq: 7500, attack: 0.012, wet: 0.1 });
  const swell = (t, dur) => noiseHit(t, { vol: 0.02, dur, type: 'bandpass', freq: 500, to: 5000, attack: dur * 0.9, wet: 0.5 });

  function scheduler() {
    // אם הדפדפן התעכב – ממשיכים מעכשיו במקום לנגן הכול בבת אחת
    if (nextNoteTime < ctx.currentTime - 0.05) nextNoteTime = ctx.currentTime + 0.05;
    while (nextNoteTime < ctx.currentTime + 0.6) {
      const t = nextNoteTime;
      const i = step % 128;                 // 16 תיבות × 8 שמיניות
      const barAll = (i / 8) | 0, bar = barAll % 8, s = i % 8, ch = CHORDS[bar];
      const drums = barAll >= 2, withLead = barAll >= 8;

      if (s === 0) strings(ch.n, t, STEP * 8);
      bass(s % 2 === 0 ? ch.root : ch.root + 12, t);
      arp(ch.n[[0, 1, 2, 1][s % 4]] + 24, t);
      if (drums) {
        if (s === 0 || s === 4 || (s === 7 && bar % 2 === 1)) kick(t);
        if (s === 2 || s === 6) snare(t);
        shaker(t, s % 2 ? 0.012 : 0.006);
      }
      if (withLead) LEAD[bar].forEach(([pos, m, len]) => { if (pos === s) lead(m, t, len); });
      if ((barAll === 7 || barAll === 15) && s === 0) swell(t, STEP * 8);

      nextNoteTime += STEP; step++;
    }
  }

  return {
    unlock,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('sb-muted', m ? '1' : '0'); } catch (e) {}
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
    },
    startMusic() {
      unlock();
      if (!ctx || musicOn) return;
      musicOn = true; step = 0; nextNoteTime = ctx.currentTime + 0.1;
      musicTimer = setInterval(scheduler, 100);
    },
    stopMusic() { musicOn = false; clearInterval(musicTimer); },
    throw() { noise(0.17, { vol: 0.22, freq: 1900, to: 450, q: 0.8 }); },
    hit() { noise(0.24, { vol: 0.5, freq: 1300, to: 260, type: 'lowpass' }); tone(170, 0.2, { vol: 0.35, to: 60 }); },
    hitMe() { this.hit(); tone(620, 0.35, { type: 'triangle', vol: 0.12, to: 180 }); noise(0.4, { vol: 0.12, freq: 5000, type: 'highpass', delay: 0.05 }); },
    splat() { noise(0.12, { vol: 0.16, freq: 900, to: 380, type: 'lowpass' }); },
    block() { tone(1250, 0.16, { type: 'triangle', vol: 0.15, to: 1900 }); tone(1900, 0.25, { vol: 0.08, delay: 0.05 }); },
    pickup() { [660, 880, 1320, 1760].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.15, delay: i * 0.06 })); },
    appear() { tone(990, 0.12, { vol: 0.07 }); tone(1480, 0.18, { vol: 0.05, delay: 0.07 }); },
    beep() { tone(660, 0.16, { type: 'square', vol: 0.07 }); },
    go() { tone(990, 0.35, { type: 'square', vol: 0.07 }); tone(1320, 0.4, { type: 'triangle', vol: 0.09 }); },
    click() { tone(880, 0.06, { type: 'triangle', vol: 0.08 }); },
    // טעינה במכונה: צליל קטן שעולה עם כל כדור
    reload(n) { tone(420 + n * 55, 0.07, { type: 'triangle', vol: 0.09 }); noise(0.05, { vol: 0.05, freq: 3000, type: 'highpass' }); },
    // אין כדורים: "קליק" עמום
    empty() { tone(140, 0.09, { type: 'square', vol: 0.06, to: 90 }); noise(0.04, { vol: 0.08, freq: 600, type: 'lowpass' }); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.12 }));
      [523, 659, 784].forEach(f => tone(f * 2, 0.9, { type: 'sine', vol: 0.07, delay: 0.5 }));
    },
    lose() { [523, 466, 415, 392].forEach((f, i) => tone(f, 0.32, { type: 'triangle', vol: 0.13, delay: i * 0.16 })); }
  };
})();
