// ============================================================
// TECHFLOW POS - SERVER POUR RENDER.COM
// Port: dynamique selon Render
// Timezone: Madagascar (UTC+3)
// Database: PostgreSQL
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// ============ POSTGRESQL CONFIG ============
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Database helper functions
const db = {
  // Pour SELECT retournant plusieurs lignes
  all: async (sql, params = []) => {
    try {
      const pgSql = convertSqliteToPg(sql);
      const result = await pool.query(pgSql, params);
      return result.rows;
    } catch (error) {
      console.error('DB all error:', error);
      throw error;
    }
  },

  // Pour SELECT retournant une seule ligne
  get: async (sql, params = []) => {
    try {
      const pgSql = convertSqliteToPg(sql);
      const result = await pool.query(pgSql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('DB get error:', error);
      throw error;
    }
  },

  // Pour INSERT, UPDATE, DELETE
  run: async (sql, params = []) => {
    try {
      const pgSql = convertSqliteToPg(sql);
      const result = await pool.query(pgSql, params);
      return {
        lastID: result.rows[0]?.id || 0,
        changes: result.rowCount || 0
      };
    } catch (error) {
      console.error('DB run error:', error);
      throw error;
    }
  },

  // Pour exécuter plusieurs requêtes en série
  serialize: async (callback) => {
    await callback();
  }
};

// Convertir SQLite vers PostgreSQL
function convertSqliteToPg(sql) {
  if (!sql) return sql;
  
  let converted = sql
    .replace(/AUTOINCREMENT/gi, 'SERIAL')
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bTEXT\b/gi, 'VARCHAR')
    .replace(/\bREAL\b/gi, 'DECIMAL(10,2)')
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
    .replace(/GROUP_CONCAT\(/gi, 'STRING_AGG(')
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/'now'/gi, 'CURRENT_TIMESTAMP')
    .replace(/DATE\(/gi, 'DATE_TRUNC(')
    .replace(/strftime\('%Y-%m-%d',/gi, "TO_CHAR(")
    .replace(/\)\)/g, ", 'YYYY-MM-DD')");

  // Gérer les différences de fonctions de date
  converted = converted.replace(/DATE\('([^']+)',\s*'([^']+)'\s*\)/g, "DATE '$1' + INTERVAL '$2'");
  
  return converted;
}

// ============ MADAGASCAR TIMEZONE HELPERS ============
function getMadagascarDateTime() {
    const now = new Date();
    const madagascarTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const year = madagascarTime.getFullYear();
    const month = String(madagascarTime.getMonth() + 1).padStart(2, '0');
    const day = String(madagascarTime.getDate()).padStart(2, '0');
    const hours = String(madagascarTime.getHours()).padStart(2, '0');
    const minutes = String(madagascarTime.getMinutes()).padStart(2, '0');
    const seconds = String(madagascarTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getMadagascarDate() {
    const now = new Date();
    const madagascarTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const year = madagascarTime.getFullYear();
    const month = String(madagascarTime.getMonth() + 1).padStart(2, '0');
    const day = String(madagascarTime.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'techflow_pos_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
};

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// Multer configuration (mémoire pour Render)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// ============ INITIALIZE DATABASE ============
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données PostgreSQL...');

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'caissier',
        full_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_default INTEGER DEFAULT 0
      )
    `);

    // Products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        category VARCHAR(100),
        purchase_price DECIMAL(10,2) DEFAULT 0,
        sale_price DECIMAL(10,2) NOT NULL,
        quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        image TEXT,
        barcode VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sales table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        client_id INTEGER REFERENCES clients(id),
        user_id INTEGER REFERENCES users(id),
        subtotal DECIMAL(10,2),
        discount_type VARCHAR(20),
        discount_value DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2),
        payment_method VARCHAR(20) DEFAULT 'cash',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sale items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(200),
        quantity INTEGER,
        unit_price DECIMAL(10,2),
        total DECIMAL(10,2)
      )
    `);

    // Stock movements table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(200),
        movement_type VARCHAR(10),
        quantity INTEGER,
        reason TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Expenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        type VARCHAR(20) DEFAULT 'realized',
        category VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Financial goals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_goals (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        target_amount DECIMAL(10,2) NOT NULL,
        current_amount DECIMAL(10,2) DEFAULT 0,
        deadline DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Company config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        name VARCHAR(200) DEFAULT 'TechFlow POS',
        logo TEXT,
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(100),
        website VARCHAR(200),
        invoice_header TEXT,
        invoice_footer TEXT DEFAULT 'Misaotra tompoko!',
        currency VARCHAR(10) DEFAULT 'Ar',
        tax_rate DECIMAL(5,2) DEFAULT 0
      )
    `);

    // Insert default admin
    const defaultPassword = bcrypt.hashSync('admin_26', 10);
    const now = getMadagascarDateTime();
    
    const adminExists = await pool.query(
      "SELECT id FROM users WHERE username = 'admin'"
    );
    
    if (adminExists.rowCount === 0) {
      await pool.query(
        `INSERT INTO users (username, password, role, full_name, is_default, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['admin', defaultPassword, 'admin', 'Administrateur', 1, now]
      );
      console.log('✅ Admin par défaut créé');
    }

    // Insert default company config
    const configExists = await pool.query(
      "SELECT id FROM company_config WHERE id = 1"
    );
    
    if (configExists.rowCount === 0) {
      await pool.query(
        `INSERT INTO company_config (id, name) VALUES (1, 'TechFlow POS')`
      );
      console.log('✅ Configuration société créée');
    }

    console.log('✅ Base de données PostgreSQL initialisée avec succès');
  } catch (error) {
    console.error('❌ Erreur initialisation DB:', error);
  }
}

