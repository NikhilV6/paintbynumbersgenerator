"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 10001);
const host = process.env.HOST || "127.0.0.1";
const apiOrigin = process.env.PBN_API_ORIGIN;
const connectSources = ["'self'", "http://127.0.0.1:8000", "http://localhost:8000"];
if (apiOrigin) {
    const parsedApiOrigin = new URL(apiOrigin);
    if (parsedApiOrigin.origin !== apiOrigin || parsedApiOrigin.protocol !== "https:") {
        throw new Error("PBN_API_ORIGIN must be an HTTPS origin without a path.");
    }
    connectSources.push(parsedApiOrigin.origin);
}
const contentSecurityPolicy = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src " + connectSources.join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
].join("; ");
const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer(function (request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end("Method not allowed");
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
    }

    if (pathname === "/") pathname = "/index.html";
    const filePath = path.resolve(root, "." + pathname);
    if (!filePath.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.stat(filePath, function (statError, stats) {
        if (statError || !stats.isFile()) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            "Cache-Control": "no-cache",
            "Content-Length": stats.size,
            "Content-Type": contentTypes[path.extname(filePath).toLowerCase()]
                || "application/octet-stream",
            "Content-Security-Policy": contentSecurityPolicy,
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff"
        });
        if (request.method === "HEAD") {
            response.end();
            return;
        }
        const stream = fs.createReadStream(filePath);
        stream.on("error", function () {
            if (!response.headersSent) response.writeHead(500);
            response.end("Could not read file");
        });
        stream.pipe(response);
    });
});

server.listen(port, host, function () {
    console.log("Frontend available at http://" + host + ":" + port);
});
