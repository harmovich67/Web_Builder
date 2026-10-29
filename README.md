# Fronty ⚡

A modern peer-to-peer marketplace for buying and selling pre-owned electronics — phones, laptops, gaming gear, and accessories.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5 + JavaScript (ES6+) |
| Styling | Tailwind CSS 4 (CDN) + Custom CSS |
| Backend | PHP (no framework) + PDO |
| Database | SQLite (`api/fronty.db`) |
| Desktop | Python 3 + PyQt6 (optional controller) |

No build step required — open the HTML files directly via a PHP server.

---

## Quick Start

### Requirements
- PHP 7.4+ with `pdo_sqlite` extension
- A web server or PHP's built-in dev server

### Run locally

```bash
cd /path/to/fronty
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Store homepage — browse & search listings |
| `/sell.html` | Multi-step form to list an item (3 steps) |
| `/product.html?id=N` | Product detail page |
| `/admin.html` | Admin dashboard (password protected) |

---

## Admin Access

Default credentials (change in production):

```
Password: admin123
```

The login hits `/api/index.php?action=auth.login` and verifies a bcrypt-hashed password from the DB.

---

## Project Structure

```
fronty/
├── index.html              # Store homepage
├── admin.html              # Admin dashboard
├── product.html            # Product detail
├── sell.html               # Seller listing form
├── css/
│   └── styles.css          # Custom styles (animations, glass-morphism, etc.)
├── js/
│   ├── app.js              # Shared API client (FrontyAPI) + utilities (Utils)
│   ├── store.js            # Homepage logic (search, filter, pagination)
│   ├── sell.js             # Multi-step listing form logic
│   ├── admin.js            # Admin dashboard logic (CRUD + auth)
│   └── product.js          # Product detail + image gallery + lightbox
├── api/
│   ├── index.php           # REST API router
│   ├── database.php        # SQLite setup + auto-seeding
│   └── fronty.db           # SQLite database (auto-created)
├── uploads/                # Uploaded product images
└── fronty_controller.py    # Optional PyQt6 desktop controller
```

---

## API Reference

All endpoints: `GET/POST api/index.php?action=<action>`

### Products

| Action | Method | Params | Description |
|--------|--------|--------|-------------|
| `products.list` | GET | `status`, `category`, `search`, `limit`, `offset` | List products |
| `products.get` | GET | `id` | Get single product |
| `products.create` | POST | body: `title, price, category, ...` | Create listing |
| `products.update` | POST | body: `id, ...fields` | Update listing |
| `products.status` | POST | body: `id, status` | Approve / Reject |
| `products.delete` | POST | body: `id` | Delete listing |
| `products.stats` | GET | — | Dashboard counts |

### Sellers

| Action | Method | Params | Description |
|--------|--------|--------|-------------|
| `sellers.list` | GET | — | All sellers |
| `sellers.get` | GET | `id` | Seller + their products |
| `sellers.update` | POST | body: `id, name, phone, ...` | Update seller |
| `sellers.delete` | POST | body: `id` | Delete seller |

### Auth & Upload

| Action | Method | Description |
|--------|--------|-------------|
| `auth.login` | POST | Verify password, returns token |
| `upload` | POST | Upload product image (multipart/form-data) |

### Response Format

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Error message" }
```

---

## Database Schema

```sql
CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  price       REAL,
  category    TEXT,       -- phones | laptops | accessories | gaming | other
  condition   TEXT,       -- new | like-new | used
  status      TEXT,       -- pending | approved | rejected
  seller_name  TEXT,
  seller_email TEXT,
  seller_phone TEXT,
  location    TEXT,
  images      TEXT,       -- JSON array of image URLs
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sellers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT,
  email          TEXT,
  phone          TEXT,
  location       TEXT,
  products_count INTEGER DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE,
  password   TEXT,  -- bcrypt hashed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Image Uploads

- Stored in `uploads/` directory
- Allowed types: JPEG, PNG, WebP, GIF
- Max file size: 5 MB per image
- Max images per listing: 5

---

## Known Limitations (Production Checklist)

- [ ] Replace session-based admin auth with JWT tokens
- [ ] Add CSRF protection on all POST endpoints
- [ ] Add rate limiting (throttle listing submissions & uploads)
- [ ] Secure `uploads/` directory (disable PHP execution inside it)
- [ ] Move database outside web root
- [ ] Set a strong admin password (update in DB)
- [ ] Enable HTTPS
- [ ] Add server-side pagination for large catalogs

---

## License

MIT
