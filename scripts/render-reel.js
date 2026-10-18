#!/usr/bin/env node
/*
 * Renderiza um roteiro de Reel (JSON) em MP4 1080x1920 pronto para o Instagram.
 *
 *   node scripts/render-reel.js public/reels/templates/avc-samu.json
 *   node scripts/render-reel.js roteiro.json --out reels/out/x.mp4 --fps 30
 *   node scripts/render-reel.js roteiro.json --sheet      # só a folha de contato (QA)
 *   node scripts/render-reel.js roteiro.json --frame 2.5  # um quadro PNG
 *
 * Usa o mesmo motor do Estúdio (public/reels/engine.js) num Chromium headless
 * (Playwright) e o ffmpeg para codificar H.264 + AAC com loudness -14 LUFS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const Engine = require(path.join(ROOT, 'public/reels/engine.js'));
const Sound = require(path.join(ROOT, 'public/reels/soundtrack.js'));

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (_) {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

function parseArgs(argv) {
  const args = { fps: 30, audio: true, sheet: false, frame: null, out: null, progress: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--fps') args.fps = Number(argv[++i]);
    else if (a === '--no-audio') args.audio = false;
    else if (a === '--sheet') args.sheet = true;
    else if (a === '--frame') args.frame = Number(argv[++i]);
    else if (a === '--quiet') args.progress = false;
    else rest.push(a);
  }
  args.spec = rest[0];
  return args;
}

function run(cmd, cmdArgs, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}\n${err.slice(-2000)}`))));
    if (input) input(p.stdin);
  });
}

// master: corta subgrave inútil no celular, dá presença, comprime e limita
const MASTER = 'highpass=f=30,lowshelf=f=110:g=-3,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=-16dB:ratio=3:attack=8:release=150:makeup=2,alimiter=limit=0.85:level=false';

// loudnorm em duas passagens: mede a trilha masterizada e aplica correção linear até -14 LUFS / -1,5 dBTP
function loudnormFilter(wav) {
  const target = 'I=-14:TP=-1.5:LRA=11';
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', wav, '-af', `${MASTER},loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => {
      const m = err.match(/\{[\s\S]*\}/);
      if (!m) return resolve(`loudnorm=${target}`);
      const j = JSON.parse(m[0]);
      resolve(`loudnorm=${target}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`);
    });
  });
}

const ORIGIN = 'http://reel.render';
const MEDIA_DIR = path.join(ROOT, 'reels/media');

// Extrai, para cada cena com vídeo, os quadros do trecho usado (já rotacionados pelo ffmpeg).
async function extractMedia(spec, tl, tmp, fps) {
  const out = {};
  for (const item of tl.scenes) {
    const m = Engine.effectiveMedia(spec, item);
    if (!m) continue;
    const src = path.isAbsolute(m.src) ? m.src : path.join(MEDIA_DIR, m.src);
    if (!fs.existsSync(src)) {
      console.warn(`aviso: vídeo não encontrado (${m.src}); a cena ${item.index + 1} usa o fundo padrão`);
      continue;
    }
    const dir = path.join(tmp, `m${item.index}`);
    fs.mkdirSync(dir);
    await run('ffmpeg', ['-loglevel', 'error', '-ss', String(Number(m.from) || 0), '-t', String(item.duration + 0.6), '-i', src,
      // já no tamanho final (cobre 1080x1920), ampliação lanczos e nitidez leve contra a compressão do WhatsApp
      '-vf', `fps=${fps},scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,unsharp=5:5:0.55:5:5:0`, '-q:v', '2', path.join(dir, 'f_%05d.jpg')]);
    const count = fs.readdirSync(dir).length;
    if (count) out[item.index] = { base: `/media/m${item.index}`, count };
  }
  return out;
}

// Som original das cenas com vídeo (media.audio > 0): filtrado, sem ruído de fundo e nivelado.
async function extractMediaAudio(spec, tl) {
  const out = {};
  for (const item of tl.scenes) {
    const m = Engine.effectiveMedia(spec, item);
    if (!m || !(Number(m.audio) > 0)) continue;
    const src = path.isAbsolute(m.src) ? m.src : path.join(MEDIA_DIR, m.src);
    if (!fs.existsSync(src)) continue;
    const pcm = await new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', ['-loglevel', 'error', '-ss', String(Number(m.from) || 0), '-t', String(item.duration), '-i', src, '-vn',
        '-af', 'highpass=f=120,lowpass=f=9000,afftdn=nf=-28,dynaudnorm=f=250:g=15:p=0.7', '-ac', '1', '-ar', '44100', '-f', 'f32le', '-']);
      const chunks = [];
      p.stdout.on('data', (d) => chunks.push(d));
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('falha ao extrair áudio de ' + m.src))));
    });
    out[item.index] = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  }
  return out;
}

const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.spec) {
    console.error('Uso: node scripts/render-reel.js <roteiro.json> [--out arquivo.mp4] [--fps 30] [--no-audio] [--sheet] [--frame segundos]');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(args.spec, 'utf8'));
  const name = path.basename(args.spec, '.json');
  const out = args.out || path.join(ROOT, 'reels/out', `${name}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tl = Engine.timeline(spec);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const media = await extractMedia(spec, tl, tmp, args.fps);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  // origem única fictícia: página, motor e quadros de vídeo na mesma origem (canvas não fica "tainted")
  await page.route(`${ORIGIN}/**`, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = rel.startsWith('/media/') ? path.join(tmp, rel.slice(7)) : path.join(ROOT, 'public/reels', rel);
    route.fulfill({ path: file });
  });
  await page.goto(`${ORIGIN}/render.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((s) => window.setSpec(s), spec);
  await page.evaluate(([m, f]) => window.setMedia(m, f), [media, args.fps]);
  const frameAt = async (t, type, q) => dataUrlToBuffer(await page.evaluate(([tt, ty, qq]) => window.frameAt(tt, ty, qq), [t, type, q]));

  try {
    if (args.frame != null) {
      const file = out.replace(/\.mp4$/, `-${args.frame}s.png`);
      fs.writeFileSync(file, await frameAt(args.frame));
      console.log(file);
      return;
    }

    // capa (quadro do gancho) + folha de contato com o meio de cada cena
    const cover = out.replace(/\.mp4$/, '-capa.jpg');
    fs.writeFileSync(cover, await frameAt(Math.min(tl.duration - 0.05, spec.coverAt != null ? spec.coverAt : 2.4), 'image/jpeg', 0.92));
    const shots = tl.scenes.map((s) => s.start + s.duration * 0.72);
    for (let i = 0; i < shots.length; i++) fs.writeFileSync(path.join(tmp, `s${String(i).padStart(2, '0')}.png`), await frameAt(shots[i]));
    const sheet = out.replace(/\.mp4$/, '-folha.jpg');
    const cols = Math.min(5, shots.length);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, 's%02d.png'),
      '-vf', `scale=360:-1,tile=${cols}x${Math.ceil(shots.length / cols)}:padding=12:color=0x111111`, '-frames:v', '1', '-q:v', '3', sheet]);
    console.log(`capa:  ${path.relative(ROOT, cover)}\nfolha: ${path.relative(ROOT, sheet)}`);
    if (args.sheet) return;

    let wav = null;
    if (args.audio && !(spec.sound && spec.sound.enabled === false)) {
      wav = path.join(tmp, 'trilha.wav');
      const mix = Sound.render(spec, 44100, { media: await extractMediaAudio(spec, tl) });
      fs.writeFileSync(wav, Buffer.from(Sound.toWav(mix, 44100)));
      console.log(`trilha: ${Sound.STYLES[mix.style].name}, ${mix.bpm} BPM`);
    }

    const total = Math.round(tl.duration * args.fps);
    const ff = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(args.fps), '-c:v', 'png', '-i', '-'];
    if (wav) ff.push('-i', wav);
    ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(args.fps));
    if (wav) ff.push('-af', `${MASTER},${await loudnormFilter(wav)}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-shortest');
    ff.push('-movflags', '+faststart', out);

    const started = Date.now();
    await run('ffmpeg', ff, async (stdin) => {
      for (let f = 0; f < total; f++) {
        const buf = await frameAt(f / args.fps);
        if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
        if (args.progress && (f % args.fps === 0 || f === total - 1)) {
          process.stdout.write(`\rrenderizando ${f + 1}/${total} quadros (${Math.round(((f + 1) / total) * 100)}%)`);
        }
      }
      stdin.end();
    });
    const mb = (fs.statSync(out).size / 1048576).toFixed(1);
    console.log(`\nvídeo: ${path.relative(ROOT, out)} (${tl.duration.toFixed(1)}s, ${mb} MB, ${((Date.now() - started) / 1000).toFixed(0)}s de render)`);
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
