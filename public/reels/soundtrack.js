/*
 * UniHub Reels — trilha sonora sintetizada (sem arquivos externos).
 *
 * Gera um buffer mono determinístico: pad ambiente, batimento cardíaco no BPM
 * escolhido e efeitos sincronizados aos eventos do motor (whoosh nas transições,
 * impacto nos números, "tick" nos passos, sino no toque em "Seguir").
 * O mesmo código toca no Estúdio (Web Audio) e vira WAV no renderizador.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ReelSound = factory(root.ReelEngine);
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  function render(spec, sampleRate = 44100) {
    const sound = Object.assign({ enabled: true, bpm: 76, heartbeat: true, pad: true, sfx: true }, spec.sound || {});
    const duration = Engine.timeline(spec).duration;
    const n = Math.ceil(duration * sampleRate);
    const out = new Float32Array(n);
    if (!sound.enabled || !n) return out;
    const sr = sampleRate;

    let seed = 99;
    const noise = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2147483648 - 1;
    };
    const add = (i, v) => { if (i >= 0 && i < n) out[i] += v; };

    // pad: acorde de Lá menor com respiração lenta
    if (sound.pad) {
      const freqs = [110, 220, 261.63, 329.63, 392];
      const gains = [0.05, 0.03, 0.022, 0.02, 0.012];
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fade = Math.min(1, t / 1.5, (duration - t) / 1.2);
        const breath = 0.75 + 0.25 * Math.sin(t * 0.8);
        let v = 0;
        for (let k = 0; k < freqs.length; k++) v += Math.sin(2 * Math.PI * freqs[k] * t + k) * gains[k];
        out[i] += v * fade * breath;
      }
    }

    const thump = (t0, f0, f1, len, gain) => {
      const s0 = Math.floor(t0 * sr), m = Math.floor(len * sr);
      let ph = 0;
      for (let j = 0; j < m; j++) {
        const p = j / m;
        const f = f0 + (f1 - f0) * p;
        ph += (2 * Math.PI * f) / sr;
        const env = Math.min(1, j / (0.004 * sr)) * Math.exp(-p * 6);
        add(s0 + j, Math.sin(ph) * env * gain);
      }
    };

    // batimento "tum-tá"
    if (sound.heartbeat) {
      const period = 60 / Math.max(30, sound.bpm);
      for (let t = 0.4; t < duration - 0.3; t += period) {
        thump(t, 90, 45, 0.16, 0.42);
        thump(t + 0.2, 110, 60, 0.12, 0.26);
      }
    }

    if (sound.sfx) {
      Engine.events(spec).forEach((e) => {
        if (e.type === 'impact') {
          thump(e.t, 140, 32, 0.7, 0.55);
          const s0 = Math.floor(e.t * sr);
          for (let j = 0; j < 0.05 * sr; j++) add(s0 + j, noise() * 0.25 * Math.exp(-j / (0.01 * sr)));
        } else if (e.type === 'whoosh') {
          // ruído filtrado que cresce até o corte
          const len = 0.42, s0 = Math.floor((e.t - 0.3) * sr), m = Math.floor(len * sr);
          let lp = 0;
          for (let j = 0; j < m; j++) {
            const p = j / m;
            const a = 0.02 + 0.25 * p;
            lp += a * (noise() - lp);
            const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
            add(s0 + j, lp * env * 0.9);
          }
        } else if (e.type === 'tick' || e.type === 'reveal') {
          const f = e.type === 'tick' ? 1320 : 660;
          const s0 = Math.floor(e.t * sr), m = Math.floor(0.18 * sr);
          for (let j = 0; j < m; j++) {
            const t = j / sr;
            const v = Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 1.5 * t);
            add(s0 + j, v * 0.12 * Math.exp(-t * 28));
          }
          if (e.type === 'reveal') thump(e.t, 120, 50, 0.4, 0.35);
        } else if (e.type === 'tap') {
          const s0 = Math.floor(e.t * sr), m = Math.floor(1.2 * sr);
          for (let j = 0; j < m; j++) {
            const t = j / sr;
            const v = Math.sin(2 * Math.PI * 880 * t) + 0.6 * Math.sin(2 * Math.PI * 1318.5 * t) + 0.3 * Math.sin(2 * Math.PI * 1760 * t);
            add(s0 + j, v * 0.14 * Math.exp(-t * 4));
          }
        }
      });
    }

    // normaliza o pico em -1,5 dBFS (o renderizador ainda aplica loudnorm -14 LUFS)
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    const target = Math.pow(10, -1.5 / 20);
    if (peak > 0) for (let i = 0; i < n; i++) out[i] *= target / peak;
    return out;
  }

  function toWav(samples, sampleRate = 44100) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return buf;
  }

  return { render, toWav };
});
