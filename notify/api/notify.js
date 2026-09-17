// Vercel serverless function: POST /api/notify
// Receives a press from the staff page and pages one doctor's phone via
// whichever provider NOTIFY_PROVIDER selects.
//
// Providers (set NOTIFY_PROVIDER to one of these):
//   ntfy      – free push notification, no account (ntfy.sh app on the phone)
//   telegram  – free, via a Telegram bot
//   pushover  – one-time $5 app purchase, then free
//   twilio    – real SMS text message (paid per message + phone number rental)
//
// Each doctor has their own delivery address so only that doctor is paged.
// Per-doctor variables are the base name plus _LATSKY / _TOM / _BAKER /
// _DIDONATO, e.g.
// NTFY_TOPIC_LATSKY. If one is missing, the shared base variable is used, so
// the system keeps working before the per-doctor values are added.
//
// PHIPA note: the message is a fixed "you're needed" line plus the time.
// Never put patient names, health card numbers, or clinical detail in it.

const CLINIC = process.env.CLINIC_NAME || "Treasury Medical";
const TITLE = process.env.ALERT_TITLE || "You're needed";

const DOCTORS = {
  latsky: { name: "Dr. Latsky" },
  tom: { name: "Dr. Tom" },
  baker: { name: "Dr. Baker" },
  didonato: { name: "Dr. Di Donato" },
};

// Best-effort flood protection, per doctor. Serverless instances don't share
// memory, so this only limits repeat presses landing on the same warm instance.
const COOLDOWN_MS = 10 * 1000;
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

// "NTFY_TOPIC" + "latsky" -> NTFY_TOPIC_LATSKY, falling back to NTFY_TOPIC.
function envFor(base, key) {
  return process.env[`${base}_${key.toUpperCase()}`] || process.env[base] || "";
}

function torontoTime() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

// Each provider gets { title, body, time, key }:
//   title = "Dr. Latsky — You're needed", body = "Treasury Medical · 12:10 p.m."
// Push apps show title above body; SMS/Telegram use title + time on one line.
// `key` is the doctor id, used to look up that doctor's delivery address.

async function sendNtfy({ title, body, key }) {
  const topic = envFor("NTFY_TOPIC", key);
  if (!topic) throw new Error(`NTFY_TOPIC_${key.toUpperCase()} is not set`);
  const base = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  // Publish as JSON rather than headers: HTTP headers are Latin-1 only, and
  // the title contains an em dash, which would throw before the request is sent.
  const headers = { "Content-Type": "application/json" };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  const r = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify({ topic, title, message: body, priority: 5, tags: ["bell"] }),
  });
  if (!r.ok) throw new Error(`ntfy responded ${r.status}`);
}

async function sendTelegram({ title, time, key }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = envFor("TELEGRAM_CHAT_ID", key);
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `${title}\n${time}` }),
  });
  if (!r.ok) throw new Error(`Telegram responded ${r.status}`);
}

async function sendPushover({ title, body, key }) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = envFor("PUSHOVER_USER_KEY", key);
  if (!token || !user) throw new Error("PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY not set");
  const form = new URLSearchParams({ token, user, title, message: body, priority: "1" });
  const r = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) throw new Error(`Pushover responded ${r.status}`);
}

async function sendTwilio({ title, time, key }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = envFor("ALERT_PHONE", key);
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

  // Default to Latsky so an old bookmark or a Flic button posting {} still works.
  const key = String(body.doctor || "latsky").toLowerCase();
  const doctor = DOCTORS[key];
  if (!doctor) return json(res, 400, { ok: false, error: "Unknown doctor" });

  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) {
    return json(res, 429, { ok: false, error: "Already sent — wait a few seconds" });
  }

  const time = torontoTime();
  const title = `${doctor.name} — ${TITLE}`;
  const text = `${CLINIC} · ${time}`;

  try {
    await provider({ title, body: text, time, key });
    lastSent.set(key, now);
    return json(res, 200, { ok: true, doctor: doctor.name, time });
  } catch (err) {
    console.error("[notify] send failed:", err.message);
    return json(res, 502, { ok: false, error: "Could not deliver notification" });
  }
};
