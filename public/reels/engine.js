/*
 * UniHub Reels — motor de renderização 9:16 (1080x1920).
 *
 * Função pura do tempo: renderFrame(ctx, spec, t) desenha exatamente o mesmo
 * quadro no navegador (Estúdio) e no renderizador headless (scripts/render-reel.js).
 * Técnicas inspiradas nos fluxos "Claude Code + vídeo" que viralizaram em Reels:
 * tipografia cinética, legendas palavra-a-palavra, punch zoom, marca-texto,
 * barra de progresso de retenção, zona segura do Instagram e 3 "looks" visuais.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReelEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 1080;
  const H = 1920;
  // Áreas cobertas pela interface do Reels (perfil, legenda, botões laterais).
  const SAFE = { top: 250, bottom: 480, left: 70, right: 150 };
  const CX = (SAFE.left + (W - SAFE.right)) / 2;
  const CONTENT_W = W - SAFE.left - SAFE.right - 40;
  const TRANSITION = 0.3;

  const SANS = '"Inter", "Segoe UI", system-ui, sans-serif';
  const SERIF = '"DM Serif Display", Georgia, "Liberation Serif", serif';

  const LOOKS = {
    impacto: {
      name: 'Impacto',
      bg1: '#090d24', bg2: '#22104a', glow: '#ff3b5c',
      text: '#ffffff', muted: 'rgba(255,255,255,0.66)',
      accent: '#ff3b5c', accent2: '#ffd23f', onAccent: '#ffffff',
      card: 'rgba(255,255,255,0.07)', cardLine: 'rgba(255,255,255,0.14)',
      ecg: 'rgba(255,59,92,0.55)',
      display: SANS, displayWeight: 900, displayStyle: 'normal',
      highlight: 'box', energy: 1, grid: true
    },
    clinico: {
      name: 'Clínico',
      bg1: '#f4fbfa', bg2: '#d9f0ec', glow: '#0aa59a',
      text: '#0f2b2a', muted: 'rgba(15,43,42,0.62)',
      accent: '#0a9c92', accent2: '#e8505b', onAccent: '#ffffff',
      card: 'rgba(255,255,255,0.75)', cardLine: 'rgba(15,43,42,0.10)',
      ecg: 'rgba(10,156,146,0.45)',
      display: SANS, displayWeight: 800, displayStyle: 'normal',
      highlight: 'underline', energy: 0.55, grid: false
    },
    editorial: {
      name: 'Editorial',
      bg1: '#0c0a08', bg2: '#211912', glow: '#e8b04b',
      text: '#f5eee2', muted: 'rgba(245,238,226,0.6)',
      accent: '#e8b04b', accent2: '#f5eee2', onAccent: '#1a1208',
      card: 'rgba(245,238,226,0.06)', cardLine: 'rgba(245,238,226,0.16)',
      ecg: 'rgba(232,176,75,0.4)',
      display: SERIF, displayWeight: 400, displayStyle: 'italic',
      highlight: 'color', energy: 0.75, grid: false
    },
    retro: {
      name: 'Retrô',
      bg1: '#5f5c2b', bg2: '#27321a', glow: '#e4f064',
      text: '#fbf8e6', muted: 'rgba(251,248,230,0.72)',
      accent: '#e4f064', accent2: '#ffd84a', onAccent: '#33340f',
      card: 'rgba(30,32,12,0.42)', cardLine: 'rgba(251,248,230,0.28)',
      ecg: 'rgba(228,240,100,0.45)',
      display: SANS, displayWeight: 900, displayStyle: 'normal', tracking: -0.055,
      titleColor: '#e4f064', highlight: 'scribble', scribble: '#ffffff', energy: 0.7, grid: false, stickers: true, film: true
    }
  };

  const SCENE_TYPES = {
    hook: 'Gancho (0–3s)',
    stat: 'Número de impacto',
    step: 'Passo / sinal',
    list: 'Lista',
    myth: 'Mito × Verdade',
    recap: 'Resumo (sigla)',
    cta: 'Chamada (salvar/seguir)',
    clip: 'Vídeo seu + adesivos'
  };

  // ---------- utilidades ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, start, dur) => clamp((t - start) / dur);
  const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOutBack = (p) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N},]/gu, '');

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function font(look, size, opts = {}) {
    const display = opts.display !== false;
    const family = display ? look.display : SANS;
    const weight = opts.weight || (display ? look.displayWeight : 600);
    const style = display ? look.displayStyle : 'normal';
    return `${style} ${weight} ${Math.round(size)}px ${family}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function highlightSet(list) {
    const set = new Set();
    (list || []).forEach((h) => String(h).split(/\s+/).forEach((w) => w && set.add(norm(w))));
    return set;
  }

  // ---------- linha do tempo ----------
  function timeline(spec) {
    let t = 0;
    const scenes = (spec.scenes || []).map((s, i) => {
      const dur = Math.max(0.6, Number(s.duration) || 3);
      const item = { scene: s, index: i, start: t, end: t + dur, duration: dur };
      t += dur;
      return item;
    });
    return { scenes, duration: t };
  }

  function sceneAt(tl, t) {
    for (const s of tl.scenes) if (t < s.end) return s;
    return tl.scenes[tl.scenes.length - 1];
  }

  // Momentos-chave usados também pela trilha sonora (soundtrack.js).
  function events(spec) {
    const tl = timeline(spec);
    const out = [{ t: 0, type: 'impact' }];
    tl.scenes.forEach((s) => {
      if (s.index > 0) out.push({ t: s.start, type: 'whoosh' });
      const type = s.scene.type;
      if (type === 'step') out.push({ t: s.start + 0.25, type: 'tick' });
      if (type === 'stat') out.push({ t: s.start + 0.35, type: 'impact' });
      if (type === 'myth') out.push({ t: s.start + mythTimes(s.duration).reveal, type: 'reveal' });
      if (type === 'recap') (s.scene.letters || []).forEach((_, i) => out.push({ t: s.start + 0.3 + i * 0.22, type: 'tick' }));
      if (type === 'cta' && !s.scene.minimal) out.push({ t: s.start + ctaTimes(s.duration).tap, type: 'tap' });
    });
    return out;
  }

  function captionWords(scene, duration) {
    const words = String(scene.caption || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    // a legenda entra depois do texto principal da cena, para não competir com ele
    const delay = scene.captionDelay != null ? Number(scene.captionDelay) : ({ hook: 1.5, step: 1.2 }[scene.type] || 0.3);
    const start = Math.min(delay, duration * 0.5), end = Math.max(start + 0.5, duration - 0.15);
    const weights = words.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = start;
    return words.map((w, i) => {
      const d = ((end - start) * weights[i]) / total;
      const item = { text: w, start: acc, end: acc + d };
      acc += d;
      return item;
    });
  }

  // ---------- layout de texto ----------
  function setTracking(ctx, look, size, opts) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = look.tracking && opts.display !== false ? `${(look.tracking * size).toFixed(1)}px` : '0px';
  }

  function layoutWords(ctx, text, size, maxWidth, look, opts) {
    ctx.font = font(look, size, opts);
    setTracking(ctx, look, size, opts);
    const space = ctx.measureText(' ').width;
    const lines = [];
    let line = [], lineW = 0;
    String(text).split(/\s+/).filter(Boolean).forEach((w) => {
      const ww = ctx.measureText(w).width;
      if (line.length && lineW + space + ww > maxWidth) {
        lines.push({ words: line, width: lineW });
        line = []; lineW = 0;
      }
      line.push({ text: w, width: ww });
      lineW += (line.length > 1 ? space : 0) + ww;
    });
    if (line.length) lines.push({ words: line, width: lineW });
    return { lines, space };
  }

  function fitText(ctx, text, maxSize, minSize, maxWidth, maxLines, look, opts) {
    let size = maxSize;
    let layout = layoutWords(ctx, text, size, maxWidth, look, opts);
    while (size > minSize && (layout.lines.length > maxLines || layout.lines.some((l) => l.width > maxWidth))) {
      size -= 4;
      layout = layoutWords(ctx, text, size, maxWidth, look, opts);
    }
    return { size, ...layout };
  }

  /**
   * Texto cinético: cada palavra entra com overshoot; palavras de destaque
   * ganham marca-texto animado (box / sublinhado / cor, conforme o look).
   * Retorna a altura ocupada.
   */
  function drawKinetic(ctx, look, text, o) {
    const fit = fitText(ctx, text, o.size, o.minSize || 40, o.maxWidth || CONTENT_W, o.maxLines || 5, look, o);
    const size = fit.size;
    const lh = size * (o.lineHeight || 1.12);
    const hl = highlightSet(o.highlight);
    const stagger = o.stagger != null ? o.stagger : 0.07;
    const align = o.align || 'center';
    let idx = 0;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    fit.lines.forEach((line, li) => {
      const baseline = o.y + size * 0.86 + li * lh;
      let x = align === 'center' ? o.x - line.width / 2 : o.x;
      line.words.forEach((w) => {
        const appear = (o.start || 0) + idx * stagger;
        const p = prog(o.t, appear, 0.38);
        if (p > 0) {
          const s = lerp(o.pop === false ? 0.92 : 0.45, 1, easeOutBack(p));
          const dy = (1 - easeOutCubic(p)) * size * 0.45;
          const isHl = hl.has(norm(w.text));
          ctx.save();
          ctx.globalAlpha *= clamp(p * 1.6);
          ctx.translate(x + w.width / 2, baseline - size * 0.32 + dy);
          ctx.scale(s, s);
          ctx.translate(-w.width / 2, size * 0.32);
          ctx.font = font(look, size, o);
          setTracking(ctx, look, size, o);
          let color = o.color || look.text;
          if (isHl) {
            const hp = easeOutCubic(prog(o.t, appear + 0.18, 0.32));
            if (look.highlight === 'box') {
              ctx.fillStyle = look.accent;
              roundRect(ctx, -size * 0.12, -size * 0.86, (w.width + size * 0.24) * hp, size * 1.08, size * 0.14);
              ctx.fill();
              color = look.onAccent;
            } else if (look.highlight === 'underline') {
              ctx.fillStyle = look.accent;
              ctx.globalAlpha *= 0.28;
              roundRect(ctx, -size * 0.06, -size * 0.28, (w.width + size * 0.12) * hp, size * 0.34, size * 0.08);
              ctx.fill();
              ctx.globalAlpha /= 0.28;
              color = look.accent;
            } else if (look.highlight === 'scribble') {
              color = look.accent;
              scribbleLine(ctx, -size * 0.04, size * 0.16, w.width + size * 0.08, size, hp, look.scribble || look.accent, norm(w.text).length);
            } else {
              color = look.accent;
            }
          }
          ctx.fillStyle = color;
          ctx.fillText(w.text, 0, 0);
          ctx.restore();
        }
        x += w.width + fit.space;
        idx++;
      });
    });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return fit.lines.length * lh;
  }

  // sublinhado feito à mão: duas passadas levemente onduladas (p 0..1 = quanto já foi desenhado)
  function scribbleLine(ctx, x, y, w, size, p, color, seed) {
    if (p <= 0) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.065);
    ctx.beginPath();
    const n = 28, total = n * 2;
    for (let i = 0; i <= total * clamp(p); i++) {
      const back = i > n;
      const u = back ? (total - i) / n : i / n;
      const px = x + u * w;
      const py = y + Math.sin(u * 7 + seed) * size * 0.025 + (back ? size * 0.07 : 0) - u * size * 0.03;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawKicker(ctx, look, text, x, y, t, start) {
    if (!text) return;
    const p = easeOutCubic(prog(t, start || 0, 0.4));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.font = `800 34px ${SANS}`;
    const label = String(text).toUpperCase().split('').join(' ');
    const w = ctx.measureText(label).width + 56;
    const bx = x - w / 2, by = y + (1 - p) * 20;
    ctx.fillStyle = look.card;
    ctx.strokeStyle = look.cardLine;
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, w, 64, 32);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = look.accent;
    ctx.beginPath(); ctx.arc(bx + 30, by + 32, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.text;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 44, by + 34);
    ctx.restore();
  }

  function drawSmall(ctx, look, text, x, y, t, start, opts = {}) {
    if (!text) return 0;
    const p = easeOutCubic(prog(t, start || 0, 0.45));
    if (p <= 0) return 0;
    const size = opts.size || 32;
    const lay = layoutWords(ctx, text, size, opts.maxWidth || CONTENT_W, look, { display: false, weight: opts.weight || 500 });
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.fillStyle = opts.color || look.muted;
    ctx.font = font(look, size, { display: false, weight: opts.weight || 500 });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    lay.lines.forEach((l, i) => ctx.fillText(l.words.map((w) => w.text).join(' '), x, y + i * size * 1.3));
    ctx.restore();
    return lay.lines.length * size * 1.3;
  }

  // ---------- ícones vetoriais (animados por "phase" 0..1) ----------
  function drawIcon(ctx, name, x, y, s, color, phase = 1, look) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(4, s * 0.07);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const r = s / 2;
    switch (name) {
      case 'smile': { // sorriso que "cai" de um lado (paralisia facial)
        const droop = easeInOutCubic(clamp(phase));
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 0.36, -r * 0.22, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.36, -r * 0.22 + droop * r * 0.06, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, r * 0.18);
        ctx.quadraticCurveTo(-r * 0.05, r * 0.62 - droop * r * 0.12, r * 0.5, r * 0.18 + droop * r * 0.42);
        ctx.stroke();
        break;
      }
      case 'arms': { // boneco com os dois braços erguidos; um deles desce
        const fall = easeInOutCubic(clamp(phase));
        ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, r * 0.35); ctx.lineTo(-r * 0.32, r * 0.95); ctx.moveTo(0, r * 0.35); ctx.lineTo(r * 0.32, r * 0.95); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.25); ctx.lineTo(-r * 0.62, -r * 0.92); ctx.stroke();
        const ang = lerp(-Math.PI * 0.27, Math.PI * 0.32, fall);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.25); ctx.lineTo(Math.cos(ang) * r * 0.86, -r * 0.25 + Math.sin(ang) * r * 0.86); ctx.stroke();
        break;
      }
      case 'speech': { // balão de fala com onda "enrolada"
        ctx.beginPath();
        roundRect(ctx, -r, -r * 0.75, s, r * 1.3, r * 0.3);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.55); ctx.lineTo(-r * 0.6, r * 0.95); ctx.lineTo(-r * 0.1, r * 0.55); ctx.stroke();
        ctx.beginPath();
        const amp = r * (0.08 + 0.16 * clamp(phase));
        for (let i = 0; i <= 40; i++) {
          const px = -r * 0.66 + (i / 40) * r * 1.32;
          const py = -r * 0.1 + Math.sin(i * 0.9 + phase * 6) * amp * Math.sin((i / 40) * Math.PI);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case 'phone': {
        ctx.save();
        ctx.rotate(-0.15 + Math.sin(phase * Math.PI * 8) * 0.12 * (1 - clamp(phase)));
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, -r * 0.7);
        ctx.quadraticCurveTo(-r * 0.95, -r * 0.2, -r * 0.4, r * 0.45);
        ctx.quadraticCurveTo(r * 0.15, r * 1.0, r * 0.65, r * 0.66);
        ctx.lineTo(r * 0.4, r * 0.3); ctx.lineTo(r * 0.08, r * 0.45);
        ctx.quadraticCurveTo(-r * 0.25, r * 0.2, -r * 0.42, -r * 0.12);
        ctx.lineTo(-r * 0.22, -r * 0.42); ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.lineWidth *= 0.8;
        const a0 = ctx.globalAlpha;
        for (let i = 0; i < 2; i++) {
          ctx.globalAlpha = a0 * (0.5 + 0.5 * Math.sin(phase * 20 - i));
          ctx.beginPath(); ctx.arc(-r * 0.1, -r * 0.1, r * (0.95 + i * 0.28), -Math.PI * 0.45, -Math.PI * 0.05); ctx.stroke();
        }
        break;
      }
      case 'brain': {
        const lobes = [[-0.42, -0.25, 0.42], [0.42, -0.25, 0.42], [-0.5, 0.25, 0.36], [0.5, 0.25, 0.36], [0, -0.5, 0.36], [0, 0.4, 0.32]];
        ctx.beginPath();
        lobes.forEach(([lx, ly, lr]) => { ctx.moveTo(lx * r + lr * r, ly * r); ctx.arc(lx * r, ly * r, lr * r, 0, Math.PI * 2); });
        ctx.globalAlpha *= 0.18; ctx.fill(); ctx.globalAlpha /= 0.18;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(-r * 0.42, -r * 0.2, r * 0.25, Math.PI * 0.2, Math.PI * 1.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.2, r * 0.25, -Math.PI * 0.3, Math.PI * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'clock': {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        const a = -Math.PI / 2 + phase * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.38, 0); ctx.stroke();
        break;
      }
      case 'heart': {
        const beat = 1 + 0.08 * Math.max(0, Math.sin(phase * Math.PI * 6));
        ctx.scale(beat, beat);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.8);
        ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.05, 0, -r * 0.42);
        ctx.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.8);
        ctx.fill();
        break;
      }
      case 'x': {
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6); ctx.stroke();
        break;
      }
      case 'check': {
        const p = easeOutCubic(clamp(phase));
        ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(-r * 0.15, r * 0.45 * Math.min(1, p * 2));
        if (p > 0.5) ctx.lineTo(lerp(-r * 0.15, r * 0.65, (p - 0.5) * 2), lerp(r * 0.45, -r * 0.5, (p - 0.5) * 2));
        ctx.stroke();
        break;
      }
      case 'bookmark': {
        ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.8); ctx.lineTo(r * 0.55, -r * 0.8); ctx.lineTo(r * 0.55, r * 0.85); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.55, r * 0.85); ctx.closePath();
        phase >= 1 ? ctx.fill() : ctx.stroke();
        break;
      }
      case 'send': {
        ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.1); ctx.lineTo(r * 0.85, -r * 0.75); ctx.lineTo(r * 0.25, r * 0.85); ctx.lineTo(-r * 0.05, r * 0.05); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.05, r * 0.05); ctx.lineTo(r * 0.85, -r * 0.75); ctx.stroke();
        break;
      }
      case 'alert':
      default: {
        ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.95, r * 0.75); ctx.lineTo(-r * 0.95, r * 0.75); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.3); ctx.lineTo(0, r * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, r * 0.45, ctx.lineWidth * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function iconPop(ctx, look, name, x, y, s, t, start, phase, color) {
    const p = prog(t, start, 0.45);
    if (p <= 0 || !name) return;
    ctx.save();
    ctx.translate(x, y);
    const sc = easeOutBack(p);
    ctx.scale(sc, sc);
    ctx.globalAlpha *= clamp(p * 2);
    ctx.fillStyle = look.card; ctx.strokeStyle = look.cardLine; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawIcon(ctx, name, 0, 0, s, color || look.accent, phase, look);
    ctx.restore();
  }

  // ---------- fundo ----------
  function ecgY(x) {
    const period = 420;
    const u = ((x % period) + period) % period / period;
    const bump = (c, w, a) => a * Math.exp(-Math.pow((u - c) / w, 2));
    return bump(0.18, 0.035, -18) + bump(0.36, 0.008, 22) + bump(0.4, 0.01, -120) + bump(0.44, 0.009, 46) + bump(0.66, 0.05, -30);
  }

  function drawBackground(ctx, look, t, spec) {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, look.bg1); g.addColorStop(1, look.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // brilho que flutua devagar
    const gx = W * (0.5 + 0.3 * Math.sin(t * 0.35)), gy = H * (0.38 + 0.12 * Math.cos(t * 0.27));
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 900);
    rg.addColorStop(0, hexA(look.glow, 0.22)); rg.addColorStop(1, hexA(look.glow, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    if (look.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 2;
      const off = (t * 30) % 90;
      ctx.beginPath();
      for (let x = -90 + off; x < W; x += 90) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -90 + off; y < H; y += 90) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    // partículas determinísticas
    const rand = rng(1234 + (spec.seed || 0));
    for (let i = 0; i < 46; i++) {
      const px = rand() * W, speed = 20 + rand() * 50, size = 2 + rand() * 5, ph = rand() * 10;
      const py = (((rand() * H - t * speed) % H) + H) % H;
      ctx.globalAlpha = 0.18 + 0.25 * Math.sin(t * 1.3 + ph) ** 2;
      ctx.fillStyle = i % 5 === 0 ? look.accent : look.text;
      ctx.beginPath(); ctx.arc(px + Math.sin(t + ph) * 12, py, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (look.stickers) {
      drawFlower(ctx, W - SAFE.right - 40, H - SAFE.bottom + 60, 120, t * 0.4, look);
      drawStars(ctx, SAFE.left + 40, H - SAFE.bottom + 40, 1, t, look);
    }

    // traçado de ECG rolando (assinatura visual "medicina")
    const baseY = H - 330, speed = 340, head = W * 0.82;
    ctx.save();
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const lg = ctx.createLinearGradient(0, 0, head, 0);
    lg.addColorStop(0, hexA(look.ecg, 0)); lg.addColorStop(1, look.ecg);
    ctx.strokeStyle = lg;
    ctx.beginPath();
    for (let x = 0; x <= head; x += 4) {
      const y = baseY + ecgY(x + t * speed);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = look.accent;
    ctx.shadowColor = look.accent; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(head, baseY + ecgY(head + t * speed), 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function hexA(color, a) {
    if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, a + ')');
    const h = color.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- cenas ----------
  function mythTimes(d) { return { strike: Math.min(1.3, d * 0.3), reveal: Math.min(1.8, d * 0.42) }; }
  function ctaTimes(d) { return { cursor: Math.min(1.0, d * 0.25), tap: Math.min(1.7, d * 0.42) }; }

  const renderers = {
    hook(ctx, look, s, t, d) {
      drawKicker(ctx, look, s.kicker, CX, 330, t, 0);
      let y = 470;
      if (s.icon) { iconPop(ctx, look, s.icon, CX, 545, 130, t, 0.05, t / d); y = 700; }
      drawKinetic(ctx, look, s.text, { x: CX, y, t, start: 0.12, size: s.icon ? 108 : 124, minSize: 64, maxLines: s.icon ? 4 : 5, highlight: s.highlight, stagger: 0.085 });
    },

    stat(ctx, look, s, t, d) {
      drawSmall(ctx, look, s.kicker || s.pre, CX, 330, t, 0, { size: 44, weight: 700, color: look.text });
      // grade de "neurônios" que vão se apagando
      const cols = 12, rows = 6, gap = 62, gx = CX - ((cols - 1) * gap) / 2, gy = 470;
      const lost = easeInOutCubic(prog(t, 0.3, d - 0.6));
      const rand = rng(77);
      const a0 = ctx.globalAlpha;
      for (let i = 0; i < cols * rows; i++) {
        const on = rand() > lost;
        const px = gx + (i % cols) * gap, py = gy + Math.floor(i / cols) * gap;
        ctx.globalAlpha = a0 * (on ? 0.85 : 0.12);
        ctx.fillStyle = on ? look.accent : look.muted;
        ctx.beginPath(); ctx.arc(px, py, on ? 11 : 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = a0;
      const p = easeOutCubic(prog(t, 0.35, Math.min(1.4, d * 0.45)));
      const value = Number(s.value) || 0;
      const shown = (value * p).toLocaleString('pt-BR', { minimumFractionDigits: s.decimals || 0, maximumFractionDigits: s.decimals || 0 });
      const label = `${s.prefix || ''}${shown}${s.suffix || ''}`;
      const sc = 1 + 0.06 * Math.sin(prog(t, 0.35, 0.5) * Math.PI) * look.energy;
      ctx.save();
      ctx.translate(CX, 1000); ctx.scale(sc, sc);
      ctx.font = font(look, 250, { weight: look.displayWeight });
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = look.accent;
      ctx.shadowColor = hexA(look.accent, 0.5); ctx.shadowBlur = 50 * look.energy;
      ctx.fillText(label, 0, 0);
      ctx.restore();
      drawKinetic(ctx, look, [s.unit, s.label].filter(Boolean).join(' '), { x: CX, y: 1060, t, start: 0.6, size: 66, minSize: 44, maxLines: 2, highlight: s.highlight, stagger: 0.06 });
      drawSmall(ctx, look, s.source, CX, 1250, t, 1.0, { size: 26 });
    },

    step(ctx, look, s, t, d) {
      const letters = s.letters || [];
      const active = s.stepIndex != null ? s.stepIndex : -1;
      // trilha de progresso da sigla
      if (letters.length) {
        const a0 = ctx.globalAlpha;
        const chip = 84, gap = 22, total = letters.length * chip + (letters.length - 1) * gap;
        letters.forEach((L, i) => {
          const x = CX - total / 2 + i * (chip + gap);
          const isA = i === active, done = i < active;
          ctx.fillStyle = isA ? look.accent : done ? hexA(look.accent, 0.35) : look.card;
          ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2;
          roundRect(ctx, x, 300, chip, chip, 22); ctx.fill(); ctx.stroke();
          ctx.font = `900 46px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = isA ? look.onAccent : look.text;
          ctx.globalAlpha = a0 * (isA || done ? 1 : 0.55);
          ctx.fillText(L, x + chip / 2, 300 + chip / 2 + 2);
          ctx.globalAlpha = a0;
        });
      }
      // letra gigante + ilustração do sinal
      const p = prog(t, 0.05, 0.5);
      const cardX = CX - 330, cardY = 450, size = 300;
      ctx.save();
      ctx.translate(cardX + size / 2, cardY + size / 2);
      const sc = lerp(0.3, 1, easeOutBack(p));
      ctx.scale(sc, sc); ctx.rotate((1 - easeOutCubic(p)) * -0.25);
      ctx.globalAlpha *= clamp(p * 2);
      ctx.fillStyle = look.accent;
      ctx.shadowColor = hexA(look.accent, 0.45); ctx.shadowBlur = 40;
      roundRect(ctx, -size / 2, -size / 2, size, size, 56); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `900 230px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = look.onAccent;
      ctx.fillText(s.letter || '?', 0, 14);
      ctx.restore();
      iconPop(ctx, look, s.icon, CX + 190, cardY + size / 2, 170, t, 0.3, prog(t, 0.9, d * 0.5), look.text);

      drawKinetic(ctx, look, s.title, { x: CX, y: 810, t, start: 0.35, size: 120, minSize: 80, maxLines: 1, highlight: [s.title], stagger: 0.08 });
      drawKinetic(ctx, look, s.text, { x: CX, y: 975, t, start: 0.7, size: 58, minSize: 40, maxLines: 3, highlight: s.highlight, stagger: 0.045, display: false, weight: 700, pop: false });
    },

    list(ctx, look, s, t, d) {
      drawKinetic(ctx, look, s.title, { x: CX, y: 330, t, start: 0, size: 92, minSize: 60, maxLines: 2, highlight: s.highlight });
      const items = s.items || [];
      const step = Math.min(0.6, (d - 0.8) / Math.max(1, items.length));
      items.forEach((it, i) => {
        const st = 0.5 + i * step;
        const p = easeOutCubic(prog(t, st, 0.4));
        if (p <= 0) return;
        const y = 580 + i * 150;
        ctx.save();
        ctx.globalAlpha *= p;
        ctx.translate((1 - p) * 120, 0);
        ctx.fillStyle = look.card; ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2;
        roundRect(ctx, SAFE.left + 20, y, CONTENT_W, 124, 28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = look.accent;
        roundRect(ctx, SAFE.left + 44, y + 26, 72, 72, 20); ctx.fill();
        ctx.fillStyle = look.onAccent; ctx.font = `900 40px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), SAFE.left + 80, y + 64);
        ctx.fillStyle = look.text; ctx.textAlign = 'left';
        const f = fitText(ctx, it, 46, 30, CONTENT_W - 150, 1, look, { display: false, weight: 700 });
        ctx.font = font(look, f.size, { display: false, weight: 700 });
        ctx.fillText(it, SAFE.left + 140, y + 64);
        ctx.restore();
      });
    },

    myth(ctx, look, s, t, d) {
      const tm = mythTimes(d);
      const x = SAFE.left + 20, w = CONTENT_W;
      // card MITO
      const pIn = easeOutCubic(prog(t, 0, 0.4));
      const pOut = easeInOutCubic(prog(t, tm.reveal - 0.1, 0.45));
      ctx.save();
      ctx.globalAlpha *= pIn * lerp(1, 0.45, pOut);
      const y1 = lerp(420, 330, pOut);
      ctx.translate(0, (1 - pIn) * 60);
      ctx.fillStyle = look.card; ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2;
      roundRect(ctx, x, y1, w, 300, 36); ctx.fill(); ctx.stroke();
      ctx.font = `900 36px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8505b';
      ctx.fillText('✕  ' + (s.mythLabel || 'MITO'), x + 40, y1 + 56);
      const f = fitText(ctx, s.myth, 64, 40, w - 80, 3, look, {});
      ctx.font = font(look, f.size); ctx.fillStyle = look.text; ctx.textBaseline = 'alphabetic';
      f.lines.forEach((l, i) => {
        const ly = y1 + 130 + i * f.size * 1.12;
        ctx.fillText(l.words.map((q) => q.text).join(' '), x + 40, ly + f.size * 0.5);
        const sp = easeInOutCubic(prog(t, tm.strike + i * 0.12, 0.35));
        if (sp > 0 && look.stickers) {
          ctx.save();
          ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = Math.max(6, f.size * 0.09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          const zig = Math.max(3, Math.round(l.width / 70));
          for (let z = 0; z <= zig * sp; z++) {
            const px = x + 36 + (z / zig) * (l.width + 8), py = ly + f.size * (z % 2 ? 0.05 : 0.35);
            z ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.stroke();
          ctx.restore();
        } else if (sp > 0) {
          ctx.fillStyle = '#e8505b';
          ctx.fillRect(x + 36, ly + f.size * 0.2, (l.width + 8) * sp, Math.max(6, f.size * 0.09));
          ctx.fillStyle = look.text;
        }
      });
      ctx.restore();
      // card VERDADE
      const pT = prog(t, tm.reveal, 0.5);
      if (pT > 0) {
        const y2 = 690;
        ctx.save();
        ctx.globalAlpha *= clamp(pT * 2);
        ctx.translate(CX, y2 + 230); ctx.scale(lerp(0.85, 1, easeOutBack(pT)), lerp(0.85, 1, easeOutBack(pT))); ctx.translate(-CX, -(y2 + 230));
        ctx.fillStyle = hexA(look.accent, 0.16); ctx.strokeStyle = look.accent; ctx.lineWidth = 4;
        roundRect(ctx, x, y2, w, 470, 40); ctx.fill(); ctx.stroke();
        drawIcon(ctx, 'check', x + 66, y2 + 64, 54, look.accent, prog(t, tm.reveal + 0.2, 0.5));
        ctx.font = `900 36px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = look.accent;
        ctx.fillText(s.truthLabel || 'VERDADE', x + 112, y2 + 66);
        ctx.restore();
        drawKinetic(ctx, look, s.truth, { x: x + 40, y: y2 + 120, t, start: tm.reveal + 0.15, size: 64, minSize: 40, maxWidth: w - 80, maxLines: 5, highlight: s.highlight, stagger: 0.05, align: 'left' });
      }
    },

    recap(ctx, look, s, t, d) {
      drawKinetic(ctx, look, s.title, { x: CX, y: 330, t, start: 0, size: 84, minSize: 56, maxLines: 2, highlight: s.highlight });
      const letters = s.letters || [], words = s.words || [];
      const n = Math.max(1, letters.length);
      const cell = Math.min(200, (CONTENT_W - (n - 1) * 20) / n);
      const total = n * cell + (n - 1) * 20;
      letters.forEach((L, i) => {
        const p = prog(t, 0.3 + i * 0.22, 0.45);
        if (p <= 0) return;
        const x = CX - total / 2 + i * (cell + 20);
        const bob = Math.sin((t - i * 0.2) * 3) * 8 * look.energy;
        ctx.save();
        ctx.translate(x + cell / 2, 640 + bob);
        const sc = easeOutBack(p); ctx.scale(sc, sc);
        ctx.globalAlpha *= clamp(p * 2);
        ctx.fillStyle = look.accent;
        roundRect(ctx, -cell / 2, -cell / 2, cell, cell * 1.15, 36); ctx.fill();
        ctx.fillStyle = look.onAccent; ctx.font = `900 ${Math.round(cell * 0.72)}px ${SANS}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(L, 0, cell * 0.08);
        ctx.restore();
        if (words[i]) {
          ctx.save();
          ctx.globalAlpha *= easeOutCubic(prog(t, 0.55 + i * 0.22, 0.4));
          ctx.fillStyle = look.text;
          const f = fitText(ctx, words[i], 40, 22, cell + 16, 1, look, { display: false, weight: 700 });
          ctx.font = font(look, f.size, { display: false, weight: 700 }); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(words[i], x + cell / 2, 640 + cell * 0.7 + 18);
          ctx.restore();
        }
      });
      if (s.note) drawKinetic(ctx, look, s.note, { x: CX, y: 960, t, start: 0.3 + n * 0.22 + 0.2, size: 60, minSize: 40, maxLines: 3, highlight: s.noteHighlight, stagger: 0.05 });
    },

    cta(ctx, look, s, t, d) {
      if (s.minimal) {
        // final minimalista: só a frase, o @ e o aviso — sem interface falsa
        const h = drawKinetic(ctx, look, s.text, {
          x: SAFE.left + 10, y: 520, t, start: 0.15, size: 150, minSize: 80, maxLines: 4, lineHeight: 0.92,
          align: 'left', color: look.titleColor || look.text, highlight: s.highlight, stagger: 0.09, maxWidth: CONTENT_W + 20
        });
        const p = easeOutCubic(prog(t, 1.0, 0.5));
        if (p > 0 && s.handle) {
          ctx.save();
          ctx.globalAlpha *= p;
          ctx.fillStyle = look.text; ctx.font = `800 46px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12;
          ctx.fillText(s.handle, SAFE.left + 100 + (1 - p) * 30, 520 + h + 70);
          ctx.restore();
          if (look.stickers) drawStars(ctx, SAFE.left + 40, 520 + h + 20, prog(t, 0.95, 0.9), t, look);
        }
        drawSmall(ctx, look, s.disclaimer, CX, 1240, t, 1.2, { size: 26, color: 'rgba(255,255,255,0.75)' });
        return;
      }
      const tm = ctaTimes(d);
      drawKinetic(ctx, look, s.text, { x: CX, y: 320, t, start: 0, size: 88, minSize: 56, maxLines: 3, highlight: s.highlight, stagger: 0.06 });
      // card de perfil com botão Seguir
      const pc = easeOutCubic(prog(t, 0.35, 0.45));
      const cx = SAFE.left + 20, cy = 720, cw = CONTENT_W, ch = 200;
      const tapped = t >= tm.tap;
      ctx.save();
      ctx.globalAlpha *= pc; ctx.translate(0, (1 - pc) * 80);
      ctx.fillStyle = look.card; ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2;
      roundRect(ctx, cx, cy, cw, ch, 40); ctx.fill(); ctx.stroke();
      const ax = cx + 100, ay = cy + ch / 2;
      const ring = ctx.createLinearGradient(ax - 60, ay - 60, ax + 60, ay + 60);
      ring.addColorStop(0, '#feda75'); ring.addColorStop(0.5, '#d62976'); ring.addColorStop(1, '#4f5bd5');
      ctx.strokeStyle = ring; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(ax, ay, 62, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = look.accent; ctx.beginPath(); ctx.arc(ax, ay, 50, 0, Math.PI * 2); ctx.fill();
      drawIcon(ctx, 'heart', ax, ay + 4, 46, look.onAccent, t / 2);
      // botão
      const bw = 210, bh = 84, bx = cx + cw - bw - 36, by = ay - bh / 2;
      const textW = bx - (ax + 90) - 20;
      const fitLine = (txt, size, weight) => {
        ctx.font = `${weight} ${size}px ${SANS}`;
        while (size > 18 && ctx.measureText(txt).width > textW) { size -= 2; ctx.font = `${weight} ${size}px ${SANS}`; }
      };
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = look.text; fitLine(s.handle || '@seu.perfil', 40, 800);
      ctx.fillText(s.handle || '@seu.perfil', ax + 90, ay - 22);
      ctx.fillStyle = look.muted; fitLine(s.bio || 'Medicina em 30 segundos', 30, 500);
      ctx.fillText(s.bio || 'Medicina em 30 segundos', ax + 90, ay + 26);
      const press = tapped ? 1 - 0.08 * Math.sin(prog(t, tm.tap, 0.25) * Math.PI) : 1;
      ctx.save();
      ctx.translate(bx + bw / 2, ay); ctx.scale(press, press); ctx.translate(-(bx + bw / 2), -ay);
      ctx.fillStyle = tapped ? look.card : '#0095f6';
      ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2;
      roundRect(ctx, bx, by, bw, bh, 22); ctx.fill(); if (tapped) ctx.stroke();
      ctx.fillStyle = tapped ? look.text : '#ffffff'; ctx.font = `800 34px ${SANS}`; ctx.textAlign = 'center';
      ctx.fillText(tapped ? 'Seguindo' : 'Seguir', bx + bw / 2, ay + 2);
      ctx.restore();
      if (tapped) {
        const rp = prog(t, tm.tap, 0.6);
        ctx.strokeStyle = hexA('#0095f6', 1 - rp); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(bx + bw / 2, ay, 40 + rp * 120, 0, Math.PI * 2); ctx.stroke();
      }
      // cursor que vem tocar no botão
      const cp = easeInOutCubic(prog(t, tm.cursor, tm.tap - tm.cursor));
      if (t > tm.cursor && t < tm.tap + 0.7) {
        const px = lerp(CX - 100, bx + bw * 0.6, cp), py = lerp(cy + ch + 260, ay + 10, cp);
        ctx.save();
        ctx.translate(px, py);
        ctx.globalAlpha *= 1 - prog(t, tm.tap + 0.35, 0.35);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 64); ctx.lineTo(16, 50); ctx.lineTo(28, 76); ctx.lineTo(40, 70); ctx.lineTo(28, 46); ctx.lineTo(48, 44); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      // salvar + compartilhar
      const icons = [['bookmark', s.saveLabel || 'Salve'], ['send', s.shareLabel || 'Envie']];
      icons.forEach(([name, lab], i) => {
        const st = tm.tap + 0.25 + i * 0.2;
        const p = prog(t, st, 0.45);
        if (p <= 0) return;
        const x = CX + (i ? 170 : -170), y = 1050;
        const bounce = 1 + 0.1 * Math.sin(Math.max(0, t - st) * 5) * Math.exp(-Math.max(0, t - st) * 1.5);
        ctx.save();
        ctx.translate(x, y); ctx.scale(easeOutBack(p) * bounce, easeOutBack(p) * bounce);
        ctx.globalAlpha *= clamp(p * 2);
        drawIcon(ctx, name, 0, 0, 92, look.accent, name === 'bookmark' ? prog(t, st + 0.3, 0.01) : 1);
        ctx.fillStyle = look.text; ctx.font = `800 36px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(lab, 0, 72);
        ctx.restore();
      });
      drawSmall(ctx, look, s.disclaimer, CX, 1240, t, 0.6, { size: 26 });
    }
  };

  // ---------- vídeo do criador + adesivos estilo scrapbook ----------
  function mediaSize(img) {
    return { w: img.videoWidth || img.naturalWidth || img.width, h: img.videoHeight || img.naturalHeight || img.height };
  }

  function drawMedia(ctx, look, img, m, lt, d) {
    const { w, h } = mediaSize(img);
    if (!w || !h) return;
    const zoomEnd = m.zoom != null ? Number(m.zoom) : 1.08;
    const blur = Number(m.blur) || 0;
    const z = lerp(1, zoomEnd, easeInOutCubic(clamp(lt / d))) * (1 + (blur * 6) / W);
    const sc = Math.max(W / w, H / h) * z;
    const dw = w * sc, dh = h * sc;
    const fy = m.focusY != null ? Number(m.focusY) : 0.5;
    const fx = m.focusX != null ? Number(m.focusX) : 0.5;
    ctx.save();
    const filters = [];
    if (blur) filters.push(`blur(${blur}px)`);
    if (m.grade === 'bw') filters.push('grayscale(1) contrast(1.1)');
    if (filters.length) ctx.filter = filters.join(' ');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (W - dw) * fx, (H - dh) * fy, dw, dh);
    ctx.filter = 'none';
    if (m.grade === 'warm' || (m.grade == null && look.stickers)) {
      // tom dourado/esverdeado da referência
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(214,190,40,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(120,110,20,0.12)';
      ctx.fillRect(0, 0, W, H);
    }
    const dim = m.dim != null ? Number(m.dim) : 0.45;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,0,0,${dim})`);
    g.addColorStop(0.45, `rgba(0,0,0,${dim * 0.35})`);
    g.addColorStop(0.7, `rgba(0,0,0,${dim * 0.35})`);
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, dim * 1.3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawMediaPlaceholder(ctx, look, m) {
    ctx.save();
    ctx.strokeStyle = look.cardLine; ctx.lineWidth = 4; ctx.setLineDash([24, 16]);
    roundRect(ctx, SAFE.left + 20, 900, CONTENT_W, 260, 32); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = look.muted; ctx.font = `700 36px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m && m.src ? `vídeo: ${m.src}` : 'Escolha um vídeo seu para esta cena', CX, 1030);
    ctx.restore();
  }

  function drawFlower(ctx, x, y, size, rot, look, alpha = 1) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha *= alpha;
    const r = size / 2;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      const g = ctx.createLinearGradient(0, -r, 0, -r * 0.2);
      g.addColorStop(0, '#9fe39a'); g.addColorStop(1, '#2f9a55');
      ctx.fillStyle = g; ctx.strokeStyle = '#1d5f33'; ctx.lineWidth = Math.max(2, size * 0.025);
      ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.26, r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(-r * 0.07, -r * 0.72, r * 0.06, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#48b86a'; ctx.strokeStyle = '#1d5f33';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function starPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function drawStars(ctx, x, y, p, t, look) {
    const pos = [[0, 0, 30], [-14, 58, 26], [26, 104, 30]];
    pos.forEach(([dx, dy, r], i) => {
      const q = easeOutBack(clamp(p * 3 - i * 0.4));
      if (q <= 0) return;
      ctx.save();
      ctx.translate(x + dx, y + dy); ctx.rotate(Math.sin(t * 1.5 + i) * 0.15); ctx.scale(q, q);
      ctx.fillStyle = look.accent2; ctx.strokeStyle = 'rgba(80,60,0,0.5)'; ctx.lineWidth = 3;
      starPath(ctx, 0, 0, r); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }

  // seta desenhada à mão, progressiva (p 0..1). Estilos: loop (laço), curve, zigzag, spiral
  function drawDoodleArrow(ctx, x0, y0, x1, y1, p, color, style = 'loop') {
    if (p <= 0) return;
    const pts = [];
    const n = 70;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      let bx = lerp(x0, x1, u), by = lerp(y0, y1, u);
      if (style === 'zigzag') {
        const tri = (Math.abs(((u * 5) % 1) - 0.5) - 0.25) * 4 * (u < 0.85 ? 1 : 0);
        bx += nx * tri * 22; by += ny * tri * 22;
      } else if (style === 'spiral') {
        const sp = Math.max(0, 1 - u * 1.6);
        bx += Math.cos(u * Math.PI * 7) * 46 * sp; by += Math.sin(u * Math.PI * 7) * 46 * sp;
      } else {
        const bow = Math.sin(u * Math.PI) * (style === 'curve' ? 0.35 : 0.2) * len;
        bx += nx * bow; by += ny * bow;
        if (style === 'loop') {
          const loop = Math.exp(-Math.pow((u - 0.45) / 0.12, 2));
          bx += Math.cos(u * Math.PI * 4) * 38 * loop; by += Math.sin(u * Math.PI * 4) * 38 * loop;
        }
      }
      pts.push([bx, by]);
    }
    const m = Math.max(2, Math.floor(pts.length * clamp(p)));
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.slice(0, m).forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    if (p >= 1) {
      const [ax, ay] = pts[pts.length - 1], [bx, by] = pts[pts.length - 4];
      const a = Math.atan2(ay - by, ax - bx);
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(a - 0.5) * 26, ay - Math.sin(a - 0.5) * 26); ctx.lineTo(ax, ay);
      ctx.lineTo(ax - Math.cos(a + 0.5) * 26, ay - Math.sin(a + 0.5) * 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScribbleCircle(ctx, cx, cy, rx, ry, p, color, seed = 1) {
    if (p <= 0) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
    ctx.beginPath();
    const turns = 1.18, n = 90;
    for (let i = 0; i <= n * clamp(p); i++) {
      const u = i / n;
      const a = -Math.PI * 0.6 + u * turns * Math.PI * 2;
      const wob = 1 + 0.06 * Math.sin(u * 9 + seed) + u * 0.08;
      const px = cx + Math.cos(a) * rx * wob, py = cy + Math.sin(a) * ry * wob;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // adesivos, setas e círculos — valem para qualquer tipo de cena
  function drawOverlays(ctx, look, s, t) {
    (s.circles || []).forEach((c, i) => {
      const at = c.at != null ? Number(c.at) : 0.8 + i * 0.4;
      drawScribbleCircle(ctx, (c.x != null ? c.x : 0.5) * W, (c.y != null ? c.y : 0.5) * H, (c.rx || 0.16) * W, (c.ry || c.rx || 0.1) * H,
        easeInOutCubic(prog(t, at, 0.55)), c.color || look.scribble || '#ffffff', i + 1);
    });
    (s.stickers || []).forEach((st, i) => {
      const at = st.at != null ? Number(st.at) : 0.6 + i * 0.45;
      const x = (st.x != null ? st.x : 0.5) * W, yy = (st.y != null ? st.y : 0.6) * H;
      const rot = st.rot != null ? st.rot : (i % 2 ? 0.07 : -0.06);
      const box = drawPill(ctx, look, st.text, x, yy, rot, prog(t, at, 0.4));
      if (box && st.arrow && st.arrow !== 'none') {
        const dir = st.arrow === 'left' ? -1 : 1;
        const sx = x + dir * box.w * 0.15, sy = yy + (st.arrowUp ? -box.h : box.h);
        const ex = sx + (st.dx != null ? Number(st.dx) : dir * 140), ey = sy + (st.dy != null ? Number(st.dy) : st.arrowUp ? -150 : 150);
        drawDoodleArrow(ctx, sx, sy, ex, ey, prog(t, at + 0.25, 0.5), '#ffffff', st.arrowStyle || 'loop');
      }
    });
  }

  function drawPill(ctx, look, text, x, y, rot, p) {
    if (p <= 0) return null;
    ctx.save();
    ctx.font = `italic 600 42px ${SANS}`;
    const w = ctx.measureText(text).width + 72, h = 80;
    ctx.translate(x, y); ctx.rotate(rot);
    const sc = easeOutBack(p); ctx.scale(sc, sc);
    ctx.globalAlpha *= clamp(p * 2);
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = look.stickers ? '#eef4a6' : '#ffffff';
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = look.stickers ? '#3b3c12' : '#111111';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 2);
    ctx.restore();
    return { w, h };
  }

  // barra de pesquisa que "digita" (como no seu vídeo: "Como colocar 🔍")
  function drawSearchBar(ctx, look, text, y, t, start) {
    const p = prog(t, start, 0.35);
    if (p <= 0) return;
    const w = 640, h = 96, x = CX - w / 2;
    const chars = Math.floor(clamp((t - start - 0.3) / Math.max(0.5, text.length * 0.06)) * text.length);
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2);
    ctx.translate(CX, y); ctx.scale(lerp(0.8, 1, easeOutBack(p)), lerp(0.8, 1, easeOutBack(p))); ctx.translate(-CX, -y);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(255,126,182,0.6)'; ctx.shadowBlur = 24;
    roundRect(ctx, x, y - h / 2, w, h, 26); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = '#ff7eb6';
    roundRect(ctx, x + w - 110, y - h / 2 + 12, 96, h - 24, 18); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x + w - 66, y - 6, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 53, y + 7); ctx.lineTo(x + w - 38, y + 22); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = `600 42px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const shown = text.slice(0, chars);
    ctx.fillText(shown, x + 36, y + 2);
    if (Math.floor(t * 2.5) % 2 === 0) {
      const cw = ctx.measureText(shown).width;
      ctx.fillRect(x + 40 + cw, y - 24, 4, 50);
    }
    ctx.restore();
  }

  renderers.clip = function (ctx, look, s, t, d) {
    let y = 300;
    let flowerSpot = null;
    if (s.title) {
      const opts = {
        x: SAFE.left + 10, y, t, start: 0.1, size: s.titleSize || 168, minSize: 80, maxLines: 3,
        lineHeight: 0.9, align: 'left', color: look.titleColor || look.text, highlight: s.highlight, stagger: 0.09, maxWidth: CONTENT_W + 20
      };
      // a flor vai no fim da linha mais curta do título, como na referência
      const fit = fitText(ctx, s.title, opts.size, opts.minSize, opts.maxWidth, opts.maxLines, look, opts);
      let best = 0;
      fit.lines.forEach((l, i) => { if (l.width < fit.lines[best].width) best = i; });
      const fx = opts.x + fit.lines[best].width + 90;
      if (fx < W - SAFE.right - 40) flowerSpot = [fx, y + best * fit.size * 0.9 + fit.size * 0.45, Math.min(170, fit.size * 1.05)];
      const hTitle = drawKinetic(ctx, look, s.title, opts);
      y += hTitle + 20;
    }
    if (s.flower !== false && look.stickers) {
      const fp = easeOutBack(prog(t, 0.45, 0.5));
      const [fx, fy, fs] = flowerSpot || [W - SAFE.right - 70, y + (s.subtitle ? 230 : 60), 150];
      if (fp > 0) drawFlower(ctx, fx, fy, fs * fp, t * 0.6, look);
    }
    if (s.subtitle) {
      const p = easeOutCubic(prog(t, 0.6, 0.4));
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.fillStyle = look.text; ctx.font = `800 56px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12;
      ctx.fillText(s.subtitle, SAFE.left + 110 + (1 - p) * 40, y + 10);
      ctx.restore();
      drawStars(ctx, SAFE.left + 50, y - 10, prog(t, 0.55, 0.9), t, look);
      y += 150;
    }
    if (s.search) drawSearchBar(ctx, look, s.search.text || s.search, s.search.y || 1000, t, s.search.at != null ? s.search.at : 0.5);
    if (s.shout) {
      const p = prog(t, 0, 0.3);
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2);
      ctx.translate(CX + Math.sin(t * 60) * 6 * (1 - p), 760); ctx.scale(lerp(1.4, 1, easeOutCubic(p)), lerp(1.4, 1, easeOutCubic(p)));
      ctx.fillStyle = '#ffffff'; ctx.font = `900 150px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24;
      ctx.fillText(s.shout, 0, 0);
      ctx.restore();
    }
  };

  // ---------- legendas palavra-a-palavra ----------
  function drawCaptions(ctx, look, scene, lt, d) {
    const words = captionWords(scene, d);
    if (!words.length) return;
    // blocos curtos (até 3 palavras / 18 caracteres), estilo CapCut
    const chunks = [];
    let cur = [];
    words.forEach((w) => {
      const len = cur.reduce((a, c) => a + c.text.length + 1, 0) + w.text.length;
      if (cur.length && (cur.length >= 3 || len > 18)) { chunks.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) chunks.push(cur);
    const chunk = chunks.find((c) => lt < c[c.length - 1].end) || chunks[chunks.length - 1];
    if (lt < chunk[0].start) return;
    const size = 66, y = H - SAFE.bottom - 130;
    ctx.save();
    ctx.font = `900 ${size}px ${SANS}`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const space = ctx.measureText(' ').width * 1.5 + size * 0.1;
    const label = (w) => w.text.toUpperCase();
    const widths = chunk.map((w) => ctx.measureText(label(w)).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (chunk.length - 1);
    let x = CX - total / 2;
    chunk.forEach((w, i) => {
      const active = lt >= w.start && lt < w.end;
      const shown = lt >= w.start;
      const p = easeOutBack(prog(lt, w.start, 0.18));
      ctx.save();
      ctx.translate(x + widths[i] / 2, y);
      const sc = shown ? lerp(0.7, active ? 1.1 : 1, p) : 1;
      ctx.scale(sc, sc);
      ctx.globalAlpha = shown ? 1 : 0.0;
      ctx.lineWidth = 14; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(label(w), -widths[i] / 2, 0);
      ctx.fillStyle = active ? look.accent2 : '#ffffff';
      ctx.fillText(label(w), -widths[i] / 2, 0);
      ctx.restore();
      x += widths[i] + space;
    });
    ctx.restore();
  }

  function drawChrome(ctx, look, spec, t, tl) {
    // barra de progresso (retenção) logo abaixo da área do topo
    const y = SAFE.top - 40, x0 = SAFE.left, x1 = W - SAFE.left;
    ctx.fillStyle = look.cardLine;
    roundRect(ctx, x0, y, x1 - x0, 10, 5); ctx.fill();
    ctx.fillStyle = look.accent;
    roundRect(ctx, x0, y, Math.max(10, (x1 - x0) * clamp(t / tl.duration)), 10, 5); ctx.fill();
    if (spec.handle) {
      ctx.font = `700 28px ${SANS}`; ctx.fillStyle = look.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(spec.handle, x0, y - 18);
    }
  }

  function drawSafeZone(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,90,0.18)';
    ctx.fillRect(0, 0, W, SAFE.top);
    ctx.fillRect(0, H - SAFE.bottom, W, SAFE.bottom);
    ctx.fillRect(0, SAFE.top, SAFE.left, H - SAFE.top - SAFE.bottom);
    ctx.fillRect(W - SAFE.right, SAFE.top, SAFE.right, H - SAFE.top - SAFE.bottom);
    ctx.setLineDash([18, 12]); ctx.strokeStyle = 'rgba(255,0,90,0.9)'; ctx.lineWidth = 4;
    ctx.strokeRect(SAFE.left, SAFE.top, W - SAFE.left - SAFE.right, H - SAFE.top - SAFE.bottom);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = `700 30px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Topo do Reels (perfil / áudio)', W / 2, SAFE.top / 2);
    ctx.fillText('Legenda, curtir e comentar', W / 2, H - SAFE.bottom / 2);
    ctx.restore();
  }

  let grainTiles = null;
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }
  function drawFilm(ctx, t, amount) {
    if (!grainTiles) {
      grainTiles = [];
      const r = rng(4242);
      for (let k = 0; k < 4; k++) {
        const c = makeCanvas(256, 256);
        if (!c) return;
        const g = c.getContext('2d');
        const img = g.createImageData(256, 256);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 128 + (r() + r() - 1) * 120;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        grainTiles.push(c);
      }
    }
    // o grão troca 8x por segundo: textura de filme sem explodir o tamanho do arquivo
    const f = Math.floor(t * 8);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = amount;
    ctx.fillStyle = ctx.createPattern(grainTiles[f % 4], 'repeat');
    ctx.translate((f * 73) % 256, (f * 151) % 256);
    ctx.fillRect(-256, -256, W + 512, H + 512);
    ctx.restore();
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.32, W / 2, H * 0.45, H * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // Vídeo de cada cena: o da própria cena ou o "fundo padrão" do roteiro (desfocado, contínuo)
  function effectiveMedia(spec, item) {
    const m = item.scene.media;
    if (m && m.src) return m;
    const b = spec.backdrop;
    if (!b || !b.src || item.scene.backdrop === false) return null;
    return {
      src: b.src, from: (Number(b.from) || 0) + item.start, dim: b.dim != null ? b.dim : 0.55,
      blur: b.blur != null ? b.blur : 14, zoom: b.zoom != null ? b.zoom : 1.04, grade: b.grade, audio: Number(b.audio) || 0, backdrop: true
    };
  }

  function drawSceneMedia(ctx, look, spec, item, lt, opts) {
    const m = effectiveMedia(spec, item);
    // speed < 1 = câmera lenta (estica um trecho curto e limpo do vídeo)
    const img = m && opts.media ? opts.media(item.index, lt * (Number(m.speed) || 1), m) : null;
    if (img) drawMedia(ctx, look, img, m, lt, item.duration);
    return !!img;
  }

  function drawScene(ctx, look, spec, item, lt, opts, hasMedia) {
    if (!hasMedia && item.scene.type === 'clip') drawMediaPlaceholder(ctx, look, item.scene.media);
    const fn = renderers[item.scene.type] || renderers.hook;
    fn(ctx, look, item.scene, lt, item.duration);
    drawOverlays(ctx, look, item.scene, lt);
  }

  function renderFrame(ctx, spec, t, opts = {}) {
    const look = LOOKS[spec.look] || LOOKS.impacto;
    const tl = timeline(spec);
    t = clamp(t, 0, Math.max(0, tl.duration - 1e-4));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, look, t, spec);
    if (!tl.scenes.length) { ctx.restore(); return; }

    const cur = sceneAt(tl, t);
    const lt = t - cur.start;
    const prev = cur.index > 0 ? tl.scenes[cur.index - 1] : null;
    const tp = prev ? easeInOutCubic(prog(lt, 0, TRANSITION)) : 1;

    // punch zoom + tremor no início de cenas de impacto
    const punchy = cur.scene.punch != null ? cur.scene.punch : ['hook', 'stat', 'recap', 'clip'].includes(cur.scene.type);
    const zoom = punchy ? 1 + 0.09 * look.energy * (1 - easeOutCubic(prog(lt, 0, 0.45))) : 1;
    const shake = punchy && lt < 0.3 ? (1 - lt / 0.3) * 10 * look.energy : 0;

    // camada de vídeo: fica parada e faz fusão entre as cenas (nada de fundo gerado aparecendo)
    let prevMedia = false;
    if (prev && tp < 1) prevMedia = drawSceneMedia(ctx, look, spec, prev, prev.duration, opts);
    ctx.save();
    if (prev && tp < 1 && prevMedia) ctx.globalAlpha = tp;
    const curMedia = drawSceneMedia(ctx, look, spec, cur, lt, opts);
    ctx.restore();

    // camada de texto/cartões: whip — a cena anterior sai na primeira metade, a nova entra logo depois
    if (prev && tp < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - clamp(tp * 2);
      ctx.translate(0, -tp * 320);
      drawScene(ctx, look, spec, prev, prev.duration, opts, prevMedia);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = prev ? clamp((tp - 0.35) / 0.65) : 1;
    ctx.translate(W / 2 + Math.sin(lt * 90) * shake, H / 2 + (1 - tp) * 260 + Math.cos(lt * 70) * shake);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    drawScene(ctx, look, spec, cur, lt, opts, curMedia);
    ctx.restore();

    if (prev && tp < 1 && look.energy > 0.7 && !look.film) {
      ctx.fillStyle = `rgba(255,255,255,${(1 - tp) * 0.18 * look.energy})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (spec.film != null ? spec.film : look.film) drawFilm(ctx, t, 0.09);

    // capa: sem legenda nem barra de progresso
    if (!opts.cover) {
      if (spec.captions !== false) drawCaptions(ctx, look, cur.scene, lt, cur.duration);
      drawChrome(ctx, look, spec, t, tl);
    }
    if (opts.safeZone) drawSafeZone(ctx);
    ctx.restore();
  }

  // Quais quadros de vídeo o tempo t precisa: [{ index da cena, tempo local }]
  function mediaRequests(spec, t) {
    const tl = timeline(spec);
    if (!tl.scenes.length) return [];
    t = clamp(t, 0, Math.max(0, tl.duration - 1e-4));
    const cur = sceneAt(tl, t);
    const lt = t - cur.start;
    const out = [];
    const req = (item, local) => {
      const m = effectiveMedia(spec, item);
      const sp = m && (Number(m.speed) || 1);
      if (m) out.push({ index: item.index, local: local * sp, src: m.src, time: (Number(m.from) || 0) + local * sp });
    };
    req(cur, lt);
    const prev = cur.index > 0 ? tl.scenes[cur.index - 1] : null;
    if (prev && lt < TRANSITION) req(prev, prev.duration);
    return out;
  }

  return { W, H, SAFE, LOOKS, SCENE_TYPES, timeline, events, captionWords, mediaRequests, effectiveMedia, renderFrame, drawIcon };
});
