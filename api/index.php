<?php
/**
 * Fronty — API Router
 * Handles all REST API requests
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/database.php';

// ── Parse Request ────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

// ── Route ────────────────────────────────────────
try {
    $db = getDB();

    switch ($path) {

        // ═══════════ PRODUCTS ═══════════

        case 'products.list':
            $status = $_GET['status'] ?? null;
            $category = $_GET['category'] ?? null;
            $search = $_GET['search'] ?? null;

            $sql = "SELECT * FROM products WHERE 1=1";
            $params = [];

            if ($status) {
                $sql .= " AND status = ?";
                $params[] = $status;
            }
            if ($category && $category !== 'all') {
                $sql .= " AND category = ?";
                $params[] = $category;
            }
            if ($search) {
                $sql .= " AND (title LIKE ? OR description LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $sql .= " ORDER BY created_at DESC";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll();

            // Decode images JSON
            foreach ($items as &$item) {
                $item['images'] = json_decode($item['images'], true) ?: [];
            }

            respond($items);
            break;

        case 'products.get':
            $id = $_GET['id'] ?? null;
            if (!$id) respondError('Product ID required', 400);

            $stmt = $db->prepare("SELECT * FROM products WHERE id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();

            if (!$item) respondError('Product not found', 404);

            $item['images'] = json_decode($item['images'], true) ?: [];
            respond($item);
            break;

        case 'products.create':
            if ($method !== 'POST') respondError('POST required', 405);

            $required = ['title', 'price', 'category'];
            foreach ($required as $field) {
                if (empty($input[$field])) respondError("$field is required", 400);
            }

            $price = floatval($input['price']);
            if ($price < 0) respondError('Price must be a positive number', 400);

            $stmt = $db->prepare("INSERT INTO products (title, description, price, category, condition, status, seller_name, seller_email, seller_phone, location, images) 
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            $status = $input['status'] ?? 'pending';
            $images = json_encode($input['images'] ?? []);

            $stmt->execute([
                $input['title'],
                $input['description'] ?? '',
                $price,
                $input['category'],
                $input['condition'] ?? 'used',
                $status,
                $input['sellerName'] ?? $input['seller_name'] ?? 'Anonymous',
                $input['sellerEmail'] ?? $input['seller_email'] ?? '',
                $input['sellerPhone'] ?? $input['seller_phone'] ?? '',
                $input['location'] ?? '',
                $images
            ]);

            $newId = $db->lastInsertId();

            // Upsert seller
            $sellerName = $input['sellerName'] ?? $input['seller_name'] ?? 'Anonymous';
            $sellerPhone = $input['sellerPhone'] ?? $input['seller_phone'] ?? '';
            if ($sellerName !== 'Anonymous' && $sellerName !== '') {
                $check = $db->prepare("SELECT id FROM sellers WHERE name = ? AND phone = ?");
                $check->execute([$sellerName, $sellerPhone]);
                if ($check->fetch()) {
                    $db->prepare("UPDATE sellers SET products_count = products_count + 1 WHERE name = ? AND phone = ?")
                        ->execute([$sellerName, $sellerPhone]);
                } else {
                    $db->prepare("INSERT INTO sellers (name, email, phone, location, products_count) VALUES (?, ?, ?, ?, 1)")
                        ->execute([
                            $sellerName,
                            $input['sellerEmail'] ?? $input['seller_email'] ?? '',
                            $sellerPhone,
                            $input['location'] ?? ''
                        ]);
                }
            }

            respond(['id' => $newId, 'message' => 'Product created'], 201);
            break;

        case 'products.update':
            if ($method !== 'POST' && $method !== 'PUT') respondError('POST/PUT required', 405);

            $id = $input['id'] ?? $_GET['id'] ?? null;
            if (!$id) respondError('Product ID required', 400);

            $fields = [];
            $params = [];

            $allowed = ['title', 'description', 'price', 'category', 'condition', 'status',
                        'seller_name', 'seller_email', 'seller_phone', 'location'];

            foreach ($allowed as $field) {
                $camelCase = lcfirst(str_replace('_', '', ucwords($field, '_')));
                $value = $input[$field] ?? $input[$camelCase] ?? null;
                if ($value !== null) {
                    $fields[] = "$field = ?";
                    $params[] = $value;
                }
            }

            if (isset($input['images'])) {
                $fields[] = "images = ?";
                $params[] = json_encode($input['images']);
            }

            if (empty($fields)) respondError('No fields to update', 400);

            $fields[] = "updated_at = CURRENT_TIMESTAMP";
            $params[] = $id;

            $sql = "UPDATE products SET " . implode(', ', $fields) . " WHERE id = ?";
            $db->prepare($sql)->execute($params);

            respond(['message' => 'Product updated']);
            break;

        case 'products.status':
            if ($method !== 'POST') respondError('POST required', 405);

            $id = $input['id'] ?? null;
            $status = $input['status'] ?? null;

            if (!$id || !$status) respondError('id and status required', 400);
            if (!in_array($status, ['pending', 'approved', 'rejected'])) respondError('Invalid status', 400);

            $db->prepare("UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                ->execute([$status, $id]);

            respond(['message' => "Product $status"]);
            break;

        case 'products.delete':
            if ($method !== 'POST' && $method !== 'DELETE') respondError('POST/DELETE required', 405);

            $id = $input['id'] ?? $_GET['id'] ?? null;
            if (!$id) respondError('Product ID required', 400);

            // Fetch seller info before deleting so we can update their count
            $sellerStmt = $db->prepare("SELECT seller_name, seller_phone FROM products WHERE id = ?");
            $sellerStmt->execute([$id]);
            $deletedProduct = $sellerStmt->fetch();

            $db->prepare("DELETE FROM products WHERE id = ?")->execute([$id]);

            // Decrement seller's products_count (floor at 0)
            if ($deletedProduct && $deletedProduct['seller_name']) {
                $db->prepare("UPDATE sellers SET products_count = MAX(0, products_count - 1) WHERE name = ? AND phone = ?")
                    ->execute([$deletedProduct['seller_name'], $deletedProduct['seller_phone'] ?? '']);
            }

            respond(['message' => 'Product deleted']);
            break;

        case 'products.stats':
            $stats = [
                'total' => $db->query("SELECT COUNT(*) FROM products")->fetchColumn(),
                'pending' => $db->query("SELECT COUNT(*) FROM products WHERE status='pending'")->fetchColumn(),
                'approved' => $db->query("SELECT COUNT(*) FROM products WHERE status='approved'")->fetchColumn(),
                'rejected' => $db->query("SELECT COUNT(*) FROM products WHERE status='rejected'")->fetchColumn(),
            ];
            respond($stats);
            break;

        // ═══════════ SELLERS / USERS ═══════════

        case 'sellers.list':
            $stmt = $db->query("SELECT s.*, 
                (SELECT COUNT(*) FROM products p WHERE p.seller_name = s.name AND p.seller_phone = s.phone) as actual_products
                FROM sellers s ORDER BY s.created_at DESC");
            respond($stmt->fetchAll());
            break;

        case 'sellers.get':
            $id = $_GET['id'] ?? null;
            if (!$id) respondError('Seller ID required', 400);

            $stmt = $db->prepare("SELECT * FROM sellers WHERE id = ?");
            $stmt->execute([$id]);
            $seller = $stmt->fetch();
            if (!$seller) respondError('Seller not found', 404);

            // Get seller's products
            $products = $db->prepare("SELECT * FROM products WHERE seller_name = ? AND seller_phone = ? ORDER BY created_at DESC");
            $products->execute([$seller['name'], $seller['phone']]);
            $seller['products'] = $products->fetchAll();
            foreach ($seller['products'] as &$p) {
                $p['images'] = json_decode($p['images'], true) ?: [];
            }

            respond($seller);
            break;

        case 'sellers.delete':
            if ($method !== 'POST' && $method !== 'DELETE') respondError('POST/DELETE required', 405);

            $id = $input['id'] ?? $_GET['id'] ?? null;
            if (!$id) respondError('Seller ID required', 400);

            $db->prepare("DELETE FROM sellers WHERE id = ?")->execute([$id]);
            respond(['message' => 'Seller deleted']);
            break;

        case 'sellers.update':
            if ($method !== 'POST' && $method !== 'PUT') respondError('POST/PUT required', 405);

            $id = $input['id'] ?? null;
            if (!$id) respondError('Seller ID required', 400);

            $fields = [];
            $params = [];

            foreach (['name', 'email', 'phone', 'location'] as $f) {
                if (isset($input[$f])) {
                    $fields[] = "$f = ?";
                    $params[] = $input[$f];
                }
            }

            if (empty($fields)) respondError('No fields to update', 400);
            $params[] = $id;

            $db->prepare("UPDATE sellers SET " . implode(', ', $fields) . " WHERE id = ?")
                ->execute($params);

            respond(['message' => 'Seller updated']);
            break;

        // ═══════════ AUTH ═══════════

        case 'auth.login':
            if ($method !== 'POST') respondError('POST required', 405);

            $username = $input['username'] ?? 'admin';
            $password = $input['password'] ?? '';

            $stmt = $db->prepare("SELECT * FROM admins WHERE username = ?");
            $stmt->execute([$username]);
            $admin = $stmt->fetch();

            if (!$admin || !password_verify($password, $admin['password'])) {
                respondError('Invalid credentials', 401);
            }

            // Simple token (for demo; in production use JWT)
            $token = bin2hex(random_bytes(32));
            respond(['token' => $token, 'username' => $admin['username']]);
            break;

        // ═══════════ IMAGE UPLOAD ═══════════

        case 'upload':
            if ($method !== 'POST') respondError('POST required', 405);

            if (empty($_FILES['image'])) respondError('No image uploaded', 400);

            $file = $_FILES['image'];
            $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

            if (!in_array($file['type'], $allowed)) {
                respondError('Invalid image type', 400);
            }

            if ($file['size'] > 5 * 1024 * 1024) {
                respondError('File too large (max 5MB)', 400);
            }

            $uploadDir = __DIR__ . '/../uploads/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);

            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $filename = uniqid('img_') . '.' . $ext;
            $filepath = $uploadDir . $filename;

            if (!move_uploaded_file($file['tmp_name'], $filepath)) {
                respondError('Upload failed', 500);
            }

            respond(['url' => 'uploads/' . $filename]);
            break;

        // ═══════════ CUSTOMER AUTH ═══════════

        case 'customer.register':
            if ($method !== 'POST') respondError('POST required', 405);

            $name     = trim($input['name'] ?? '');
            $email    = trim($input['email'] ?? '');
            $phone    = trim($input['phone'] ?? '');
            $password = $input['password'] ?? '';

            if (!$name || !$email || !$password) respondError('name, email, and password required', 400);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respondError('Invalid email address', 400);
            if (strlen($password) < 6) respondError('Password must be at least 6 characters', 400);

            $stmt = $db->prepare("SELECT id FROM customers WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) respondError('Email already registered', 409);

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $db->prepare("INSERT INTO customers (name, email, phone, password) VALUES (?, ?, ?, ?)")
               ->execute([$name, $email, $phone, $hash]);
            $customerId = $db->lastInsertId();

            $token = bin2hex(random_bytes(32));
            $db->prepare("INSERT INTO customer_tokens (customer_id, token) VALUES (?, ?)")
               ->execute([$customerId, $token]);

            respond(['token' => $token, 'customer' => ['id' => $customerId, 'name' => $name, 'email' => $email, 'phone' => $phone]], 201);
            break;

        case 'customer.login':
            if ($method !== 'POST') respondError('POST required', 405);

            $email    = trim($input['email'] ?? '');
            $password = $input['password'] ?? '';

            if (!$email || !$password) respondError('email and password required', 400);

            $stmt = $db->prepare("SELECT * FROM customers WHERE email = ?");
            $stmt->execute([$email]);
            $customer = $stmt->fetch();

            if (!$customer || !password_verify($password, $customer['password'])) {
                respondError('Invalid email or password', 401);
            }

            $token = bin2hex(random_bytes(32));
            $db->prepare("INSERT INTO customer_tokens (customer_id, token) VALUES (?, ?)")
               ->execute([$customer['id'], $token]);

            respond(['token' => $token, 'customer' => ['id' => $customer['id'], 'name' => $customer['name'], 'email' => $customer['email'], 'phone' => $customer['phone']]]);
            break;

        case 'customer.profile':
            $c = getAuthCustomer($db);
            unset($c['password']);
            respond($c);
            break;

        case 'customer.update':
            if ($method !== 'POST') respondError('POST required', 405);
            $c = getAuthCustomer($db);

            $fields = []; $params = [];
            foreach (['name', 'phone'] as $f) {
                if (isset($input[$f]) && $input[$f] !== '') {
                    $fields[] = "$f = ?";
                    $params[] = $input[$f];
                }
            }
            if (empty($fields)) respondError('No fields to update', 400);
            $params[] = $c['id'];
            $db->prepare("UPDATE customers SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
            respond(['message' => 'Profile updated']);
            break;

        case 'customer.logout':
            if ($method !== 'POST') respondError('POST required', 405);
            $headers = getallheaders();
            $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
            if (preg_match('/^Bearer\s+(.+)$/', $auth, $m)) {
                $db->prepare("DELETE FROM customer_tokens WHERE token = ?")->execute([trim($m[1])]);
            }
            respond(['message' => 'Logged out']);
            break;

        // ═══════════ ORDERS ═══════════

        case 'orders.create':
            if ($method !== 'POST') respondError('POST required', 405);
            $c = getAuthCustomer($db);

            $productId       = $input['product_id'] ?? null;
            $shippingAddress = trim($input['shipping_address'] ?? '');
            $note            = trim($input['note'] ?? '');

            if (!$productId)       respondError('product_id required', 400);
            if (!$shippingAddress) respondError('shipping_address required', 400);

            $stmt = $db->prepare("SELECT id, status FROM products WHERE id = ?");
            $stmt->execute([$productId]);
            $product = $stmt->fetch();
            if (!$product)                         respondError('Product not found', 404);
            if ($product['status'] !== 'approved') respondError('Product is not available', 400);

            // Prevent duplicate active order
            $stmt = $db->prepare("SELECT id FROM orders WHERE customer_id = ? AND product_id = ? AND status NOT IN ('cancelled')");
            $stmt->execute([$c['id'], $productId]);
            if ($stmt->fetch()) respondError('You already have an active order for this product', 409);

            $db->prepare("INSERT INTO orders (customer_id, product_id, shipping_address, note) VALUES (?, ?, ?, ?)")
               ->execute([$c['id'], $productId, $shippingAddress, $note]);

            respond(['id' => $db->lastInsertId(), 'message' => 'Order placed successfully'], 201);
            break;

        case 'orders.list':
            $c = getAuthCustomer($db);
            $stmt = $db->prepare("
                SELECT o.*, p.title, p.price, p.category, p.images, p.seller_name, p.location
                FROM orders o
                JOIN products p ON p.id = o.product_id
                WHERE o.customer_id = ?
                ORDER BY o.created_at DESC
            ");
            $stmt->execute([$c['id']]);
            $orders = $stmt->fetchAll();
            foreach ($orders as &$o) { $o['images'] = json_decode($o['images'], true) ?: []; }
            respond($orders);
            break;

        case 'orders.get':
            $c = getAuthCustomer($db);
            $id = $_GET['id'] ?? null;
            if (!$id) respondError('Order ID required', 400);

            $stmt = $db->prepare("
                SELECT o.*, p.title, p.price, p.category, p.images, p.description, p.condition,
                       p.seller_name, p.seller_phone, p.location
                FROM orders o
                JOIN products p ON p.id = o.product_id
                WHERE o.id = ? AND o.customer_id = ?
            ");
            $stmt->execute([$id, $c['id']]);
            $order = $stmt->fetch();
            if (!$order) respondError('Order not found', 404);
            $order['images'] = json_decode($order['images'], true) ?: [];
            respond($order);
            break;

        case 'orders.cancel':
            if ($method !== 'POST') respondError('POST required', 405);
            $c = getAuthCustomer($db);
            $id = $input['id'] ?? null;
            if (!$id) respondError('Order ID required', 400);

            $stmt = $db->prepare("SELECT id, status FROM orders WHERE id = ? AND customer_id = ?");
            $stmt->execute([$id, $c['id']]);
            $order = $stmt->fetch();
            if (!$order) respondError('Order not found', 404);
            if ($order['status'] !== 'pending') respondError('Only pending orders can be cancelled', 400);

            $db->prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
               ->execute([$id]);
            respond(['message' => 'Order cancelled']);
            break;

        // ═══════════ ADMIN — ORDERS ═══════════

        case 'admin.orders.list':
            $status = $_GET['status'] ?? null;
            $sql = "SELECT o.*,
                        c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
                        p.title as product_title, p.price as product_price, p.category as product_category
                    FROM orders o
                    JOIN customers c ON c.id = o.customer_id
                    JOIN products p ON p.id = o.product_id";
            $params = [];
            if ($status) { $sql .= " WHERE o.status = ?"; $params[] = $status; }
            $sql .= " ORDER BY o.created_at DESC";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            respond($stmt->fetchAll());
            break;

        case 'admin.orders.status':
            if ($method !== 'POST') respondError('POST required', 405);
            $id     = $input['id'] ?? null;
            $status = $input['status'] ?? null;
            $valid  = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
            if (!$id || !$status)       respondError('id and status required', 400);
            if (!in_array($status, $valid)) respondError('Invalid status', 400);
            $db->prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
               ->execute([$status, $id]);
            respond(['message' => "Order updated to $status"]);
            break;

        default:
            respondError('Unknown action: ' . $path, 404);
    }

} catch (PDOException $e) {
    respondError('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    respondError($e->getMessage(), 500);
}

// ── Helpers ──────────────────────────────────────

function getAuthCustomer(PDO $db): array {
    $headers = getallheaders();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/', $auth, $m)) {
        respondError('Unauthorized — missing or malformed token', 401);
    }
    $token = trim($m[1]);
    $stmt  = $db->prepare("SELECT c.* FROM customers c JOIN customer_tokens ct ON ct.customer_id = c.id WHERE ct.token = ?");
    $stmt->execute([$token]);
    $customer = $stmt->fetch();
    if (!$customer) respondError('Invalid or expired token', 401);
    return $customer;
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

function respondError(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}
