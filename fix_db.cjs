const Database = require('better-sqlite3');
const db = new Database('safety.db');
db.prepare("UPDATE sites SET drawingPdfId = CAST(drawingPdfId AS INTEGER)").run();
const sites = db.prepare("SELECT * FROM sites").all();
console.log(JSON.stringify(sites, null, 2));
db.close();
