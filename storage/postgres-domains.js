/* PostgreSQL repositories for the first migrated core domains. */
class UserRepository {
  constructor(db) { this.db = db; }
  findById(id) { return this.db.one('SELECT * FROM users WHERE id = $1', [id]); }
  findByEmail(email) { return this.db.one('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]); }
  async create(user) {
    const fields = ['id', 'name', 'email', 'password_hash', 'city', 'neighborhood', 'cep', 'address', 'account_type', 'business_name', 'cnpj', 'interests_json', 'avatar', 'rating', 'donations', 'received', 'carbon_saved_percent', 'achievements_json', 'role', 'suspended', 'notification_preferences_json', 'created_at', 'last_active_at'];
    const values = fields.map((field) => user[field]);
    await this.db.query(`INSERT INTO users (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})`, values);
    return this.findById(user.id);
  }
  async touch(id) { await this.db.query('UPDATE users SET last_active_at = $1 WHERE id = $2', [new Date().toISOString(), id]); }
}

class PostRepository {
  constructor(db) { this.db = db; }
  findById(id) { return this.db.one('SELECT * FROM posts WHERE id = $1', [id]); }
  async listFeed(limit = 100) { return this.db.many('SELECT * FROM posts ORDER BY created_at DESC LIMIT $1', [limit]); }
  async create(post) {
    const fields = ['id', 'author_id', 'title', 'description', 'category', 'condition', 'goal', 'image_url', 'likes', 'comments', 'location', 'created_at', 'chip_icon', 'chip_label', 'status', 'reserved_by', 'completed_with', 'completed_at', 'views', 'updated_at'];
    await this.db.query(`INSERT INTO posts (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})`, fields.map((field) => post[field] ?? null));
    return this.findById(post.id);
  }
  async updateStatus(id, status, reservedBy, completedWith, completedAt) {
    return this.db.one('UPDATE posts SET status = $1, reserved_by = $2, completed_with = $3, completed_at = $4, updated_at = $5 WHERE id = $6 RETURNING *', [status, reservedBy, completedWith, completedAt, new Date().toISOString(), id]);
  }
}

module.exports = { UserRepository, PostRepository };
