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

// ✅ Admin Activity Log – Get All Logs
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const [logs] = await connection.query(`
      SELECT a.id, a.warehouse_id, a.description, a.timestamp,
             w.name AS warehouse_name
      FROM activity_logs a
      LEFT JOIN warehouses w ON a.warehouse_id = w.id
      ORDER BY a.timestamp DESC
      LIMIT 100
    `);
    res.json(logs);
  } catch (err) {
    console.error('❌ Error fetching admin activity logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ✅ Product POST route
// ✅ Add Product Route – Corrected
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
//order status admin
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

    // ✅ Step 4: Log it in activity_logs
    await connection.query(
      'INSERT INTO activity_logs (warehouse_id, description) VALUES (?, ?)',
      [warehouse_id, `📦 Order #${orderId} updated to "${status}" for ${product_name} (Distributor: ${distributor_name})`]
    );

    res.json({ message: "✅ Order status updated and history recorded" });

  } catch (error) {
    console.error('❌ Order Update Error:', error.message);
    res.status(500).json({ error: 'Server error while updating order status' });
  }
});

// ✅ Get All Orders
// ✅ Get Order Status History
app.get("/api/orders/history", async (req, res) => {
  try {
    const [rows] = await connection.query(
      "SELECT order_id, warehouse_id, distributor_name, product_name, quantity, status, created_at FROM order_status_history ORDER BY created_at DESC"
    );
    res.json({ success: true, orders: rows });
  } catch (error) {
    console.error("❌ Fetch Order History Error:", error.message);
    res.status(500).json({ success: false, message: "Server error while fetching history" });
  }
});


