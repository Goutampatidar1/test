# OHO E-Bazar — Server Deployment Guide (Apache)

This guide covers deploying the full OHO E-Bazar stack on a Linux VPS using **Apache**, **PM2**, and **Let's Encrypt**.

## What you are deploying

| Component | Folder | Role |
|-----------|--------|------|
| Backend API | `Backend/` | Node.js + Express + MongoDB (port `5000` internally) |
| Admin Panel | `AdminPannel/` | React + Vite static build |
| Venue Vendor Panel | `VenueVendorPanel/` | React + Vite static build |

## Recommended architecture

```text
Internet
   │
   ▼
Apache (ports 80 / 443)
   ├── api.yourdomain.com     → Node backend (127.0.0.1:5000)
   ├── admin.yourdomain.com   → AdminPannel/dist
   └── vendor.yourdomain.com  → VenueVendorPanel/dist
```

MongoDB can run on the same server or use a remote/hosted instance.

### Server requirements

- **OS:** Ubuntu 22.04 LTS (or similar Debian-based Linux)
- **Node.js:** 18+ (20 LTS recommended)
- **RAM:** 2 GB+ if MongoDB runs on the same machine; 1 GB is enough with external MongoDB
- **Software:** Apache, PM2, Certbot

---

## 1. Initial server setup

SSH into your VPS and install dependencies:

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2, Apache, Git
sudo npm install -g pm2
sudo apt install -y apache2 certbot python3-certbot-apache git
```

Enable required Apache modules:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
sudo systemctl restart apache2
```

| Module | Purpose |
|--------|---------|
| `proxy`, `proxy_http` | Reverse proxy to the Node backend |
| `rewrite` | SPA client-side routing |
| `ssl` | HTTPS |
| `headers` | Forward `X-Forwarded-*` headers to Node |

---

## 2. Upload the project

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone <your-repo-url> oho-ebazar
sudo chown -R $USER:$USER oho-ebazar
cd oho-ebazar/OHO-E-BAZAR
```

Alternatively, upload the project via SFTP/SCP to `/var/www/oho-ebazar`.

---

## 3. Deploy the backend

### Install dependencies

```bash
cd /var/www/oho-ebazar/OHO-E-BAZAR/Backend
npm install --production
```

### Production environment

Create `Backend/.env` from `Backend/.env.example`. **Do not use development secrets in production.**

```env
PORT=5000
NODE_ENV=production

MONGODB_URI=mongodb://user:password@host:27017/oho_ecommerce?authSource=admin

JWT_SECRET=replace_with_a_long_random_string_at_least_32_chars
JWT_EXPIRES_IN=8h

# Required so upload/image URLs in API responses use your public API domain
PUBLIC_BASE_URL=https://api.yourdomain.com
```

When `NODE_ENV=production`, the backend **requires** `JWT_SECRET` and `MONGODB_URI` (see `Backend/config/index.js`).

Optional variables are documented in `Backend/.env.example` (JWT refresh/reset keys, shipping fees, etc.).

### Uploads directory

User-uploaded files are stored under `Backend/uploads/` and served at `/uploads`:

```bash
mkdir -p uploads
chmod 755 uploads
```

Back up this folder regularly.

### Start with PM2

```bash
pm2 start server.js --name oho-backend
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` so the process restarts on reboot.

Verify locally on the server:

```bash
curl http://127.0.0.1:5000/api
```

---

## 4. Build the frontends

Both panels need the API URL **at build time** (`VITE_*` variables are baked into the bundle).

### Admin Panel

Create `AdminPannel/.env.production`:

```env
VITE_API_URL=https://api.yourdomain.com
```

```bash
cd /var/www/oho-ebazar/OHO-E-BAZAR/AdminPannel
npm install
npm run build
```

Output: `AdminPannel/dist/`

### Venue Vendor Panel

Create `VenueVendorPanel/.env.production`:

```env
VITE_API_URL=https://api.yourdomain.com

# Only if hosting under a subpath (e.g. https://yourdomain.com/vendor/), not a subdomain:
# VITE_BASE_PATH=/vendor/
```

```bash
cd /var/www/oho-ebazar/OHO-E-BAZAR/VenueVendorPanel
npm install
npm run build
```

Output: `VenueVendorPanel/dist/`

---

## 5. DNS

Create **A records** pointing to your server IP:

| Host | Points to |
|------|-----------|
| `api.yourdomain.com` | Your server IP |
| `admin.yourdomain.com` | Your server IP |
| `vendor.yourdomain.com` | Your server IP |

Wait for DNS to propagate before requesting SSL certificates.

---

## 6. Apache virtual hosts

On Debian/Ubuntu, site configs live in `/etc/apache2/sites-available/`.

Replace `yourdomain.com` and paths below with your actual domain and install path.

### API — `/etc/apache2/sites-available/api.yourdomain.com.conf`

```apache
<VirtualHost *:80>
    ServerName api.yourdomain.com

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Forwarded-Port "80"

    ProxyPass / http://127.0.0.1:5000/
    ProxyPassReverse / http://127.0.0.1:5000/

    # Allow file uploads (20 MB; adjust if needed)
    LimitRequestBody 20971520
