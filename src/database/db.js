const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Tabela de configurações globais (para salvar ID do painel)
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Tabela de jogadores
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        user_id VARCHAR(32) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        points INT DEFAULT 0,
        wins INT DEFAULT 0,
        penalties INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de histórico de auditoria
    await client.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(32) NOT NULL,
        action VARCHAR(50) NOT NULL,
        points_changed INT NOT NULL,
        author_id VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDB,
  // Helpers para manipulação de dados
  async getPanelMessageId() {
    const res = await pool.query('SELECT value FROM config WHERE key = $1', ['panel_message_id']);
    return res.rows[0]?.value || null;
  },
  async setPanelMessageId(messageId) {
    await pool.query(
      'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      ['panel_message_id', messageId]
    );
  },
  async addPlayer(userId, username) {
    await pool.query(
      'INSERT INTO players (user_id, username, points, wins, penalties) VALUES ($1, $2, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING',
      [userId, username]
    );
  },
  async removePlayer(userId) {
    await pool.query('DELETE FROM players WHERE user_id = $1', [userId]);
  },
  async getPlayer(userId) {
    const res = await pool.query('SELECT * FROM players WHERE user_id = $1', [userId]);
    return res.rows[0];
  },
  async getAllPlayers() {
    const res = await pool.query('SELECT * FROM players ORDER BY points DESC, wins DESC');
    return res.rows;
  },
  async registerWin(userId, authorId) {
    await pool.query('UPDATE players SET points = points + 3, wins = wins + 1 WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO history (user_id, action, points_changed, author_id) VALUES ($1, $2, $3, $4)', [userId, 'WIN', 3, authorId]);
  },
  async removeWin(userId, authorId) {
    await pool.query('UPDATE players SET points = GREATEST(0, points - 3), wins = GREATEST(0, wins - 1) WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO history (user_id, action, points_changed, author_id) VALUES ($1, $2, $3, $4)', [userId, 'REMOVE_WIN', -3, authorId]);
  },
  async applyPenalty(userId, authorId) {
    await pool.query('UPDATE players SET points = GREATEST(0, points - 2), penalties = penalties + 1 WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO history (user_id, action, points_changed, author_id) VALUES ($1, $2, $3, $4)', [userId, 'PENALTY', -2, authorId]);
  }
};