// ============ AUTH MIDDLEWARE ============
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
};

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'OK', 
      app: 'TechFlow POS',
      database: 'PostgreSQL',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// ============ AUTH ROUTES ============
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
        }
        
        const user = await db.get('SELECT * FROM users WHERE username = $1', [username]);
        
        if (!user) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        
        if (bcrypt.compareSync(password, user.password)) {
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name
            };
            res.json({ success: true, user: req.session.user });
        } else {
            res.status(401).json({ error: 'Identifiants incorrects' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ error: 'Non connecté' });
    }
});

// ============ USERS ROUTES ============
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT id, username, role, full_name, created_at, is_default FROM users ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { username, password, role, full_name } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        const now = getMadagascarDateTime();
        
        const result = await db.run(
            'INSERT INTO users (username, password, role, full_name, created_at) VALUES ($1, $2, $3, $4, $5)',
            [username, hashedPassword, role || 'caissier', full_name, now]
        );
        
        res.json({ id: result.lastID, success: true });
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { username, password, role, full_name } = req.body;
        
        const user = await db.get('SELECT is_default FROM users WHERE id = $1', [req.params.id]);
        
        if (user && user.is_default === 1 && role !== 'admin') {
            return res.status(403).json({ error: 'Impossible de modifier le rôle de l\'admin par défaut' });
        }
        
        if (password) {
            const hashedPassword = bcrypt.hashSync(password, 10);
            await db.run(
                'UPDATE users SET username = $1, password = $2, role = $3, full_name = $4 WHERE id = $5',
                [username, hashedPassword, role, full_name, req.params.id]
            );
        } else {
            await db.run(
                'UPDATE users SET username = $1, role = $2, full_name = $3 WHERE id = $4',
                [username, role, full_name, req.params.id]
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await db.get('SELECT is_default FROM users WHERE id = $1', [req.params.id]);
        
        if (user && user.is_default === 1) {
            return res.status(403).json({ error: 'Impossible de supprimer l\'admin par défaut' });
        }
        
        await db.run('DELETE FROM users WHERE id = $1 AND is_default = 0', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PRODUCTS ROUTES ============
app.get('/api/products', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.session.user.role === 'admin';
        const fields = isAdmin 
            ? '*' 
            : 'id, name, category, sale_price, quantity, min_stock, image, barcode';
        
        const rows = await db.all(`SELECT ${fields} FROM products ORDER BY name`);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.session.user.role === 'admin';
        const fields = isAdmin 
            ? '*' 
            : 'id, name, category, sale_price, quantity, min_stock, image, barcode';
        
        const row = await db.get(`SELECT ${fields} FROM products WHERE id = $1`, [req.params.id]);
        
        if (!row) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }
        
        res.json(row);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, category, purchase_price, sale_price, quantity, min_stock, barcode } = req.body;
        
        if (!name || !sale_price) {
            return res.status(400).json({ error: 'Nom et prix de vente requis' });
        }
        
        let image = null;
        if (req.file) {
            // Stocker en base64 pour Render (pas de stockage de fichiers)
            image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        
        const now = getMadagascarDateTime();
        
        const result = await db.run(
            `INSERT INTO products (name, category, purchase_price, sale_price, quantity, min_stock, image, barcode, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [name, category || '', purchase_price || 0, sale_price, quantity || 0, min_stock || 5, image, barcode || '', now, now]
        );
        
        const productId = result.lastID;
        
        // Log initial stock movement if quantity > 0
        if (quantity && parseInt(quantity) > 0) {
            await db.run(
                `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [productId, name, 'entry', parseInt(quantity), 'Stock initial', req.session.user.id, now]
            );
        }
        
        res.json({ id: productId, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, category, purchase_price, sale_price, quantity, min_stock, barcode } = req.body;
        const now = getMadagascarDateTime();
        
        const oldProduct = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
        
        if (!oldProduct) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }
        
        let image = oldProduct.image;
        if (req.file) {
            image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        
        const newQuantity = parseInt(quantity) || 0;
        const oldQuantity = oldProduct.quantity || 0;
        
        await db.run(
            `UPDATE products SET name = $1, category = $2, purchase_price = $3, sale_price = $4, 
             quantity = $5, min_stock = $6, image = $7, barcode = $8, updated_at = $9 
             WHERE id = $10`,
            [name, category || '', purchase_price || 0, sale_price, newQuantity, min_stock || 5, image, barcode || '', now, req.params.id]
        );
        
        // Log stock movement if quantity changed
        if (newQuantity !== oldQuantity) {
            const diff = newQuantity - oldQuantity;
            const movementType = diff > 0 ? 'entry' : 'exit';
            await db.run(
                `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [req.params.id, name, movementType, Math.abs(diff), 'Ajustement admin', req.session.user.id, now]
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products/:id/add-stock', requireAuth, async (req, res) => {
    try {
        const { quantity } = req.body;
        const now = getMadagascarDateTime();
        
        if (!quantity || parseInt(quantity) <= 0) {
            return res.status(400).json({ error: 'Quantité invalide' });
        }
        
        const product = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
        
        if (!product) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }
        
        const addQty = parseInt(quantity);
        const newQuantity = (product.quantity || 0) + addQty;
        
        await db.run(
            'UPDATE products SET quantity = $1, updated_at = $2 WHERE id = $3',
            [newQuantity, now, req.params.id]
        );
        
        await db.run(
            `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, product.name, 'entry', addQty, 'Réapprovisionnement', req.session.user.id, now]
        );
        
        res.json({ success: true, newQuantity });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CLIENTS ROUTES ============
app.get('/api/clients', requireAuth, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM clients ORDER BY name');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/clients/:id', requireAuth, async (req, res) => {
    try {
        const client = await db.get('SELECT * FROM clients WHERE id = $1', [req.params.id]);
        
        if (!client) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }
        
        const sales = await db.all(
            `SELECT s.*, STRING_AGG(si.product_name || ' x' || si.quantity, ', ') as items 
             FROM sales s 
             LEFT JOIN sale_items si ON s.id = si.sale_id 
             WHERE s.client_id = $1 
             GROUP BY s.id 
             ORDER BY s.created_at DESC`,
            [req.params.id]
        );
        
        res.json({ ...client, sales: sales || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/clients', requireAuth, async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Le nom est requis' });
        }
        
        const now = getMadagascarDateTime();
        
        const result = await db.run(
            'INSERT INTO clients (name, phone, email, address, created_at) VALUES ($1, $2, $3, $4, $5)',
            [name, phone || '', email || '', address || '', now]
        );
        
        res.json({ id: result.lastID, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/clients/:id', requireAuth, async (req, res) => {
    try {
        const { name, phone, email, address } = req.body;
        
        await db.run(
            'UPDATE clients SET name = $1, phone = $2, email = $3, address = $4 WHERE id = $5',
            [name, phone || '', email || '', address || '', req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/clients/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM clients WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ SALES ROUTES ============
function generateInvoiceNumber() {
    const now = new Date();
    const madagascarTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    
    const year = madagascarTime.getFullYear();
    const month = String(madagascarTime.getMonth() + 1).padStart(2, '0');
    const day = String(madagascarTime.getDate()).padStart(2, '0');
    const hour = String(madagascarTime.getHours()).padStart(2, '0');
    const minute = String(madagascarTime.getMinutes()).padStart(2, '0');
    const second = String(madagascarTime.getSeconds()).padStart(2, '0');
    
    return `FAC-${year}${month}${day}-${hour}${minute}${second}`;
}

app.get('/api/sales', requireAuth, async (req, res) => {
    try {
        const { period } = req.query;
        const today = getMadagascarDate();
        let whereClause = 'WHERE 1=1';
        
        if (period === 'today') {
            whereClause += ` AND DATE(s.created_at) = '${today}'`;
        } else if (period === 'week') {
            whereClause += ` AND s.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
        } else if (period === 'month') {
            whereClause += ` AND s.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
        }
        
        const rows = await db.all(
            `SELECT s.*, c.name as client_name, u.username as user_name, u.full_name as user_full_name
             FROM sales s 
             LEFT JOIN clients c ON s.client_id = c.id 
             LEFT JOIN users u ON s.user_id = u.id 
             ${whereClause}
             ORDER BY s.created_at DESC`
        );
        
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sales/:id', requireAuth, async (req, res) => {
    try {
        const sale = await db.get(
            `SELECT s.*, c.name as client_name, c.phone as client_phone, u.username as user_name, u.full_name as user_full_name
             FROM sales s 
             LEFT JOIN clients c ON s.client_id = c.id 
             LEFT JOIN users u ON s.user_id = u.id 
             WHERE s.id = $1`,
            [req.params.id]
        );
        
        if (!sale) {
            return res.status(404).json({ error: 'Vente non trouvée' });
        }
        
        const items = await db.all('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
        res.json({ ...sale, items: items || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sales', requireAuth, async (req, res) => {
    try {
        const { client_id, client_name, client_phone, items, subtotal, discount_type, discount_value, total, payment_method } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Le panier est vide' });
        }
        
        const invoice_number = generateInvoiceNumber();
        const now = getMadagascarDateTime();
        let finalClientId = client_id || null;
        
        // Create client if name provided
        if (!client_id && client_name && client_name.trim()) {
            const clientResult = await db.run(
                'INSERT INTO clients (name, phone, created_at) VALUES ($1, $2, $3)',
                [client_name.trim(), client_phone || '', now]
            );
            finalClientId = clientResult.lastID;
        }
        
        // Start transaction
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Insert sale
            const saleResult = await client.query(
                `INSERT INTO sales (invoice_number, client_id, user_id, subtotal, discount_type, discount_value, total, payment_method, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [invoice_number, finalClientId, req.session.user.id, subtotal, discount_type || 'percent', discount_value || 0, total, payment_method || 'cash', now]
            );
            
            const saleId = saleResult.rows[0].id;
            
            // Insert sale items and update stock
            for (const item of items) {
                await client.query(
                    `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [saleId, item.id, item.name, item.quantity, item.price, item.quantity * item.price]
                );
                
                // Update product stock
                await client.query(
                    'UPDATE products SET quantity = quantity - $1, updated_at = $2 WHERE id = $3',
                    [item.quantity, now, item.id]
                );
                
                // Log stock movement
                await client.query(
                    `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [item.id, item.name, 'exit', item.quantity, 'Vente ' + invoice_number, req.session.user.id, now]
                );
            }
            
            await client.query('COMMIT');
            res.json({ id: saleId, invoice_number, success: true });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Sale creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sales/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const now = getMadagascarDateTime();
        
        const sale = await db.get('SELECT invoice_number FROM sales WHERE id = $1', [req.params.id]);
        
        if (!sale) {
            return res.status(404).json({ error: 'Vente non trouvée' });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get sale items
            const itemsResult = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [req.params.id]);
            
            // Restore stock
            for (const item of itemsResult.rows) {
                await client.query(
                    'UPDATE products SET quantity = quantity + $1, updated_at = $2 WHERE id = $3',
                    [item.quantity, now, item.product_id]
                );
                
                // Log stock restoration
                await client.query(
                    `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [item.product_id, item.product_name, 'entry', item.quantity, 'Annulation vente ' + sale.invoice_number, req.session.user.id, now]
                );
            }
            
            // Delete sale items
            await client.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
            
            // Delete sale
            await client.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
            
            await client.query('COMMIT');
            res.json({ success: true });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ STOCK MOVEMENTS ROUTES ============
app.get('/api/stock-movements', requireAuth, async (req, res) => {
    try {
        const { period } = req.query;
        const today = getMadagascarDate();
        let whereClause = '';
        
        if (period === 'today') {
            whereClause = `WHERE DATE(sm.created_at) = '${today}'`;
        } else if (period === 'week') {
            whereClause = `WHERE sm.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
        } else if (period === 'month') {
            whereClause = `WHERE sm.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
        }
        
        const rows = await db.all(
            `SELECT sm.*, u.username as user_name, u.full_name as user_full_name
             FROM stock_movements sm 
             LEFT JOIN users u ON sm.user_id = u.id 
             ${whereClause}
             ORDER BY sm.created_at DESC`
        );
        
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stock-movements', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { product_id, movement_type, quantity, reason } = req.body;
        const now = getMadagascarDateTime();
        
        if (!product_id || !movement_type || !quantity) {
            return res.status(400).json({ error: 'Données manquantes' });
        }
        
        const product = await db.get('SELECT * FROM products WHERE id = $1', [product_id]);
        
        if (!product) {
            return res.status(404).json({ error: 'Produit non trouvé' });
        }
        
        const qty = parseInt(quantity);
        let newQuantity;
        
        if (movement_type === 'entry') {
            newQuantity = (product.quantity || 0) + qty;
        } else {
            newQuantity = (product.quantity || 0) - qty;
            if (newQuantity < 0) {
                return res.status(400).json({ error: 'Stock insuffisant' });
            }
        }
        
        await db.run(
            'UPDATE products SET quantity = $1, updated_at = $2 WHERE id = $3',
            [newQuantity, now, product_id]
        );
        
        const result = await db.run(
            `INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, reason, user_id, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [product_id, product.name, movement_type, qty, reason || 'Mouvement manuel', req.session.user.id, now]
        );
        
        res.json({ id: result.lastID, success: true, newQuantity });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/stock-movements/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const now = getMadagascarDateTime();
        
        const movement = await db.get('SELECT * FROM stock_movements WHERE id = $1', [req.params.id]);
        
        if (!movement) {
            return res.status(404).json({ error: 'Mouvement non trouvé' });
        }
        
        const product = await db.get('SELECT * FROM products WHERE id = $1', [movement.product_id]);
        
        if (product) {
            let newQuantity;
            if (movement.movement_type === 'entry') {
                newQuantity = Math.max(0, (product.quantity || 0) - movement.quantity);
            } else {
                newQuantity = (product.quantity || 0) + movement.quantity;
            }
            
            await db.run(
                'UPDATE products SET quantity = $1, updated_at = $2 WHERE id = $3',
                [newQuantity, now, movement.product_id]
            );
        }
        
        await db.run('DELETE FROM stock_movements WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ DASHBOARD STATS ============
app.get('/api/dashboard/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = {};
        const today = getMadagascarDate();
        
        // Today's sales
        const todayData = await db.get(
            `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue 
             FROM sales 
             WHERE DATE(created_at) = $1`,
            [today]
        );
        
        stats.todaySales = parseInt(todayData.count) || 0;
        stats.todayRevenue = parseFloat(todayData.revenue) || 0;
        
        // Monthly sales
        const monthData = await db.get(
            `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue 
             FROM sales 
             WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
        );
        
        stats.monthSales = parseInt(monthData.count) || 0;
        stats.monthRevenue = parseFloat(monthData.revenue) || 0;
        
        // Critical stock
        const critical = await db.get(
            "SELECT COUNT(*) as count FROM products WHERE quantity <= min_stock"
        );
        
        stats.criticalStock = parseInt(critical.count) || 0;
        
        // Calculate profit
        const items = await db.all(
            `SELECT si.quantity, si.unit_price, p.purchase_price 
             FROM sale_items si 
             JOIN products p ON si.product_id = p.id 
             JOIN sales s ON si.sale_id = s.id 
             WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'`
        );
        
        let profit = 0;
        (items || []).forEach(item => {
            profit += (parseFloat(item.unit_price) - (parseFloat(item.purchase_price) || 0)) * parseInt(item.quantity);
        });
        stats.monthProfit = profit;
        
        // Monthly expenses
        const expenses = await db.get(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM expenses 
             WHERE status = 'validated' 
             AND created_at >= CURRENT_DATE - INTERVAL '30 days'`
        );
        
        stats.monthExpenses = parseFloat(expenses.total) || 0;
        stats.netProfit = profit - stats.monthExpenses;
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/chart', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { period } = req.query;
        const days = period === 'week' ? 7 : 30;
        
        const rows = await db.all(
            `SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as sales 
             FROM sales 
             WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days' 
             GROUP BY DATE(created_at) 
             ORDER BY date`
        );
        
        res.json(rows || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/top-products', requireAuth, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT si.product_name, SUM(si.quantity) as total_sold, SUM(si.total) as revenue 
             FROM sale_items si 
             JOIN sales s ON si.sale_id = s.id 
             WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days' 
             GROUP BY si.product_id 
             ORDER BY total_sold DESC 
             LIMIT 10`
        );
        
        res.json(rows || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ TREASURY / EXPENSES ============
app.get('/api/expenses', requireAuth, requireAdmin, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM expenses ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/expenses', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { description, amount, type, category, status } = req.body;
        const now = getMadagascarDateTime();
        
        if (!description || !amount) {
            return res.status(400).json({ error: 'Description et montant requis' });
        }
        
        const result = await db.run(
            'INSERT INTO expenses (description, amount, type, category, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [description, amount, type || 'realized', category || '', status || 'pending', now]
        );
        
        res.json({ id: result.lastID, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { description, amount, type, category, status } = req.body;
        
        await db.run(
            'UPDATE expenses SET description = $1, amount = $2, type = $3, category = $4, status = $5 WHERE id = $6',
            [description, amount, type, category, status, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/expenses/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM expenses WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ FINANCIAL GOALS ============
app.get('/api/financial-goals', requireAuth, requireAdmin, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM financial_goals ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/financial-goals', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, target_amount, deadline } = req.body;
        const now = getMadagascarDateTime();
        
        if (!name || !target_amount) {
            return res.status(400).json({ error: 'Nom et montant cible requis' });
        }
        
        const result = await db.run(
            'INSERT INTO financial_goals (name, target_amount, deadline, created_at) VALUES ($1, $2, $3, $4)',
            [name, target_amount, deadline || null, now]
        );
        
        res.json({ id: result.lastID, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/financial-goals/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { name, target_amount, current_amount, deadline, status } = req.body;
        
        await db.run(
            'UPDATE financial_goals SET name = $1, target_amount = $2, current_amount = $3, deadline = $4, status = $5 WHERE id = $6',
            [name, target_amount, current_amount || 0, deadline, status || 'active', req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/financial-goals/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM financial_goals WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ COMPANY CONFIG ============
app.get('/api/config', requireAuth, async (req, res) => {
    try {
        const row = await db.get('SELECT * FROM company_config WHERE id = 1');
        res.json(row || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/config', requireAuth, requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        const { name, address, phone, email, website, invoice_header, invoice_footer, currency, tax_rate } = req.body;
        
        const current = await db.get('SELECT logo FROM company_config WHERE id = 1');
        let logo = current ? current.logo : null;
        
        if (req.file) {
            logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        
        await db.run(
            `UPDATE company_config SET name = $1, logo = $2, address = $3, phone = $4, email = $5, 
             website = $6, invoice_header = $7, invoice_footer = $8, currency = $9, tax_rate = $10 WHERE id = 1`,
            [name || 'TechFlow POS', logo, address || '', phone || '', email || '', 
             website || '', invoice_header || '', invoice_footer || 'Misaotra tompoko!', currency || 'Ar', tax_rate || 0]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ EXPORTS ============
app.get('/api/export/clients', requireAuth, async (req, res) => {
    try {
        const rows = await db.all('SELECT name, phone, email, address FROM clients ORDER BY name');
        
        let csv = '\ufeffNom,Téléphone,Email,Adresse\n';
        (rows || []).forEach(row => {
            csv += `"${row.name || ''}","${row.phone || ''}","${row.email || ''}","${row.address || ''}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/export/sales', requireAuth, async (req, res) => {
    try {
        const { period } = req.query;
        const today = getMadagascarDate();
        let whereClause = '';
        
        if (period === 'today') {
            whereClause = `WHERE DATE(s.created_at) = '${today}'`;
        } else if (period === 'week') {
            whereClause = `WHERE s.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
        } else if (period === 'month') {
            whereClause = `WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
        }
        
        const rows = await db.all(
            `SELECT s.invoice_number, s.created_at, c.name as client, s.subtotal, s.discount_value, s.total, u.full_name as vendeur
             FROM sales s 
             LEFT JOIN clients c ON s.client_id = c.id 
             LEFT JOIN users u ON s.user_id = u.id
             ${whereClause}
             ORDER BY s.created_at DESC`
        );
        
        let csv = '\ufeffNuméro Facture,Date,Client,Sous-total,Remise,Total,Vendeur\n';
        (rows || []).forEach(row => {
            csv += `"${row.invoice_number}","${row.created_at}","${row.client || 'Anonyme'}","${row.subtotal}","${row.discount_value}","${row.total}","${row.vendeur || ''}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=ventes_${period || 'all'}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CATEGORIES ============
app.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const rows = await db.all(
            'SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != \'\' ORDER BY category'
        );
        res.json((rows || []).map(r => r.category));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ STATIC FILES ============
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint non trouvé' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log('');
      console.log('══════════════════════════════════════════════════════════════');
      console.log('  ████████╗███████╗ ██████╗██╗  ██╗███████╗██╗      ██████╗ ██╗    ██╗');
      console.log('  ╚══██╔══╝██╔════╝██╔════╝██║  ██║██╔════╝██║     ██╔═══██╗██║    ██║');
      console.log('     ██║   █████╗  ██║     ███████║█████╗  ██║     ██║   ██║██║ █╗ ██║');
      console.log('     ██║   ██╔══╝  ██║     ██╔══██║██╔══╝  ██║     ██║   ██║██║███╗██║');
      console.log('     ██║   ███████╗╚██████╗██║  ██║███████╗███████╗╚██████╔╝╚███╔███╔╝');
      console.log('     ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝');
      console.log('══════════════════════════════════════════════════════════════');
      console.log('');
      console.log(`   🚀 TechFlow POS (Render Edition) démarré avec succès!`);
      console.log(`   🌐 URL: http://localhost:${PORT}`);
      console.log(`   🔐 Login: http://localhost:${PORT}/login.html`);
      console.log(`   📊 Database: PostgreSQL (Render)`);
      console.log(`   🕐 Timezone: Madagascar (UTC+3)`);
      console.log(`   📅 Date/Heure: ${getMadagascarDateTime()}`);
      console.log(`   ⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('');
      console.log('══════════════════════════════════════════════════════════════');
      console.log('   Health Check: GET /health');
      console.log('══════════════════════════════════════════════════════════════');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

startServer();