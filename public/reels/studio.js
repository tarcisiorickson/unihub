/* UniHub · Estúdio de Reels — editor visual sobre o motor ReelEngine. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('preview');
  const ctx = canvas.getContext('2d');

  const TEMPLATES = [
    { name: 'avc-samu', label: 'Modelo: AVC — sigla SAMU', url: 'templates/avc-samu.json' },
    { name: 'intubacao-bastidores', label: 'Modelo: bastidores da intubação (vídeo próprio)', url: 'templates/intubacao-bastidores.json' }
  ];
  const ICONS = ['', 'brain', 'heart', 'smile', 'arms', 'speech', 'phone', 'clock', 'alert', 'check', 'x', 'bookmark', 'send'];
  const TYPE_COLORS = { hook: '#ff3b5c', stat: '#f5a524', step: '#7c6cff', list: '#3fa7ff', myth: '#e8505b', recap: '#2ecc8f', cta: '#d62976', clip: '#b5c42f' };

  // Campos editáveis por tipo de cena: [chave, rótulo, tipo de campo]
  const FIELDS = {
    hook: [['kicker', 'Selo', 'text'], ['text', 'Texto do gancho', 'textarea'], ['highlight', 'Palavras em destaque (vírgula)', 'list'], ['icon', 'Ícone', 'icon']],
    stat: [['kicker', 'Frase de abertura', 'text'], ['value', 'Número', 'number'], ['decimals', 'Casas decimais', 'number'], ['prefix', 'Prefixo', 'text'], ['unit', 'Unidade', 'text'], ['label', 'Complemento', 'text'], ['highlight', 'Destaques (vírgula)', 'list'], ['source', 'Fonte', 'text']],
    step: [['letter', 'Letra', 'text'], ['title', 'Título', 'text'], ['text', 'Instrução', 'textarea'], ['icon', 'Ícone', 'icon'], ['highlight', 'Destaques (vírgula)', 'list'], ['letters', 'Sigla (letras, vírgula)', 'list'], ['stepIndex', 'Posição na sigla (0 = primeira)', 'number']],
    list: [['title', 'Título', 'text'], ['items', 'Itens (um por linha)', 'lines'], ['highlight', 'Destaques (vírgula)', 'list']],
    myth: [['myth', 'Mito', 'textarea'], ['truth', 'Verdade', 'textarea'], ['highlight', 'Destaques (vírgula)', 'list']],
    recap: [['title', 'Título', 'text'], ['letters', 'Letras (vírgula)', 'list'], ['words', 'Palavras (vírgula)', 'list'], ['note', 'Nota', 'text'], ['noteHighlight', 'Destaques da nota', 'list']],
    cta: [['text', 'Chamada', 'textarea'], ['highlight', 'Destaques (vírgula)', 'list'], ['handle', '@ do perfil', 'text'], ['bio', 'Bio', 'text'], ['disclaimer', 'Aviso', 'textarea']],
    clip: [['title', 'Título grande', 'textarea'], ['subtitle', 'Subtítulo (com estrelas)', 'text'], ['highlight', 'Destaques (vírgula)', 'list'], ['search.text', 'Barra de pesquisa (digitando)', 'text'], ['stickers', 'Adesivos: texto ; x ; y ; seta (left/right/none) ; up — um por linha', 'stickers'], ['shout', 'Grito na tela (ex.: SPOILER)', 'text']]
  };
  const COMMON = [['duration', 'Duração (s)', 'number'], ['caption', 'Legenda palavra a palavra', 'text'], ['captionDelay', 'Atraso da legenda (s, vazio = automático)', 'number'],
    ['media.src', 'Seu vídeo de fundo', 'media'], ['media.from', 'Começar o vídeo em (s)', 'number'], ['media.dim', 'Escurecer vídeo (0–1)', 'number'], ['media.zoom', 'Zoom lento até (ex.: 1.1)', 'number'], ['media.grade', 'Tom do vídeo', 'grade'], ['media.audio', 'Som original do vídeo (0 = mudo, 1 = cheio)', 'number']];
  const GRADES = [['', 'automático'], ['none', 'original'], ['warm', 'dourado (retrô)'], ['bw', 'preto e branco']];

  const DEFAULT_SCENES = {
    hook: { duration: 3, kicker: 'Medicina em 30s', text: 'O erro que quase todo mundo comete', highlight: ['erro'], icon: 'alert' },
    stat: { duration: 3.5, kicker: 'Você sabia?', value: 80, decimals: 0, prefix: '', unit: '%', label: 'dos casos podem ser evitados', highlight: ['evitados'], source: 'Fonte: ' },
    step: { duration: 3.5, letter: '1', title: 'Passo', text: 'Descreva o que a pessoa deve fazer.', icon: 'check', letters: [], stepIndex: 0 },
    list: { duration: 4, title: '3 sinais de alerta', items: ['Primeiro sinal', 'Segundo sinal', 'Terceiro sinal'] },
    myth: { duration: 4, myth: 'Uma crença comum e errada.', truth: 'O que a evidência realmente mostra.', highlight: [] },
    recap: { duration: 3.5, title: 'Resumo:', letters: ['A', 'B', 'C'], words: ['Um', 'Dois', 'Três'], note: '' },
    cta: { duration: 4, text: 'Salve e envie para alguém que você ama', highlight: ['envie'], handle: '@seu.perfil', bio: 'Medicina em 30 segundos', disclaimer: 'Conteúdo educativo. Não substitui avaliação médica.' },
    clip: { duration: 3.5, title: 'meu 2º período', subtitle: 'Retrospectiva', stickers: [{ text: 'a little sunshine', x: 0.35, y: 0.55, arrow: 'right' }], media: { src: '', from: 0 } }
  };
  const videos = {};

  let spec = null;
  let slug = 'meu-reel';
  let selected = 0;
  let time = 0;
  let playing = false;
  let lastTs = 0;
  let audio = { ctx: null, buffer: null, dirty: true, source: null, dest: null };
  let recorder = null;

  // ---------- carregamento ----------
  async function loadTemplateList() {
    const sel = $('templateSelect');
    let saved = [];
    try {
      const res = await fetch('/api/reels');
      if (res.ok) saved = await res.json();
    } catch (_) { /* servidor indisponível: só modelos estáticos */ }
    sel.innerHTML = '<option value="">Carregar…</option>' +
      TEMPLATES.map((t) => `<option value="tpl:${t.name}">${t.label}</option>`).join('') +
      saved.filter((s) => !TEMPLATES.some((t) => t.name === s)).map((s) => `<option value="srv:${s}">Salvo: ${s}</option>`).join('') +
      '<option value="blank">Em branco</option>';
  }

  async function loadFrom(value) {
    if (!value) return;
    if (value === 'blank') {
      setSpec({ title: 'Novo reel', look: 'impacto', handle: '@seu.perfil', captions: true, sound: { enabled: true, bpm: 76 }, scenes: [clone(DEFAULT_SCENES.hook), clone(DEFAULT_SCENES.cta)], post: { caption: '', hashtags: [] } }, 'novo-reel');
      return;
    }
    const [kind, name] = value.split(':');
    const url = kind === 'tpl' ? TEMPLATES.find((t) => t.name === name).url : `/api/reels/${encodeURIComponent(name)}`;
    const res = await fetch(url);
    setSpec(await res.json(), name);
  }

  function setSpec(s, name) {
    spec = s;
    spec.scenes = spec.scenes || [];
    spec.post = spec.post || { caption: '', hashtags: [] };
    spec.sound = spec.sound || { enabled: true, bpm: 76 };
    slug = slugify(name || spec.title || 'meu-reel');
    selected = 0;
    time = 0;
    renderAllPanels();
    status(`Roteiro "${spec.title || slug}" carregado.`);
  }

  // ---------- painéis ----------
  function renderAllPanels() {
    $('fTitle').value = spec.title || '';
    $('fHandle').value = spec.handle || '';
    $('fCaptions').checked = spec.captions !== false;
    $('fSound').checked = spec.sound.enabled !== false;
    $('fStyle').innerHTML = '<option value="">Automático (pelo look)</option>' +
      Object.entries(ReelSound.STYLES).map(([k, v]) => `<option value="${k}" ${spec.sound.style === k ? 'selected' : ''}>${v.name} · ${v.bpm} BPM</option>`).join('') +
      `<option value="none" ${spec.sound.music === false ? 'selected' : ''}>Sem música (só efeitos)</option>`;
    $('fBpm').value = spec.sound.bpm || '';
    $('fMusicVol').value = spec.sound.musicVolume != null ? spec.sound.musicVolume : 1;
    $('fPost').value = spec.post.caption || '';
    $('fTags').value = (spec.post.hashtags || []).join(' ');
    renderLooks();
    renderSceneList();
    renderSceneEditor();
    renderTimeline();
    renderChecklist();
  }

  function renderLooks() {
    $('looks').innerHTML = Object.entries(ReelEngine.LOOKS).map(([key, l]) => `
      <div class="look ${spec.look === key ? 'active' : ''}" data-look="${key}">
        <div class="sw"><i style="background:${l.bg1}"></i><i style="background:${l.accent}"></i><i style="background:${l.accent2}"></i></div>
        ${l.name}
      </div>`).join('');
  }

  function sceneSummary(s) {
    const search = s.search && (s.search.text || s.search);
    const sticker = s.stickers && s.stickers[0] && s.stickers[0].text;
    return s.text || s.title || s.myth || s.kicker || (s.value != null ? String(s.value) : '') || search || sticker || (s.media && s.media.src) || '—';
  }

  function renderSceneList() {
    $('sceneList').innerHTML = spec.scenes.map((s, i) => `
      <li class="scene-item ${i === selected ? 'active' : ''}" data-index="${i}">
        <span class="num" style="background:${TYPE_COLORS[s.type] || '#666'}">${i + 1}</span>
        <div class="meta"><b>${ReelEngine.SCENE_TYPES[s.type] || s.type} · ${fmt(s.duration || 3)}s</b><span>${escapeHtml(sceneSummary(s))}</span></div>
        <div class="tools">
          <button data-act="up" title="Subir">↑</button>
          <button data-act="down" title="Descer">↓</button>
          <button data-act="dup" title="Duplicar">⧉</button>
          <button data-act="del" title="Excluir">✕</button>
        </div>
      </li>`).join('');
  }

  function getPath(obj, key) { return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    const parent = parts.reduce((o, k) => (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}), obj);
    if (value === undefined || value === '') delete parent[last]; else parent[last] = value;
    if (parts.length && !Object.keys(parent).length) delete obj[parts[0]];
  }

  function fieldValue(scene, key, kind) {
    let v = getPath(scene, key);
    if (key === 'search.text' && typeof scene.search === 'string') v = scene.search;
    if (v == null) return '';
    if (kind === 'stickers') return v.map((st) => [st.text, st.x, st.y, st.arrow || 'none', st.arrowUp ? 'up' : ''].join(' ; ').replace(/ ; $/, '')).join('\n');
    if (kind === 'list') return v.join(', ');
    if (kind === 'lines') return v.join('\n');
    return v;
  }

  function renderSceneEditor() {
    const box = $('sceneEditor');
    const scene = spec.scenes[selected];
    if (!scene) { box.innerHTML = '<h2>Cena</h2><p class="hint">Adicione uma cena para editar.</p>'; return; }
    const fields = (FIELDS[scene.type] || []).concat(COMMON);
    box.innerHTML = `<h2>Cena ${selected + 1} · ${ReelEngine.SCENE_TYPES[scene.type] || scene.type}</h2>` +
      fields.map(([key, label, kind]) => {
        const val = escapeHtml(fieldValue(scene, key, kind));
        if (kind === 'textarea' || kind === 'lines') return `<label>${label}<textarea data-key="${key}" data-kind="${kind}" rows="3">${val}</textarea></label>`;
        if (kind === 'grade') return `<label>${label}<select data-key="${key}" data-kind="grade">${GRADES.map(([v, n]) => `<option value="${v}" ${(getPath(scene, key) || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
        if (kind === 'stickers') return `<label>${label}<textarea data-key="${key}" data-kind="stickers" rows="3">${val}</textarea></label>`;
        if (kind === 'media') return `<label>${label}<input type="text" data-key="${key}" data-kind="text" value="${val}" placeholder="arquivo em reels/media/"></label><button class="btn small" type="button" data-upload="1">Enviar vídeo…</button>`;
        if (kind === 'icon') return `<label>${label}<select data-key="${key}" data-kind="icon">${ICONS.map((ic) => `<option value="${ic}" ${scene[key] === ic || (!scene[key] && !ic) ? 'selected' : ''}>${ic || '(nenhum)'}</option>`).join('')}</select></label>`;
        return `<label>${label}<input type="${kind === 'number' ? 'number' : 'text'}" step="0.1" data-key="${key}" data-kind="${kind}" value="${val}"></label>`;
      }).join('');
  }

  function renderTimeline() {
    const tl = ReelEngine.timeline(spec);
    $('track').innerHTML = tl.scenes.map((s) => `
      <div class="clip ${s.index === selected ? 'active' : ''}" data-index="${s.index}" style="width:${(s.duration / tl.duration) * 100}%;background:${TYPE_COLORS[s.scene.type] || '#666'}">
        ${s.index + 1}. ${s.scene.type}<small>${fmt(s.duration)}s</small>
      </div>`).join('');
  }

  // ---------- checklist viral ----------
  function analyze() {
    const tl = ReelEngine.timeline(spec);
    const sc = spec.scenes;
    const first = sc[0] || {};
    const isHook = first.type === 'hook' || (first.type === 'clip' && !!first.title);
    const hookWords = String(first.text || first.title || '').split(/\s+/).filter(Boolean).length + (first.type === 'clip' ? String(first.subtitle || '').split(/\s+/).filter(Boolean).length : 0);
    const stat = sc.find((s) => s.type === 'stat');
    const last = sc[sc.length - 1] || {};
    const allText = JSON.stringify(sc).toLowerCase();
    const post = (spec.post.caption || '').toLowerCase();
    const tags = spec.post.hashtags || [];
    const captioned = sc.filter((s) => s.caption).length;
    return [
      [isHook && tl.scenes[0].duration <= 3.5, 'Gancho abre o vídeo em até 3,5 s', 'A saída nos 3 primeiros segundos é o que mais derruba o alcance.'],
      [hookWords > 0 && hookWords <= 12, `Gancho curto (${hookWords} palavras)`, 'Até 12 palavras: tem que ser lido em 1 segundo.'],
      [(first.highlight || []).length > 0 || (first.type === 'clip' && !!first.title), 'Gancho com palavra em destaque', 'O marca-texto (ou o título colorido) guia o olho para a promessa.'],
      [tl.duration >= 15 && tl.duration <= 45, `Duração ideal (${fmt(tl.duration)} s)`, 'Entre 15 e 45 s para conteúdo educativo curto.'],
      [tl.scenes.every((s) => s.duration <= 5), 'Ritmo: nenhuma cena passa de 5 s', 'Cenas longas viram o ponto de saída.'],
      [!!(stat && stat.source && stat.source.replace(/fonte:?/i, '').trim()) || sc.some((s) => s.type === 'myth'), 'Informação com respaldo (número com fonte ou mito × verdade)', 'Um dado que choca com referência, ou um mito corrigido.'],
      [last.type === 'cta' && /salv|envi|compart/.test(String(last.text).toLowerCase()), 'Termina pedindo salvar/enviar', 'Envios e salvamentos estão entre os sinais mais fortes.'],
      [spec.captions !== false && captioned >= 3, `Legendas em ${captioned} cenas`, 'Boa parte do público assiste sem som.'],
      [/não substitui|nao substitui/.test(allText), 'Aviso médico no vídeo', 'Exigência ética (CFM) e de credibilidade.'],
      [/fonte/.test(post), 'Fontes citadas na legenda do post', 'Aumenta a confiança e protege contra denúncias.'],
      [tags.length >= 3 && tags.length <= 10, `${tags.length} hashtags`, 'De 3 a 10 hashtags, misturando nicho e amplas.']
    ].map(([ok, label, tip]) => ({ ok: !!ok, label, tip }));
  }

  function renderChecklist() {
    const items = analyze();
    const score = Math.round((items.filter((i) => i.ok).length / items.length) * 100);
    $('score').textContent = score;
    $('scoreBar').style.width = score + '%';
    $('checklist').innerHTML = items.map((i) => `
      <li class="${i.ok ? 'ok' : 'bad'}"><span class="ic">${i.ok ? '✓' : '!'}</span><div>${i.label}${i.ok ? '' : `<small>${i.tip}</small>`}</div></li>`).join('');
  }

  // ---------- edição ----------
  function changed(full) {
    audio.dirty = true;
    time = Math.min(time, ReelEngine.timeline(spec).duration);
    if (full) renderSceneList();
    renderTimeline();
    renderChecklist();
  }

  function onSceneField(e) {
    const el = e.target;
    const key = el.dataset.key;
    if (!key) return;
    const scene = spec.scenes[selected];
    const kind = el.dataset.kind;
    const raw = el.value;
    if (key === 'search.text' && typeof scene.search === 'string') scene.search = { text: scene.search };
    let value;
    if (kind === 'number') value = raw === '' ? undefined : Number(raw);
    else if (kind === 'list') value = raw.split(',').map((x) => x.trim()).filter(Boolean);
    else if (kind === 'lines') value = raw.split('\n').map((x) => x.trim()).filter(Boolean);
    else if (kind === 'stickers') value = raw.split('\n').map(parseSticker).filter(Boolean);
    else value = raw;
    setPath(scene, key, value);
    if (key === 'duration') scene.duration = Math.max(0.6, scene.duration || 0.6);
    changed(true);
    seekToScene(selected, true);
  }

  function onSceneListClick(e) {
    const item = e.target.closest('.scene-item');
    if (!item) return;
    const i = Number(item.dataset.index);
    const act = e.target.dataset.act;
    if (act === 'up' && i > 0) { swap(i, i - 1); selected = i - 1; }
    else if (act === 'down' && i < spec.scenes.length - 1) { swap(i, i + 1); selected = i + 1; }
    else if (act === 'dup') { spec.scenes.splice(i + 1, 0, clone(spec.scenes[i])); selected = i + 1; }
    else if (act === 'del') { spec.scenes.splice(i, 1); selected = Math.max(0, Math.min(selected, spec.scenes.length - 1)); }
    else selected = i;
    changed(true);
    renderSceneEditor();
    seekToScene(selected);
  }

  function parseSticker(line) {
    const [text, x, y, arrow, up] = line.split(';').map((p) => p.trim());
    if (!text) return null;
    const st = { text, x: x ? Number(x) : 0.5, y: y ? Number(y) : 0.6 };
    if (arrow) st.arrow = arrow;
    if (up === 'up') st.arrowUp = true;
    return st;
  }

  // ---------- vídeos do criador ----------
  function mediaUrl(src) {
    return /^(blob:|https?:|\/)/.test(src) ? src : `/reels-media/${encodeURIComponent(src)}`;
  }

  const usedVideos = new Set();
  function mediaFor(index, local, scene) {
    const m = scene.media;
    const key = `${index}|${m.src}`;
    let v = videos[key];
    if (!v) {
      v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.src = mediaUrl(m.src);
      v.onerror = () => status(`Não consegui abrir o vídeo "${escapeHtml(m.src)}". Envie o arquivo pelo botão "Enviar vídeo…".`);
      videos[key] = v;
    }
    usedVideos.add(key);
    let target = (Number(m.from) || 0) + local;
    if (v.duration) target = Math.min(target, v.duration - 0.05);
    const isFrozen = local >= ReelEngine.timeline(spec).scenes[index].duration - 0.01;
    const vol = Math.min(1, Math.max(0, Number(m.audio) || 0));
    v.muted = !(vol > 0 && playing && !isFrozen && spec.sound.enabled !== false);
    v.volume = vol;
    if (playing && !isFrozen) {
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.05 && !v.seeking) v.currentTime = target;
    }
    return v.readyState >= 2 ? v : null;
  }

  async function uploadVideo(file) {
    const scene = spec.scenes[selected];
    try {
      status('Enviando vídeo…');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/reels/media', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const { src } = await res.json();
      setPath(scene, 'media.src', src);
      status(`Vídeo "${escapeHtml(src)}" pronto para usar e renderizar.`);
    } catch (e) {
      // sem servidor: pré-visualiza localmente (o MP4 do servidor não verá este arquivo)
      setPath(scene, 'media.src', URL.createObjectURL(file));
      status(`Servidor indisponível (${escapeHtml(e.message)}): vídeo só na pré-visualização/WebM.`);
    }
    changed(true); renderSceneEditor();
  }

  function swap(a, b) { const t = spec.scenes[a]; spec.scenes[a] = spec.scenes[b]; spec.scenes[b] = t; }

  function seekToScene(i, keepIfInside) {
    const s = ReelEngine.timeline(spec).scenes[i];
    if (!s) return;
    if (keepIfInside && time >= s.start && time < s.end) return;
    // pula para um momento em que a cena já está montada
    time = s.start + Math.min(s.duration * 0.7, 2.2);
    if (playing) restartAudio();
  }

  // ---------- reprodução ----------
  function draw() {
    if (!spec) return;
    usedVideos.clear();
    ReelEngine.renderFrame(ctx, spec, time, { safeZone: $('fSafe').checked, media: mediaFor });
    Object.entries(videos).forEach(([k, v]) => { if (!usedVideos.has(k) && !v.paused) v.pause(); });
    const dur = ReelEngine.timeline(spec).duration || 1;
    $('timeLabel').textContent = `${fmt(time)} / ${fmt(dur)} s`;
    $('playhead').style.left = (time / dur) * 100 + '%';
  }

  function loop(ts) {
    if (playing) {
      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      time += dt;
      const dur = ReelEngine.timeline(spec).duration;
      if (time >= dur) {
        if (recorder) { time = dur; stopRecording(); }
        else if ($('fLoop').checked) { time = 0; restartAudio(); }
        else { time = dur; pause(); }
      }
      const cur = ReelEngine.timeline(spec).scenes.findIndex((s) => time < s.end);
      if (cur >= 0 && cur !== selected && !document.activeElement.closest('#sceneEditor')) {
        selected = cur;
        renderSceneList(); renderSceneEditor(); renderTimeline();
      }
    }
    lastTs = ts;
    draw();
    requestAnimationFrame(loop);
  }

  function ensureAudio() {
    if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.dirty || !audio.buffer) {
      const sr = audio.ctx.sampleRate;
      const mix = ReelSound.render(spec, sr);
      audio.buffer = audio.ctx.createBuffer(2, Math.max(1, mix.left.length), sr);
      audio.buffer.copyToChannel(mix.left, 0);
      audio.buffer.copyToChannel(mix.right, 1);
      audio.dirty = false;
    }
  }

  function startAudio() {
    if (spec.sound.enabled === false) return;
    ensureAudio();
    stopAudio();
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.buffer;
    src.connect(audio.ctx.destination);
    if (audio.dest) src.connect(audio.dest);
    src.start(0, Math.min(time, audio.buffer.duration));
    audio.source = src;
  }
  function stopAudio() { if (audio.source) { try { audio.source.stop(); } catch (_) {} audio.source = null; } }
  function restartAudio() { if (playing) startAudio(); }

  function play() {
    if (time >= ReelEngine.timeline(spec).duration - 0.01) time = 0;
    playing = true; lastTs = 0;
    $('playBtn').textContent = '❚❚';
    startAudio();
  }
  function pause() {
    playing = false;
    $('playBtn').textContent = '▶';
    stopAudio();
  }

  function scrub(e) {
    const r = $('timeline').getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    time = p * ReelEngine.timeline(spec).duration;
    restartAudio();
  }

  // ---------- exportação ----------
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function startRecording() {
    if (!canvas.captureStream || !window.MediaRecorder) { status('Seu navegador não suporta gravação. Use "Renderizar MP4".'); return; }
    pause();
    time = 0;
    const stream = canvas.captureStream(30);
    if (spec.sound.enabled !== false) {
      ensureAudio();
      audio.dest = audio.ctx.createMediaStreamDestination();
      audio.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      download(`${slug}.webm`, new Blob(chunks, { type: 'video/webm' }));
      status('WebM gravado. Para o Instagram, prefira o MP4 do botão "Renderizar MP4".');
      audio.dest = null;
      recorder = null;
      $('recordBtn').classList.remove('recording');
      $('recordBtn').textContent = 'Gravar WebM';
    };
    recorder.start();
    $('recordBtn').classList.add('recording');
    $('recordBtn').textContent = 'Gravando…';
    status('Gravando em tempo real… mantenha a aba aberta.');
    play();
  }
  function stopRecording() { pause(); if (recorder && recorder.state !== 'inactive') recorder.stop(); }

  async function saveToServer() {
    const res = await fetch(`/api/reels/${slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec, null, 2) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function renderOnServer() {
    try {
      status('Salvando roteiro…');
      await saveToServer();
      const res = await fetch(`/api/reels/${slug}/render`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      status('Renderizando MP4 1080x1920 no servidor… (leva alguns minutos)');
      const poll = async () => {
        const st = await (await fetch(`/api/reels/${slug}/render`)).json();
        if (st.state === 'running') { status(`Renderizando… ${st.progress || ''}`); setTimeout(poll, 2000); }
        else if (st.state === 'done') status(`Pronto! <a href="${st.video}" target="_blank">Baixar MP4</a> · <a href="${st.cover}" target="_blank">capa</a> · <a href="${st.sheet}" target="_blank">folha de contato</a>`);
        else status(`Falha na renderização: ${escapeHtml(st.error || 'erro desconhecido')}`);
      };
      poll();
    } catch (e) {
      status(`Servidor indisponível (${escapeHtml(e.message)}). No terminal: <code>node scripts/render-reel.js roteiro.json</code>`);
    }
  }

  // ---------- utilidades ----------
  function status(html) { $('status').innerHTML = html; }
  function fmt(n) { return (Math.round(n * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function slugify(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meu-reel'; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- eventos ----------
  function bind() {
    $('templateSelect').addEventListener('change', (e) => { loadFrom(e.target.value); e.target.value = ''; });
    $('fTitle').addEventListener('input', (e) => { spec.title = e.target.value; });
    $('fHandle').addEventListener('input', (e) => { spec.handle = e.target.value; });
    $('fCaptions').addEventListener('change', (e) => { spec.captions = e.target.checked; changed(); });
    $('fSound').addEventListener('change', (e) => { spec.sound.enabled = e.target.checked; changed(); if (!e.target.checked) stopAudio(); else restartAudio(); });
    $('fBpm').addEventListener('input', (e) => { if (e.target.value) spec.sound.bpm = Number(e.target.value); else delete spec.sound.bpm; changed(); });
    $('fStyle').addEventListener('change', (e) => {
      const v = e.target.value;
      spec.sound.music = v !== 'none';
      if (v && v !== 'none') spec.sound.style = v; else delete spec.sound.style;
      changed(); restartAudio();
    });
    $('fMusicVol').addEventListener('change', (e) => { spec.sound.musicVolume = Number(e.target.value); changed(); restartAudio(); });
    $('looks').addEventListener('click', () => { if (!spec.sound.style) { audio.dirty = true; restartAudio(); } });
    $('fPost').addEventListener('input', (e) => { spec.post.caption = e.target.value; renderChecklist(); });
    $('fTags').addEventListener('input', (e) => { spec.post.hashtags = e.target.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t)); renderChecklist(); });
    $('looks').addEventListener('click', (e) => { const l = e.target.closest('.look'); if (l) { spec.look = l.dataset.look; renderLooks(); } });
    $('sceneList').addEventListener('click', onSceneListClick);
    $('sceneEditor').addEventListener('input', onSceneField);
    $('sceneEditor').addEventListener('click', (e) => { if (e.target.dataset.upload) $('videoFile').click(); });
    $('videoFile').addEventListener('change', (e) => { if (e.target.files[0]) uploadVideo(e.target.files[0]); e.target.value = ''; });
    $('newSceneType').innerHTML = Object.entries(ReelEngine.SCENE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('addScene').addEventListener('click', () => {
      const type = $('newSceneType').value;
      spec.scenes.splice(selected + 1, 0, Object.assign({ type }, clone(DEFAULT_SCENES[type])));
      selected = Math.min(selected + 1, spec.scenes.length - 1);
      changed(true); renderSceneEditor(); seekToScene(selected);
    });
    $('playBtn').addEventListener('click', () => (playing ? pause() : play()));
    let dragging = false;
    $('timeline').addEventListener('pointerdown', (e) => { dragging = true; $('timeline').setPointerCapture(e.pointerId); scrub(e); });
    $('timeline').addEventListener('pointermove', (e) => dragging && scrub(e));
    $('timeline').addEventListener('pointerup', () => { dragging = false; });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      if (e.code === 'ArrowRight') { time = Math.min(ReelEngine.timeline(spec).duration, time + 0.1); restartAudio(); }
      if (e.code === 'ArrowLeft') { time = Math.max(0, time - 0.1); restartAudio(); }
    });
    $('exportBtn').addEventListener('click', () => download(`${slug}.json`, new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' })));
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { setSpec(JSON.parse(await f.text()), f.name.replace(/\.json$/, '')); }
      catch (err) { status('JSON inválido: ' + escapeHtml(err.message)); }
      e.target.value = '';
    });
    $('saveBtn').addEventListener('click', async () => {
      try { await saveToServer(); status(`Salvo como <b>${slug}</b> no servidor.`); loadTemplateList(); }
      catch (e) { status(`Não foi possível salvar (${escapeHtml(e.message)}). Use "Exportar JSON".`); }
    });
    $('recordBtn').addEventListener('click', () => (recorder ? stopRecording() : startRecording()));
    $('renderBtn').addEventListener('click', renderOnServer);
    $('copyPost').addEventListener('click', async () => {
      const text = `${spec.post.caption || ''}\n\n${(spec.post.hashtags || []).join(' ')}`.trim();
      try { await navigator.clipboard.writeText(text); status('Legenda copiada.'); } catch (_) { status('Não foi possível copiar; selecione o texto manualmente.'); }
    });
  }

  async function init() {
    bind();
    await loadTemplateList();
    const res = await fetch(TEMPLATES[0].url);
    setSpec(await res.json(), TEMPLATES[0].name);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    requestAnimationFrame(loop);
  }

  init().catch((e) => status('Erro ao iniciar: ' + escapeHtml(e.message)));
})();
