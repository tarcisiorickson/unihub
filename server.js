const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do multer
const upload = multer({ dest: 'uploads/' });

// Inicialização do banco de dados (usando better-sqlite3)
const db = new Database('unihub.db');

// Criação das tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    professor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    user_id INTEGER,
    dificuldade INTEGER,
    didatica INTEGER,
    carga_horaria INTEGER,
    comentario TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    user_id INTEGER,
    filename TEXT NOT NULL,
    originalname TEXT NOT NULL,
    tipo TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )
`);

// Inserir dados de exemplo
const insertSampleData = () => {
  try {
    // Verificar se já existem dados
    const existingSubjects = db.prepare('SELECT COUNT(*) as count FROM subjects').get();

    if (existingSubjects.count === 0) {
      // Inserir disciplinas de exemplo
      const insertSubject = db.prepare('INSERT INTO subjects (name, code, professor) VALUES (?, ?, ?)');

      insertSubject.run('Cálculo I', 'MA044', 'Prof. João Silva');
      insertSubject.run('Programação I', 'CC101', 'Prof. Maria Santos');
      insertSubject.run('Álgebra Linear', 'MA105', 'Prof. Carlos Oliveira');
      insertSubject.run('Estruturas de Dados', 'CC201', 'Prof. Ana Costa');
      insertSubject.run('Física I', 'FI101', 'Prof. Roberto Lima');
      insertSubject.run('Química Geral', 'QU101', 'Prof. Lucia Ferreira');

      console.log('Dados de exemplo inseridos com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao inserir dados de exemplo:', error);
  }
};

insertSampleData();

// Rotas da API

// Buscar disciplinas
app.get('/api/subjects/search', (req, res) => {
  const { q } = req.query;
  try {
    let subjects;
    if (q) {
      subjects = db.prepare(`
        SELECT * FROM subjects 
        WHERE name LIKE ? OR code LIKE ? 
        ORDER BY name
      `).all(`%${q}%`, `%${q}%`);
    } else {
      subjects = db.prepare('SELECT * FROM subjects ORDER BY name LIMIT 10').all();
    }
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter disciplinas populares
app.get('/api/subjects/popular', (req, res) => {
  try {
    const subjects = db.prepare(`
      SELECT s.*, COUNT(r.id) as review_count 
      FROM subjects s 
      LEFT JOIN reviews r ON s.id = r.subject_id 
      GROUP BY s.id 
      ORDER BY review_count DESC 
      LIMIT 6
    `).all();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter detalhes de uma disciplina
app.get('/api/subjects/:id', (req, res) => {
  const { id } = req.params;
  try {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    if (!subject) {
      return res.status(404).json({ error: 'Disciplina não encontrada' });
    }
    res.json(subject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter avaliações de uma disciplina
app.get('/api/subjects/:id/reviews', (req, res) => {
  const { id } = req.params;
  try {
    const reviews = db.prepare(`
      SELECT r.*, u.name as author_name 
      FROM reviews r 
      JOIN users u ON r.user_id = u.id 
      WHERE r.subject_id = ? 
      ORDER BY r.created_at DESC
    `).all(id);

    const averages = db.prepare(`
      SELECT 
        AVG(dificuldade) as avg_dificuldade,
        AVG(didatica) as avg_didatica,
        AVG(carga_horaria) as avg_carga_horaria,
        COUNT(*) as total_reviews
      FROM reviews 
      WHERE subject_id = ?
    `).get(id);

    res.json({ reviews, averages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar avaliação
app.post('/api/subjects/:id/reviews', (req, res) => {
  const { id } = req.params;
  const { user_id, dificuldade, didatica, carga_horaria, comentario } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO reviews (subject_id, user_id, dificuldade, didatica, carga_horaria, comentario) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, user_id, dificuldade, didatica, carga_horaria, comentario);

    res.json({ id: result.lastInsertRowid, message: 'Avaliação adicionada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter materiais de uma disciplina
app.get('/api/subjects/:id/materials', (req, res) => {
  const { id } = req.params;
  try {
    const materials = db.prepare(`
      SELECT m.*, u.name as uploader_name 
      FROM materials m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.subject_id = ? 
      ORDER BY m.created_at DESC
    `).all(id);

    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload de material
app.post('/api/subjects/:id/materials', upload.single('file'), (req, res) => {
  const { id } = req.params;
  const { user_id, tipo } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Arquivo não enviado' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO materials (subject_id, user_id, filename, originalname, tipo) 
      VALUES (?, ?, ?, ?, ?)
    `).run(id, user_id, file.filename, file.originalname, tipo);

    res.json({ id: result.lastInsertRowid, message: 'Material enviado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download de material
app.get('/api/materials/:filename/download', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// Autenticação simplificada (em produção, usar hash de senha)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ? AND password = ?').get(email, password);
    if (user) {
      res.json({ user, message: 'Login realizado com sucesso!' });
    } else {
      res.status(401).json({ error: 'Email ou senha incorretos' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  try {
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email, password);
    res.json({ id: result.lastInsertRowid, message: 'Usuário cadastrado com sucesso!' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Email já cadastrado' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Perfil do usuário
app.get('/api/users/:id/reviews', (req, res) => {
  const { id } = req.params;
  try {
    const reviews = db.prepare(`
      SELECT r.*, s.name as subject_name, s.code as subject_code 
      FROM reviews r 
      JOIN subjects s ON r.subject_id = s.id 
      WHERE r.user_id = ? 
      ORDER BY r.created_at DESC
    `).all(id);
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id/materials', (req, res) => {
  const { id } = req.params;
  try {
    const materials = db.prepare(`
      SELECT m.*, s.name as subject_name, s.code as subject_code 
      FROM materials m 
      JOIN subjects s ON m.subject_id = s.id 
      WHERE m.user_id = ? 
      ORDER BY m.created_at DESC
    `).all(id);
    res.json(materials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estúdio de Reels: roteiros salvos e renderização MP4
const { spawn } = require('child_process');
const REELS_SPECS = path.join(__dirname, 'reels', 'specs');
const REELS_OUT = path.join(__dirname, 'reels', 'out');
const REEL_TEMPLATES = path.join(__dirname, 'public', 'reels', 'templates');
const REELS_MEDIA = path.join(__dirname, 'reels', 'media');
[REELS_SPECS, REELS_OUT, REELS_MEDIA].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
app.use('/reels-out', express.static(REELS_OUT));
app.use('/reels-media', express.static(REELS_MEDIA));

// Vídeos do criador usados como fundo das cenas
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: REELS_MEDIA,
    filename: (req, file, cb) => {
      const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const base = path.basename(name, path.extname(name))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video';
      cb(null, `${base}-${Date.now().toString(36)}${path.extname(file.originalname).toLowerCase() || '.mp4'}`);
    }
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('video/'))
});

app.post('/api/reels/media', mediaUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo de vídeo' });
  res.json({ src: req.file.filename });
});

const renderJobs = {};
const validSlug = (slug) => /^[a-z0-9-]{1,60}$/.test(slug);
const specPath = (slug) => {
  const saved = path.join(REELS_SPECS, `${slug}.json`);
  return fs.existsSync(saved) ? saved : path.join(REEL_TEMPLATES, `${slug}.json`);
};

app.get('/api/reels', (req, res) => {
  const names = fs.readdirSync(REELS_SPECS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  res.json(names);
});

app.get('/api/reels/:slug', (req, res) => {
  const { slug } = req.params;
  if (!validSlug(slug) || !fs.existsSync(specPath(slug))) {
    return res.status(404).json({ error: 'Roteiro não encontrado' });
  }
  res.sendFile(specPath(slug));
});

app.put('/api/reels/:slug', express.json({ limit: '1mb' }), (req, res) => {
  const { slug } = req.params;
  if (!validSlug(slug)) return res.status(400).json({ error: 'Nome inválido' });
  if (!req.body || !Array.isArray(req.body.scenes)) return res.status(400).json({ error: 'Roteiro sem cenas' });
  fs.writeFileSync(path.join(REELS_SPECS, `${slug}.json`), JSON.stringify(req.body, null, 2));
  res.json({ message: 'Roteiro salvo', slug });
});

app.post('/api/reels/:slug/render', (req, res) => {
  const { slug } = req.params;
  if (!validSlug(slug) || !fs.existsSync(specPath(slug))) {
    return res.status(404).json({ error: 'Roteiro não encontrado' });
  }
  if (renderJobs[slug] && renderJobs[slug].state === 'running') {
    return res.status(409).json({ error: 'Renderização já em andamento' });
  }
  const job = { state: 'running', progress: '', error: '' };
  renderJobs[slug] = job;
  const out = path.join(REELS_OUT, `${slug}.mp4`);
  const child = spawn(process.execPath, [path.join(__dirname, 'scripts', 'render-reel.js'), specPath(slug), '--out', out]);
  child.stdout.on('data', (d) => {
    const m = String(d).match(/(\d+)%/g);
    if (m) job.progress = m[m.length - 1];
  });
  child.stderr.on('data', (d) => { job.error += d; });
  child.on('close', (code) => {
    job.state = code === 0 ? 'done' : 'error';
    if (code === 0) {
      job.video = `/reels-out/${slug}.mp4`;
      job.cover = `/reels-out/${slug}-capa.jpg`;
      job.sheet = `/reels-out/${slug}-folha.jpg`;
    }
  });
  res.json({ message: 'Renderização iniciada' });
});

app.get('/api/reels/:slug/render', (req, res) => {
  res.json(renderJobs[req.params.slug] || { state: 'idle' });
});

// Criar diretório de uploads se não existir
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});