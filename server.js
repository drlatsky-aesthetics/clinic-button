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

// ─── STATE ───────────────────────────────────────────────────────────────────

const alerts = {}; // { roomId: { room, label, time, acknowledged } }
const clients = new Set(); // Connected WebSocket dashboard clients

// ─── HTTP SERVER (serves dashboard) ──────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
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
