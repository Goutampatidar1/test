/**
 * Restore https://ohoebazar.com:5017 without breaking Hostinger/Apache.
 *
 * With certs + public IPv4:
 *   HTTP  127.0.0.1:PORT   → Apache + Hostinger health checks
 *   HTTPS <public-ip>:PORT → Flutter https://ohoebazar.com:5017
 *
 * Without certs / if HTTPS bind fails:
 *   HTTP  0.0.0.0:PORT
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const dns = require("dns");

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

function listExternalIpv4() {
  const out = [];
  if (process.env.HTTPS_BIND_IP && String(process.env.HTTPS_BIND_IP).trim()) {
    out.push(String(process.env.HTTPS_BIND_IP).trim());
  }
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      const family = net.family === "IPv4" || net.family === 4;
      if (family && !net.internal && net.address && !out.includes(net.address)) {
        out.push(net.address);
      }
    }
  }
  return out;
}

function resolveDomainIpv4(hostname) {
  return new Promise((resolve) => {
    dns.lookup(hostname, { family: 4 }, (err, address) => {
      if (err || !address) return resolve(null);
      resolve(address);
    });
  });
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

function tryListen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * @param {import('express').Express} app
 * @param {{ port: number, onListening?: Function }} options
 */
async function listenHttpAndMaybeHttps(app, { port, onListening }) {
  const ssl = loadSslMaterials();
  if (!ssl) {
    return listenHttpOnly(app, port, onListening);
  }

  let candidates = listExternalIpv4();
  const domain = process.env.SSL_DOMAIN || "ohoebazar.com";
  const resolved = await resolveDomainIpv4(domain);
  if (resolved && !candidates.includes(resolved)) {
    candidates.push(resolved);
  }
  if (resolved) {
    candidates = [resolved, ...candidates.filter((ip) => ip !== resolved)];
  }

  if (!candidates.length) {
    console.warn("SSL loaded but no public IPv4 — falling back to HTTP-only on", port);
    return listenHttpOnly(app, port, onListening);
  }

  const httpServer = http.createServer(app);
  try {
    await tryListen(httpServer, port, "127.0.0.1");
  } catch (err) {
    console.error("HTTP 127.0.0.1 listen error:", err.message);
    process.exit(1);
  }

  let boundIp = null;
  for (const ip of candidates) {
    const httpsServer = https.createServer(ssl.opts, app);
    try {
      await tryListen(httpsServer, port, ip);
      boundIp = ip;
      break;
    } catch (err) {
      console.warn(`HTTPS ${ip}:${port} failed: ${err.message}`);
      try {
        httpsServer.close();
      } catch {
        /* ignore */
      }
    }
  }

  if (!boundIp) {
    console.warn("HTTPS bind failed on all IPs — keeping HTTP on 127.0.0.1 only is not enough for Hostinger; rebinding HTTP on 0.0.0.0");
    try {
      httpServer.close();
    } catch {
      /* ignore */
    }
    return listenHttpOnly(app, port, onListening);
  }

  if (typeof onListening === "function") {
    onListening({
      mode: "dual-bind",
      http: `127.0.0.1:${port}`,
      https: `${boundIp}:${port}`,
      sslSource: ssl.source,
      certPath: ssl.certPath,
      apachePort: port,
    });
  }

  return { mode: "dual-bind", ssl, boundIp };
}

module.exports = {
  loadSslMaterials,
  listenHttpAndMaybeHttps,
};
