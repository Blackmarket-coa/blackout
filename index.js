import http from "node:http";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Blackout monorepo service is running.\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`blackout service listening on http://0.0.0.0:${port}`);
});
