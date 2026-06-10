# Clinic Smart Button System — CLAUDE.md

## Project Overview
A patient-ready notification system for clinic use. Flic 2 Bluetooth buttons (one per exam room) connect to a Flic Hub LR, which talks to this Node.js server over TCP. The server broadcasts press events via WebSocket to a browser dashboard at the front desk.

**Primary use:** Treasury Aesthetics + family practice at Dr. Jason Latsky's clinic in Toronto.

---

## Architecture

```
[Flic 2 Button] → BT → [Flic Hub LR] → TCP → [server.js] → WS → [dashboard.html]
```

| File | Role |
|---|---|
| `server.js` | Node.js HTTP + WebSocket server, Flic Hub TCP client |
| `dashboard.html` | Front desk browser UI, served by server.js |
| `package.json` | Dependencies: `ws`, `flic-hub-sdk-js` |

---

## Tech Stack
- **Runtime:** Node.js 18+
- **HTTP:** Built-in `node:http`
- **WebSocket:** `ws` library (server-side)
- **Flic SDK:** `flic-hub-sdk-js` (TCP client to Flic Hub LR)
- **Frontend:** Vanilla JS + CSS, no build step, served as static HTML
- **Fonts:** Cormorant Garamond + Jost (Google Fonts CDN)

---

## Key Config in server.js

```js
const FLIC_HUB_HOST = process.env.FLIC_HUB_HOST || "192.168.1.100"; // LAN IP of Hub
const FLIC_HUB_PORT = 8124;   // Flic Hub SDK default port
const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.FLIC_HUB_HOST;

const BUTTON_MAP = {
  "80:e4:da:79:01:01": { room: "Room 1",           label: "Room 1" },
  "80:e4:da:79:04:04": { room: "Aesthetics Suite", label: "Treasury Aesthetics Suite" },
  // ... add real BT addresses from Flic app
};
```

Button addresses are found in the Flic iOS/Android app → button settings → Bluetooth address.

---

## Common Commands

```bash
# Install dependencies
npm install

# Run in demo mode (no hardware, simulates presses every 15s)
npm run demo

# Run against real Flic Hub
FLIC_HUB_HOST=192.168.1.100 npm start

# Run as persistent background service
npm run service:start
npm run service:stop
npm run service:logs
```

---

## Coding Conventions
- Plain Node.js — no TypeScript, no transpilation, no bundler
- `const`/`let` only, no `var`
- Arrow functions preferred for callbacks
- No external HTTP frameworks (no Express) — keep it zero-dependency except `ws` and `flic-hub-sdk-js`
- Dashboard is single-file HTML (CSS + JS inline) — keep it that way for easy deployment
- CSS uses `--css-variables` for all colors; palette lives in `:root`
- Brand palette: `--gold: #C9A84C`, `--charcoal: #1C1C1E`, `--ivory: #F5F0E8`

---

## WebSocket Message Protocol

All messages are JSON. Server → client:

| type | payload | meaning |
|---|---|---|
| `state` | `{ alerts: {...} }` | Full state snapshot on connect |
| `alert` | `{ alert: AlertObject }` | New button press |
| `acknowledged` | `{ roomId }` | Alert marked done |
| `cleared` | `{ roomId }` | Alert removed from state |

Client → server:

| type | payload | meaning |
|---|---|---|
| `acknowledge` | `{ roomId }` | Dismiss alert |
| `test_press` | `{ buttonId }` | Simulate a press (dev/testing) |

---

## AlertObject Shape

```js
{
  roomId: "aesthetics_suite",   // snake_case room key
  room: "Aesthetics Suite",     // display name
  label: "Treasury Aesthetics Suite",
  clickType: "single" | "double" | "hold",
  time: "2025-01-15T14:32:00.000Z",  // ISO timestamp
  acknowledged: false
}
```

---

## Adding a New Room / Button
1. Pair button in Flic app → note Bluetooth address
2. Add entry to `BUTTON_MAP` in `server.js`
3. Add entry to `ROOMS` array in `dashboard.html`
4. Restart server

---

## Known Constraints
- `flic-hub-sdk-js` requires the Flic Hub LR (not just Flic desktop app) for multi-button TCP access
- The Flic Hub must be on the same LAN as the Node.js server
- Dashboard clients on different subnets won't connect — all devices must be on clinic WiFi
- No auth on the WebSocket — acceptable for local LAN, not for internet exposure
- Audio chime requires a user click on the dashboard page first (browser autoplay policy)

---

## Planned Enhancements
- [ ] SQLite alert log (`better-sqlite3`)
- [ ] Unacknowledged alert SMS after 5 min (Twilio)
- [ ] Double-click = urgent flag, hold = emergency
- [ ] Oscar EMR integration hook (append to encounter note via Oscar API)
- [ ] Multi-location config (Treasury vs family practice)
