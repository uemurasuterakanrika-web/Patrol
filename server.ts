import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("safety.db");

// Initialize Database & Migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    managerName TEXT,
    drawingPdfId INTEGER,
    FOREIGN KEY (drawingPdfId) REFERENCES files(id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content BLOB,
    mimeType TEXT
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siteId INTEGER NOT NULL,
    status TEXT DEFAULT 'draft',
    FOREIGN KEY (siteId) REFERENCES sites(id)
  );

  CREATE TABLE IF NOT EXISTS inspection_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspectionId INTEGER NOT NULL,
    itemId TEXT NOT NULL,
    rating TEXT,
    comment TEXT,
    photoId TEXT,
    FOREIGN KEY (inspectionId) REFERENCES inspections(id)
  );
`);

// Helper to add column if not exists
const addColumn = (table: string, column: string, type: string) => {
  try {
    db.prepare(`SELECT ${column} FROM ${table} LIMIT 1`).get();
  } catch (e: any) {
    if (e.message.includes(`no such column: ${column}`)) {
      console.log(`Adding column ${column} to table ${table}`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
};

addColumn("sites", "address", "TEXT");
addColumn("sites", "managerName", "TEXT");
addColumn("sites", "drawingPdfId", "INTEGER");
addColumn("inspections", "date", "TEXT");
addColumn("inspections", "inspectorName", "TEXT");
addColumn("inspections", "workerCount", "INTEGER");
addColumn("inspections", "workContent", "TEXT");
addColumn("inspections", "overallComment", "TEXT");
addColumn("inspections", "score", "INTEGER");
addColumn("inspections", "rank", "TEXT");
addColumn("inspections", "templateVersion", "TEXT");
addColumn("inspection_items", "photoCaption", "TEXT");
addColumn("inspection_items", "correctiveAction", "TEXT");
addColumn("inspection_items", "correctivePhotoId", "TEXT");
addColumn("inspection_items", "correctivePhotoCaption", "TEXT");
addColumn("inspection_items", "markers", "TEXT");

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE"]
    }
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Logging Middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Middleware to broadcast updates
  const broadcastUpdate = (type: string, id?: any) => {
    io.emit('dataUpdated', { type, id });
  };

  // API Routes
  app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/api/files/:id", (req, res, next) => {
    try {
      const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.id) as { content: Buffer, mimeType: string } | undefined;
      if (!file) return res.status(404).send("File not found");
      res.contentType(file.mimeType);
      res.send(file.content);
    } catch (e) { next(e); }
  });

  app.post("/api/files", (req, res, next) => {
    try {
      let { content, mimeType } = req.body;
      if (!content) return res.status(400).json({ error: "Content is required" });

      let dataToSave = content;
      if (typeof content === 'string' && content.startsWith('data:')) {
        const base64Part = content.split(',')[1];
        if (!base64Part) return res.status(400).json({ error: "Invalid data URL" });
        dataToSave = Buffer.from(base64Part, 'base64');
      }

      console.log(`Saving file: type=${mimeType}, size=${dataToSave.length} bytes`);
      const result = db.prepare("INSERT INTO files (content, mimeType) VALUES (?, ?)").run(dataToSave, mimeType || 'application/pdf');
      res.json({ id: result.lastInsertRowid });
    } catch (e) {
      console.error("POST /api/files Error:", e);
      next(e);
    }
  });

  app.get("/api/sites", (req, res, next) => {
    try {
      const sites = db.prepare("SELECT * FROM sites").all();
      res.json(sites);
    } catch (e) { next(e); }
  });

  app.post("/api/sites", (req, res, next) => {
    try {
      const { name, address, managerName, drawingPdfId } = req.body;
      const result = db.prepare("INSERT INTO sites (name, address, managerName, drawingPdfId) VALUES (?, ?, ?, ?)").run(name, address, managerName, drawingPdfId);
      broadcastUpdate('sites');
      res.json({ id: result.lastInsertRowid });
    } catch (e) { next(e); }
  });

  app.patch("/api/sites/:id", (req, res, next) => {
    try {
      const { name, address, managerName, drawingPdfId } = req.body;
      const { id } = req.params;

      if (name !== undefined) db.prepare("UPDATE sites SET name = ? WHERE id = ?").run(name, id);
      if (address !== undefined) db.prepare("UPDATE sites SET address = ? WHERE id = ?").run(address, id);
      if (managerName !== undefined) db.prepare("UPDATE sites SET managerName = ? WHERE id = ?").run(managerName, id);
      if (drawingPdfId !== undefined) db.prepare("UPDATE sites SET drawingPdfId = ? WHERE id = ?").run(drawingPdfId, id);

      broadcastUpdate('sites', id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/sites/:id", (req, res, next) => {
    try {
      const { id } = req.params;
      db.prepare(`
        DELETE FROM inspection_items 
        WHERE inspectionId IN (SELECT id FROM inspections WHERE siteId = ?)
      `).run(id);
      db.prepare("DELETE FROM inspections WHERE siteId = ?").run(id);
      db.prepare("DELETE FROM sites WHERE id = ?").run(id);
      broadcastUpdate('sites', id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.get("/api/inspections", (req, res, next) => {
    try {
      const { siteId } = req.query;
      let query = `
        SELECT i.*, s.name as siteName 
        FROM inspections i 
        JOIN sites s ON i.siteId = s.id
      `;
      const params: any[] = [];
      if (siteId) {
        query += " WHERE i.siteId = ?";
        params.push(siteId);
      }
      query += " ORDER BY i.date DESC";
      const inspections = db.prepare(query).all(...params);
      res.json(inspections);
    } catch (e) { next(e); }
  });

  app.get("/api/inspections/:id", (req, res, next) => {
    try {
      const inspection = db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id);
      if (!inspection) return res.status(404).json({ error: "Not found" });

      const items = db.prepare("SELECT * FROM inspection_items WHERE inspectionId = ?").all(req.params.id);
      res.json({ ...inspection, items });
    } catch (e) { next(e); }
  });

  app.post("/api/inspections", (req, res, next) => {
    try {
      const { siteId, date, inspectorName, workerCount, workContent, templateVersion } = req.body;
      const result = db.prepare(`
        INSERT INTO inspections (siteId, date, inspectorName, workerCount, workContent, templateVersion) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(siteId, date, inspectorName, workerCount, workContent, templateVersion);
      broadcastUpdate('inspections');
      res.json({ id: result.lastInsertRowid });
    } catch (e) { next(e); }
  });

  app.patch("/api/inspections/:id", (req, res, next) => {
    try {
      const { date, inspectorName, workerCount, workContent, overallComment, score, rank, status } = req.body;
      db.prepare(`
        UPDATE inspections 
        SET date = COALESCE(?, date),
            inspectorName = COALESCE(?, inspectorName),
            workerCount = COALESCE(?, workerCount),
            workContent = COALESCE(?, workContent),
            overallComment = COALESCE(?, overallComment),
            score = COALESCE(?, score),
            rank = COALESCE(?, rank),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(date, inspectorName, workerCount, workContent, overallComment, score, rank, status, req.params.id);
      broadcastUpdate('inspections', req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/inspections/:id", (req, res, next) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM inspection_items WHERE inspectionId = ?").run(id);
      db.prepare("DELETE FROM inspections WHERE id = ?").run(id);
      broadcastUpdate('inspections', id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.post("/api/inspections/:id/items", (req, res, next) => {
    try {
      const { itemId, rating, comment, correctiveAction, photoId, photoCaption, correctivePhotoId, correctivePhotoCaption, markers } = req.body;
      const inspectionId = req.params.id;

      const existing = db.prepare("SELECT id FROM inspection_items WHERE inspectionId = ? AND itemId = ?").get(inspectionId, itemId) as { id: number } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE inspection_items 
          SET rating = COALESCE(?, rating), 
              comment = COALESCE(?, comment), 
              correctiveAction = COALESCE(?, correctiveAction),
              photoId = COALESCE(?, photoId),
              photoCaption = COALESCE(?, photoCaption),
              correctivePhotoId = COALESCE(?, correctivePhotoId),
              correctivePhotoCaption = COALESCE(?, correctivePhotoCaption),
              markers = COALESCE(?, markers)
          WHERE id = ?
        `).run(rating, comment, correctiveAction, photoId, photoCaption, correctivePhotoId, correctivePhotoCaption, markers, existing.id);
        broadcastUpdate('inspection_item', inspectionId);
        res.json({ id: existing.id, updated: true });
      } else {
        const result = db.prepare(`
          INSERT INTO inspection_items (inspectionId, itemId, rating, comment, correctiveAction, photoId, photoCaption, correctivePhotoId, correctivePhotoCaption, markers) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(inspectionId, itemId, rating, comment, correctiveAction, photoId, photoCaption, correctivePhotoId, correctivePhotoCaption, markers);
        broadcastUpdate('inspection_item', inspectionId);
        res.json({ id: result.lastInsertRowid, created: true });
      }
    } catch (e) { next(e); }
  });

  // Catch-all for undefined /api routes
  app.all("/api/*", (req, res) => {
    console.warn(`[NOT FOUND] ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Route Not Found: " + req.url });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error:", err);
    // Ensure we always return JSON
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.message || "Internal Server Error",
      status: status
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  
  const getLocalIp = () => {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  };

  const localIp = getLocalIp();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://${localIp}:${PORT}`);
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

startServer();
