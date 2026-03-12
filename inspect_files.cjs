const Database = require('better-sqlite3');
const db = new Database('safety.db');
const files = db.prepare("SELECT id, mimeType FROM files").all();
console.log(JSON.stringify(files, null, 2));
db.close();
