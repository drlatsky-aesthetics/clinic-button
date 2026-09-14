// Vercel serverless function: POST /api/notify
// Receives a "patient ready" press from the staff page and forwards it to
// Dr. Latsky's phone via whichever provider NOTIFY_PROVIDER selects.
//
// Providers (set NOTIFY_PROVIDER to one of these):
//   ntfy      – free push notification, no account (ntfy.sh app on the phone)
//   telegram  – free, via a Telegram bot
//   pushover  – one-time $5 app purchase, then free
//   twilio    – real SMS text message (paid per message + phone number rental)
//
// PHIPA note: messages contain the room name only. Never put patient names,
// health card numbers, or any clinical detail in a notification.

const ROOMS = {
  room_1: "Room 1",
  room_2: "Room 2",
  room_3: "Room 3",
  aesthetics_suite: "Aesthetics Suite",
};

const CLICK_LABEL = {
  single: "Patient ready",
  double: "URGENT — needs attention",
  hold: "EMERGENCY — physician now",
};

// Best-effort flood protection. Serverless instances don't share memory, so
// this only limits repeat presses that land on the same warm instance.
const COOLDOWN_MS = 15 * 1000;
const lastSent = new Map();

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

function timingSafeEqual(a, b) {
  const { timingSafeEqual: tse } = require("node:crypto");
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return tse(bufA, bufB);
}

function torontoTime() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

// Each provider gets { title, body, time, urgent }:
//   title = "Patient ready — Room 1", body = "Room 1 · 12:10 p.m.", time = "12:10 p.m."
// Push apps show title above body; SMS/Telegram use title + time on one line.

async function sendNtfy({ title, body, urgent }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) throw new Error("NTFY_TOPIC is not set");
  const base = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  const headers = {
    Title: title,
    Priority: urgent ? "urgent" : "high",
    Tags: urgent ? "rotating_light" : "bell",
  };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  const r = await fetch(`${base}/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers,
    body,
  });
  if (!r.ok) throw new Error(`ntfy responded ${r.status}`);
}

async function sendTelegram({ title, time }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `${title}\n${time}` }),
  });
  if (!r.ok) throw new Error(`Telegram responded ${r.status}`);
}

async function sendPushover({ title, body, urgent }) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) throw new Error("PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY not set");
  const form = new URLSearchParams({
    token,
    user,
    title,
    message: body,
    priority: urgent ? "1" : "0",
  });
  const r = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) throw new Error(`Pushover responded ${r.status}`);
}

async function sendTwilio({ title, time }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.ALERT_PHONE;
  if (!sid || !auth || !from || !to) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM / ALERT_PHONE not set");
  }
  const form = new URLSearchParams({ From: from, To: to, Body: `${title} (${time})` });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!r.ok) throw new Error(`Twilio responded ${r.status}`);
}

const PROVIDERS = {
  ntfy: sendNtfy,
  telegram: sendTelegram,
  pushover: sendPushover,
  twilio: sendTwilio,
};

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "POST only" });
  }

  const pin = process.env.STAFF_PIN;
  if (!pin) return json(res, 500, { ok: false, error: "Server not configured: STAFF_PIN missing" });

  const provider = PROVIDERS[process.env.NOTIFY_PROVIDER || "ntfy"];
  if (!provider) return json(res, 500, { ok: false, error: "Unknown NOTIFY_PROVIDER" });

  const body = parseBody(req);
  const suppliedPin = req.headers["x-staff-pin"] || body.pin || "";
  if (!timingSafeEqual(suppliedPin, pin)) {
    return json(res, 401, { ok: false, error: "Wrong PIN" });
  }

  const roomId = String(body.roomId || "");
  const room = ROOMS[roomId];
  if (!room) return json(res, 400, { ok: false, error: "Unknown room" });

  const clickType = CLICK_LABEL[body.clickType] ? body.clickType : "single";
  const urgent = clickType !== "single";

  const now = Date.now();
  const key = `${roomId}:${clickType}`;
  if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) {
    return json(res, 429, { ok: false, error: "Already sent — wait a few seconds" });
  }

  const time = torontoTime();
  const title = `${CLICK_LABEL[clickType]} — ${room}`;
  const text = `${room} · ${time}`;

  try {
    await provider({ title, body: text, time, urgent });
    lastSent.set(key, now);
    return json(res, 200, { ok: true, room, clickType });
  } catch (err) {
    // Room name only — nothing patient-identifying is ever logged.
    console.error("[notify] send failed:", err.message);
    return json(res, 502, { ok: false, error: "Could not deliver notification" });
  }
};
