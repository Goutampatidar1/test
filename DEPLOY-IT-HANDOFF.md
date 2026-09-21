# OHO E-Bazar — IT deployment handoff

This package contains everything needed to deploy **Admin Panel**, **Vendor Panel**, and **Backend API** to a live Linux server (Apache + Node.js + MongoDB).

## Package contents

| Folder / file | Purpose |
|---------------|---------|
| `Backend/` | Node.js API (run with PM2 on port **5001** internally) |
| `AdminPannel/dist/` | Built admin website (web root) |
| `AdminPannel/dist/vendor/` | Built vendor website at `/vendor/` |
| `VenueVendorPanel/` | Vendor source (only if IT must rebuild frontends) |
| `AdminPannel/` | Admin source (only if IT must rebuild frontends) |
| `deploy/apache-ohoecom-combined.conf` | Apache vhost for **single-domain** setup |
| `docs/DEPLOYMENT.md` | Full step-by-step deployment guide |
| `deploy/SERVER-API-PROXY.md` | Fix API 404 / mobile issues |

## Live URLs (configured in this build)

| App | URL |
|-----|-----|
| Admin | `https://ohoecom.developmentalphawizz.com/` |
| Vendor | `https://ohoecom.developmentalphawizz.com/vendor/` |
| API | `https://ohoecom.developmentalphawizz.com/api` |
| Uploads | `https://ohoecom.developmentalphawizz.com/uploads` |

If the production domain is different, IT must update `.env.production` in both panels and run `npm run build` again before upload.

---

## What IT must configure on the server

### 1. Server software

- **Ubuntu 22.04+** (or similar Linux)
- **Node.js 20 LTS**
- **PM2** (`npm install -g pm2`)
- **Apache** with modules: `proxy`, `proxy_http`, `rewrite`, `ssl`, `headers`
- **MongoDB** (local or hosted — Atlas, etc.)
- **SSL certificate** (Let's Encrypt / Certbot recommended)

### 2. Backend environment file

Create `Backend/.env` on the server (copy from `Backend/.env.production.example`):

```env
PORT=5001
NODE_ENV=production

MONGODB_URI=mongodb://USER:PASSWORD@HOST:27017/ohoecom?authSource=admin

JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET_MIN_32_CHARS
JWT_EXPIRES_IN=8h

PUBLIC_BASE_URL=https://ohoecom.developmentalphawizz.com
```

**Do not** set `EXPOSE_OTP_IN_RESPONSE=true` on live production (OTP must go via SMS only).

Secure the file: `chmod 600 Backend/.env`

### 3. Apache reverse proxy (required for mobile)

Apache on **port 443** must proxy to Node on localhost:

```apache
ProxyPass        /api      http://127.0.0.1:5001/api
ProxyPassReverse /api      http://127.0.0.1:5001/api
ProxyPass        /uploads  http://127.0.0.1:5001/uploads
ProxyPassReverse /uploads  http://127.0.0.1:5001/uploads
```

Use `deploy/apache-ohoecom-combined.conf` as the starting template.

**Do not expose port 5001 publicly** — mobile networks often block non-standard ports.

### 4. Document root layout

```text
/var/www/ohoecom/
  AdminPannel/dist/          ← Apache DocumentRoot
    index.html               ← Admin SPA
    assets/...
    vendor/                  ← Vendor SPA (from VenueVendorPanel build)
      index.html
      assets/...
  Backend/                   ← Node app (not served by Apache directly)
    server.js
    uploads/                 ← Must be writable; back up regularly
```

### 5. Start backend

```bash
cd /var/www/ohoecom/Backend
npm install --production
pm2 start server.js --name oho-backend
pm2 save
pm2 startup
```

### 6. Verify

```bash
curl -s -X POST https://ohoecom.developmentalphawizz.com/api/vendor-panel/auth/otp/send \
  -H "Content-Type: application/json" -d '{"phone":"9876543210"}'
```

Should return **JSON**, not HTML.

---

## What the business team must provide to IT

| Item | Required | Notes |
|------|----------|-------|
| Production domain | Yes | e.g. `ohoecom.developmentalphawizz.com` |
| Server SSH / hosting access | Yes | VPS or cPanel with Node support |
| MongoDB connection string | Yes | Database name, user, password, host |
| SSL certificate | Yes | Usually auto via Certbot |
| JWT secret | Yes | Long random string (32+ chars) |
| SMS gateway for OTP | Yes (live login) | OTP is not shown on screen in production |
| Razorpay keys | If payments used | For vendor promotions / orders |
| Firebase FCM key | Optional | Push notifications |
| Email SMTP | Optional | If email features are enabled later |

---

## Quick deploy commands (on server)

```bash
# 1. Extract zip to /var/www/ohoecom
# 2. Backend
cd /var/www/ohoecom/Backend
cp .env.production.example .env   # then edit with real values
npm install --production
mkdir -p uploads && chmod -R 755 uploads
pm2 start server.js --name oho-backend

# 3. Apache — copy and enable vhost from deploy/apache-ohoecom-combined.conf
sudo apache2ctl configtest && sudo systemctl reload apache2

# 4. Optional: seed initial admin/categories (once, on empty DB)
# node scripts/seed.js
```

---

## Rebuild frontends (if domain changes)

```bash
# AdminPannel/.env.production
VITE_API_URL=https://YOUR-DOMAIN.com

# VenueVendorPanel/.env.production
VITE_API_URL=https://YOUR-DOMAIN.com

cd AdminPannel && npm install && npm run build
cd ../VenueVendorPanel && npm install && npm run build
mkdir -p ../AdminPannel/dist/vendor
cp -r dist/* ../AdminPannel/dist/vendor/
```

---

## Support contacts

- Full guide: `docs/DEPLOYMENT.md`
- API proxy issues: `deploy/SERVER-API-PROXY.md`
- Backend API docs: `Backend/docs/API.md` (if present)
