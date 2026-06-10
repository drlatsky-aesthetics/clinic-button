# Add Alert Log

Add persistent SQLite logging so every button press and acknowledgment is stored for end-of-day review.

## Implementation

1. Install: `npm install better-sqlite3`

2. Create `db.js`:
   ```js
   const Database = require("better-sqlite3");
   const db = new Database("alerts.db");

   db.exec(`
     CREATE TABLE IF NOT EXISTS alert_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       room_id TEXT NOT NULL,
       room_name TEXT NOT NULL,
       click_type TEXT,
       pressed_at TEXT NOT NULL,
       acknowledged_at TEXT,
       response_seconds INTEGER
     )
   `);

   const insertAlert = db.prepare(
     `INSERT INTO alert_log (room_id, room_name, click_type, pressed_at)
      VALUES (@roomId, @room, @clickType, @time)`
   );

   const recordAck = db.prepare(
     `UPDATE alert_log SET acknowledged_at = @now, response_seconds = @secs
      WHERE room_id = @roomId AND acknowledged_at IS NULL
      ORDER BY id DESC LIMIT 1`
   );

   module.exports = { insertAlert, recordAck };
   ```

3. In `server.js`:
   ```js
   const { insertAlert, recordAck } = require("./db");

   // In handleButtonPress(), after building alert object:
   insertAlert.run(alert);

   // In handleAcknowledge():
   const now = new Date().toISOString();
   const secs = Math.floor((Date.now() - new Date(alerts[roomId].time)) / 1000);
   recordAck.run({ roomId, now, secs });
   ```

4. Add a `/log` route to `server.js` to serve last 50 events as JSON:
   ```js
   if (req.url === "/log") {
     const rows = db.prepare("SELECT * FROM alert_log ORDER BY id DESC LIMIT 50").all();
     res.writeHead(200, { "Content-Type": "application/json" });
     res.end(JSON.stringify(rows));
     return;
   }
   ```

## Notes
- `alerts.db` will be created in the project root — add to `.gitignore`
- Response time in seconds is useful for tracking clinic flow efficiency
- Can add a simple log viewer tab to dashboard.html later
