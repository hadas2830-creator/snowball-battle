/* assets.js – כל הציורים של המשחק (SVG), כדי שהמשחק יעבוד גם בלי שרת */
window.SVG_ASSETS = {

/* ---------- דמות השחקן: 4 שכבות ---------- */
p_back: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 80 100">
<ellipse cx="30" cy="93" rx="9.5" ry="6" fill="#3a2f2f"/><ellipse cx="50" cy="93" rx="9.5" ry="6" fill="#3a2f2f"/>
<ellipse cx="28" cy="91" rx="5" ry="2.2" fill="#5c4848"/><ellipse cx="48" cy="91" rx="5" ry="2.2" fill="#5c4848"/>
</svg>`,

p_coat: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 80 100">
<path d="M22 56 Q11 62 13 72" stroke="#5e5e5e" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="M22 56 Q11 62 13 72" stroke="#ececec" stroke-width="8.4" stroke-linecap="round" fill="none"/>
<path d="M58 56 Q69 62 67 72" stroke="#5e5e5e" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="M58 56 Q69 62 67 72" stroke="#d6d6d6" stroke-width="8.4" stroke-linecap="round" fill="none"/>
<path d="M40 45 C58 45 63 56 63 70 L64 84 C64 93 54 95 40 95 C26 95 16 93 16 84 L17 70 C17 56 22 45 40 45Z" fill="#ffffff" stroke="#5e5e5e" stroke-width="2.2"/>
<path d="M50 47 C60 50 63 58 63 70 L64 84 C64 91 58 94 50 94.5 C55 85 56 62 50 47Z" fill="#d2d2d2"/>
<path d="M40 52 V93" stroke="#9e9e9e" stroke-width="2"/>
<path d="M24 77 h9 M47 77 h9" stroke="#9e9e9e" stroke-width="2.2" stroke-linecap="round"/>
<path d="M17.5 86 C26 90.5 54 90.5 62.5 86" stroke="#b8b8b8" stroke-width="3" fill="none"/>
</svg>`,

p_face: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 80 100">
<circle cx="40" cy="34" r="18.5" fill="#ffdcc0" stroke="#d29a78" stroke-width="1.6"/>
<ellipse cx="34" cy="41" rx="4" ry="2.6" fill="#ff8a8a" opacity=".55"/>
<ellipse cx="51" cy="41" rx="4" ry="2.6" fill="#ff8a8a" opacity=".55"/>
<ellipse cx="37.5" cy="35" rx="2.7" ry="3.6" fill="#262633"/><ellipse cx="48.5" cy="35" rx="2.7" ry="3.6" fill="#262633"/>
<circle cx="38.5" cy="33.5" r="1.05" fill="#fff"/><circle cx="49.5" cy="33.5" r="1.05" fill="#fff"/>
<ellipse cx="43.5" cy="39.3" rx="2.6" ry="2.1" fill="#ffab88"/>
<path d="M39 43.2 Q43.5 46.8 48 43.2" stroke="#97483a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
</svg>`,

p_hat: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 80 100">
<path d="M21 26 C21 12 29 7 40 7 C51 7 59 12 59 26 Z" fill="#ffffff" stroke="#5e5e5e" stroke-width="2"/>
<path d="M49 8.6 C55.5 11.5 59 17 59 26 L52.5 26 C53 18 51.5 12.5 49 8.6Z" fill="#d6d6d6"/>
<path d="M24.5 17 H55.5" stroke="#dcdcdc" stroke-width="3"/>
<rect x="18.5" y="22" width="43" height="9" rx="4.5" fill="#efefef" stroke="#5e5e5e" stroke-width="2"/>
<path d="M24 23.6v5.8 M29 23.6v5.8 M34 23.6v5.8 M39 23.6v5.8 M44 23.6v5.8 M49 23.6v5.8 M54 23.6v5.8" stroke="#c4c4c4" stroke-width="1.4"/>
<circle cx="40" cy="6.5" r="6.2" fill="#f7f7f7" stroke="#5e5e5e" stroke-width="1.8"/>
<circle cx="38" cy="4.8" r="2" fill="#fff"/>
<path d="M25 48 C32 53 48 53 55 48 L55 54 C48 59 32 59 25 54 Z" fill="#f2f2f2" stroke="#5e5e5e" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M47 55 L52.5 55 L55.5 71 L48.5 71 Z" fill="#e2e2e2" stroke="#5e5e5e" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M49.5 71 v3 M52 71 v3 M54.5 71 v3" stroke="#5e5e5e" stroke-width="1.4" stroke-linecap="round"/>
<circle cx="13" cy="73" r="5.8" fill="#f2f2f2" stroke="#5e5e5e" stroke-width="1.8"/>
<circle cx="67" cy="73" r="5.8" fill="#dedede" stroke="#5e5e5e" stroke-width="1.8"/>
</svg>`,

/* גוש קרח שמופיע כשנפגעים */
ice: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 80 100">
<rect x="7" y="4" width="66" height="94" rx="12" fill="#bfeeff" fill-opacity=".55" stroke="#ffffff" stroke-opacity=".95" stroke-width="2.5"/>
<path d="M16 14 L30 10 L19 44 Z" fill="#ffffff" opacity=".55"/>
<path d="M58 60 L64 58 L62 86 Z" fill="#ffffff" opacity=".45"/>
<path d="M12 70 L28 62 M50 20 L66 30" stroke="#ffffff" stroke-width="2" opacity=".7" stroke-linecap="round"/>
</svg>`,

ball: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40">
<defs><radialGradient id="b" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef4fb"/><stop offset="1" stop-color="#b3c8e2"/></radialGradient></defs>
<circle cx="20" cy="20" r="18" fill="url(#b)" stroke="#9fb6d3" stroke-width="1"/>
<circle cx="25" cy="25" r="2.2" fill="#d5e2f1"/><circle cx="14" cy="26" r="1.5" fill="#d5e2f1"/>
<ellipse cx="14" cy="12.5" rx="5" ry="3" fill="#ffffff" transform="rotate(-30 14 12.5)"/>
</svg>`,

/* ---------- בונוסים ---------- */
pu_big: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 60 60">
<defs><radialGradient id="o" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#b9c6ff"/><stop offset=".45" stop-color="#4361ee"/><stop offset="1" stop-color="#2a2f9e"/></radialGradient></defs>
<circle cx="30" cy="30" r="26" fill="url(#o)" stroke="#ffffff" stroke-width="3"/>
<circle cx="30" cy="31" r="13" fill="#ffffff" stroke="#c7d6ef" stroke-width="1.5"/><ellipse cx="25.5" cy="26.5" rx="4" ry="2.4" fill="#eef4fb" transform="rotate(-30 25.5 26.5)"/>
<path d="M44 12 l1.6 3.4 l3.4 1.6 l-3.4 1.6 l-1.6 3.4 l-1.6 -3.4 l-3.4 -1.6 l3.4 -1.6Z" fill="#fff"/>
</svg>`,

pu_triple: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 60 60">
<defs><radialGradient id="o" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffd6a8"/><stop offset=".45" stop-color="#f77f00"/><stop offset="1" stop-color="#b54c00"/></radialGradient></defs>
<circle cx="30" cy="30" r="26" fill="url(#o)" stroke="#ffffff" stroke-width="3"/>
<circle cx="30" cy="20" r="6.5" fill="#fff"/><circle cx="20" cy="36" r="6.5" fill="#fff"/><circle cx="40" cy="36" r="6.5" fill="#fff"/>
</svg>`,

pu_shield: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 60 60">
<defs><radialGradient id="o" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#b8f3ff"/><stop offset=".45" stop-color="#06b6d4"/><stop offset="1" stop-color="#0e7490"/></radialGradient></defs>
<circle cx="30" cy="30" r="26" fill="url(#o)" stroke="#ffffff" stroke-width="3"/>
<path d="M30 14 L43 19 Q43 36 30 45 Q17 36 17 19 Z" fill="#ffffff"/>
<path d="M30 19 L38 22 Q38 33 30 39Z" fill="#cdeffa"/>
</svg>`
};
