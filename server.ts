import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import path from "path";

const db = new Database("chat.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER,
    role TEXT,
    text TEXT,
    imageData TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chatId) REFERENCES chats(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev";

  app.use(express.json());
  app.use(cookieParser());

  // Auth API
  app.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)");
      const result = stmt.run(email, hashedPassword);
      
      const token = jwt.sign({ userId: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
      res.json({ user: { email } });
    } catch (error: any) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        res.status(400).json({ error: "Email already exists" });
      } else {
        res.status(500).json({ error: "Server error" });
      }
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
    res.json({ user: { email: user.email } });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      res.json({ user: { id: decoded.userId, email: decoded.email } });
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Chat API
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  app.get("/api/chats", authenticate, (req: any, res) => {
    const chats = db.prepare("SELECT * FROM chats WHERE userId = ? ORDER BY createdAt DESC").all(req.user.userId);
    res.json({ chats });
  });

  app.post("/api/chats", authenticate, (req: any, res) => {
    const { title } = req.body;
    const result = db.prepare("INSERT INTO chats (userId, title) VALUES (?, ?)").run(req.user.userId, title || "New Chat");
    res.json({ id: result.lastInsertRowid, title: title || "New Chat" });
  });

  app.get("/api/chats/:id/messages", authenticate, (req: any, res) => {
    const messages = db.prepare("SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC").all(req.params.id);
    res.json({ messages });
  });

  app.post("/api/chats/:id/messages", authenticate, (req: any, res) => {
    const { role, text, imageData } = req.body;
    db.prepare("INSERT INTO messages (chatId, role, text, imageData) VALUES (?, ?, ?, ?)").run(req.params.id, role, text, imageData);
    res.json({ success: true });
  });

  app.delete("/api/chats/:id", authenticate, (req: any, res) => {
    db.prepare("DELETE FROM messages WHERE chatId = ?").run(req.params.id);
    db.prepare("DELETE FROM chats WHERE id = ? AND userId = ?").run(req.params.id, req.user.userId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve("dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
