# Clinic Smart Button System

A lightweight patient-ready notification system using **Flic 2 buttons** and a browser dashboard.

---

## Hardware Required

| Item | Approx. Cost (CAD) | Where to Buy |
|---|---|---|
| Flic 2 button (×4 for 4 rooms) | ~$35 each | flic.io, Amazon.ca |
| Flic Hub LR | ~$90 | flic.io |
| Any tablet / monitor for dashboard | — | — |

**Total for 4-room setup: ~$230 CAD**

---

## How It Works

```
[Flic Button] → Bluetooth → [Flic Hub LR]
                                  ↓ TCP (local network)
                            [Node.js Server]
                                  ↓ WebSocket
                          [Browser Dashboard]
                      (front desk / any device on WiFi)
```

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Flic Hub
- Plug in Flic Hub LR to ethernet (same network as your server/computer)
- Add buttons via Flic app
- Note the Hub's IP address (from your router or Flic app)

### 3. Configure button → room mapping
Edit `server.js` → `BUTTON_MAP`:
```js
const BUTTON_MAP = {
  "80:e4:da:79:01:01": { room: "Room 1",           label: "Room 1" },
  "80:e4:da:79:02:02": { room: "Room 2",           label: "Room 2" },
  "80:e4:da:79:03:03": { room: "Room 3",           label: "Room 3" },
  "80:e4:da:79:04:04": { room: "Aesthetics Suite", label: "Treasury Aesthetics Suite" },
};
```
Find button addresses in the Flic app → button settings.

### 4. Run the server

**Demo mode (no hardware needed):**
```bash
npm run demo
```

**With real Flic Hub:**
```bash
FLIC_HUB_HOST=192.168.1.100 npm run live
```

### 5. Open the dashboard
Open a browser on any device on the same network:
```
http://<your-computer-ip>:3000
```

---

## Dashboard Features

- 🔔 **Alert card** appears instantly when button pressed
- ⏱ Elapsed time shown (refreshes every 30s)
- ✓ **Acknowledge** button clears the alert
- Room tiles show live status + can be clicked to test
- Chime sound on new alert (click page once to unlock audio)
- Auto-reconnects if server restarts

---

## Button Press Types

Flic 2 supports three press types — you can assign different meanings:
- **Single click** → Patient ready
- **Double click** → Urgent / needs immediate attention  
- **Hold** → Emergency / need physician now

To act on press type, edit `handleButtonPress()` in `server.js`.

---

## Running as a Service (optional, for always-on)

```bash
npm install -g pm2
pm2 start server.js --name clinic-buttons -- env FLIC_HUB_HOST=192.168.1.100
pm2 startup   # auto-start on boot
pm2 save
```

---

## Future Enhancements
- [ ] Persist alert log to SQLite
- [ ] SMS/email notification on unacknowledged alert > 5 min
- [ ] Oscar EMR integration (tag patient encounter)
- [ ] Multi-location support (Treasury + family practice)
