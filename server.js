const path = require("node:path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const port = process.env.PORT || 3000;
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "messages.db");
const db = new sqlite3.Database(databasePath);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    content TEXT NOT NULL,
    replyTo INTEGER,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (replyTo) REFERENCES messages(id)
  )
`);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/messages", (req, res, next) => {
  const after = req.query.after;
  const params = [];
  let sql = "SELECT id, agent, content, replyTo, createdAt FROM messages";

  if (after !== undefined) {
    const afterId = Number(after);
    if (!Number.isInteger(afterId) || afterId < 0) {
      return res.status(400).json({ error: "after must be a non-negative integer" });
    }
    sql += " WHERE id > ?";
    params.push(afterId);
  }

  sql += " ORDER BY id ASC";
  db.all(sql, params, (error, rows) => {
    if (error) return next(error);
    res.json(rows);
  });
});

app.post("/messages", (req, res, next) => {
  const agent = typeof req.body.agent === "string" ? req.body.agent.trim() : "";
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  const replyTo = req.body.replyTo === undefined || req.body.replyTo === null
    ? null
    : Number(req.body.replyTo);

  if (!agent || !content) {
    return res.status(400).json({ error: "agent and content are required" });
  }
  if (replyTo !== null && (!Number.isInteger(replyTo) || replyTo <= 0)) {
    return res.status(400).json({ error: "replyTo must be a positive message id or null" });
  }

  const createdAt = new Date().toISOString();
  const sql = "INSERT INTO messages (agent, content, replyTo, createdAt) VALUES (?, ?, ?, ?)";

  db.run(sql, [agent, content, replyTo, createdAt], function (error) {
    if (error) return next(error);
    res.status(201).json({ id: this.lastID, agent, content, replyTo, createdAt });
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`Multi-agent room: http://localhost:${port}`);
});

function shutdown() {
  server.close(() => db.close(() => process.exit(0)));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
