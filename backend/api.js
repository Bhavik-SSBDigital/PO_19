import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import db from "./lib/prisma.js";
import router from "./routes.js";
import { corsOptions, securityHeaders } from "./middleware/securityHeaders.js";

dotenv.config();

const PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILD_DIR = path.join(__dirname, "build");

const app = express();

app.disable("x-powered-by");
// Always run Express in production mode: this guarantees the framework's
// default error page (which prints stack traces + server file paths) is never
// used, regardless of what NODE_ENV the server was started with.
app.set("env", "production");

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API responses carry user/business data - never let proxies/browsers cache them.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

// Serve React build folder (dotfiles such as .env / .git are never served,
// and source maps are never published).
app.use(
  express.static(BUILD_DIR, {
    dotfiles: "deny",
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// API routes
app.use("/api", router);

// Unknown API route -> clean JSON 404 (NOT the SPA's index.html, and no
// framework "Cannot POST /api/..." page).
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Not found" });
});

// SPA fallback - only for real client-side page routes. Anything that looks
// like a file request (has an extension, e.g. .env / .map / .json / .bak) or
// contains a dot-segment (/.git/config, /.env) gets a plain 404 instead of
// index.html with HTTP 200.
app.get("*", (req, res) => {
  const hasDotSegment = req.path.split("/").some((seg) => seg.startsWith("."));
  if (hasDotSegment || path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }

  res.sendFile(path.join(BUILD_DIR, "index.html"), (err) => {
    if (err && !res.headersSent) {
      // do not leak absolute server paths / errno details
      res.status(404).type("text/plain").send("Not found");
    }
  });
});

// Anything else that still falls through (non-GET on a non-API path)
app.use((req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

// Central error handler - the ONLY place errors leave the server.
// Never returns stack traces, file paths, library versions or error text.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return req.socket?.destroy();
  }

  let status = 500;
  let message = "Internal server error";

  if (err?.message === "Origin not allowed by CORS") {
    status = 403;
    message = "Forbidden";
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid request body";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    message = "Request body too large";
  } else if (
    Number.isInteger(err?.status) &&
    err.status >= 400 &&
    err.status < 500
  ) {
    status = err.status;
    message = "Bad request";
  }

  if (status >= 500) {
    console.error("Unhandled error:", err);
  }

  res.status(status).json({ message });
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  db();
});
