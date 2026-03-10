import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("safety.db");

// Initialize Database & Migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    drawingPdfId TEXT
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
addColumn("inspections", "date", "TEXT");
addColumn("inspections", "inspectorName", "TEXT");
addColumn("inspections", "workerCount", "INTEGER");
addColumn("inspections", "workContent", "TEXT");
addColumn("inspections", "overallComment", "TEXT");
addColumn("inspections", "score", "INTEGER");
addColumn("inspections", "rank", "TEXT");
addColumn("inspections", "templateVersion", "TEXT");
addColumn("inspection_items", "photoCaption", "TEXT");

// Seed initial sites if empty
const siteCount = db.prepare("SELECT COUNT(*) as count FROM sites").get() as { count: number };
if (siteCount.count === 0) {
  // Initial seed removed as per user request
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
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
      
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/sites/:id", (req, res, next) => {
    try {
      const { id } = req.params;
      // Delete inspection items first
      db.prepare(`
        DELETE FROM inspection_items 
        WHERE inspectionId IN (SELECT id FROM inspections WHERE siteId = ?)
      `).run(id);
      // Delete inspections
      db.prepare("DELETE FROM inspections WHERE siteId = ?").run(id);
      // Delete site
      db.prepare("DELETE FROM sites WHERE id = ?").run(id);
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
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.delete("/api/inspections/:id", (req, res, next) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM inspection_items WHERE inspectionId = ?").run(id);
      db.prepare("DELETE FROM inspections WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  app.post("/api/inspections/:id/items", (req, res, next) => {
    try {
      const { itemId, rating, comment, photoId, photoCaption } = req.body;
      const inspectionId = req.params.id;
      
      // Upsert logic
      const existing = db.prepare("SELECT id FROM inspection_items WHERE inspectionId = ? AND itemId = ?").get(inspectionId, itemId) as { id: number } | undefined;
      
      if (existing) {
        db.prepare(`
          UPDATE inspection_items 
          SET rating = COALESCE(?, rating), 
              comment = COALESCE(?, comment), 
              photoId = COALESCE(?, photoId),
              photoCaption = COALESCE(?, photoCaption)
          WHERE id = ?
        `).run(rating, comment, photoId, photoCaption, existing.id);
        res.json({ id: existing.id, updated: true });
      } else {
        const result = db.prepare(`
          INSERT INTO inspection_items (inspectionId, itemId, rating, comment, photoId, photoCaption) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(inspectionId, itemId, rating, comment, photoId, photoCaption);
        res.json({ id: result.lastInsertRowid, created: true });
      }
    } catch (e) { next(e); }
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
