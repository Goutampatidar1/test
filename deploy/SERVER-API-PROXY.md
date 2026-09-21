# Fix: registration works on localhost but 404 on server

## What is wrong

- **Local:** frontend calls `http://localhost:5001/api/...` → Node responds ✅
- **Server (broken):** frontend calls `https://ohoecom.developmentalphawizz.com/api/...` → Apache returns **admin HTML 404** ❌
- **Server (backend alive):** `https://ohoecom.developmentalphawizz.com:5001/api/...` → Node responds ✅ but **mobile networks block port 5001**

The production build is correct. The **server must proxy `/api` and `/uploads` on port 443** to Node on `127.0.0.1:5001`.

`.htaccess` `[P]` proxy is **often disabled** on cPanel/shared hosting. Use **VirtualHost ProxyPass** instead.

## Quick test

```bash
# Should return JSON from Express (400/401 is OK — means API is reachable)
curl -s -X POST https://ohoecom.developmentalphawizz.com/api/venue-vendor/auth/register \
  -H "Content-Type: application/json" -d "{}"

# Should NOT return HTML with <title>Oho Ebazar — Admin</title>
```

## Fix on server (Apache)

1. Enable modules:
   ```bash
   sudo a2enmod proxy proxy_http rewrite headers ssl
   ```

2. Copy `deploy/apache-ohoecom-combined.conf` to your vhost (edit `DocumentRoot` path).

3. Add inside the **HTTPS** vhost for `ohoecom.developmentalphawizz.com`:
   ```apache
   ProxyPreserveHost On
   RequestHeader set X-Forwarded-Proto "https"

   ProxyPass        /api      http://127.0.0.1:5001/api
   ProxyPassReverse /api      http://127.0.0.1:5001/api
   ProxyPass        /uploads  http://127.0.0.1:5001/uploads
   ProxyPassReverse /uploads  http://127.0.0.1:5001/uploads
   ```

4. Reload Apache:
   ```bash
   sudo apache2ctl configtest && sudo systemctl reload apache2
   ```

5. Ensure Node is running:
   ```bash
   pm2 status
   curl http://127.0.0.1:5001/api
   ```

6. Set backend `PUBLIC_BASE_URL` in `Backend/.env`:
   ```env
   PUBLIC_BASE_URL=https://ohoecom.developmentalphawizz.com
   ```

7. Rebuild and upload frontends (`.env.production` already has correct API URL):
   ```bash
   cd VenueVendorPanel && npm run build
   cd ../AdminPannel && npm run build
   ```

## cPanel (no root SSH)

Ask hosting support to **reverse-proxy** these paths to `http://127.0.0.1:5001`:

| Public path | Backend |
|-------------|---------|
| `/api` | `http://127.0.0.1:5001/api` |
| `/uploads` | `http://127.0.0.1:5001/uploads` |

Or create subdomain `api.ohoecom.developmentalphawizz.com` proxied to port 5001, then set:

```env
VITE_API_URL=https://api.ohoecom.developmentalphawizz.com
```

and rebuild both panels.

## Temporary desktop-only workaround (not for mobile)

```env
VITE_API_URL=https://ohoecom.developmentalphawizz.com:5001
```

Rebuild. This restores desktop production until Apache proxy is configured.
