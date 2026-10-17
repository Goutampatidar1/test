/**
 * Optional HTTP+HTTPS on the same PORT (5017).
 * If cert/key missing or mismatched, falls back to plain HTTP so the API stays up.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

function readIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function keyMatchesCert(certPem, keyPem) {
  try {
    if (typeof crypto.X509Certificate !== "function") return true;
    const x509 = new crypto.X509Certificate(certPem);
    const key = crypto.createPrivateKey(keyPem);
    if (typeof x509.checkPrivateKey === "function") {
      return x509.checkPrivateKey(key);
    }
    return true;
  } catch (err) {
    console.warn("SSL key/cert check failed:", err.message);
    return false;
  }
}

function loadFromPaths(certPath, keyPath, caPath) {
  const cert = readIfExists(certPath);
  const key = readIfExists(keyPath);
  if (!cert || !key) return null;
  // fullchain.pem may include intermediates — validate against the first (leaf) cert only.
  const leafPem = String(cert).split("-----END CERTIFICATE-----")[0] + "-----END CERTIFICATE-----\n";
  if (!keyMatchesCert(leafPem, key)) {
    console.warn(`SSL skip: key does not match cert (${keyPath} / ${certPath})`);
    return null;
  }
  let certOut = cert;
  const ca = readIfExists(caPath);
  // If cert file is leaf-only, append CA bundle. If it's already a fullchain, keep as-is.
  const certCount = (String(cert).match(/BEGIN CERTIFICATE/g) || []).length;
  if (ca && certCount < 2) {
    certOut = Buffer.concat([
      Buffer.isBuffer(cert) ? cert : Buffer.from(cert),
      Buffer.from("\n"),
      Buffer.isBuffer(ca) ? ca : Buffer.from(ca),
    ]);
  }
  // Do not set opts.ca — that is for client-certificate auth, not the server chain.
  const opts = { cert: certOut, key };
  return { opts, certPath, keyPath, caPath: caPath || null };
}

function loadFromJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return loadFromPaths(raw.cert, raw.key, raw.ca || raw.cabundle || null);
  } catch (err) {
    console.warn("SSL json load failed:", err.message);
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

  const preferredCerts = [
    ...certs.filter((f) => f.toLowerCase().includes(needle)),
    ...certs,
  ];

  for (const certPath of preferredCerts) {
    const base = path.basename(certPath).replace(/\.(crt|pem)$/i, "");
    const orderedKeys = [
      ...keys.filter((k) => path.basename(k).startsWith(base)),
      ...keys.filter((k) => path.basename(k).toLowerCase().includes(needle)),
      ...keys,
    ];
    const seen = new Set();
    for (const keyPath of orderedKeys) {
      if (seen.has(keyPath)) continue;
      seen.add(keyPath);
      const caPath =
        bundles.find((b) => path.basename(b).startsWith(base)) ||
        pickBest(bundles, needle) ||
        null;
      const loaded = loadFromPaths(certPath, keyPath, caPath);
      if (loaded) return loaded;
    }
  }
  return null;
}

function loadSslMaterials() {
  if (String(process.env.DISABLE_HTTPS_MUX || "").trim() === "1") {
    return null;
  }

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

function listenHttpOnly(app, port, onListening) {
  const server = app.listen(port, "0.0.0.0", () => {
    if (typeof onListening === "function") {
      onListening({ mode: "http-only", http: `0.0.0.0:${port}`, apachePort: port });
    }
  });
  server.on("error", (err) => {
    console.error("HTTP listen error:", err.message);
    process.exit(1);
  });
  return { mode: "http-only", server };
}

function listenHttpAndHttpsSamePort(app, port, ssl, onListening) {
  const httpServer = http.createServer(app);
  const httpsServer = https.createServer(ssl.opts, app);

  httpServer.on("error", (err) => console.error("HTTP server error:", err.message));
  httpsServer.on("error", (err) => console.error("HTTPS server error:", err.message));

  const mux = net.createServer((socket) => {
    socket.once("error", () => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    });

    socket.once("data", (buf) => {
      socket.pause();
      socket.unshift(buf);
      const isTls = buf && buf.length > 0 && buf[0] === 0x16;
      (isTls ? httpsServer : httpServer).emit("connection", socket);
      process.nextTick(() => {
        try {
          socket.resume();
        } catch {
          /* ignore */
        }
      });
    });
  });

  mux.on("error", (err) => {
    console.error("Mux listen error:", err.message);
    listenHttpOnly(app, port, onListening);
  });

  mux.listen(port, "0.0.0.0", () => {
    if (typeof onListening === "function") {
      onListening({
        mode: "http+https-mux",
        http: `0.0.0.0:${port}`,
        https: `0.0.0.0:${port}`,
        sslSource: ssl.source,
        certPath: ssl.certPath,
        apachePort: port,
      });
    }
  });

  return { mode: "http+https-mux", mux, ssl };
}

/**
 * @param {import('express').Express} app
 * @param {{ port: number, onListening?: Function }} options
 */
async function listenHttpAndMaybeHttps(app, { port, onListening }) {
  try {
    const ssl = loadSslMaterials();
    if (!ssl) {
      return listenHttpOnly(app, port, onListening);
    }
    return listenHttpAndHttpsSamePort(app, port, ssl, onListening);
  } catch (err) {
    console.error("HTTPS setup failed, using HTTP-only:", err.message);
    return listenHttpOnly(app, port, onListening);
  }
}

module.exports = {
  loadSslMaterials,
  listenHttpAndMaybeHttps,
};
