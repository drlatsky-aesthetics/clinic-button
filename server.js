/**
 * Clinic Smart Button Server
 * ─────────────────────────
 * Listens for Flic button presses via the Flic Hub SDK (or mock mode for testing)
 * and broadcasts events over WebSocket to the clinic dashboard.
 *
 * Hardware: Flic 2 buttons + Flic Hub LR (or Flic desktop app on Mac/Windows)
 * Protocol: Flic Hub SDK → Node.js → WebSocket → Browser dashboard
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const PORT = 3000;
const FLIC_HUB_HOST = process.env.FLIC_HUB_HOST || "192.168.1.100"; // Set your Flic Hub IP

// ─── OSCAR CONFIG ─────────────────────────────────────────────────────────────
const OSCAR_BASE_URL      = process.env.OSCAR_BASE_URL      || "";  // e.g. https://yourclinic.well-ai.com/oscar
const OSCAR_CLIENT_ID     = process.env.OSCAR_CLIENT_ID     || "";
const OSCAR_CLIENT_SECRET = process.env.OSCAR_CLIENT_SECRET || "";
const OSCAR_PROVIDER_NO   = process.env.OSCAR_PROVIDER_NO   || "1"; // physician provider number
const FLIC_HUB_PORT = 8124; // Default Flic Hub SDK port
const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.FLIC_HUB_HOST;

// Map Flic button Bluetooth addresses to room names
// Replace these with your actual button addresses (found in Flic app)
const BUTTON_MAP = {
  "80:e4:da:79:01:01": { room: "Room 1", label: "Dr. Latsky – Room 1" },
  "80:e4:da:79:02:02": { room: "Room 2", label: "Dr. Latsky – Room 2" },
  "80:e4:da:79:03:03": { room: "Room 3", label: "Room 3" },
  "80:e4:da:79:04:04": { room: "Aesthetics Suite", label: "Treasury Aesthetics Suite" },
  demo: { room: "Demo Room", label: "Demo Button" },
};

// ─── OSCAR API CLIENT ─────────────────────────────────────────────────────────

let oscarToken = { token: null, expiresAt: 0 };

async function getOscarToken() {
  if (oscarToken.token && Date.now() < oscarToken.expiresAt - 60000) {
    return oscarToken.token;
  }
  const res = await fetch(`${OSCAR_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: OSCAR_CLIENT_ID,
      client_secret: OSCAR_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`OSCAR token error: ${res.status}`);
  const data = await res.json();
  oscarToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return oscarToken.token;
}

async function oscarFetch(path, options = {}) {
  if (!OSCAR_BASE_URL) throw new Error("OSCAR not configured");
  const token = await getOscarToken();
  return fetch(`${OSCAR_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Bad JSON")); } });
  });
}

// ─── STATE ───────────────────────────────────────────────────────────────────

const alerts = {}; // { roomId: { room, label, time, acknowledged } }
const clients = new Set(); // Connected WebSocket dashboard clients

// ─── HTTP SERVER (serves dashboard) ──────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // ── API ROUTES ──────────────────────────────────────────────────────────────

  if (req.method === "POST" && req.url === "/api/patient-lookup") {
    try {
      const { hcn } = await readBody(req);
      const apiRes = await oscarFetch(`/oscar/api/v1/patients/search?query=${encodeURIComponent(hcn)}`);
      const data = await apiRes.json();
      const patients = Array.isArray(data) ? data : (data.patients || data.content || []);
      const patient = patients[0];
      if (!patient) {
        res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "NOT_FOUND", message: "No patient found for that HCN." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({
        demographicNo: patient.demographicNo || patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth || patient.dob,
        hcn,
      }));
    } catch (e) {
      if (e.message === "OSCAR not configured") {
        res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({
          error: "OSCAR_NOT_CONFIGURED",
          message: "Set OSCAR_BASE_URL, OSCAR_CLIENT_ID, OSCAR_CLIENT_SECRET in .env to enable patient lookup.",
        }));
      } else {
        console.error("[OSCAR] patient-lookup error:", e.message); // never logs HCN or patient data
        res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "SERVER_ERROR", message: "Lookup failed." }));
      }
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/vitals") {
    try {
      const { demographicNo, measurements } = await readBody(req);
      const measuredDate = new Date().toISOString();
      let saved = 0;
      for (const m of measurements) {
        const apiRes = await oscarFetch(`/oscar/api/v1/patients/${demographicNo}/measurements`, {
          method: "POST",
          body: JSON.stringify({
            type: m.type,
            value: m.value,
            measuredDate,
            providerNo: OSCAR_PROVIDER_NO,
          }),
        });
        if (apiRes.ok) saved++;
        else console.error("[OSCAR] vitals save failed for type", m.type, "status", apiRes.status); // no PHI in log
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ saved }));
    } catch (e) {
      if (e.message === "OSCAR not configured") {
        res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({
          error: "OSCAR_NOT_CONFIGURED",
          message: "Set OSCAR_BASE_URL, OSCAR_CLIENT_ID, OSCAR_CLIENT_SECRET in .env to enable vitals saving.",
        }));
      } else {
        console.error("[OSCAR] vitals error:", e.message); // never logs patient data or measurements
        res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "SERVER_ERROR", message: "Save failed." }));
      }
    }
    return;
  }

  // ── FILE SERVING ────────────────────────────────────────────────────────────

  const filePath =
    req.url === "/" || req.url === "/index.html"
      ? path.join(__dirname, "dashboard.html")
      : path.join(__dirname, req.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

// ─── WEBSOCKET SERVER ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Dashboard connected. Total clients: ${clients.size}`);

  // Send current state to newly connected client
  ws.send(JSON.stringify({ type: "state", alerts }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "acknowledge") {
        handleAcknowledge(msg.roomId);
      }
      if (msg.type === "test_press") {
        handleButtonPress(msg.buttonId || "demo", "single");
      }
    } catch (e) {
      console.error("[WS] Bad message:", e.message);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Dashboard disconnected. Total clients: ${clients.size}`);
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === 1) client.send(data);
  }
}

// ─── BUTTON LOGIC ─────────────────────────────────────────────────────────────

function handleButtonPress(buttonAddress, clickType) {
  const config = BUTTON_MAP[buttonAddress] || {
    room: `Unknown (${buttonAddress})`,
    label: `Button ${buttonAddress}`,
  };

  const roomId = config.room.toLowerCase().replace(/\s+/g, "_");
  const alert = {
    roomId,
    room: config.room,
    label: config.label,
    clickType, // single, double, hold
    time: new Date().toISOString(),
    acknowledged: false,
  };

  alerts[roomId] = alert;
  console.log(`[BUTTON] ${config.label} pressed (${clickType})`);
  broadcast({ type: "alert", alert });
}

function handleAcknowledge(roomId) {
  if (alerts[roomId]) {
    alerts[roomId].acknowledged = true;
    console.log(`[ACK] ${roomId} acknowledged`);
    broadcast({ type: "acknowledged", roomId });
    // Remove after short delay
    setTimeout(() => {
      delete alerts[roomId];
      broadcast({ type: "cleared", roomId });
    }, 2000);
  }
}

// ─── FLIC HUB CONNECTION ──────────────────────────────────────────────────────

function connectFlicHub() {
  // The flic-hub-sdk-js library handles the TCP socket to your Flic Hub
  // Install: npm install flic-hub-sdk-js
  let fliclib;
  try {
    fliclib = require("flic-hub-sdk-js");
  } catch (e) {
    console.warn("[FLIC] flic-hub-sdk-js not installed. Run: npm install flic-hub-sdk-js");
    console.warn("[FLIC] Running in DEMO_MODE — use dashboard Test buttons.");
    return;
  }

  const client = new fliclib.FlicClient(FLIC_HUB_HOST, FLIC_HUB_PORT);

  client.once("ready", () => {
    console.log(`[FLIC] Connected to Flic Hub at ${FLIC_HUB_HOST}:${FLIC_HUB_PORT}`);
    client.getInfo((err, info) => {
      if (err) return console.error("[FLIC] getInfo error:", err);
      console.log(`[FLIC] Hub has ${info.bdAddrOfVerifiedButtons.length} verified buttons`);

      for (const addr of info.bdAddrOfVerifiedButtons) {
        const cc = new fliclib.FlicConnectionChannel(addr);

        cc.on("buttonSingleOrDoubleClickOrHold", (clickType, wasQueued) => {
          if (!wasQueued) handleButtonPress(addr, clickType);
        });

        client.addConnectionChannel(cc);
        console.log(`[FLIC] Listening to button: ${addr} (${BUTTON_MAP[addr]?.room || "unassigned"})`);
      }
    });
  });

  client.on("error", (err) => {
    console.error("[FLIC] Connection error:", err.message);
    console.log("[FLIC] Retrying in 10s...");
    setTimeout(connectFlicHub, 10000);
  });

  client.on("close", () => {
    console.warn("[FLIC] Hub connection closed. Reconnecting in 10s...");
    setTimeout(connectFlicHub, 10000);
  });
}

// ─── DEMO MODE: Simulate a press every 15s for testing ───────────────────────

function startDemoMode() {
  console.log("[DEMO] Demo mode active — simulating button presses every 15s");
  console.log("[DEMO] Or trigger manually from the dashboard.");
  const rooms = Object.keys(BUTTON_MAP);
  let i = 0;
  setInterval(() => {
    handleButtonPress(rooms[i % rooms.length], "single");
    i++;
  }, 15000);
}

// ─── START ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n✅ Clinic Button Server running at http://localhost:${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
  console.log(`   Mode: ${DEMO_MODE ? "DEMO (no Flic Hub)" : `Flic Hub at ${FLIC_HUB_HOST}`}\n`);

  if (DEMO_MODE) {
    startDemoMode();
  } else {
    connectFlicHub();
  }
});
