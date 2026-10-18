/*
 * UniHub Reels — trilha sonora original gerada por código (sem direitos autorais).
 *
 * Música com bateria, baixo, acordes e arpejo, estruturada pela linha do tempo do
 * vídeo (intro no gancho, batida na 2ª cena, respiro no mito, final no CTA), mais
 * efeitos sincronizados aos eventos do motor e, opcionalmente, o som original dos
 * vídeos do criador. Mixada para soar em alto-falante de celular (200 Hz–5 kHz).
 * O mesmo código toca no Estúdio (Web Audio) e vira WAV estéreo no renderizador.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ReelSound = factory(root.ReelEngine);
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  const STYLES = {
    pulse: { name: 'Pop eletrônico', bpm: 118, swing: 0, drums: 'four', hats: 16, keys: 'saw', bass: 'pump', arp: 16, crackle: 0, bright: 0.85 },
    pop: { name: 'Pop leve', bpm: 104, swing: 0, drums: 'pop', hats: 8, keys: 'piano', bass: 'sync', arp: 8, crackle: 0, bright: 0.7 },
    cinematic: { name: 'Cinemático', bpm: 88, swing: 0, drums: 'cine', hats: 0, keys: 'pad', bass: 'long', arp: 8, crackle: 0, bright: 0.5 },
    lofi: { name: 'Lo-fi', bpm: 86, swing: 0.18, drums: 'boombap', hats: 8, keys: 'epiano', bass: 'lofi', arp: 0, crackle: 1, bright: 0.45 }
  };
  const LOOK_STYLE = { impacto: 'pulse', clinico: 'pop', editorial: 'cinematic', retro: 'lofi' };

  // Lá menor: Am – F – C – G (um acorde por compasso)
  const CHORDS = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
  const ROOTS = [45, 41, 48, 43];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- blocos de síntese ----------
  const TABLE = 2048;
  function wavetable(harmonics) {
    const t = new Float32Array(TABLE + 1);
    for (let i = 0; i <= TABLE; i++) {
      let v = 0;
      harmonics.forEach((a, h) => { if (a) v += a * Math.sin((2 * Math.PI * (h + 1) * i) / TABLE); });
      t[i] = v;
    }
    let peak = 0;
    for (let i = 0; i <= TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
    for (let i = 0; i <= TABLE; i++) t[i] /= peak || 1;
    return t;
  }
  const saw = (n, bright) => Array.from({ length: n }, (_, i) => Math.pow(bright, i) / (i + 1));
  const TABLES = {
    sine: wavetable([1]),
    epiano: wavetable([1, 0.42, 0.12, 0.05, 0, 0, 0.03]),
    piano: wavetable([1, 0.6, 0.35, 0.22, 0.12, 0.08, 0.05, 0.03]),
    bass: wavetable(saw(10, 0.82)),
    sawBright: wavetable(saw(16, 0.93)),
    sawSoft: wavetable(saw(10, 0.72)),
    pad: wavetable([1, 0.3, 0.18, 0.08, 0.05])
  };

  function biquad(type, f, q, sr) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a, A1 = (-2 * c) / a0, A2 = (1 - a) / a0, B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
      const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    };
  }

  function bus(n) { return { L: new Float32Array(n), R: new Float32Array(n) }; }

  function render(spec, sampleRate = 44100, opts = {}) {
    const sr = sampleRate;
    const sound = Object.assign({ enabled: true, music: true, sfx: true, heartbeat: true, musicVolume: 1 }, spec.sound || {});
    const styleKey = STYLES[sound.style] ? sound.style : LOOK_STYLE[spec.look] || 'pulse';
    const st = STYLES[styleKey];
    const bpm = Number(sound.bpm) >= 60 && Number(sound.bpm) <= 160 ? Number(sound.bpm) : st.bpm;
    const tl = Engine.timeline(spec);
    const duration = tl.duration;
    const n = Math.ceil(duration * sr);
    const out = bus(n);
    if (!sound.enabled || !n) return { left: out.L, right: out.R };

    const music = bus(n), drums = bus(n), fx = bus(n);
    let seed = 1234567;
    const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
    const panGain = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
    const put = (b, i, v, gl, gr) => { if (i >= 0 && i < n) { b.L[i] += v * gl; b.R[i] += v * gr; } };

    // nota com wavetable + envelope ADSR simplificado + filtro passa-baixa
    function note(b, t0, dur, midi, o) {
      const table = TABLES[o.table || 'sine'];
      const s0 = Math.floor(t0 * sr), rel = o.release || 0.08;
      const m = Math.floor((dur + rel) * sr);
      const [gl, gr] = panGain(o.pan || 0);
      const lp = o.lp ? biquad('lp', o.lp, 0.7, sr) : null;
      const f = mtof(midi);
      const voices = o.detune ? [-o.detune, o.detune] : [0];
      const ph = voices.map(() => 0);
      for (let j = 0; j < m; j++) {
        const t = j / sr;
        let env = Math.min(1, t / (o.attack || 0.005));
        if (o.decay) env *= Math.exp(-t / o.decay) * (1 - (o.sustain || 0)) + (o.sustain || 0);
        if (t > dur) env *= Math.max(0, 1 - (t - dur) / rel);
        let v = 0;
        const wob = o.wobble ? 1 + o.wobble * Math.sin(2 * Math.PI * 0.6 * (t0 + t)) : 1;
        for (let k = 0; k < voices.length; k++) {
          ph[k] += (f * wob * Math.pow(2, voices[k] / 1200)) / sr;
          ph[k] -= Math.floor(ph[k]);
          const x = ph[k] * TABLE, i0 = x | 0;
          v += table[i0] + (table[i0 + 1] - table[i0]) * (x - i0);
        }
        v /= voices.length;
        if (lp) v = lp(v);
        put(b, s0 + j, v * env * o.gain, gl, gr);
      }
    }

    // corda pinçada (Karplus-Strong) — arpejos e melodia
    function pluck(b, t0, midi, gain, pan, len = 0.9) {
      const f = mtof(midi), period = Math.max(2, Math.round(sr / f));
      const ring = new Float32Array(period);
      for (let i = 0; i < period; i++) ring[i] = noise();
      const s0 = Math.floor(t0 * sr), m = Math.floor(len * sr);
      const [gl, gr] = panGain(pan);
      let idx = 0, prev = 0;
      for (let j = 0; j < m; j++) {
        const cur = ring[idx];
        const next = 0.497 * (cur + prev);
        prev = cur;
        ring[idx] = next;
        idx = (idx + 1) % period;
        put(b, s0 + j, cur * gain * Math.min(1, (m - j) / (0.05 * sr)), gl, gr);
      }
    }

    function kick(t0, gain) {
      const s0 = Math.floor(t0 * sr), m = Math.floor(0.42 * sr);
      let ph = 0;
      for (let j = 0; j < m; j++) {
        const t = j / sr;
        const f = 48 + 120 * Math.exp(-t / 0.035);
        ph += (2 * Math.PI * f) / sr;
        const body = Math.sin(ph) * Math.exp(-t / 0.13) * 0.7;
        // harmônico "knock" (~250 Hz) e clique: é o que o celular consegue tocar
        const knock = Math.sin(ph * 2.5) * Math.exp(-t / 0.035) * 0.45;
        const click = j < 0.003 * sr ? noise() * 0.5 : 0;
        put(drums, s0 + j, (body + knock + click) * gain, 0.707, 0.707);
      }
      return t0;
    }

    function snare(t0, gain, clap) {
      const bp = biquad('bp', 1900, 0.8, sr), hp = biquad('hp', 600, 0.7, sr);
      const s0 = Math.floor(t0 * sr), m = Math.floor(0.26 * sr);
      for (let j = 0; j < m; j++) {
        const t = j / sr;
        let env;
        if (clap) {
          const burst = t < 0.03 ? Math.exp(-((t % 0.011) / 0.004)) : 0;
          env = Math.max(burst, Math.exp(-t / 0.09) * 0.8);
        } else env = Math.exp(-t / 0.075);
        const tone = clap ? 0 : Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.6;
        const nz = hp(bp(noise())) * 2.8;
        put(drums, s0 + j, (nz * env + tone) * gain, 0.72, 0.69);
      }
    }

    function hat(t0, gain, open, pan = 0.25) {
      const hp = biquad('hp', 7500, 0.7, sr);
      const s0 = Math.floor(t0 * sr), dec = open ? 0.14 : 0.028, m = Math.floor(dec * 5 * sr);
      const [gl, gr] = panGain(pan);
      for (let j = 0; j < m; j++) put(drums, s0 + j, hp(noise()) * Math.exp(-j / sr / dec) * gain, gl, gr);
    }

    function riser(t0, len, gain) {
      const s0 = Math.floor(t0 * sr), m = Math.floor(len * sr);
      let lpState = 0;
      for (let j = 0; j < m; j++) {
        const p = j / m;
        const a = 0.01 + 0.4 * p * p;
        lpState += a * (noise() - lpState);
        const tone = Math.sin(2 * Math.PI * (300 + 900 * p * p) * (j / sr)) * 0.25;
        put(fx, s0 + j, (lpState * 1.6 + tone) * p * p * gain, 0.7 + 0.2 * Math.sin(p * 9), 0.7 - 0.2 * Math.sin(p * 9));
      }
    }

    // ---------- forma da música ----------
    const beat = 60 / bpm, bar = beat * 4;
    const drop = tl.scenes.length > 1 ? tl.scenes[1].start : 0;
    const phase = drop - Math.ceil(drop / bar) * bar; // a 2ª cena cai no tempo 1 do compasso
    const sectionAt = (t) => {
      if (t < drop - 1e-3) return 'intro';
      const s = tl.scenes.find((x) => t < x.end) || tl.scenes[tl.scenes.length - 1];
      if (s.scene.type === 'myth') return 'break';
      if (s.index === tl.scenes.length - 1) return 'outro';
      return ['step', 'list', 'recap'].includes(s.scene.type) ? 'busy' : 'full';
    };
    const kicks = [];

    if (sound.music) {
      for (let b = 0, t = phase; t < duration + 0.01; b++, t = phase + b * bar) {
        const sec = sectionAt(t + 0.01);
        const nextSec = sectionAt(t + bar + 0.01);
        const ci = b % 4;
        const chord = CHORDS[ci], root = ROOTS[ci];
        const swingAt = (eighth) => t + eighth * (beat / 2) + (eighth % 2 ? st.swing * beat * 0.5 : 0);
        const intro = sec === 'intro', brk = sec === 'break';

        // acordes
        chord.forEach((m, k) => {
          const pan = (k - 1) * 0.35;
          if (st.keys === 'epiano') {
            [0, 2.5].forEach((bt) => note(music, t + bt * beat + (bt ? st.swing * beat * 0.5 : 0), beat * (bt ? 1.4 : 2.2), m, { table: 'epiano', gain: intro ? 0.075 : 0.1, decay: 1.1, attack: 0.008, pan, lp: 3800, wobble: 0.0035 }));
          } else if (st.keys === 'piano') {
            [0, 1.5, 2, 3.5].forEach((bt) => note(music, t + bt * beat, beat * 0.9, m, { table: 'piano', gain: intro ? 0.06 : 0.085, decay: 0.5, attack: 0.004, pan, lp: intro ? 2400 : 6000 }));
          } else if (st.keys === 'saw') {
            note(music, t, bar, m, { table: 'sawBright', gain: intro || brk ? 0.05 : 0.065, attack: 0.02, detune: 9, pan, lp: intro ? 1200 : brk ? 1800 : 5200, release: 0.15 });
          } else {
            note(music, t, bar, m, { table: 'pad', gain: 0.08, attack: 0.5, detune: 7, pan, lp: 2200, release: 0.6 });
          }
        });

        // baixo (com harmônicos, para aparecer no celular)
        if (!intro) {
          const bassPat = { pump: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], sync: [0, 1.5, 2, 3.5], long: [0], lofi: [0, 1.5, 2.5] }[st.bass];
          const len = { pump: 0.42, sync: 0.9, long: 3.8, lofi: 0.9 }[st.bass];
          bassPat.forEach((bt) => note(music, t + bt * beat, beat * len, root + (st.bass === 'pump' && bt % 1 ? 12 : 0), { table: 'bass', gain: brk ? 0.1 : 0.16, attack: 0.006, decay: st.bass === 'long' ? 3 : 0.35, sustain: 0.35, lp: brk ? 700 : 2200, release: 0.05 }));
        }

        // arpejo / melodia pinçada
        const arpOn = st.arp && (sec === 'busy' || sec === 'outro' || (brk && st.arp));
        if (arpOn) {
          const steps = st.arp === 16 ? 16 : 8;
          const pat = [0, 1, 2, 1, 2, 0, 1, 2];
          for (let i = 0; i < steps; i++) {
            const m = chord[pat[i % 8]] + 12 + (i % 8 === 7 ? 12 : 0);
            pluck(music, t + i * (bar / steps), m, brk ? 0.16 : 0.22, i % 2 ? 0.45 : -0.45, 0.5);
          }
        }
        if (st.keys === 'epiano' && !intro && (sec === 'busy' || sec === 'outro')) {
          const mel = [76, 74, 72, 69];
          [0.5, 1.5, 3].forEach((bt, i) => pluck(music, swingAt(bt * 2), mel[(b + i) % 4], 0.18, 0.3, 0.8));
        }

        // bateria
        const k = (bt, g = 0.95) => kicks.push(kick(t + bt * beat, g));
        if (intro) {
          if (sound.heartbeat) { k(0, 0.55); k(0.6, 0.38); k(2, 0.55); k(2.6, 0.38); }
        } else if (!brk) {
          if (st.drums === 'four') { [0, 1, 2, 3].forEach((bt) => k(bt)); [1, 3].forEach((bt) => snare(t + bt * beat, 0.42, true)); }
          if (st.drums === 'pop') { [0, 1.5, 2].forEach((bt) => k(bt)); [1, 3].forEach((bt) => snare(t + bt * beat, 0.45)); }
          if (st.drums === 'cine') { [0, 2].forEach((bt) => k(bt, 1)); if (b % 2) snare(t + 3 * beat, 0.4, true); }
          if (st.drums === 'boombap') { k(0); k(1.75, 0.7); k(2.5, 0.85); [1, 3].forEach((bt) => snare(t + bt * beat + st.swing * beat * 0.25, 0.4)); }
          const hatsN = st.hats && sec === 'busy' && st.drums === 'four' ? 16 : st.hats;
          for (let i = 0; i < hatsN; i++) {
            const tt = hatsN === 8 ? swingAt(i) : t + i * (bar / hatsN);
            const open = st.drums === 'four' && hatsN === 16 && i % 4 === 2;
            hat(tt, (open ? 0.16 : 0.12) * (i % 2 ? 0.7 : 1) * (0.85 + 0.3 * Math.abs(noise())), open, i % 2 ? 0.3 : -0.1);
          }
        } else {
          for (let i = 0; i < 4; i++) hat(t + i * beat + beat / 2, 0.05, false);
        }
        // subida antes de cada mudança de seção
        if (sec !== nextSec && (nextSec === 'full' || nextSec === 'busy' || nextSec === 'outro' || (sec === 'intro'))) {
          riser(t + bar - Math.min(bar, 1.6), Math.min(bar, 1.6), 0.22);
        }
      }

      // chiado de vinil (lo-fi)
      if (st.crackle) {
        const hp = biquad('hp', 1500, 0.7, sr);
        for (let i = 0; i < n; i++) {
          let v = hp(noise()) * 0.006;
          if (Math.abs(noise()) > 0.9993) v += noise() * 0.12;
          music.L[i] += v; music.R[i] += v * 0.9;
        }
      }
    }

    // ---------- efeitos sincronizados ----------
    if (sound.sfx) {
      Engine.events(spec).forEach((e) => {
        const s0 = Math.floor(e.t * sr);
        if (e.type === 'impact') {
          const m = Math.floor(0.9 * sr), bp = biquad('bp', 900, 0.6, sr);
          let ph = 0;
          for (let j = 0; j < m; j++) {
            const t = j / sr;
            ph += (2 * Math.PI * (40 + 110 * Math.exp(-t / 0.08))) / sr;
            const boom = (Math.sin(ph) + 0.4 * Math.sin(ph * 3)) * Math.exp(-t / 0.35);
            const crack = bp(noise()) * Math.exp(-t / 0.05) * 1.2;
            put(fx, s0 + j, (boom * 0.55 + crack * 0.5) * 0.7, 0.707, 0.707);
          }
        } else if (e.type === 'whoosh') {
          const len = 0.45, start = Math.floor((e.t - 0.32) * sr), m = Math.floor(len * sr);
          const bp = biquad('bp', 1200, 0.5, sr);
          for (let j = 0; j < m; j++) {
            const p = j / m;
            const env = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.1)), 2);
            const v = bp(noise()) * env * 0.55;
            put(fx, start + j, v, 0.5 + 0.4 * p, 0.9 - 0.4 * p);
          }
        } else if (e.type === 'tick') {
          pluck(fx, e.t, 88, 0.22, 0, 0.3);
        } else if (e.type === 'reveal') {
          [72, 76, 79].forEach((m, i) => pluck(fx, e.t + i * 0.06, m + 12, 0.2, (i - 1) * 0.4, 0.8));
        } else if (e.type === 'tap') {
          [81, 88].forEach((m, i) => note(fx, e.t + i * 0.09, 0.05, m, { table: 'sine', gain: 0.2, decay: 0.5, attack: 0.002, release: 0.9 }));
        }
      });
    }

    // ---------- som original dos vídeos (ambiente / fala) ----------
    const duck = new Float32Array(n).fill(1);
    tl.scenes.forEach((item) => {
      const m = Engine.effectiveMedia(spec, item);
      const pcm = opts.media && opts.media[item.index];
      const gain = m && Number(m.audio) > 0 ? Number(m.audio) : 0;
      if (!pcm || !gain) return;
      const s0 = Math.floor(item.start * sr), len = Math.min(pcm.length, Math.floor(item.duration * sr));
      const fade = Math.floor(0.12 * sr);
      for (let j = 0; j < len; j++) {
        const env = Math.min(1, j / fade, (len - j) / fade);
        put(out, s0 + j, pcm[j] * gain * env, 0.707, 0.707);
        duck[s0 + j] = Math.min(duck[s0 + j], 1 - 0.45 * gain * env);
      }
    });

    // ---------- mixagem ----------
    // sidechain: a música "respira" a cada bumbo
    const pump = new Float32Array(n).fill(1);
    kicks.forEach((t0) => {
      const s0 = Math.floor(t0 * sr), m = Math.floor(0.3 * sr);
      for (let j = 0; j < m && s0 + j < n; j++) if (s0 + j >= 0) pump[s0 + j] = Math.min(pump[s0 + j], 1 - 0.45 * Math.exp(-j / sr / 0.09));
    });
    const mv = Number(sound.musicVolume) >= 0 ? Number(sound.musicVolume) : 1;
    const lowCut = [biquad('hp', 35, 0.7, sr), biquad('hp', 35, 0.7, sr)];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fade = Math.min(1, t / 0.04, (duration - t) / 0.6);
      const mus = pump[i] * duck[i] * mv;
      let L = out.L[i] + (music.L[i] * mus + drums.L[i] * duck[i] * mv + fx.L[i]);
      let R = out.R[i] + (music.R[i] * mus + drums.R[i] * duck[i] * mv + fx.R[i]);
      L = Math.tanh(lowCut[0](L) * 1.4) / 1.4;
      R = Math.tanh(lowCut[1](R) * 1.4) / 1.4;
      out.L[i] = L * fade; out.R[i] = R * fade;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]));
    const target = Math.pow(10, -1 / 20);
    if (peak > 0) for (let i = 0; i < n; i++) { out.L[i] *= target / peak; out.R[i] *= target / peak; }
    return { left: out.L, right: out.R, style: styleKey, bpm };
  }

  function toWav(stereo, sampleRate = 44100) {
    const L = stereo.left, R = stereo.right, n = L.length;
    const buf = new ArrayBuffer(44 + n * 4);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    return buf;
  }

  return { render, toWav, STYLES, LOOK_STYLE };
});
