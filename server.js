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

// Nova tabela para disciplinas do usuário
db.exec(`
  CREATE TABLE IF NOT EXISTS user_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subject_id INTEGER,
    semester TEXT,
    year INTEGER,
    status TEXT DEFAULT 'cursando',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (subject_id) REFERENCES subjects (id),
    UNIQUE(user_id, subject_id)
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
      subjects = db.prepare('SELECT * FROM subjects ORDER BY name LIMIT 50').all();
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

// Obter disciplinas do usuário
app.get('/api/users/:id/subjects', (req, res) => {
  const { id } = req.params;
  try {
    const subjects = db.prepare(`
      SELECT us.*, s.name as subject_name, s.code as subject_code, s.professor 
      FROM user_subjects us 
      JOIN subjects s ON us.subject_id = s.id 
      WHERE us.user_id = ? 
      ORDER BY us.year DESC, us.semester DESC
    `).all(id);
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar disciplina ao usuário
app.post('/api/users/:id/subjects', (req, res) => {
  const { id } = req.params;
  const { subject_id, semester, year, status } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO user_subjects (user_id, subject_id, semester, year, status) 
      VALUES (?, ?, ?, ?, ?)
    `).run(id, subject_id, semester, year, status || 'cursando');

    res.json({ id: result.lastInsertRowid, message: 'Disciplina adicionada com sucesso!' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Disciplina já adicionada' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Remover disciplina do usuário
app.delete('/api/users/:userId/subjects/:subjectId', (req, res) => {
  const { userId, subjectId } = req.params;

  try {
    const result = db.prepare('DELETE FROM user_subjects WHERE user_id = ? AND subject_id = ?')
      .run(userId, subjectId);

    if (result.changes > 0) {
      res.json({ message: 'Disciplina removida com sucesso!' });
    } else {
      res.status(404).json({ error: 'Disciplina não encontrada' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// Criar diretório de uploads se não existir
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});