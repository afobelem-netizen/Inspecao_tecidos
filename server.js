const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do PostgreSQL (Railway fornece essa variável)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar banco de dados
async function initDatabase() {
  try {
    // Tabela de tecidos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tecidos (
        codigo TEXT PRIMARY KEY,
        filtro INTEGER NOT NULL,
        placa INTEGER NOT NULL,
        lado TEXT NOT NULL,
        instalado_em TIMESTAMP NOT NULL,
        instalador TEXT NOT NULL,
        observacoes TEXT,
        status TEXT DEFAULT 'em_operacao',
        removido_em TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de anomalias
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anomalias (
        id SERIAL PRIMARY KEY,
        tecido_codigo TEXT NOT NULL,
        data TIMESTAMP NOT NULL,
        quadrante TEXT NOT NULL,
        condicao TEXT NOT NULL,
        responsavel TEXT NOT NULL,
        observacoes TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tecido_codigo) REFERENCES tecidos (codigo)
      )
    `);

    console.log('✅ Banco de dados PostgreSQL pronto na nuvem!');
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
}

// API Routes
app.get('/api/tecidos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tecidos ORDER BY instalado_em DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tecidos', async (req, res) => {
  try {
    const { codigo, filtro, placa, lado, instalado_em, instalador, observacoes } = req.body;

    // Verificar se existe tecido ativo na mesma posição
    const tecidoExistente = await pool.query(
      'SELECT codigo FROM tecidos WHERE filtro = $1 AND placa = $2 AND lado = $3 AND status = $4',
      [filtro, placa, lado, 'em_operacao']
    );

    if (tecidoExistente.rows.length > 0) {
      // Marcar tecido anterior como substituído
      await pool.query(
        'UPDATE tecidos SET status = $1, removido_em = $2 WHERE codigo = $3',
        ['substituido', new Date().toISOString(), tecidoExistente.rows[0].codigo]
      );
    }

    // Inserir novo tecido
    await pool.query(
      `INSERT INTO tecidos (codigo, filtro, placa, lado, instalado_em, instalador, observacoes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [codigo, filtro, placa, lado, instalado_em, instalador, observacoes]
    );

    res.json({ success: true, message: 'Tecido instalado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/anomalias', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM anomalias ORDER BY data DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/anomalias', async (req, res) => {
  try {
    const { tecido_codigo, data, quadrante, condicao, responsavel, observacoes } = req.body;

    await pool.query(
      `INSERT INTO anomalias (tecido_codigo, data, quadrante, condicao, responsavel, observacoes) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tecido_codigo, data, quadrante, condicao, responsavel, observacoes]
    );

    res.json({ success: true, message: 'Anomalia registrada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Sistema de inspeção na nuvem funcionando!',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Servir frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicializar servidor
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`☁️  Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
});
