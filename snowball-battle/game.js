/* game.js – זירת המשחק (Phaser): תנועה, כדורי שלג, פגיעות, בונוסים ואפקטים */
(function () {
  /* הזירה היא תמונה (arena.png, 1024×538) שמוגדלת פי 1.25.
     כל המיקומים למטה כתובים בפיקסלים של התמונה המקורית, ו-S מגדיל אותם. */
  const S = 1.25;
  const W = 1280, H = 672;
  let B; // גבולות הזירה – נקבעים לפי הזירה שנבחרה
  const SPEED = 270, BALL_SPEED = 780, BALL_RANGE = 820, COOLDOWN = 420, WIN_SCORE = 5;
  const PLAYER_R = 15, PS = 0.34;
  // הבובות: תמונה בגובה 150 פיקסלים, מוצגת בגובה ~75
  const DOLL_SCALE = 0.5, DOLL_H = 75; // גובה הבובה על המסך
  // התכופפות (Alt): מגינה רק מאחורי חומת שלג – כדור שעף מעל החומה עובר מעל הראש של מי שמתכופף צמוד אליה.
  // חומות שלג נמוכות: כדור נמוך נעצר בהן, כדור גבוה עובר מעליהן
  const LOW_WALL_H = 29, CROUCH_SPEED = 0, WALL_COVER = 130; // מתכופפים = עומדים במקום
  const low = (r) => Object.assign(r, { low: true });
  const DOLL_BY_COLOR = { 0xef4444: 'doll_red', 0x3b82f6: 'doll_blue', 0x22c55e: 'doll_green' };
  // גודל הגוף לצורך פגיעה: חצי רוחב המעיל (בלי הידיים), ועומק קטן על הקרקע
  const BODY_RX = 16, BODY_RY = 9;

  /* האם הכדור נגע בגוף? בודקים כמה נקודות לאורך הדרך שהכדור עבר מאז הבדיקה הקודמת,
     כדי שכדור מהיר לא "יקפוץ" מעל שחקן. הכדור צריך באמת לעבור דרך הגוף. */
  function touches(b, p) {
    const rx = BODY_RX + b.r, ry = BODY_RY + b.r * 0.6;
    const sx = b.px == null ? b.x : b.px, sy = b.py == null ? b.y : b.py;
    for (let k = 1; k <= 4; k++) {
      const x = sx + (b.x - sx) * k / 4, y = sy + (b.y - sy) * k / 4;
      const dx = (x - p.x) / rx, dy = (y - p.y) / ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }
  // נקודות התחלה לשחקן 1, 2, 3
  let SPAWNS;
  // תחמושת: 10 כדורים, ומכונה באמצע שממלאת כדור כל 0.15 שנייה כשעומדים לידה
  // חנות בבקתה: עומדים מול הדלת ולוחצים חץ למעלה
  const DOOR = { x: 503 * S, y: 362 * S, rx: 24 * S, ry: 15 * S };
  const COIN_PER_HIT = 2, COIN_PICKUP = 2;
  // אין כניסה לבקתה; החנות תעבור לתפריט. עד אז – בלי פתיתים בזירה ובלי מונה
  const DOOR_SHOP = false, COINS_ON = false;
  const SHOP = {
    boots: { price: 6 },   // מגפי ריצה: מהירות +15% (נשאר)
    bag: { price: 5 },     // תיק גדול: 15 כדורים (נשאר)
    shield: { price: 4 }   // מגן: 5 שניות (חד פעמי)
  };
  const MAX_AMMO = 10, BIG_BAG = 15, RELOAD_EVERY = 150, RELOAD_FROM = 3; // אפשר להטעין כשנשארו 3 כדורים או פחות
  let MACHINE; // מתחת לבקתה, עם מעבר ביניהם
  // אזור הטעינה (אליפסה סביב המכונה) – קטן מספיק כדי לא לגלוש לאגם
  const ZONE = { rx: 60, ry: 32, dy: -8 };
  // כמה פעמים בשנייה שולחים מיקום, וכמה "החלקה" מוסיפים (במילישניות):
  // 2 שחקנים – 20 פעמים בשנייה; 3 שחקנים – 15 (כדי לא לעבור את המגבלה של Supabase החינמי)
  const NET = { 2: { send: 50, delay: 90 }, 3: { send: 66, delay: 110 } };
  // רמת הרובוט (רמה גבוהה): זמן תגובה, דיוק, מרחק שהוא שומר, והפסקה נוספת בין זריקות
  const BOT = { react: 0.23, aimError: 0.09, dodgeMargin: 9, keepDist: 300, extraCooldown: 330, speed: 0.8 };

  let SHAPES, PONDS, STREAMS, CHIMNEY, CUTS, CUT_TOP, CUT_BG;
  /* גזירות מהציור – כדי שאפשר יהיה להתחבא מאחורי חפצים.
     [x1, y1, x2, base, core]: הריבוע של החפץ (base = קו הרגליים שלו),
     core = החלק שבטוח שייך לחפץ ולא נמחק לעולם (tri = עץ, circ = עיגולים, box = ריבוע) */
  const tri = (cx, top, w, base) => ({ t: 'tri', cx, top, w, base });
  const circ = (...c) => ({ t: 'circ', c });
  const box = (x1, y1, x2, y2) => ({ t: 'box', x1, y1, x2, y2 });
  const cabinCore = (cx, top, roofBase, x1, x2, bottom) => ({ t: 'multi', parts: [box(x1, roofBase, x2, bottom), tri(cx, top, x2 - x1 + 16, roofBase)] });

  /* ---------- הזירות ----------
     כל המיקומים בפיקסלים של תמונה ברוחב 1024 (הגובה 538).
     shapes: ['c', x, y, r] = עיגול (עץ, איש שלג, פנס) | ['r', x1, y1, x2, y2, נמוך?] = מלבן. נמוך (1) = חומה/סלע/ספסל: כדור גבוה עובר מעליו
     cuts: [x1, y1, x2, תחתית, ליבה] = מה גוזרים מהציור כדי שאפשר יהיה להתחבא מאחוריו */
  const ARENAS = {
    classic: {
      img: 'arena', bg: 'white', cutTop: 52, bounds: [30, 60, 998, 518],
      machine: [690, 226], chimney: [541, 218], spawns: [[150, 345], [880, 300], [505, 405]],
      shapes: [
        ['c', 125, 140, 12], ['c', 280, 137, 12], ['c', 660, 95, 12], ['c', 912, 122, 12], ['c', 855, 188, 12],
        ['c', 65, 268, 15], ['c', 945, 385, 15], ['c', 100, 500, 15],
        ['c', 328, 245, 17], ['c', 330, 388, 22], ['c', 677, 357, 17],
        ['r', 180, 153, 292, 190, 1], ['r', 713, 407, 826, 442, 1], ['r', 836, 435, 960, 473, 1],
        ['r', 432, 282, 578, 348],
        ['r', 188, 372, 250, 402, 1], ['r', 758, 203, 822, 237, 1]
      ],
      ponds: [[502, 135, 100, 35], [503, 483, 127, 40]],
      cuts: [
        [83, 38, 167, 144, tri(125, 42, 54, 136)], [240, 36, 320, 141, tri(280, 40, 52, 134)],
        [619, 10, 700, 100, tri(660, 14, 52, 92)], [870, 22, 953, 127, tri(912, 26, 54, 119)],
        [812, 80, 900, 194, tri(855, 92, 58, 186)], [8, 108, 128, 274, tri(66, 124, 82, 262)],
        [877, 164, 1014, 392, tri(946, 180, 96, 380)], [18, 276, 188, 510, tri(102, 292, 120, 496)],
        [294, 174, 362, 262, circ([328, 192, 9], [328, 216, 12], [328, 242, 16])],
        [271, 280, 389, 412, circ([330, 306, 14], [330, 345, 18], [331, 385, 22])],
        [644, 286, 710, 378, circ([677, 302, 9], [677, 327, 12], [677, 356, 16])],
        [420, 206, 585, 352, { t: 'multi', parts: [box(436, 282, 570, 346), tri(503, 212, 150, 282), box(530, 214, 552, 250)] }],
        [175, 147, 297, 195, box(184, 158, 288, 190)], [708, 400, 831, 447, box(717, 412, 822, 442)],
        [830, 427, 965, 479, box(840, 440, 956, 474)], [182, 365, 255, 406, box(192, 377, 246, 401)],
        [752, 195, 825, 242, box(762, 206, 818, 237)]
      ]
    },
    mountains: {
      img: 'arena_mountains', bg: 'blue', cutTop: 100, bounds: [30, 100, 998, 518],
      machine: [529, 152], chimney: [541, 222], spawns: [[150, 345], [880, 300], [505, 405]],
      shapes: [
        ['c', 122, 140, 12], ['c', 280, 137, 12], ['c', 660, 95, 12], ['c', 912, 122, 12], ['c', 855, 190, 12],
        ['c', 65, 270, 15], ['c', 945, 385, 15], ['c', 100, 505, 15], ['c', 300, 520, 13], ['c', 722, 520, 13],
        ['r', 757, 203, 823, 237, 1], ['r', 186, 370, 250, 402, 1],
        ['r', 836, 433, 962, 474, 1],
        ['r', 432, 282, 575, 348]
      ],
      ponds: [[502, 484, 127, 40]],
      streams: [
        { r: 15, pts: [[232, 162], [352, 240], [242, 300], [368, 398]] },
        { r: 15, pts: [[742, 137], [668, 215], [790, 305], [658, 402]] }
      ],
      cuts: [
        [86, 38, 162, 146, tri(122, 42, 56, 138)], [240, 36, 320, 143, tri(280, 40, 56, 135)],
        [620, 8, 700, 101, tri(660, 12, 56, 93)], [874, 22, 952, 128, tri(912, 26, 56, 120)],
        [814, 84, 900, 196, tri(855, 88, 60, 188)], [10, 110, 126, 276, tri(65, 116, 86, 266)],
        [876, 164, 1012, 392, tri(945, 170, 100, 382)], [18, 278, 190, 512, tri(100, 284, 124, 500)],
        [255, 414, 348, 527, tri(300, 420, 64, 516)], [680, 414, 768, 527, tri(722, 420, 62, 516)],
        [752, 196, 828, 242, box(762, 206, 818, 236)], [182, 364, 256, 406, box(192, 374, 246, 400)],
        [830, 426, 966, 480, box(840, 438, 956, 474)],
        [420, 205, 585, 352, { t: 'multi', parts: [box(436, 282, 570, 346), tri(503, 212, 150, 282), box(530, 214, 552, 250)] }]
      ]
    },
    shops: {
      img: 'arena_shops', bg: 'white', cutTop: 120, bounds: [30, 125, 998, 518],
      machine: [505, 420], chimney: null, spawns: [[150, 330], [880, 300], [512, 165]],
      shapes: [
        ['c', 65, 270, 15], ['c', 100, 505, 15], ['c', 945, 385, 15],
        ['c', 212, 208, 7], ['c', 810, 205, 7],
        ['c', 328, 245, 17], ['c', 330, 392, 22], ['c', 677, 360, 17],
        ['r', 438, 290, 575, 348],
        ['r', 620, 210, 706, 238, 1], ['r', 758, 203, 822, 237, 1],
        ['r', 188, 368, 250, 401, 1], ['r', 698, 295, 756, 331, 1],
        ['r', 713, 406, 826, 442, 1], ['r', 836, 433, 962, 474, 1]
      ],
      ponds: [[503, 486, 127, 40]],
      cuts: [
        [10, 110, 126, 276, tri(65, 116, 86, 266)], [18, 278, 190, 512, tri(100, 284, 124, 500)],
        [876, 164, 1012, 392, tri(945, 170, 100, 382)],
        [196, 106, 230, 215, box(206, 114, 219, 212)], [794, 104, 828, 212, box(803, 112, 817, 210)],
        [294, 174, 362, 264, circ([328, 192, 9], [328, 216, 12], [328, 243, 16])],
        [271, 280, 389, 414, circ([330, 306, 14], [330, 345, 18], [331, 388, 22])],
        [644, 286, 710, 380, circ([677, 305, 9], [677, 330, 12], [677, 359, 16])],
        [425, 190, 598, 352, { t: 'multi', parts: [box(440, 262, 574, 346), tri(511, 196, 160, 258)] }],
        [615, 203, 712, 242, box(624, 212, 702, 236)], [752, 196, 828, 242, box(762, 206, 818, 236)],
        [182, 362, 256, 406, box(192, 372, 246, 400)], [692, 290, 762, 335, box(702, 298, 752, 330)],
        [708, 400, 831, 447, box(717, 412, 822, 442)], [830, 427, 966, 480, box(840, 440, 956, 474)]
      ]
    }
  };

  // מפעיל זירה: מכשולים, קרח, מכונה, נקודות התחלה וגבולות
  function setArena(key) {
    const d = ARENAS[key] || ARENAS.classic;
    B = { x1: d.bounds[0] * S, y1: d.bounds[1] * S, x2: d.bounds[2] * S, y2: d.bounds[3] * S };
    MACHINE = { x: d.machine[0] * S, y: d.machine[1] * S };
    SPAWNS = d.spawns.map(([x, y]) => ({ x: x * S, y: y * S }));
    SHAPES = d.shapes.map(q => q[0] === 'c' ? circle(q[1], q[2], q[3]) : (q[5] ? low(rect(q[1], q[2], q[3], q[4])) : rect(q[1], q[2], q[3], q[4])));
    SHAPES.push(rect(d.machine[0] - 23, d.machine[1] - 14, d.machine[0] + 23, d.machine[1] + 1)); // המכונה
    PONDS = d.ponds.map(([x, y, rx, ry]) => ({ x: x * S, y: y * S, rx: rx * S, ry: ry * S }));
    STREAMS = (d.streams || []).map(st => ({ r: st.r * S, pts: st.pts.map(([x, y]) => [x * S, y * S]) }));
    CHIMNEY = d.chimney ? { x: d.chimney[0] * S, y: d.chimney[1] * S } : null;
    CUTS = d.cuts; CUT_TOP = d.cutTop; CUT_BG = d.bg;
  }
  const circle = (x, y, r) => ({ c: true, x: x * S, y: y * S, r: r * S });
  const rect = (x1, y1, x2, y2) => ({ c: false, x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S });
  setArena('classic');

  function inCore(core, x, y) {
    if (core.t === 'multi') return core.parts.some(p => inCore(p, x, y));
    if (core.t === 'box') return x >= core.x1 && x <= core.x2 && y >= core.y1 && y <= core.y2;
    if (core.t === 'circ') return core.c.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    if (y < core.top || y > core.base) return false;
    const half = (core.w / 2) * (y - core.top) / (core.base - core.top);
    return Math.abs(x - core.cx) <= half + 3;
  }

  /* גוזר כל חפץ מהציור: מוחק את השלג שמסביב (מילוי מהקצוות), משאיר את החפץ */
  function buildCutouts(scene, img, arenaKey) {
    const made = [], k = img.naturalWidth / 1024;
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    CUTS.forEach(([x1, y1, x2, base, core], n) => {
      const key = 'cut_' + arenaKey + '_' + n;
      if (scene.textures.exists(key)) { made.push(scene.add.image(x1 * S, y1 * S, key).setOrigin(0).setScale(S / k).setDepth(base * S)); return; }
      const X1 = Math.round(x1 * k), Y1 = Math.round(y1 * k);
      const w = Math.round((x2 - x1) * k), h = Math.round((base - y1) * k);
      const id = ctx.getImageData(X1, Y1, w, h), d = id.data;
      const isBg = (i) => {
        if (y1 + Math.floor(i / w) / k < CUT_TOP) return true; // הגדר / ההרים / החנויות שמאחורי החפץ
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        if (CUT_BG === 'blue') return mn >= 150 && b >= r && b >= g - 6 && b - r <= 85; // שלג כחלחל (ערב בהרים)
        return mn >= 196 && mx - mn <= 42;
      };
      const coreMask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inCore(core, x / k + x1, y / k + y1)) coreMask[y * w + x] = 1;
      const clear = new Uint8Array(w * h);
      const stack = [];
      const seed = (i) => { if (!clear[i] && !coreMask[i] && isBg(i)) { clear[i] = 1; stack.push(i); } };
      for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
      while (stack.length) {
        const i = stack.pop(), x = i % w;
        if (x > 0) seed(i - 1);
        if (x < w - 1) seed(i + 1);
        if (i >= w) seed(i - w);
        if (i < w * (h - 1)) seed(i + w);
      }
      for (let i = 0; i < w * h; i++) {
        if (clear[i]) { d[i * 4 + 3] = 0; continue; }
        const x = i % w;
        // קצה רך
        if ((x > 0 && clear[i - 1]) || (x < w - 1 && clear[i + 1]) || (i >= w && clear[i - w]) || (i < w * (h - 1) && clear[i + w])) d[i * 4 + 3] = 150;
      }
      const t = scene.textures.createCanvas(key, w, h);
      t.getContext().putImageData(id, 0, 0); t.refresh();
      made.push(scene.add.image(x1 * S, y1 * S, key).setOrigin(0).setScale(S / k).setDepth(base * S));
    });
    return made;
  }

  const PU_INFO = {
    big: { label: 'כדור ענק!', color: 0x4361ee },
    triple: { label: 'זריקה משולשת!', color: 0xf77f00 },
    shield: { label: 'מגן קרח!', color: 0x06b6d4 },
    coin: { label: '+2 ❄', color: 0x7fd4ff }
  };

  const now = () => performance.now();
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const segDist = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  const inPond = (x, y) => PONDS.some(p => ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1)
    || STREAMS.some(st => st.pts.some((p, i) => i > 0 && segDist(x, y, st.pts[i - 1], p) < st.r));
  function darker(hex, f) {
    const r = ((hex >> 16) & 255) * f, g = ((hex >> 8) & 255) * f, b = (hex & 255) * f;
    return (r << 16) | (g << 8) | b;
  }

  /* דוחף עיגול (שחקן) החוצה ממכשולים ומהגבולות */
  function resolve(p) {
    for (const s of SHAPES) {
      if (s.c) {
        const d = dist(p.x, p.y, s.x, s.y), min = s.r + PLAYER_R;
        if (d < min && d > 0.001) {
          const nx = (p.x - s.x) / d, ny = (p.y - s.y) / d;
          p.x = s.x + nx * min; p.y = s.y + ny * min;
          const dot = p.vx * nx + p.vy * ny; if (dot < 0) { p.vx -= dot * nx; p.vy -= dot * ny; }
        }
      } else {
        const cx = Math.max(s.x1, Math.min(p.x, s.x2)), cy = Math.max(s.y1, Math.min(p.y, s.y2));
        const d = dist(p.x, p.y, cx, cy);
        if (d < PLAYER_R) {
          if (d > 0.001) {
            const nx = (p.x - cx) / d, ny = (p.y - cy) / d;
            p.x = cx + nx * PLAYER_R; p.y = cy + ny * PLAYER_R;
            const dot = p.vx * nx + p.vy * ny; if (dot < 0) { p.vx -= dot * nx; p.vy -= dot * ny; }
          } else {
            const opts = [[p.x - s.x1, -1, 0], [s.x2 - p.x, 1, 0], [p.y - s.y1, 0, -1], [s.y2 - p.y, 0, 1]].sort((a, b) => a[0] - b[0]);
            p.x += opts[0][1] * (opts[0][0] + PLAYER_R); p.y += opts[0][2] * (opts[0][0] + PLAYER_R);
          }
        }
      }
    }
    if (p.x < B.x1) { p.x = B.x1; p.vx = Math.max(0, p.vx); }
    if (p.x > B.x2) { p.x = B.x2; p.vx = Math.min(0, p.vx); }
    if (p.y < B.y1) { p.y = B.y1; p.vy = Math.max(0, p.vy); }
    if (p.y > B.y2) { p.y = B.y2; p.vy = Math.min(0, p.vy); }
  }
  function overLowWall(x, y) {
    return SHAPES.some(s => s.low && x > s.x1 - 6 && x < s.x2 + 6 && y > s.y1 - 6 && y < s.y2 + 4);
  }
  function ballBlocked(x, y, r, h) {
    for (const s of SHAPES) {
      if (s.low && h > LOW_WALL_H) continue; // הכדור עף מעל חומת השלג הנמוכה
      if (s.c) { if (dist(x, y, s.x, s.y) < s.r + r * 0.4) return true; }
      else if (x > s.x1 - r * 0.4 && x < s.x2 + r * 0.4 && y > s.y1 - r * 0.4 && y < s.y2 + r * 0.2) return true;
    }
    return false;
  }

  /* ---------- טקסטורות שנוצרות בקוד ---------- */
  function canvasTex(scene, key, w, h, draw) {
    const t = scene.textures.createCanvas(key, w, h);
    draw(t.getContext(), w, h); t.refresh();
  }

  function buildTextures(scene) {
    canvasTex(scene, 'flake', 16, 16, (c) => {
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 16, 16);
    });
    canvasTex(scene, 'chunk', 14, 14, (c) => {
      c.fillStyle = '#ffffff'; c.strokeStyle = '#b8cbe2'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(7, 1); c.lineTo(13, 5); c.lineTo(11, 12); c.lineTo(3, 13); c.lineTo(1, 6); c.closePath(); c.fill(); c.stroke();
    });
    canvasTex(scene, 'shadow', 64, 24, (c) => {
      const g = c.createRadialGradient(32, 12, 0, 32, 12, 32);
      g.addColorStop(0, 'rgba(40,70,120,0.38)'); g.addColorStop(1, 'rgba(40,70,120,0)');
      c.save(); c.scale(1, 24 / 64); c.fillStyle = g; c.fillRect(0, 0, 64, 64); c.restore();
    });
    canvasTex(scene, 'print', 10, 14, (c) => {
      c.fillStyle = 'rgba(120,150,195,0.55)';
      c.beginPath(); c.ellipse(5, 7, 4, 6, 0, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, 'ring', 72, 30, (c) => {
      c.strokeStyle = '#ffffff'; c.lineWidth = 3.5;
      c.beginPath(); c.ellipse(36, 15, 32, 12, 0, 0, Math.PI * 2); c.stroke();
    });
    canvasTex(scene, 'bubble', 128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 20, 64, 64, 62);
      g.addColorStop(0, 'rgba(180,240,255,0.05)'); g.addColorStop(0.8, 'rgba(150,225,255,0.3)'); g.addColorStop(1, 'rgba(220,250,255,0.85)');
      c.fillStyle = g; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(42, 34, 16, 8, -0.6, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, 'glow', 96, 96, (c) => {
      const g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 96, 96);
    });
    canvasTex(scene, 'confetti', 12, 7, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 12, 7); });
    canvasTex(scene, 'smoke', 40, 40, (c) => {
      const g = c.createRadialGradient(20, 20, 0, 20, 20, 20);
      g.addColorStop(0, 'rgba(235,240,248,0.9)'); g.addColorStop(1, 'rgba(235,240,248,0)');
      c.fillStyle = g; c.fillRect(0, 0, 40, 40);
    });
    canvasTex(scene, 'reticle', 48, 48, (c) => {
      const draw = (col, w) => {
        c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
        c.beginPath(); c.arc(24, 24, 13, 0, Math.PI * 2); c.stroke();
        [[24, 3, 24, 9], [24, 39, 24, 45], [3, 24, 9, 24], [39, 24, 45, 24]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); });
      };
      draw('rgba(20,40,80,0.7)', 5); draw('#ffffff', 2.5);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(24, 24, 2.5, 0, Math.PI * 2); c.fill();
    });
    canvasTex(scene, 'vignette', W, H, (c) => {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
      g.addColorStop(0, 'rgba(15,30,70,0)'); g.addColorStop(1, 'rgba(15,30,70,0.12)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
  }

  /* ---------- הסצנה ---------- */
  class ArenaScene extends Phaser.Scene {
    constructor() { super('arena'); }

    create() {
      Object.keys(Arena.images).forEach(k => this.textures.addImage(k, Arena.images[k]));
      buildTextures(this);

      this.buildArena(Arena.arenaKey || 'classic');

      // שלג יורד
      this.add.particles(0, -20, 'flake', {
        x: { min: -100, max: W }, lifespan: 12000, speedY: { min: 28, max: 70 }, speedX: { min: 4, max: 30 },
        scale: { min: 0.15, max: 0.6 }, alpha: { min: 0.5, max: 0.95 }, frequency: 55
      }).setDepth(9000);
      this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(9100);

      // חץ קטן שמראה לאן הכדור יעוף
      this.aimArrow = this.add.triangle(0, 0, 0, -8, 18, 0, 0, 8, 0xffffff)
        .setStrokeStyle(2.5, 0x1b2a4a).setAlpha(0.95).setVisible(false);
      this.tweens.add({ targets: this.aimArrow, scale: 1.2, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      this.players = {}; this.balls = new Map(); this.pus = new Map(); this.prints = [];
      this.mode = 'idle'; this.slow = 1;
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ALT', false);

      Arena.scene = this;
      Arena._ready && Arena._ready();
    }

    /* ---------- בניית הזירה (אפשר להחליף זירה בין משחקים) ---------- */
    buildArena(key) {
      if (!ARENAS[key]) key = 'classic';
      if (this.arenaKey === key && this.arenaObjs) return;
      (this.arenaObjs || []).forEach(o => { this.tweens.killTweensOf(o); o.destroy(); });
      this.arenaObjs = []; this.arenaKey = key;
      setArena(key);
      const A = (o) => { this.arenaObjs.push(o); return o; };
      const def = ARENAS[key];
      A(this.add.image(0, 0, def.img).setOrigin(0).setDisplaySize(W, H).setDepth(-100));
      try { buildCutouts(this, Arena.images[def.img], key).forEach(A); } catch (e) { console.warn('cutouts failed', e); }

      // מכונת הכדורים
      const zone = this.machineZone = A(this.add.ellipse(MACHINE.x, MACHINE.y + ZONE.dy, ZONE.rx * 2, ZONE.ry * 2, 0x7fd4ff, 0.22)
        .setStrokeStyle(2.5, 0xffffff, 0.8).setDepth(-55).setVisible(false));
      this.tweens.add({ targets: zone, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      A(this.add.image(MACHINE.x, MACHINE.y + 3, 'shadow').setScale(1.5, 0.9).setDepth(-50));
      this.machineImg = A(this.add.image(MACHINE.x, MACHINE.y + 2, 'machine').setOrigin(0.5, 0.98).setScale(0.5).setDepth(MACHINE.y));
      A(this.add.particles(MACHINE.x, MACHINE.y - 80, 'flake', {
        x: { min: -18, max: 18 }, speedY: { min: -30, max: -10 }, lifespan: 1200, scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 }, frequency: 220
      }).setDepth(MACHINE.y + 1));
      this.machineArrow = A(this.add.text(MACHINE.x, MACHINE.y - 118, '⬇ כדורים כאן', {
        fontFamily: 'Rubik, Arial, sans-serif', fontSize: '20px', fontStyle: '900', color: '#ffe066', stroke: '#1b2a4a', strokeThickness: 6, rtl: true
      }).setOrigin(0.5).setDepth(9200).setVisible(false));
      this.doorArrow = A(this.add.text(DOOR.x, DOOR.y - 92, '⬆', {
        fontFamily: 'Rubik, Arial, sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffe066', stroke: '#1b2a4a', strokeThickness: 6
      }).setOrigin(0.5).setDepth(9200).setVisible(false));
      this.machineLock = A(this.add.text(MACHINE.x, MACHINE.y - 112, '🔒', { fontSize: '34px', padding: { y: 6 } }).setOrigin(0.5).setDepth(9200).setVisible(false));
      this.machineLocked = undefined;

      // עשן מהארובה (אם יש)
      if (CHIMNEY) A(this.add.particles(CHIMNEY.x, CHIMNEY.y, 'smoke', {
        lifespan: 3200, speedY: { min: -38, max: -22 }, speedX: { min: 4, max: 16 },
        scale: { start: 0.5, end: 1.8 }, alpha: { start: 0.75, end: 0 }, frequency: 260
      }).setDepth(2000));
    }

    /* ---------- שחקנים ---------- */
    makePlayer(info, isMe) {
      const color = info.colorNum;
      const c = this.add.container(0, 0);
      const ring = this.add.image(0, 2, 'ring').setTint(color).setAlpha(isMe ? 0.9 : 0.55).setScale(0.75);
      const shadow = this.add.image(0, 3, 'shadow').setScale(0.95, 0.75);
      const body = this.add.container(0, 0);
      // הבובה לפי הצבע שנבחר (אדום / כחול / ירוק)
      const dollName = (DOLL_BY_COLOR[color] || 'doll_red').replace('doll_', '');
      const face = this.add.image(0, 2, 'doll_' + dollName).setOrigin(0.5, 1).setScale(DOLL_SCALE);
      const ice = this.add.image(0, 2, 'ice').setOrigin(0.5, 1).setScale(PS * 1.1).setVisible(false).setAlpha(0.85);
      body.add([face, ice]);
      const bubble = this.add.image(0, -33, 'bubble').setScale(0.72).setVisible(false);
      const label = this.add.text(0, -84, info.name, {
        fontFamily: 'Rubik, Arial, sans-serif', fontSize: '18px', fontStyle: '700', color: '#ffffff',
        stroke: '#1b2a4a', strokeThickness: 5, rtl: true
      }).setOrigin(0.5);
      c.add([ring, shadow, body, bubble, label]);
      c.nameLabel = label;
      if (isMe) {
        const arrow = this.add.triangle(0, -68, 0, 0, 14, 0, 7, 9, color).setStrokeStyle(2, 0xffffff);
        c.add(arrow);
        this.tweens.add({ targets: arrow, y: -63, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      return {
        id: info.id, name: info.name, color, isMe, c, body, ice, bubble, face, dollName, view: 'front',
        x: 0, y: 0, vx: 0, vy: 0, aim: 0, facing: 1, walkT: 0, punch: 0, moving: false,
        stunUntil: 0, invulnUntil: 0, shieldUntil: 0, power: null, nextThrow: 0,
        snaps: [], lastPrint: null, printSide: 1, shieldRemote: false
      };
    }

    clearAll() {
      Object.values(this.players).forEach(p => p.c.destroy());
      this.players = {};
      this.balls.forEach(b => this.removeBall(b, null));
      this.pus.forEach(p => p.c.destroy()); this.pus.clear();
      this.prints.forEach(p => p.destroy()); this.prints = [];
      this.mode = 'idle'; this.aimArrow.setVisible(false); this.input.keyboard.clearCaptures();
      if (this.doorArrow) this.doorArrow.setVisible(false);
      if (this.machineZone) { this.machineArrow.setVisible(false); this.machineLock.setVisible(false); this.machineImg.clearTint().setAlpha(1); this.machineLocked = false; }
      this.slow = 1; this.tweens.timeScale = 1;
      if (this.confetti) { this.confetti.destroy(); this.confetti = null; }
    }

    /* o = { roster: [{id, name, colorNum}], meId, isHost, send } */
    setupMatch(o) {
      this.clearAll();
      Arena.arenaKey = o.arena || Arena.arenaKey || 'classic';
      this.buildArena(Arena.arenaKey);
      this.isHost = o.isHost; this.send = o.send;
      this.meId = o.meId;
      this.roster = o.roster.map(r => r.id);
      const net = NET[this.roster.length >= 3 ? 3 : 2];
      this.sendEvery = net.send; this.renderDelay = net.delay;
      o.roster.forEach(r => { this.players[r.id] = this.makePlayer(r, r.id === this.meId); });
      this.me = this.players[this.meId];
      this.me.speedMul = Arena.persist.boots ? 1.15 : 1;
      this.me.maxAmmo = Arena.persist.bag ? BIG_BAG : MAX_AMMO;
      // מצב אימון: שחקן שהמחשב משחק בו
      this.botId = o.bot || null;
      if (this.botId && this.players[this.botId]) this.players[this.botId].isBot = true;
      // בזמן משחק: חצים ורווח שייכים למשחק (לא מגללים ולא לוחצים על כפתורים)
      this.input.keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,ALT');
      this.scores = {};
      this.roster.forEach(id => { this.scores[id] = 0; });
      this.placeAtSpawn();
    }

    others() { return Object.values(this.players).filter(p => !p.isMe); }

    placeAtSpawn() {
      this.roster.forEach((id, i) => {
        const p = this.players[id]; if (!p) return;
        const s = SPAWNS[i % SPAWNS.length];
        Object.assign(p, { x: s.x, y: s.y, vx: 0, vy: 0, snaps: [], stunUntil: 0, invulnUntil: 0, shieldUntil: 0, shieldRemote: false, power: null, lastPrint: null, nextThrow: 0, strafeUntil: 0, unstickUntil: 0, stuckSince: 0, ammo: p.maxAmmo || MAX_AMMO, nextReload: 0, inShop: false });
        p.aim = s.x < W / 2 ? 0 : Math.PI;
        p.ice.setVisible(false); p.bubble.setVisible(false); p.c.setPosition(p.x, p.y);
      });
    }

    setHost(v) { this.isHost = v; if (v && this.mode === 'play' && this.pus.size === 0) this.nextPu = now() + 4000; }

    removePlayer(id) {
      const p = this.players[id];
      if (!p || p.isMe) return;
      p.c.destroy(); delete this.players[id];
      this.roster = this.roster.filter(x => x !== id);
      delete this.scores[id];
      this.pushScores();
    }

    startRound() {
      if (!this.me) return;
      this.balls.forEach(b => this.removeBall(b, null));
      this.pus.forEach(p => p.c.destroy()); this.pus.clear();
      if (this.confetti) { this.confetti.destroy(); this.confetti = null; }
      this.slow = 1; this.tweens.timeScale = 1;
      this.roster.forEach(id => { this.scores[id] = 0; });
      this.pushScores(); UI.setPower(null); UI.setAmmo(this.me.ammo, this.me.maxAmmo); UI.setCoins(Arena.persist.coins); this.nextCoin = now() + 9000;
      this.placeAtSpawn();
      this.mode = 'countdown';
      this.ballSeq = 0; this.puSeq = 0; this.nextPu = 0;
      const seq = ['3', '2', '1', 'קדימה!'];
      seq.forEach((t, i) => this.time.delayedCall(i * 750, () => {
        if (this.mode !== 'countdown') return;
        UI.countdown(t);
        if (i < 3) Sfx.beep(); else { Sfx.go(); this.mode = 'play'; this.nextPu = now() + 5000; UI.showHint(); }
      }));
    }

    stop() { this.clearAll(); this.me = null; this.roster = []; }

    /* ---------- לולאה ---------- */
    update(time, deltaMs) {
      const dt = Math.min(deltaMs, 50) / 1000 * this.slow;
      const t = now();
      if (this.me) {
        this.updateMe(dt, t);
        this.others().forEach(p => p.isBot ? this.updateBot(p, dt, t) : this.updateRemote(p, t));
        this.updateBalls(dt, t);
        this.updatePus(t);
        Object.values(this.players).forEach(p => this.animate(p, dt, t));
      }
    }

    updateMe(dt, t) {
      const p = this.me, k = this.keys;
      let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      const len = Math.hypot(ix, iy) || 1; ix /= len; iy /= len;
      const canMove = this.mode === 'play' && t > p.stunUntil && !p.inShop;
      const ice = inPond(p.x, p.y);
      const accel = ice ? 2.4 : 15;
      const f = 1 - Math.exp(-accel * dt);
      p.crouch = this.mode === 'play' && k.ALT.isDown;
      const sp = canMove ? SPEED * (p.speedMul || 1) * (ice ? 1.15 : 1) * (p.crouch ? CROUCH_SPEED : 1) : 0;
      p.vx += (ix * sp - p.vx) * f; p.vy += (iy * sp - p.vy) * f;
      p.x += p.vx * dt; p.y += p.vy * dt;
      resolve(p);
      p.moving = Math.hypot(p.vx, p.vy) > 40;
      this.reloadAt(p, t);
      // מנעול + מכונה אפורה = אי אפשר להטעין עכשיו (יותר מ-3 כדורים). כשאפשר – המנעול נעלם והמכונה נדלקת
      const locked = this.mode === 'play' && p.ammo > RELOAD_FROM && !p.refilling;
      if (locked !== this.machineLocked) {
        this.machineLocked = locked;
        if (locked) this.machineImg.setTint(0x8f99aa).setAlpha(0.8); else this.machineImg.clearTint().setAlpha(1);
      }

      // כיוון הזריקה = הכיוון שהולכים אליו (או האחרון שהלכו אליו)
      if ((ix || iy) && canMove) p.aim = Math.atan2(iy, ix);
      const active = this.mode === 'play' || this.mode === 'countdown';
      this.aimArrow.setVisible(active)
        .setPosition(p.x + Math.cos(p.aim) * 38, p.y - 12 + Math.sin(p.aim) * 22)
        .setRotation(p.aim).setDepth(p.y + 1);

      if (k.SPACE.isDown && this.mode === 'play' && !p.inShop && t > p.stunUntil && t >= p.nextThrow) this.throwBall(t);

      // דלת הבקתה: עומדים מולה ולוחצים חץ למעלה כדי להיכנס לחנות; חץ למטה – יציאה
      const ddx = (p.x - DOOR.x) / DOOR.rx, ddy = (p.y - DOOR.y) / DOOR.ry;
      const atDoor = DOOR_SHOP && this.mode === 'play' && ddx * ddx + ddy * ddy <= 1;
      this.doorArrow.setVisible(atDoor && !p.inShop);
      const JD = Phaser.Input.Keyboard.JustDown;
      const upNow = JD(k.UP) || JD(k.W), downNow = JD(k.DOWN) || JD(k.S);
      if (atDoor && !p.inShop && upNow && t > p.stunUntil) this.openShop();
      else if (p.inShop && (downNow || this.mode !== 'play')) this.closeShop();

      if (t - (this.lastSend || 0) > this.sendEvery && (this.mode === 'play' || this.mode === 'countdown')) {
        this.lastSend = t;
        this.send('st', { x: Math.round(p.x), y: Math.round(p.y), a: Math.round(p.aim * 100) / 100, m: p.moving ? 1 : 0, sh: t < p.shieldUntil ? 1 : 0, cr: p.crouch ? 1 : 0 });
      }
    }

    updateRemote(p, t) {
      const s = p.snaps;
      if (!s.length) return;
      const rt = t - this.renderDelay; // מציגים את השחקן מעט "באיחור" כדי שהתנועה תהיה חלקה
      let a = s[0], b = s[s.length - 1];
      for (let i = s.length - 1; i >= 0; i--) { if (s[i].t <= rt) { a = s[i]; b = s[i + 1] || s[i]; break; } }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
      const px = p.x, py = p.y;
      // רק מיקומים אמיתיים שהגיעו מהמחשב השני – בלי ניחושים
      p.x = a.x + (b.x - a.x) * k; p.y = a.y + (b.y - a.y) * k;
      let da = b.a - a.a; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      p.aim = a.a + da * k;
      p.moving = (b.m || a.m) && (Math.abs(p.x - px) + Math.abs(p.y - py) > 0.3);
      p.shieldRemote = !!b.sh;
      p.crouch = !!b.cr;
    }

    animate(p, dt, t) {
      p.c.setPosition(p.x, p.y).setDepth(p.y);
      const face = Math.cos(p.aim) >= 0 ? 1 : -1;
      const sn = Math.sin(p.aim);
      const view = sn < -0.55 ? 'back' : sn > 0.55 ? 'front' : 'side';
      if (view !== p.view) {
        const key = view === 'front' ? 'doll_' + p.dollName : 'doll' + view + '_' + p.dollName;
        if (this.textures.exists(key)) {
          p.view = view;
          p.face.setTexture(key).setScale(DOLL_H / this.textures.get(key).getSourceImage().height);
        }
      }
      p.facing = face;
      if (p.moving) {
        p.walkT += dt * 15;
        p.body.y = -Math.abs(Math.sin(p.walkT)) * 5;
        p.body.rotation = Math.sin(p.walkT) * 0.08;
        this.footprints(p);
      } else {
        p.body.y *= 0.8; p.body.rotation *= 0.8;
      }
      p.punch = Math.max(0, p.punch - dt * 5);
      const breathe = 1 + Math.sin(t / 320) * 0.015;
      p.crouchK = (p.crouchK || 0) + ((p.crouch ? 1 : 0) - (p.crouchK || 0)) * Math.min(1, dt * 16);
      const ck = p.crouchK;
      p.body.scaleX = face * (1 + p.punch * 0.16) * (1 + ck * 0.1);
      p.body.scaleY = breathe * (1 - p.punch * 0.1) * (1 - ck * 0.4);
      if (p.c.nameLabel) p.c.nameLabel.y = -84 + ck * 30;
      p.bubble.y = -33 + ck * 12;
      p.body.rotation += face * p.punch * 0.28;
      const stunned = t < p.stunUntil;
      p.ice.setVisible(stunned);
      if (stunned) { p.body.x = Math.sin(t / 22) * 2.2; } else p.body.x = 0;
      p.face.setTint(stunned ? 0xb8e6ff : 0xffffff);
      const shield = p.isMe ? t < p.shieldUntil : p.shieldRemote;
      p.bubble.setVisible(shield);
      if (shield) { p.bubble.setScale(0.72 + Math.sin(t / 150) * 0.03); p.bubble.alpha = p.isMe && p.shieldUntil - t < 1200 ? (Math.sin(t / 60) > 0 ? 1 : 0.3) : 1; }
      // מהבהב קצת אחרי פגיעה
      p.body.alpha = (!stunned && t < p.invulnUntil) ? (Math.sin(t / 45) > 0 ? 1 : 0.45) : 1;
    }

    footprints(p) {
      if (inPond(p.x, p.y)) return;
      if (!p.lastPrint) { p.lastPrint = { x: p.x, y: p.y }; return; }
      const d = dist(p.x, p.y, p.lastPrint.x, p.lastPrint.y);
      if (d < 17) return;
      const ang = Math.atan2(p.y - p.lastPrint.y, p.x - p.lastPrint.x);
      p.printSide *= -1;
      const ox = Math.cos(ang + Math.PI / 2) * 5 * p.printSide, oy = Math.sin(ang + Math.PI / 2) * 5 * p.printSide;
      const img = this.add.image(p.x + ox, p.y + oy, 'print').setRotation(ang + Math.PI / 2).setDepth(-60).setAlpha(0.8);
      this.prints.push(img);
      this.tweens.add({ targets: img, alpha: 0, delay: 2500, duration: 4000, onComplete: () => { img.destroy(); this.prints = this.prints.filter(x => x !== img); } });
      if (this.prints.length > 160) this.prints.shift().destroy();
      p.lastPrint = { x: p.x, y: p.y };
      if (Math.random() < 0.35) this.puff(p.x, p.y, 3, 0.35);
    }

    /* ---------- החנות ---------- */
    addCoins(n) {
      Arena.persist.coins += n; UI.setCoins(Arena.persist.coins, true);
      if (this.me && this.me.inShop) UI.openShop();
    }
    openShop() {
      const p = this.me; p.inShop = true; p.vx = p.vy = 0;
      Sfx.click(); UI.openShop();
    }
    closeShop() {
      if (!this.me || !this.me.inShop) return;
      this.me.inShop = false; UI.closeShop();
    }
    buy(id) {
      const item = SHOP[id], P = Arena.persist, p = this.me;
      if (!item || !p || !p.inShop || P.coins < item.price) return false;
      if ((id === 'boots' && P.boots) || (id === 'bag' && P.bag)) return false;
      P.coins -= item.price;
      if (id === 'boots') { P.boots = true; p.speedMul = 1.15; }
      if (id === 'bag') { P.bag = true; p.maxAmmo = BIG_BAG; UI.setAmmo(p.ammo, p.maxAmmo); }
      if (id === 'shield') { p.shieldUntil = now() + 5000; UI.setPower({ type: 'shield', n: 0 }); this.time.delayedCall(5000, () => { if (this.me && !this.me.power) UI.setPower(null); }); }
      Sfx.pickup(); UI.setCoins(P.coins);
      return true;
    }

    /* ---------- מכונת הכדורים ---------- */
    // המכונה עובדת רק כשנשארו 3 כדורים או פחות, וממלאת עד 10 (אם יוצאים באמצע – נשאר מה שנטען)
    reloadAt(p, t) {
      if (this.mode !== 'play') return;
      const zx = (p.x - MACHINE.x) / ZONE.rx, zy = (p.y - (MACHINE.y + ZONE.dy)) / ZONE.ry;
      const inZone = zx * zx + zy * zy <= 1;
      if (!inZone) { p.refilling = false; p.zoneWarned = false; return; }
      if (!p.refilling) {
        if (p.ammo > RELOAD_FROM) {
          return;
        }
        p.refilling = true;
      }
      const full = p.maxAmmo || MAX_AMMO;
      if (p.ammo >= full) { p.refilling = false; return; }
      if (t < p.nextReload) return;
      p.ammo++; p.nextReload = t + RELOAD_EVERY;
      if (p.ammo >= full) p.refilling = false;
      if (p.isMe) {
        UI.setAmmo(p.ammo, full); Sfx.reload(p.ammo);
        if (p.ammo === full) { p.zoneWarned = true; this.floatText(p.x, p.y - 100, 'מלא!', '#9ff0ff'); }
      }
      this.puff(MACHINE.x, MACHINE.y - 40, 2, 0.4);
    }

    /* ---------- הרובוט (מצב אימון) ---------- */
    // האם יש קו ישר (בלי עצים/בקתה/חומות) בין שתי נקודות
    lineClear(x1, y1, x2, y2) {
      const d = dist(x1, y1, x2, y2), n = Math.ceil(d / 12);
      for (let i = 2; i < n; i++) {
        const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
        if (ballBlocked(x, y, 9.5)) return false;
      }
      return true;
    }

    updateBot(p, dt, t) {
      const me = this.me;
      const canAct = this.mode === 'play' && t > p.stunUntil;
      let dx = 0, dy = 0;
      const d = dist(p.x, p.y, me.x, me.y) || 1;
      const clear = this.lineClear(p.x, p.y, me.x, me.y);

      if (canAct) {
        // 1. התחמקות: מחפשים כדור שעומד לעבור קרוב (אחרי זמן תגובה של "אדם מהיר")
        let dodge = null, soonest = 1;
        this.balls.forEach(b => {
          if (b.owner === p.id || b.t < BOT.react) return;
          const vv = b.vx * b.vx + b.vy * b.vy;
          const tc = ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / vv; // מתי הכדור הכי קרוב
          if (tc < 0 || tc > 0.7 || tc > b.life - b.t) return;
          const cx = b.x + b.vx * tc - p.x, cy = b.y + b.vy * tc - p.y;
          const rr = BODY_RX + b.r + BOT.dodgeMargin;
          if (cx * cx + cy * cy < rr * rr && tc < soonest) {
            soonest = tc;
            let ux = -cx, uy = -cy;
            if (Math.hypot(ux, uy) < 4) { ux = -b.vy; uy = b.vx; if ((p.strafeDir || 1) < 0) { ux = -ux; uy = -uy; } }
            dodge = [ux, uy];
          }
        });
        if (p.ammo === 0 || (p.ammo <= RELOAD_FROM && d > 320)) p.reloading = true;
        if (p.ammo >= MAX_AMMO) p.reloading = false;
        if (dodge) { dx = dodge[0]; dy = dodge[1]; }
        else if (p.reloading) { // הולכים למכונה ועומדים מולה עד שמתמלא
          const fx = MACHINE.x, fy = MACHINE.y - 36; // עומדים מאחורי המכונה (מלפנים יש אגם)
          if (dist(p.x, p.y, fx, fy) > 14) { dx = fx - p.x; dy = fy - p.y; }
        }
        else {
          // 2. בונוס קרוב – רצים אליו אם הרובוט מגיע לפני השחקנית
          let goal = null;
          this.pus.forEach(pu => {
            if (pu.taken) return;
            const mine = dist(p.x, p.y, pu.x, pu.y);
            if (mine < 480 && mine < dist(me.x, me.y, pu.x, pu.y) + 80) goal = pu;
          });
          if (goal) { dx = goal.x - p.x; dy = goal.y - p.y; }
          else {
            // 3. שומרים מרחק טוב וזזים מצד לצד; אם יש עץ באמצע – מתקרבים ומחפשים זווית
            const ux = (me.x - p.x) / d, uy = (me.y - p.y) / d;
            const want = clear ? BOT.keepDist : 170;
            const radial = d > want + 70 ? 1 : d < want - 70 ? -1 : 0;
            if (t > p.strafeUntil) { p.strafeDir = Math.random() < 0.5 ? -1 : 1; p.strafeUntil = t + 500 + Math.random() * 900; }
            dx = ux * radial - uy * p.strafeDir * 0.9;
            dy = uy * radial + ux * p.strafeDir * 0.9;
          }
        }
        // נתקע בקיר? בוחרים כיוון אחר לרגע
        if (t < p.unstickUntil) { dx = p.unstickX; dy = p.unstickY; }
      }

      // תנועה – אותם חוקים כמו לשחקנית (כולל החלקה על הקרח)
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const ice = inPond(p.x, p.y);
      const f = 1 - Math.exp(-(ice ? 2.4 : 15) * dt);
      const sp = canAct && (dx || dy) ? SPEED * BOT.speed * (ice ? 1.15 : 1) : 0;
      p.vx += (dx * sp - p.vx) * f; p.vy += (dy * sp - p.vy) * f;
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      resolve(p);
      p.moving = Math.hypot(p.vx, p.vy) > 40;
      this.reloadAt(p, t);
      if (canAct && sp && dist(ox, oy, p.x, p.y) < SPEED * dt * 0.25) {
        if (!p.stuckSince) p.stuckSince = t;
        if (t - p.stuckSince > 250) {
          const a = Math.random() * Math.PI * 2;
          p.unstickX = Math.cos(a); p.unstickY = Math.sin(a); p.unstickUntil = t + 450; p.stuckSince = 0;
        }
      } else p.stuckSince = 0;
      p.shieldRemote = t < p.shieldUntil;

      // כיוון וזריקה: מכוונים למקום שבו השחקנית תהיה כשהכדור יגיע
      if (!canAct) return;
      const big = p.power && p.power.type === 'big';
      const S = BALL_SPEED * (big ? 0.82 : 1);
      const Dx = me.x - p.x, Dy = me.y - p.y;
      const a2 = me.vx * me.vx + me.vy * me.vy - S * S, b2 = 2 * (Dx * me.vx + Dy * me.vy), c2 = Dx * Dx + Dy * Dy;
      let ti = d / S;
      const disc = b2 * b2 - 4 * a2 * c2;
      if (disc >= 0 && a2 !== 0) {
        const r1 = (-b2 - Math.sqrt(disc)) / (2 * a2), r2 = (-b2 + Math.sqrt(disc)) / (2 * a2);
        const best = [r1, r2].filter(x => x > 0).sort((x, y) => x - y)[0];
        if (best) ti = best;
      }
      const tx = me.x + me.vx * ti, ty = me.y + me.vy * ti;
      p.aim = Math.atan2(ty - p.y, tx - p.x) + (Math.random() - 0.5) * BOT.aimError;
      const inRange = dist(p.x, p.y, tx, ty) < BALL_RANGE * 0.85;
      if (t >= p.nextThrow && inRange && this.lineClear(p.x, p.y, tx, ty) && t > me.invulnUntil - 150) this.botThrow(p, t);
    }

    botThrow(p, t) {
      if (p.ammo <= 0) return;
      p.ammo--;
      p.nextThrow = t + COOLDOWN + Math.random() * BOT.extraCooldown;
      p.punch = 1;
      let big = false, angles = [p.aim];
      if (p.power) {
        if (p.power.type === 'big') big = true;
        if (p.power.type === 'triple') angles = [p.aim - 0.2, p.aim, p.aim + 0.2];
        if (--p.power.n <= 0) p.power = null;
      }
      angles.forEach(a => this.spawnBall({
        id: 'bot' + (++this.ballSeq), x: Math.round(p.x + Math.cos(a) * 22), y: Math.round(p.y + Math.sin(a) * 14),
        a, big: big ? 1 : 0
      }, p.id));
      Sfx.throw();
    }

    botHit(o, b, t) {
      if (t < o.shieldUntil) {
        this.removeBall(b, 'block'); this.flashBubble(o); Sfx.block();
        this.floatText(o.x, o.y - 100, 'נחסם!', '#7fe3ff');
        return;
      }
      o.vx = b.vx * 0.35; o.vy = b.vy * 0.35;
      // בדיוק כמו פגיעה שמגיעה ממחשב אחר
      this.onMessage('hit', { id: b.id, by: this.meId }, o.id);
    }

    /* ---------- כדורים ---------- */
    throwBall(t) {
      const p = this.me;
      if (p.ammo <= 0) { // נגמרו הכדורים
        p.nextThrow = t + 600; Sfx.empty();
        this.floatText(p.x, p.y - 100, 'נגמרו הכדורים!', '#ffb4b4');
        UI.setAmmo(0, p.maxAmmo, true);
        return;
      }
      p.ammo--; UI.setAmmo(p.ammo, p.maxAmmo);
      p.nextThrow = t + COOLDOWN; p.punch = 1;
      let big = false, angles = [p.aim];
      if (p.power) {
        if (p.power.type === 'big') big = true;
        if (p.power.type === 'triple') angles = [p.aim - 0.2, p.aim, p.aim + 0.2];
        p.power.n--;
        if (p.power.n <= 0) p.power = null;
        UI.setPower(p.power);
      }
      const list = angles.map(a => ({ id: this.meId.slice(0, 4) + (++this.ballSeq), x: Math.round(p.x + Math.cos(a) * 22), y: Math.round(p.y + Math.sin(a) * 14), a: Math.round(a * 1000) / 1000, big: big ? 1 : 0 }));
      list.forEach(b => this.spawnBall(b, this.meId));
      this.send('th', { b: list });
      Sfx.throw();
    }

    spawnBall(d, owner) {
      if (this.balls.has(d.id)) return;
      const big = !!d.big, speed = BALL_SPEED * (big ? 0.82 : 1), r = big ? 17 : 9.5;
      const sprite = this.add.image(d.x, d.y - 16, 'ball').setScale(r / 36);
      const shadow = this.add.image(d.x, d.y, 'shadow').setScale(r / 22, r / 30).setDepth(-40);
      const trail = this.add.particles(0, 0, 'flake', {
        follow: sprite, lifespan: 260, speed: { min: 4, max: 22 },
        scale: { start: big ? 1.1 : 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 14
      });
      const b = { id: d.id, owner, x: d.x, y: d.y, vx: Math.cos(d.a) * speed, vy: Math.sin(d.a) * speed, t: 0, life: BALL_RANGE / speed, r, big, h: 16, sprite, shadow, trail };
      this.balls.set(d.id, b);
      if (owner !== this.meId) this.players[owner] && (this.players[owner].punch = 1);
    }

    removeBall(b, fx) {
      if (!this.balls.has(b.id)) return;
      this.balls.delete(b.id);
      if (fx) this.poof(b.x, b.y - b.h, b.big ? 26 : 14, b.big ? 1.3 : 0.9, fx);
      b.sprite.destroy(); b.shadow.destroy();
      b.trail.stop(); this.time.delayedCall(320, () => b.trail.destroy());
    }

    updateBalls(dt, t) {
      this.balls.forEach(b => {
        b.px = b.x; b.py = b.y; // איפה הכדור היה רגע לפני
        b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
        const pr = b.t / b.life;
        b.h = 16 + Math.sin(Math.min(pr, 1) * Math.PI) * 30 - Math.max(0, pr - 0.85) * 60;
        b.sprite.setPosition(b.x, b.y - b.h).setDepth(b.y + 30);
        b.sprite.rotation += dt * 9;
        if (b.h > LOW_WALL_H && overLowWall(b.x, b.y)) b.wallAt = { x: b.x, y: b.y };
        const sh = 1 - (b.h - 16) / 60;
        b.shadow.setPosition(b.x, b.y).setScale(b.r / 22 * sh, b.r / 30 * sh);

        if (pr >= 1) { Sfx.splat(); return this.removeBall(b, 'drop'); }
        if (b.x < B.x1 - 14 || b.x > B.x2 + 14 || b.y < B.y1 - 30 || b.y > B.y2 + 14 || ballBlocked(b.x, b.y, b.r, b.h)) { Sfx.splat(); return this.removeBall(b, 'splat'); }
        if (this.mode !== 'play' && this.mode !== 'over') return;

        if (b.owner !== this.meId) {
          const me = this.me;
          if (this.mode === 'play' && t > me.invulnUntil && touches(b, me) && !(me.crouch && b.wallAt && dist(b.wallAt.x, b.wallAt.y, me.x, me.y) < WALL_COVER)) this.onLocalHit(b, t);
        } else if (!b.ghost) {
          for (const o of this.others()) {
            if (o.isBot) { // את הרובוט בודקים כאן, כי הוא "חי" במחשב הזה
              if (this.mode === 'play' && t > o.invulnUntil && touches(b, o)) { this.botHit(o, b, t); break; }
              continue;
            }
            if (t > o.invulnUntil && touches(b, o) && !(o.crouch && b.wallAt && dist(b.wallAt.x, b.wallAt.y, o.x, o.y) < WALL_COVER)) {
              b.ghost = true; // נראה שפגע – מחכים לאישור מהמחשב של מי שנפגע
              b.sprite.setAlpha(0.35); b.trail.stop();
              break;
            }
          }
        }
      });
    }

    onLocalHit(b, t) {
      const me = this.me;
      if (me.inShop) this.closeShop();
      if (t < me.shieldUntil) {
        this.removeBall(b, 'block'); Sfx.block();
        this.flashBubble(me); this.floatText(me.x, me.y - 110, 'נחסם!', '#7fe3ff');
        this.send('blk', { id: b.id });
        return;
      }
      me.stunUntil = t + 650; me.invulnUntil = t + 1300;
      me.vx = b.vx * 0.35; me.vy = b.vy * 0.35;
      this.removeBall(b, 'hit');
      this.poof(me.x, me.y - 40, 30, 1.4, 'hit');
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.flash(140, 200, 235, 255);
      Sfx.hitMe();
      this.floatText(me.x, me.y - 100, 'אאוץ׳!', '#ffffff');
      this.send('hit', { id: b.id, by: b.owner });
      if (this.isHost) this.awardPoint(b.owner);
    }

    /* ---------- הודעות מהמחשב השני ---------- */
    onMessage(type, d, from) {
      if (!this.me) return;
      const t = now();
      const sender = this.players[from];
      switch (type) {
        case 'st':
          if (!sender || typeof d.x !== 'number') return;
          sender.snaps.push({ t, x: d.x, y: d.y, a: +d.a || 0, m: d.m, sh: d.sh });
          if (sender.snaps.length > 30) sender.snaps.shift();
          break;
        case 'th':
          if (!sender) return;
          (Array.isArray(d.b) ? d.b.slice(0, 3) : []).forEach(b => this.spawnBall(b, from));
          Sfx.throw();
          break;
        case 'hit': { // from = מי שנפגע, d.by = מי שזרק
          if (!sender) return;
          const b = this.balls.get(d.id);
          if (b) this.removeBall(b, null);
          sender.stunUntil = t + 650; sender.invulnUntil = t + 1300;
          this.poof(sender.x, sender.y - 40, 30, 1.4, 'hit');
          this.cameras.main.shake(140, 0.005);
          Sfx.hit();
          this.floatText(sender.x, sender.y - 100, 'פגיעה!', '#ffe066');
          const thrower = this.players[d.by];
          if (thrower) this.floatText(thrower.x, thrower.y - 100, '+1', '#ffe066');
          if (d.by === this.meId) this.addCoins(COIN_PER_HIT);
          if (this.isHost) this.awardPoint(d.by);
          break;
        }
        case 'blk': {
          if (!sender) return;
          const b = this.balls.get(d.id);
          if (b) this.removeBall(b, 'block');
          this.flashBubble(sender); Sfx.block();
          break;
        }
        case 'sc':
          if (d.s) { this.scores = d.s; this.pushScores(); }
          break;
        case 'win':
          this.doWin(d.w);
          break;
        case 'pu': this.addPu(d); break;
        case 'puc': if (this.isHost && sender && this.pus.has(d.id) && !this.pus.get(d.id).taken) this.grantPu(d.id, from); break;
        case 'pug': this.applyGrant(d); break;
        case 'pux': this.removePu(d.id, false); break;
      }
    }

    awardPoint(by) {
      if (this.mode !== 'play' || this.scores[by] == null) return;
      this.scores[by]++;
      this.send('sc', { s: this.scores });
      this.pushScores();
      if (this.scores[by] >= WIN_SCORE) { this.send('win', { w: by }); this.doWin(by); }
    }
    pushScores() { UI.setScores(this.scores); }

    doWin(w) {
      if (this.mode === 'over' || !this.me) return;
      this.mode = 'over'; this.aimArrow.setVisible(false); this.input.keyboard.clearCaptures();
      const iWon = w === this.meId;
      this.slow = 0.2; this.tweens.timeScale = 0.3;
      this.time.delayedCall(1100, () => {
        this.slow = 1; this.tweens.timeScale = 1;
        if (!this.me) return;
        if (iWon) {
          this.confetti = this.add.particles(0, -20, 'confetti', {
            x: { min: 0, max: W }, lifespan: 4500, speedY: { min: 160, max: 360 }, speedX: { min: -90, max: 90 },
            rotate: { start: 0, end: 540 }, scaleY: { start: 1, end: 0.3 }, gravityY: 40,
            tint: [0xef4444, 0xfacc15, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899], frequency: 18, quantity: 3
          }).setDepth(9400);
          this.time.delayedCall(2600, () => this.confetti && this.confetti.stop());
          Sfx.win();
        } else Sfx.lose();
        UI.showWin(iWon, this.players[w] ? this.players[w].name : '', this.scores);
      });
    }

    /* ---------- בונוסים ---------- */
    updatePus(t) {
      if (this.isHost && this.mode === 'play') {
        const all = [...this.pus.values()], bonuses = all.filter(p => p.type !== 'coin').length, coins = all.length - bonuses;
        if (bonuses === 0 && this.nextPu && t > this.nextPu) this.spawnPuHost(t);
        if (COINS_ON && coins < 2 && this.nextCoin && t > this.nextCoin) { this.spawnPuHost(t, 'coin'); this.nextCoin = t + 7000 + Math.random() * 5000; }
        this.pus.forEach(p => { if (!p.taken && t > p.expire) { this.send('pux', { id: p.id }); this.removePu(p.id, false); if (p.type !== 'coin') this.nextPu = t + 6000; } });
      }
      if (this.mode !== 'play') return;
      const bot = this.botId && this.players[this.botId];
      this.pus.forEach(p => {
        if (p.taken || p.claimed) return;
        if (bot && p.type !== 'coin' && dist(bot.x, bot.y, p.x, p.y) < 38) { this.grantPu(p.id, bot.id); return; }
        if (dist(this.me.x, this.me.y, p.x, p.y) < 38) {
          if (this.isHost) this.grantPu(p.id, this.meId);
          else { p.claimed = true; this.send('puc', { id: p.id }); }
        }
      });
    }

    spawnPuHost(t, forceType) {
      const types = ['big', 'triple', 'shield'];
      let x = 0, y = 0;
      for (let i = 0; i < 40; i++) {
        x = 300 + Math.random() * 680; y = B.y1 + 30 + Math.random() * (B.y2 - B.y1 - 60);
        const p = { x, y, vx: 0, vy: 0 }; resolve(p);
        if (p.x === x && p.y === y && !inPond(x, y) && Object.values(this.players).every(q => dist(x, y, q.x, q.y) > 120)) break;
      }
      const d = { id: 'u' + (++this.puSeq), type: forceType || types[(Math.random() * 3) | 0], x: Math.round(x), y: Math.round(y) };
      this.send('pu', d);
      this.addPu(d);
      if (!forceType) this.nextPu = Infinity;
    }

    addPu(d) {
      if (this.pus.has(d.id) || !PU_INFO[d.type]) return;
      const info = PU_INFO[d.type];
      const c = this.add.container(d.x, d.y).setDepth(d.y);
      const shadow = this.add.image(0, 4, 'shadow').setScale(0.7, 0.6);
      const glow = this.add.image(0, -26, 'glow').setTint(info.color).setScale(1.1).setAlpha(0.7);
      const orb = this.add.image(0, -26, 'pu_' + d.type).setScale(0.42);
      c.add([shadow, glow, orb]);
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 450, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [orb, glow], y: -34, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: glow, scale: 1.4, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
      const spark = this.add.particles(d.x, d.y - 30, 'flake', {
        speed: { min: 10, max: 40 }, lifespan: 700, scale: { start: 0.5, end: 0 }, tint: info.color, frequency: 120, alpha: { start: 1, end: 0 }
      }).setDepth(d.y + 1);
      this.pus.set(d.id, { id: d.id, type: d.type, x: d.x, y: d.y, c, spark, expire: now() + 12000 });
      Sfx.appear();
    }

    grantPu(id, by) {
      const p = this.pus.get(id);
      if (!p || p.taken) return;
      p.taken = true;
      const d = { id, by, type: p.type };
      this.send('pug', d);
      this.applyGrant(d);
      if (d.type !== 'coin') this.nextPu = now() + 7000 + Math.random() * 4000;
    }

    applyGrant(d) {
      const p = this.pus.get(d.id);
      const type = p ? p.type : d.type;
      if (p) {
        this.burst(p.x, p.y - 30, PU_INFO[type].color);
        this.removePu(d.id, true);
      }
      const who = this.players[d.by];
      if (!who) return;
      this.floatText(who.x, who.y - 100, PU_INFO[type].label, '#' + PU_INFO[type].color.toString(16).padStart(6, '0'));
      if (type === 'coin') { if (d.by === this.meId) { Sfx.pickup(); this.addCoins(COIN_PICKUP); } return; }
      if (who.isBot) {
        if (type === 'shield') who.shieldUntil = now() + 5000; else who.power = { type, n: 3 };
      }
      if (d.by === this.meId) {
        Sfx.pickup();
        if (type === 'shield') { this.me.shieldUntil = now() + 5000; UI.setPower({ type: 'shield', n: 0 }); this.time.delayedCall(5000, () => { if (this.me && !this.me.power) UI.setPower(null); }); }
        else { this.me.power = { type, n: 3 }; UI.setPower(this.me.power); }
      }
    }

    removePu(id, fast) {
      const p = this.pus.get(id);
      if (!p) return;
      this.pus.delete(id);
      p.spark.stop(); this.time.delayedCall(800, () => p.spark.destroy());
      if (fast) p.c.destroy();
      else this.tweens.add({ targets: p.c, scale: 0, duration: 250, onComplete: () => p.c.destroy() });
    }

    /* ---------- אפקטים ---------- */
    poof(x, y, n, size, kind) {
      const e = this.add.particles(x, y, 'chunk', {
        speed: { min: 60, max: 240 * size }, angle: { min: 0, max: 360 }, lifespan: { min: 350, max: 650 },
        scale: { start: 0.9 * size, end: 0 }, gravityY: 420, rotate: { min: 0, max: 360 }, emitting: false
      }).setDepth(y + 60);
      e.explode(n);
      const f = this.add.particles(x, y, 'flake', {
        speed: { min: 20, max: 110 * size }, lifespan: 500, scale: { start: 1.2 * size, end: 0 }, alpha: { start: 0.9, end: 0 }, emitting: false
      }).setDepth(y + 61);
      f.explode(Math.round(n * 0.8));
      if (kind === 'hit' || kind === 'block') {
        const ring = this.add.image(x, y, 'ring').setDepth(y + 62).setScale(0.3).setTint(kind === 'block' ? 0x7fe3ff : 0xffffff);
        this.tweens.add({ targets: ring, scale: 2.2 * size, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      }
      this.time.delayedCall(900, () => { e.destroy(); f.destroy(); });
    }
    puff(x, y, n, size) {
      const e = this.add.particles(x, y, 'flake', { speed: { min: 10, max: 50 }, lifespan: 380, scale: { start: 0.7 * size + 0.3, end: 0 }, alpha: { start: 0.8, end: 0 }, emitting: false }).setDepth(y - 1);
      e.explode(n); this.time.delayedCall(500, () => e.destroy());
    }
    burst(x, y, color) {
      const e = this.add.particles(x, y, 'flake', { speed: { min: 80, max: 260 }, lifespan: 600, scale: { start: 1.2, end: 0 }, tint: [color, 0xffffff], emitting: false }).setDepth(9000);
      e.explode(30); this.time.delayedCall(800, () => e.destroy());
    }
    flashBubble(p) {
      p.bubble.setVisible(true).setScale(1.15);
      this.tweens.add({ targets: p.bubble, scale: 0.72, duration: 260, ease: 'Back.easeOut' });
    }
    floatText(x, y, txt, color) {
      const t = this.add.text(x, y, txt, {
        fontFamily: 'Rubik, Arial, sans-serif', fontSize: '28px', fontStyle: '900', color,
        stroke: '#1b2a4a', strokeThickness: 6, rtl: true
      }).setOrigin(0.5).setDepth(9300).setScale(0.3);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: y - 48, alpha: 0, delay: 500, duration: 650, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    }
  }

  /* ---------- ממשק חיצוני ---------- */
  const Arena = window.Arena = {
    images: {}, scene: null,
    init(onReady) {
      Arena._ready = onReady;
      const keys = ['ice', 'ball', 'pu_big', 'pu_triple', 'pu_shield', 'pu_coin'];
      const srcs = keys.map(k => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG_ASSETS[k]));
      keys.push('arena'); srcs.push(window.ARENA_IMG);
      // הבובות והמכונה שמורות בלי הקידומת – מוסיפים אותה כאן
      const png = (b) => (b.startsWith('data:') ? b : 'data:image/png;base64,' + b);
      keys.push('machine'); srcs.push(png(window.MACHINE_IMG));
      Object.keys(window.ARENA_IMGS || {}).forEach(n => { keys.push('arena_' + n); srcs.push('data:image/jpeg;base64,' + window.ARENA_IMGS[n]); });
      Object.keys(window.DOLL_IMGS).forEach(n => { keys.push('doll_' + n); srcs.push(png(window.DOLL_IMGS[n])); });
      Object.keys(window.DOLL_VIEWS || {}).forEach(n => {
        keys.push('dollback_' + n); srcs.push(png(window.DOLL_VIEWS[n].back));
        keys.push('dollside_' + n); srcs.push(png(window.DOLL_VIEWS[n].side));
      });
      Promise.all(keys.map((k, i) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => { Arena.images[k] = img; res(); };
        img.onerror = rej;
        img.src = srcs[i];
      }))).then(() => {
        new Phaser.Game({
          type: Phaser.AUTO, parent: 'stage', width: W, height: H, backgroundColor: '#f4f1ea',
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
          render: { antialias: true }, scene: ArenaScene, banner: false
        });
      });
    },
    setupMatch(o) { Arena.scene.setupMatch(o); },
    startRound() { Arena.scene.startRound(); },
    onMessage(type, d, from) { Arena.scene && Arena.scene.onMessage(type, d, from); },
    setHost(v) { Arena.scene && Arena.scene.setHost(v); },
    arenaKey: 'classic',
    arenaList: ['classic', 'mountains', 'shops'],
    setArena(key) { Arena.arenaKey = key; if (Arena.scene && Arena.scene.mode === 'idle') Arena.scene.buildArena(key); },
    // מה שנקנה בחנות נשמר בין סיבובים (עד שיוצאים מהחדר)
    persist: { coins: 0, boots: false, bag: false },
    resetShop() { Arena.persist = { coins: 0, boots: false, bag: false }; },
    shopPrices: SHOP,
    buy(id) { return Arena.scene ? Arena.scene.buy(id) : false; },
    closeShop() { Arena.scene && Arena.scene.closeShop(); },
    removePlayer(id) { Arena.scene && Arena.scene.removePlayer(id); },
    stop() { Arena.scene && Arena.scene.stop(); }
  };
})();
