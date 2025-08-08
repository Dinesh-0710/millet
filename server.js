// server.js

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connection = require('./db'); // db.js with mysql2.createPool().promise()
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves files like login.html

// ✅ Login API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  try {
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, role: user.userType }, JWT_SECRET, { expiresIn: '2h' });

    res.json({ success: true, token, userType: user.userType });
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ✅ Get warehouse ID by email – for storing in localStorage
app.get("/api/get-warehouse-id", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const [rows] = await connection.query(
      "SELECT id FROM warehouses WHERE email = ?",
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Warehouse not found" });

    res.json({ id: rows[0].id });
  } catch (err) {
    console.error("❌ Get Warehouse ID Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get distributor ID by email
app.get("/api/get-distributor-id", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const [rows] = await connection.query(
      "SELECT id FROM distributors WHERE email = ?",
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Distributor not found" });

    res.json({ id: rows[0].id });
  } catch (err) {
    console.error("❌ Get Distributor ID Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Admin Activity Log – Get All Logs
// ✅ CORRECT: only uses existing fields
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const [logs] = await connection.query(`
      SELECT id, source, description, timestamp
      FROM activity_logs
      ORDER BY timestamp DESC
      LIMIT 100
    `);
    res.json(logs);
  } catch (err) {
    console.error('❌ Error fetching admin activity logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ✅ Product POST routed
app.post('/api/product', async (req, res) => {
  const { pName, sku, ean, unit, qty, mrp } = req.body;

  if (!pName || !sku || !ean || !unit || !qty || !mrp) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    await connection.query(
      'INSERT INTO products (name, sku, ean, unit, qty, mrp) VALUES (?, ?, ?, ?, ?, ?)',
      [pName, sku, ean, unit, qty, mrp]
    );

    res.json({ success: true, message: '✅ Product added successfully!' });
  } catch (err) {
    console.error('❌ DB Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Get Products API
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await connection.query('SELECT * FROM products');
    res.json({ success: true, products: rows });
  } catch (error) {
    console.error('❌ Fetch Products Error:', error.sqlMessage || error);
    res.status(500).json({ success: false, message: '❌ Error fetching products' });
  }
});
// Add Warehouse
app.post('/add-warehouse', async (req, res) => {
  const { wName, wLocation, wEmail, wPass } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(wPass, 10);

    await connection.query(
      'INSERT INTO warehouses (name, location, email, password) VALUES (?, ?, ?, ?)',
      [wName, wLocation, wEmail, hashedPassword]
    );

    // Also insert into users table for login
    await connection.query(
      'INSERT INTO users (username, password, userType) VALUES (?, ?, ?)',
      [wEmail, hashedPassword, 'warehouse']
    );

    res.json({ success: true, message: 'Warehouse added and login created!' });
  } catch (error) {
    console.error('❌ Add Warehouse Error:', error);
    res.status(500).json({ success: false, message: 'Error adding warehouse' });
  }
});
// Get warehouse API
app.get('/api/warehouses', async (req, res) => {
  try {
    const [rows] = await connection.query('SELECT name, location, email FROM warehouses');
    res.json({ success: true, warehouses: rows });
  } catch (error) {
    console.error('❌ Fetch Warehouses Error:', error);
    res.status(500).json({ success: false, message: 'Error fetching warehouses' });
  }
});
// ✅ POST: Add Distributor with login
app.post("/api/add-distributor", async (req, res) => {
  const { name, email, password, city, warehouse } = req.body;

  if (!name || !email || !password || !city || !warehouse) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into distributors table
    await connection.query(
      `INSERT INTO distributors (name, email, password, city, warehouse) VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, city, warehouse]
    );

    // Also insert into users table for login
    await connection.query(
      'INSERT INTO users (username, password, userType) VALUES (?, ?, ?)',
      [email, hashedPassword, 'distributor']
    );

    res.status(200).json({ success: true, message: "Distributor added successfully" });
  } catch (err) {
    console.error("❌ Add Distributor Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ✅ GET Distributors API
app.get("/api/distributors", async (req, res) => {
  try {
    const [rows] = await connection.query(
      "SELECT name, city, email, warehouse FROM distributors"
    );
    res.json({ success: true, distributors: rows });
  } catch (err) {
    console.error("❌ Fetch Distributors Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Order Status Update (Admin)
app.put('/orders/:id', async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  try {
    // Step 1: Get existing order info (for distributor/product/qty)
    const [orders] = await connection.query(
      'SELECT warehouse_id, distributor_name, product_name, quantity FROM order_status WHERE order_id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: '❌ Order not found' });
    }

    const { warehouse_id, distributor_name, product_name, quantity } = orders[0];

    // Step 2: Update status in main table
    await connection.query(
      'UPDATE order_status SET status = ? WHERE order_id = ?',
      [status, orderId]
    );

    // Step 3: Insert new row into history table
    await connection.query(
      'INSERT INTO order_status_history (order_id, warehouse_id, distributor_name, product_name, quantity, status) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, warehouse_id, distributor_name, product_name, quantity, status]
    );

    // ✅ Step 4: If Delivered, update distributor_stock
    if (status === 'Delivered') {
      const [[dist]] = await connection.query(
        'SELECT id FROM distributors WHERE email = ?',
        [distributor_name]
      );
      const [[prod]] = await connection.query(
        'SELECT id FROM products WHERE name = ?',
        [product_name]
      );

      if (dist && prod) {
        const distributorId = dist.id;
        const productId = prod.id;

        await connection.query(`
          INSERT INTO distributor_stock (distributor_id, product_id, qty)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE qty = qty + ?
        `, [distributorId, productId, quantity, quantity]);
      }
    }

    // ✅ Step 5: Log it in activity_logs
    const [[wh]] = await connection.query('SELECT name FROM warehouses WHERE id = ?', [warehouse_id]);
const source = `${wh.name} (${distributor_name})`;
await connection.query(
  'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
  [source, `📦 Order #${orderId} updated to "${status}" for ${product_name}`]
);

    res.json({ message: "✅ Order status updated, history recorded, and stock updated if delivered" });

  } catch (error) {
    console.error('❌ Order Update Error:', error.message);
    res.status(500).json({ error: 'Server error while updating order status' });
  }
});

// ✅ Get Order Status History - Admin API
app.get('/api/admin/order-status', async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT io.id AS orderId, w.name AS warehouse, d.name AS distributor,
             p.name AS product, io.qty, io.status, io.created_at AS created_at
      FROM incoming_orders io
      JOIN warehouses w ON io.warehouse_id = w.id
      JOIN distributors d ON io.distributor_id = d.id
      JOIN products p ON io.product_id = p.id
      ORDER BY io.created_at DESC
      LIMIT 20
    `);

    // Send structured response
    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('❌ Error fetching order status:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});


//main warehouse
// ✅ GET: Inventory by warehouse
app.get("/api/warehouse/inventory", async (req, res) => {
  const { warehouseId } = req.query;
  if (!warehouseId) return res.status(400).json({ error: "Missing warehouseId" });

  try {
    const [rows] = await connection.query(`
      SELECT 
        p.id AS product_id,
        p.name AS product,
        p.sku,
        p.ean,
        p.unit,
        COALESCE(wi.qty, 0) AS qty,
        p.mrp
      FROM products p
      LEFT JOIN warehouse_inventory wi ON p.id = wi.product_id AND wi.warehouse_id = ?
    `, [warehouseId]);

    res.json(rows);
  } catch (err) {
    console.error("❌ Warehouse Inventory Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});
// Add this full server.js route replacing your old /api/add-stock route
// ✅ Add stock or update existing stock
app.post("/api/add-stock", async (req, res) => {
  const { warehouseId, sku, qty } = req.body;

  if (!warehouseId || !sku || isNaN(qty)) {
    return res.status(400).json({ error: "Invalid input: warehouseId, SKU, and qty required" });
  }

  try {
    // 1. Get product ID and product name
    const [productRow] = await connection.query(
      "SELECT id, name FROM products WHERE sku = ?",
      [sku]
    );
    if (!productRow.length) {
      return res.status(404).json({ error: "❌ Product not found" });
    }

    const productId = productRow[0].id;
    const productName = productRow[0].name;

    // 2. Check if product exists in warehouse_inventory
    const [existingStock] = await connection.query(
      "SELECT qty FROM warehouse_inventory WHERE warehouse_id = ? AND product_id = ?",
      [warehouseId, productId]
    );

    if (existingStock.length > 0) {
      // 3a. Update qty
      await connection.query(
        "UPDATE warehouse_inventory SET qty = qty + ? WHERE warehouse_id = ? AND product_id = ?",
        [qty, warehouseId, productId]
      );
    } else {
      // 3b. Insert new record
      await connection.query(
        "INSERT INTO warehouse_inventory (warehouse_id, product_id, qty) VALUES (?, ?, ?)",
        [warehouseId, productId, qty]
      );
    }

    // 4. Log activity with product name instead of SKU
    const [[wh]] = await connection.query('SELECT name FROM warehouses WHERE id = ?', [warehouseId]);
    const source = `${wh.name} (Admin)`;
    await connection.query(
      'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
      [source, `➕ Added ${qty} stock for ${productName}`]
    );

    res.json({ success: true, message: "✅ Stock added successfully" });
  } catch (err) {
    console.error("❌ Error adding stock:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/warehouse/orders", async (req, res) => {
  const { warehouseId, status } = req.query;

  if (!warehouseId) {
    return res.status(400).json({ success: false, message: "Missing warehouseId" });
  }

  try {
    let sql = `
      SELECT io.id,
             w.name AS warehouse_name,      -- fixed alias here
             d.name AS distributor_name,
             p.name AS product_name,
             io.qty AS qty,                 -- fixed alias here
             io.status,
             io.created_at
      FROM incoming_orders io
      JOIN warehouses w ON io.warehouse_id = w.id
      JOIN distributors d ON io.distributor_id = d.id
      JOIN products p ON io.product_id = p.id
      WHERE io.warehouse_id = ?
    `;

    const params = [warehouseId];

    if (status) {
      sql += " AND io.status = ?";
      params.push(status);
    }

    sql += " ORDER BY io.created_at DESC";

    const [orders] = await connection.query(sql, params);

    const summary = { Pending: 0, Shipped: 0, Delivered: 0 };
    orders.forEach(o => {
      if (summary[o.status] !== undefined) summary[o.status]++;
    });

    res.json({ success: true, orders, summary });
  } catch (err) {
    console.error("❌ Fetch Warehouse Orders Error:", err.message);
    res.status(500).json({ success: false });
  }
});


app.post('/api/warehouse/dispatch', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  try {
    const [orders] = await connection.query(
      'SELECT * FROM incoming_orders WHERE id = ?', [orderId]
    );

    if (!orders.length) return res.status(404).json({ error: "Order not found" });

    const order = orders[0];

    // 1. Reduce warehouse inventory qty by order.qty
    await connection.query(
      `UPDATE warehouse_inventory 
       SET qty = GREATEST(qty - ?, 0) 
       WHERE warehouse_id = ? AND product_id = ?`,
      [order.qty, order.warehouse_id, order.product_id]
    );

    // 2. Update order status to "Shipped"
    await connection.query('UPDATE incoming_orders SET status = ? WHERE id = ?', ['Shipped', orderId]);

    // 3. Insert into activity log
    const [[wh]] = await connection.query('SELECT name FROM warehouses WHERE id = ?', [order.warehouse_id]);
    const [[dist]] = await connection.query('SELECT name FROM distributors WHERE id = ?', [order.distributor_id]);
    const [[prod]] = await connection.query('SELECT name FROM products WHERE id = ?', [order.product_id]);
    const source = `${wh.name} (${dist.name})`;
    await connection.query(
      'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
      [source, `📦 Order #${orderId} updated to "Shipped" for ${prod.name} (qty: ${order.qty})`]
    );

    res.json({ success: true, message: "✅ Order dispatched successfully and inventory updated" });
  } catch (err) {
    console.error("❌ Dispatch Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// 📦 Purchase product for a customer (Warehouse-specific)
app.post('/api/warehouse/purchase', async (req, res) => {
  const { warehouseId, customerName, productName, quantity } = req.body;

  if (!warehouseId || !customerName || !productName || !quantity || quantity <= 0) {
    return res.status(400).json({ error: '❌ Missing or invalid required fields' });
  }

  try {
    const [[product]] = await connection.query(
      'SELECT id FROM products WHERE name = ?',
      [productName]
    );
    if (!product) {
      return res.status(404).json({ error: '❌ Product not found' });
    }

    const [[inventory]] = await connection.query(
      `SELECT qty FROM warehouse_inventory 
       WHERE warehouse_id = ? AND product_id = ?`,
      [warehouseId, product.id]
    );

    if (!inventory || inventory.qty < quantity) {
      return res.status(400).json({ error: '❌ Not enough stock' });
    }

    const [[warehouse]] = await connection.query(
      'SELECT name FROM warehouses WHERE id = ?',
      [warehouseId]
    );
    if (!warehouse) {
      return res.status(404).json({ error: '❌ Warehouse not found' });
    }

    await connection.query(
      `UPDATE warehouse_inventory 
       SET qty = qty - ? 
       WHERE warehouse_id = ? AND product_id = ?`,
      [quantity, warehouseId, product.id]
    );

    await connection.query(
      `INSERT INTO customer_purchases (warehouse_name, customer_name, product_name, quantity, purchase_date)
       VALUES (?, ?, ?, ?, NOW())`,
      [warehouse.name, customerName, productName, quantity]
    );

    const description = `${customerName} purchased ${quantity} units of ${productName}`;
    const source = `${warehouse.name} (${customerName})`;

    await connection.query(
      'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
      [source, description]
    );

    console.log(`✅ Purchase recorded: ${customerName} bought ${quantity} ${productName}`);
    res.json({ success: true, message: '✅ Purchase successful' });
  } catch (err) {
    console.error('❌ Error in purchase:', err);
    res.status(500).json({ error: '❌ Server error' });
  }
});
// //
app.get('/api/warehouse/purchase-history', async (req, res) => {
  let query = `
    SELECT customer_name, product_name, quantity, purchase_date, warehouse_name
    FROM customer_purchases
  `;
  let params = [];

  if (req.query.warehouseId) {
    query += ' WHERE warehouse_name = (SELECT name FROM warehouses WHERE id = ?)';
    params.push(req.query.warehouseId);
  }

  query += ' ORDER BY purchase_date DESC LIMIT 10';

  try {
    const [rows] = await connection.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ Purchase History Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// ✅ Activity Logs API – Get Logs for a Warehouse by Name
app.get('/api/activity-logs', async (req, res) => {
  let { warehouseName } = req.query;

  if (!warehouseName) {
    return res.status(400).json({ error: 'Missing warehouseName' });
  }

  warehouseName = warehouseName.trim();

  try {
    const [logs] = await connection.query(
      `SELECT id, source, description, timestamp
       FROM activity_logs
       -- Match source starting with warehouseName followed by space and '('
       WHERE source LIKE CONCAT(?, ' (%)%')
       ORDER BY timestamp DESC
       LIMIT 50`,
      [warehouseName]
    );

    res.json(logs);
  } catch (err) {
    console.error('❌ Error fetching activity logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Activity Logs API – Add a new log using warehouseName and userName
app.post('/api/activity-logs', async (req, res) => {
  let { warehouseName, userName, description } = req.body;

  // Validate input
  if (!warehouseName || !userName || !description) {
    return res.status(400).json({ error: '❌ Missing warehouseName, userName or description' });
  }

  warehouseName = warehouseName.trim();
  userName = userName.trim();
  description = description.trim();

  try {
    // Confirm warehouse exists
    const [[warehouse]] = await connection.query(
      'SELECT name FROM warehouses WHERE name = ?',
      [warehouseName]
    );

    if (!warehouse) {
      return res.status(404).json({ error: '❌ Warehouse not found' });
    }

    // Build source as "warehouseName (userName)"
    const source = `${warehouse.name} (${userName})`;

    // Insert log with source and description and timestamp
    await connection.query(
      'INSERT INTO activity_logs (source, description, timestamp) VALUES (?, ?, NOW())',
      [source, description]
    );

    res.json({ success: true, message: '✅ Log saved' });
  } catch (err) {
    console.error('❌ Error inserting log:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//Distributor
// ✅ GET distributor stock
app.get('/api/distributor/stock', async (req, res) => {
  const { distributorId } = req.query;
  if (!distributorId) {
    return res.status(400).json({ error: "Missing distributorId" });
  }

  try {
    const [rows] = await connection.query(`
      SELECT p.name AS productName, p.sku, d.qty, p.mrp
      FROM distributor_stock d
      JOIN products p ON d.product_id = p.id
      WHERE d.distributor_id = ?
    `, [distributorId]);

    res.json({ success: true, stock: rows });
  } catch (err) {
    console.error("❌ Distributor Stock Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST new order
app.post('/api/order', async (req, res) => {
  const { distributor_id, warehouse_id, product_id, qty } = req.body;

  if (!distributor_id || !warehouse_id || !product_id || !qty || qty <= 0) {
    return res.status(400).json({ error: "Invalid order data" });
  }

  try {
    // Optionally: validate distributor, warehouse, and product existence here

    await connection.query(`
      INSERT INTO incoming_orders (distributor_id, warehouse_id, product_id, qty, status)
      VALUES (?, ?, ?, ?, 'Pending')
    `, [distributor_id, warehouse_id, product_id, qty]);

    res.json({ success: true, message: 'Order placed' });
  } catch (err) {
    console.error("❌ Place Order Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET order history
app.get('/api/distributor/orders', async (req, res) => {
  const { distributorId } = req.query;
  if (!distributorId) {
    return res.status(400).json({ error: "Missing distributorId" });
  }

  try {
    const [rows] = await connection.query(`
  SELECT o.id, o.qty, o.status, o.created_at AS date, p.name AS productName
  FROM incoming_orders o
  JOIN products p ON o.product_id = p.id
  WHERE o.distributor_id = ?
  ORDER BY o.created_at DESC
`, [distributorId]);

    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error("❌ Distributor Orders Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET distributor info
app.get('/api/distributor/info', async (req, res) => {
  const { distributorId } = req.query;
  if (!distributorId) {
    return res.status(400).json({ error: "Missing distributorId" });
  }

  try {
    const [rows] = await connection.query(
      "SELECT id, name, email FROM distributors WHERE id = ?",
      [distributorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid distributor" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("❌ Distributor Info Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST distributor sales
app.post('/api/distributor/sales', async (req, res) => {
  const { distributorId, productId, qty } = req.body;

  if (!distributorId || !productId || !qty || qty <= 0) {
    return res.status(400).json({ error: "Invalid sales data" });
  }

  try {
    // Check stock availability
    const [[stock]] = await connection.query(`
      SELECT qty FROM distributor_stock WHERE distributor_id = ? AND product_id = ?
    `, [distributorId, productId]);

    if (!stock || stock.qty < qty) {
      return res.status(400).json({ error: "Insufficient stock" });
    }

    // Record sale
    await connection.query(`
      INSERT INTO sales (distributor_id, product_id, qty, date)
      VALUES (?, ?, ?, NOW())
    `, [distributorId, productId, qty]);

    // Update stock
    await connection.query(`
      UPDATE distributor_stock
      SET qty = qty - ?
      WHERE distributor_id = ? AND product_id = ?
    `, [qty, distributorId, productId]);

    res.json({ success: true, message: 'Sale recorded' });
  } catch (err) {
    console.error("❌ Record Sales Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET distributor sales history
app.get('/api/distributor/sales', async (req, res) => {
  const { distributorId } = req.query;
  if (!distributorId) {
    return res.status(400).json({ error: "Missing distributorId" });
  }

  try {
    const [rows] = await connection.query(`
      SELECT s.id, s.qty, s.date, p.name AS productName
      FROM sales s
      JOIN products p ON s.product_id = p.id
      WHERE s.distributor_id = ?
      ORDER BY s.date DESC
    `, [distributorId]);

    res.json({ success: true, sales: rows });
  } catch (err) {
    console.error("❌ Distributor Sales History Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/// ✅ POST confirm delivery endpoint
app.post('/api/distributor/confirm-delivery', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, message: "Missing orderId" });
  }

  try {
    // Update order status to 'Delivered' only if current status is 'Shipped'
    const [result] = await connection.query(`
      UPDATE incoming_orders
      SET status = 'Delivered'
      WHERE id = ? AND status = 'Shipped'
    `, [orderId]);

    if (result.affectedRows === 0) {
      // No rows updated means order either not found or not shipped
      return res.status(404).json({ success: false, message: "Order not found or not in Shipped status" });
    }

    res.json({ success: true, message: "Delivery confirmed" });
  } catch (err) {
    console.error("❌ Confirm Delivery Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ POST activity log
app.post('/api/activity-log', async (req, res) => {
  const { source, description } = req.body;

  if (!source || !description) {
    return res.status(400).json({ error: "Missing source or description" });
  }

  try {
    await connection.query(
      "INSERT INTO activity_logs (source, description) VALUES (?, ?)",
      [source, description]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Activity Log Error:", err.message);
    res.status(500).json({ error: "Failed to log activity" });
  }
});

// ✅ Admin dashboard summary
app.get('/api/admin/summary', async (req, res) => {
  try {
    const [[productCount]] = await connection.query('SELECT COUNT(*) AS totalProducts FROM products');
    const [[warehouseCount]] = await connection.query('SELECT COUNT(*) AS totalWarehouses FROM warehouses');
    const [[distributorCount]] = await connection.query('SELECT COUNT(*) AS totalDistributors FROM distributors');
    const [[salesCount]] = await connection.query('SELECT COUNT(*) AS totalSales FROM sales');
    const [[orderCount]] = await connection.query('SELECT COUNT(*) AS totalOrders FROM incoming_orders');

    res.json({
      products: productCount.totalProducts,
      warehouses: warehouseCount.totalWarehouses,
      distributors: distributorCount.totalDistributors,
      sales: salesCount.totalSales,
      orders: orderCount.totalOrders
    });
  } catch (error) {
    console.error("❌ Admin Summary Error:", error.message);
    res.status(500).json({ error: "Server error while fetching summary" });
  }
});

// ✅ Admin distributor sales summary
app.get("/api/admin/distributor-sales", async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT d.name AS distributor, p.name AS product, SUM(s.qty) AS totalSold
      FROM sales s
      JOIN distributors d ON s.distributor_id = d.id
      JOIN products p ON s.product_id = p.id
      GROUP BY s.distributor_id, s.product_id
      ORDER BY totalSold DESC
    `);
    res.json({ success: true, sales: rows });
  } catch (err) {
    console.error("❌ Distributor Sales Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});
// ✅ Default route
app.get('/', (req, res) => {
  res.send('✅ Millet Inventory Backend Running Successfully!');
});

app.get('/api/healthcheck', (req, res) => {
  res.json({ status: 'ok' });
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