//main warehouse
// Add this full server.js route replacing your old /api/add-stock route
// ✅ Add stock or update existing stock
app.post("/api/add-stock", async (req, res) => {
  const { sku, qty } = req.body;

  if (!sku || isNaN(qty)) {
    return res.status(400).json({ error: "Invalid input: SKU and qty required" });
  }

  try {
    // 1. Get existing product details
    const [rows] = await connection.query("SELECT qty, mrp FROM products WHERE sku = ?", [sku]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existingQty = rows[0].qty || 0;
    const existingMrp = rows[0].mrp || 0;

    // 2. Assume existing MRP is per-unit MRP
    // Total cost = old + new, then average to find new MRP
    const totalQty = existingQty + qty;
    const totalCost = (existingQty * existingMrp) + (qty * existingMrp); // assuming new units cost same per unit
    const newMrp = totalCost / totalQty;

    // 3. Update table
    const [result] = await connection.query(
      "UPDATE products SET qty = ?, mrp = ? WHERE sku = ?",
      [totalQty, newMrp, sku]
    );

    res.json({ message: "Stock updated successfully", totalQty, newMrp });
  } catch (err) {
    console.error("Error updating stock:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ✅ Get Incoming Orders for Warehouse
app.get("/api/warehouse/orders", async (req, res) => {
  const { warehouseId, status } = req.query;

  if (!warehouseId) {
    return res.status(400).json({ success: false, message: "Missing warehouseId" });
  }

  const queryParams = status ? [warehouseId, status] : [warehouseId];

  try {
    const [orders] = await connection.query(
      `SELECT id, warehouse_id, distributor_name, product_name, quantity, status, created_at
       FROM incoming_orders
       WHERE warehouse_id = ?
       ${status ? 'AND status = ?' : ''}
       ORDER BY created_at DESC`,
      queryParams
    );

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

// ✅ Warehouse Dispatch Order API (New Route)
app.post('/api/warehouse/dispatch', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  try {
    const [orders] = await connection.query(
      'SELECT * FROM incoming_orders WHERE id = ?', [orderId]
    );

    if (!orders.length) return res.status(404).json({ error: "Order not found" });

    const order = orders[0];

    // Update order status
    await connection.query('UPDATE incoming_orders SET status = ? WHERE id = ?', ['Shipped', orderId]);

    // Insert into activity log
    await connection.query(
      'INSERT INTO activity_logs (warehouse_id, description) VALUES (?, ?)',
      [order.warehouse_id, `🚚 Order #${orderId} dispatched to ${order.distributor_name} (${order.product_name})`]
    );

    res.json({ success: true, message: "✅ Order dispatched successfully" });
  } catch (err) {
    console.error("❌ Dispatch Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// 📦 Purchase product for a customer (Global Stock Version)
app.post('/api/warehouse/purchase', async (req, res) => {
  const { warehouseId, customerName, product, qty } = req.body;

  try {
    if (!warehouseId || !customerName || !product || !qty) {
      return res.status(400).json({ error: '❌ Missing required fields' });
    }

    // 🔍 Fetch current product stock (Global, no warehouse_id)
    const [productRow] = await connection.query(
      'SELECT qty FROM products WHERE name = ?',
      [product]
    );

    if (!productRow.length) {
      return res.status(404).json({ error: '❌ Product not found' });
    }

    const currentQty = productRow[0].qty;
    if (qty > currentQty) {
      return res.status(400).json({ error: '❌ Not enough stock available' });
    }

    // ✅ Deduct product quantity globally
    await connection.query(
      'UPDATE products SET qty = qty - ? WHERE name = ?',
      [qty, product]
    );

    // 📝 Insert into customer_purchases
    await connection.query(
      'INSERT INTO customer_purchases (warehouse_id, customer_name, product_name, qty, purchase_date) VALUES (?, ?, ?, ?, NOW())',
      [warehouseId, customerName, product, qty]
    );

    // ✅ Log the activity
    await connection.query(
      'INSERT INTO activity_logs (warehouse_id, description) VALUES (?, ?)',
      [warehouseId, `Customer "${customerName}" purchased ${qty}x ${product}`]
    );

    res.json({ success: true, message: '✅ Purchase recorded successfully' });
  } catch (err) {
    console.error('❌ Purchase Error:', err);
    res.status(500).json({ error: '❌ Internal Server Error' });
  }
});



// 📦 Get recent purchases for this warehouse
app.get('/api/warehouse/purchase-history', async (req, res) => {
  const warehouseId = req.query.warehouseId;

  if (!warehouseId) {
    return res.status(400).json({ error: 'Missing warehouseId' });
  }

  try {
    const [rows] = await connection.query(
      'SELECT customer_name, product_name, qty, purchase_date FROM customer_purchases WHERE warehouse_id = ? ORDER BY purchase_date DESC LIMIT 10',
      [warehouseId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Purchase History Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Activity Logs API – Get Logs for a Warehouse
app.get('/api/activity-logs', async (req, res) => {
  const { warehouseId } = req.query;
  if (!warehouseId) return res.status(400).json({ error: 'Missing warehouseId' });

  try {
    const [logs] = await connection.query(
      `SELECT a.id, a.warehouse_id, a.description, a.timestamp,
              w.name AS warehouse_name
       FROM activity_logs a
       LEFT JOIN warehouses w ON a.warehouse_id = w.id
       WHERE a.warehouse_id = ?
       ORDER BY a.timestamp DESC
       LIMIT 50`,
      [warehouseId]
    );
    res.json(logs);
  } catch (err) {
    console.error('❌ Error fetching activity logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Activity Logs API – Add a new log (you can call this after a stock update, etc.)
app.post('/api/activity-logs', async (req, res) => {
  const { warehouseId, description } = req.body;
  if (!warehouseId || !description) return res.status(400).json({ error: 'Missing data' });

  try {
    await connection.query(
      'INSERT INTO activity_logs (warehouse_id, description) VALUES (?, ?)',
      [warehouseId, description]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error inserting log:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ✅ Default route
app.get('/', (req, res) => {
  res.send('✅ Millet Inventory Backend Running Successfully!');
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
