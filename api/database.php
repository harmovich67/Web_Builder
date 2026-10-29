<?php
/**
 * Fronty — Database Setup & Connection
 * SQLite database with products and sellers tables
 */

define('DB_PATH', __DIR__ . '/fronty.db');

function getDB(): PDO {
    $db = new PDO('sqlite:' . DB_PATH);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('PRAGMA foreign_keys=ON');
    return $db;
}

function initDB(): void {
    $db = getDB();

    // ── Products Table ───────────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'other',
        condition TEXT NOT NULL DEFAULT 'used',
        status TEXT NOT NULL DEFAULT 'pending',
        seller_name TEXT NOT NULL DEFAULT 'Anonymous',
        seller_email TEXT DEFAULT '',
        seller_phone TEXT DEFAULT '',
        location TEXT DEFAULT '',
        images TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // ── Sellers / Users Table ────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS sellers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        location TEXT DEFAULT '',
        products_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // ── Admin Table ──────────────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // ── Customers Table ──────────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT DEFAULT '',
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // ── Customer Tokens Table ─────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS customer_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )");

    // ── Orders Table ──────────────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        shipping_address TEXT NOT NULL DEFAULT '',
        note TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )");

    // Seed admin if not exists
    $stmt = $db->query("SELECT COUNT(*) as cnt FROM admins");
    if ($stmt->fetch()['cnt'] == 0) {
        $hash = password_hash('admin123', PASSWORD_DEFAULT);
        $db->prepare("INSERT INTO admins (username, password) VALUES (?, ?)")
            ->execute(['admin', $hash]);
    }

    // Seed products if empty
    $stmt = $db->query("SELECT COUNT(*) as cnt FROM products");
    if ($stmt->fetch()['cnt'] == 0) {
        seedProducts($db);
    }
}

function seedProducts(PDO $db): void {
    $products = [
        [
            'title' => 'iPhone 14 Pro Max',
            'description' => 'Like-new condition, 256GB, Deep Purple. Battery health 95%. Comes with original box and charger. Screen protector installed since day one. No scratches, no dents. Includes original Lightning cable, 20W charger, and Apple silicone case.',
            'price' => 850,
            'category' => 'phones',
            'condition' => 'like-new',
            'status' => 'approved',
            'seller_name' => 'Ahmed M.',
            'seller_email' => 'ahmed@example.com',
            'seller_phone' => '+201012345678',
            'location' => 'Cairo, Egypt',
            'images' => '[]'
        ],
        [
            'title' => 'MacBook Air M2 (2023)',
            'description' => 'Space Gray, 8GB RAM, 512GB SSD. Perfect for students and professionals. Minor scratch on bottom. Battery cycle count: 120. macOS Sonoma installed. Comes with USB-C charger and a Twelve South BookArc stand.',
            'price' => 920,
            'category' => 'laptops',
            'condition' => 'used',
            'status' => 'approved',
            'seller_name' => 'Sara K.',
            'seller_email' => 'sara@example.com',
            'seller_phone' => '+966501234567',
            'location' => 'Riyadh, Saudi Arabia',
            'images' => '[]'
        ],
        [
            'title' => 'Sony WH-1000XM5 Headphones',
            'description' => 'Industry-leading noise cancellation. Excellent condition with all accessories included. Comes with original case, USB-C cable, and 3.5mm audio cable. Multipoint connection supported. Only 6 months old.',
            'price' => 220,
            'category' => 'accessories',
            'condition' => 'like-new',
            'status' => 'approved',
            'seller_name' => 'Omar R.',
            'seller_email' => 'omar@example.com',
            'seller_phone' => '+971501234567',
            'location' => 'Dubai, UAE',
            'images' => '[]'
        ],
        [
            'title' => 'PlayStation 5 Digital Edition',
            'description' => 'PS5 Digital with 2 DualSense controllers (white + cosmic red) and 5 digital games including Spider-Man 2 and God of War. Barely used, mint condition. Vertical stand included.',
            'price' => 380,
            'category' => 'gaming',
            'condition' => 'like-new',
            'status' => 'approved',
            'seller_name' => 'Khaled H.',
            'seller_email' => 'khaled@example.com',
            'seller_phone' => '+201112345678',
            'location' => 'Alexandria, Egypt',
            'images' => '[]'
        ],
        [
            'title' => 'Samsung Galaxy Tab S9',
            'description' => '11-inch, 128GB, WiFi model. Comes with S Pen and Book Cover case. Sealed box, never opened. Bought as a gift but recipient already had one. Full Samsung warranty still valid.',
            'price' => 450,
            'category' => 'laptops',
            'condition' => 'new',
            'status' => 'approved',
            'seller_name' => 'Fatima Z.',
            'seller_email' => 'fatima@example.com',
            'seller_phone' => '+962791234567',
            'location' => 'Amman, Jordan',
            'images' => '[]'
        ],
        [
            'title' => 'Razer DeathAdder V3 Mouse',
            'description' => 'Ultra-lightweight gaming mouse, 63g. Used for 2 months, works perfectly. Optical sensor with 30K DPI. Includes extra mouse feet and grip tape. Original box and cable included.',
            'price' => 45,
            'category' => 'gaming',
            'condition' => 'used',
            'status' => 'approved',
            'seller_name' => 'Youssef A.',
            'seller_email' => 'youssef@example.com',
            'seller_phone' => '+201551234567',
            'location' => 'Giza, Egypt',
            'images' => '[]'
        ]
    ];

    $stmt = $db->prepare("INSERT INTO products (title, description, price, category, condition, status, seller_name, seller_email, seller_phone, location, images) 
                           VALUES (:title, :description, :price, :category, :condition, :status, :seller_name, :seller_email, :seller_phone, :location, :images)");

    $sellerStmt = $db->prepare("INSERT OR IGNORE INTO sellers (name, email, phone, location, products_count) VALUES (?, ?, ?, ?, 1)");

    foreach ($products as $p) {
        $stmt->execute($p);
        $sellerStmt->execute([$p['seller_name'], $p['seller_email'], $p['seller_phone'], $p['location']]);
    }
}

// Auto-init on include
initDB();
