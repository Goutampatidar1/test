# Backend documentation

## Quick start

1. Copy environment template: `cp .env.example .env` (or copy manually on Windows).
2. Set `MONGODB_URI`, `JWT_SECRET`, and `PORT` in `.env`.
3. From the `Backend` folder: `npm install` then `npm run dev` (or `npm start`).
4. API base URL: `http://localhost:<PORT>/api` (default port `5000`).

## References

| Document | Description |
|----------|-------------|
| [API.md](./API.md) | Full API catalog with **Postman-importable** `curl` (`--location`, `--request`, `--header`, `--data-raw`, `--form`), health, auth, admin CRUD |
| [DEPLOYMENT.md](../../docs/DEPLOYMENT.md) | Production server deployment (Apache, PM2, SSL) |

## Conventions

- JSON APIs expect header: `Content-Type: application/json`.
- Authenticated routes expect: `Authorization: Bearer <access_token>`.
- Error responses are JSON: `{ "message": "..." }` (and `stack` in development when the global error handler attaches it).
