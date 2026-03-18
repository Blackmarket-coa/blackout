import http from "node:http";

function resolvePort(value) {
  const parsed = Number.parseInt(value ?? "3000", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

const port = resolvePort(process.env.PORT);

const server = http.createServer((req, res) => {
  const { method = "GET", url = "/" } = req;

  if (method === "GET" && (url === "/health" || url === "/ready")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "blackout-monorepo" }));
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Blackout monorepo service is running.\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`blackout service listening on http://0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