</VirtualHost>
```

The backend serves:

- API routes: `https://api.yourdomain.com/api`
- Uploaded files: `https://api.yourdomain.com/uploads/...`

### Admin panel — `/etc/apache2/sites-available/admin.yourdomain.com.conf`

```apache
<VirtualHost *:80>
    ServerName admin.yourdomain.com
    DocumentRoot /var/www/oho-ebazar/OHO-E-BAZAR/AdminPannel/dist

    <Directory /var/www/oho-ebazar/OHO-E-BAZAR/AdminPannel/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
```

### Venue vendor panel — `/etc/apache2/sites-available/vendor.yourdomain.com.conf`

```apache
<VirtualHost *:80>
    ServerName vendor.yourdomain.com
    DocumentRoot /var/www/oho-ebazar/OHO-E-BAZAR/VenueVendorPanel/dist

    <Directory /var/www/oho-ebazar/OHO-E-BAZAR/VenueVendorPanel/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
```

### Enable sites

```bash
sudo a2ensite api.yourdomain.com.conf
sudo a2ensite admin.yourdomain.com.conf
sudo a2ensite vendor.yourdomain.com.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## 7. SSL (HTTPS)

```bash
sudo certbot --apache -d api.yourdomain.com -d admin.yourdomain.com -d vendor.yourdomain.com
```

Certbot creates HTTPS vhosts and HTTP→HTTPS redirects.

After SSL is enabled, ensure the **HTTPS** API vhost forwards the correct protocol to Node. If Certbot does not add this, include in the `*:443` API block:

```apache
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Forwarded-Port "443"
```

Confirm `PUBLIC_BASE_URL` in `Backend/.env` uses `https://`.

Certbot auto-renewal is installed by default. Test renewal:

```bash
sudo certbot renew --dry-run
```

---

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw enable
```

**Do not** expose port `5000` publicly. Only Apache on localhost should reach the Node process.

If MongoDB runs on the same server, restrict port `27017` to localhost or trusted IPs only.

---

## 9. Verify deployment

```bash
# API health (adjust path if you have a health route)
curl -I https://api.yourdomain.com/api

# PM2 status
pm2 status oho-backend

# Apache error log (if something fails)
sudo tail -f /var/log/apache2/error.log
```

In a browser:

1. Open `https://admin.yourdomain.com` — log in to the admin panel.
2. Open `https://vendor.yourdomain.com` — log in to the vendor panel.
3. Confirm images and uploads load (URLs under `/uploads`).

---

## 10. Deploying updates

```bash
cd /var/www/oho-ebazar/OHO-E-BAZAR
git pull

# Backend
cd Backend
npm install --production
pm2 restart oho-backend

# Frontends (rebuild when frontend code or VITE_API_URL changes)
cd ../AdminPannel
npm install
npm run build

cd ../VenueVendorPanel
npm install
npm run build
```

Apache reload is only needed when you change virtual host configuration:

```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
```

---

## 11. Optional: SPA routing via `.htaccess`

Instead of rewrite rules in the virtual host, you can place this file in each `dist/` folder after build:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

Keep `AllowOverride All` in the matching `<Directory>` block.

---

## 12. Security checklist

- [ ] Use strong, unique `JWT_SECRET` values (never commit `.env` to git).
- [ ] Set `NODE_ENV=production` on the server.
- [ ] Restrict MongoDB access (IP whitelist, strong credentials, or private network).
- [ ] Set file permissions on `.env`: `chmod 600 Backend/.env`.
- [ ] Back up `Backend/uploads/` and your database regularly.
- [ ] Keep Node, Apache, and system packages updated.
- [ ] Review PM2 logs: `pm2 logs oho-backend`.

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `Failed to load module script` / MIME type `text/html` for `.js` | Panel served from a subpath but build uses `/assets/...` at domain root | Set `VITE_BASE_PATH=/your-subpath/` in `.env.production`, rebuild, set Apache `RewriteBase` to match, redeploy `dist/` |
| Admin/vendor panel loads but API calls fail | Wrong `VITE_API_URL` at build time | Set `.env.production` and run `npm run build` again |
| 502 Bad Gateway on API domain | Backend not running | `pm2 status`, `pm2 logs oho-backend`, check `MONGODB_URI` |
| Images broken in app | `PUBLIC_BASE_URL` missing or wrong | Set to `https://api.yourdomain.com` and restart backend |
| SPA routes 404 on refresh | Apache rewrite not enabled | Enable `mod_rewrite`, check `<Directory>` rules |
| `JWT_SECRET is required` on start | `NODE_ENV=production` without secret | Set `JWT_SECRET` in `Backend/.env` |
| Upload fails | Body size limit | Increase `LimitRequestBody` in API vhost |

### Useful commands

```bash
pm2 logs oho-backend --lines 100
pm2 restart oho-backend
sudo apache2ctl -S          # list active vhosts
sudo tail -f /var/log/apache2/error.log
```

---

## Related documentation

- [Project README](../README.md) — local development setup
- [Backend docs](../Backend/docs/README.md) — API quick start
- [API catalog](../Backend/docs/API.md) — full endpoint reference
