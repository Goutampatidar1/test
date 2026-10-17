/**
 * TLS for https://ohoebazar.com:5017 while keeping Apache on plain HTTP.
 *
 * With certs:
 *   HTTPS 0.0.0.0:PORT          → mobile / Flutter
 *   HTTP  127.0.0.1:PORT+1      → Apache ProxyPass
 * Without certs:
 *   HTTP  0.0.0.0:PORT          → legacy behaviour
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");

function readIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function loadFromPaths(certPath, keyPath, caPath) {
  const cert = readIfExists(certPath);
  const key = readIfExists(keyPath);
  if (!cert || !key) return null;
  const opts = { cert, key };
  const ca = readIfExists(caPath);
  if (ca) {
    opts.cert = Buffer.concat([cert, Buffer.from("\n"), ca]);
    opts.ca = ca;
  }
  return { opts, certPath, keyPath, caPath: caPath || null };
}

function loadFromJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return loadFromPaths(raw.cert, raw.key, raw.ca || raw.cabundle || null);
  } catch {
    return null;
  }
}

function listFiles(dir, re) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => re.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function pickBest(files, domainNeedle) {
  if (!files.length) return null;
  const preferred = files.find((f) => f.toLowerCase().includes(domainNeedle));
  return preferred || files[0];
}

function discoverCpanelSsl(domain = "ohoebazar.com") {
  const home = process.env.HOME || os.homedir();
  if (!home) return null;
  const needle = String(domain).toLowerCase().replace(/\./g, "_");
  const certDir = path.join(home, "ssl", "certs");
  const keyDir = path.join(home, "ssl", "keys");

  const certs = listFiles(certDir, /\.(crt|pem)$/i).filter((f) => {
    const base = path.basename(f).toLowerCase();
    return !base.includes("cabundle") && !base.includes("ca-bundle") && !base.includes("bundle");
  });
  const keys = listFiles(keyDir, /\.(key|pem)$/i);
  const bundles = [
    ...listFiles(certDir, /\.(cabundle|ca-bundle)$/i),
    ...listFiles(certDir, /bundle\.(crt|pem)$/i),
  ];

  const certPath = pickBest(certs, needle);
  if (!certPath) return null;

  const base = path.basename(certPath).replace(/\.(crt|pem)$/i, "");
  const keyPath =
    keys.find((k) => path.basename(k).startsWith(base)) ||
    pickBest(keys, needle) ||
    keys[0];
  if (!keyPath) return null;

  const caPath =
    bundles.find((b) => path.basename(b).startsWith(base)) ||
    pickBest(bundles, needle) ||
    null;

  return loadFromPaths(certPath, keyPath, caPath);
}

function loadSslMaterials() {
  const fromEnv = loadFromPaths(
    process.env.SSL_CERT_PATH || process.env.SSL_CERT_FILE,
    process.env.SSL_KEY_PATH || process.env.SSL_KEY_FILE,
    process.env.SSL_CA_PATH || process.env.SSL_CA_FILE
  );
  if (fromEnv) return { ...fromEnv, source: "env" };

  for (const base of [process.cwd(), path.join(__dirname, ".."), __dirname]) {
    const jsonPath = path.join(base, ".oho-ssl.json");
    const json = loadFromJsonFile(jsonPath);
    if (json) return { ...json, source: jsonPath };
  }

  const domain = process.env.SSL_DOMAIN || "ohoebazar.com";
  const discovered = discoverCpanelSsl(domain);
  if (discovered) return { ...discovered, source: "cpanel-ssl" };

  return null;
}

/**
 * @param {import('express').Express} app
 * @param {{ port: number, onListening?: Function }} options
 */
function listenHttpAndMaybeHttps(app, { port, onListening }) {
  const ssl = loadSslMaterials();
  const internalPort = Number(process.env.INTERNAL_HTTP_PORT) || port + 1;

  if (ssl) {
    const httpServer = http.createServer(app);
    const httpsServer = https.createServer(ssl.opts, app);

    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0 && typeof onListening === "function") {
        onListening({
          mode: "https-public",
          http: `127.0.0.1:${internalPort}`,
          https: `0.0.0.0:${port}`,
          sslSource: ssl.source,
          certPath: ssl.certPath,
          apachePort: internalPort,
        });
      }
    };

    httpServer.on("error", (err) => {
      console.error("HTTP listen error:", err.message);
      process.exit(1);
    });
    httpsServer.on("error", (err) => {
      console.error("HTTPS listen error:", err.message);
      process.exit(1);
    });

    httpServer.listen(internalPort, "127.0.0.1", done);
    httpsServer.listen(port, "0.0.0.0", done);
    return { mode: "https-public", ssl, internalPort };
  }

  const server = app.listen(port, "0.0.0.0", () => {
    if (typeof onListening === "function") {
      onListening({ mode: "http-only", http: `0.0.0.0:${port}`, apachePort: port });
    }
  });
  return { mode: "http-only", server };
}

module.exports = {
  loadSslMaterials,
  listenHttpAndMaybeHttps,
};
