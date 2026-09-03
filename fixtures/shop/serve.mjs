import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Which fixture version to serve: 1 (baseline) or 2 (mutated). */
const VERSION = process.env.SHOP_VERSION === "2" ? "2" : "1";
const PORT = Number(process.env.PORT ?? 0);

const polyfillIife = require.resolve("@mcp-b/webmcp-polyfill/iife");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const ROUTES = {
  "/": "index.html",
  "/dresses": "dresses.html",
  "/cart": "cart.html",
};

export function createShopServer(version = VERSION) {
  const root = path.join(here, "public", `v${version}`);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let pathname = url.pathname;

      if (pathname === "/polyfill.js") {
        const body = await readFile(polyfillIife, "utf8");
        res.writeHead(200, { "content-type": CONTENT_TYPES[".js"] });
        res.end(body);
        return;
      }

      const mapped = ROUTES[pathname] ?? (pathname.slice(1) || "index.html");
      const filePath = path.join(root, mapped);
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
}

/** Start the server and resolve with `{ url, close }`. */
export function startShopServer(version = VERSION, port = 0) {
  const server = createShopServer(version);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        url: `http://127.0.0.1:${p}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startShopServer(VERSION, PORT || 3000);
  console.log(`shop fixture (v${VERSION}) listening on ${url}`);
}
