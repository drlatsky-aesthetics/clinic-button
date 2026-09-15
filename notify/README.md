# Clinic Notify — Vercel project

A single web page for clinic staff with one big button. They tap it, and
Dr. Latsky's phone gets a "You're needed — Treasury Medical" alert within a
second or two. No hardware, no LAN, works from any phone or tablet with internet.

```
[Staff phone/tablet] → public/index.html → POST /api/notify → ntfy / Telegram / Pushover / Twilio → [Dr. Latsky's phone]
```

The page asks for a shared PIN once per device and remembers it. The message
is a fixed line plus the time — no patient information ever leaves the clinic
(PHIPA).

---

## Which delivery method?

| `NOTIFY_PROVIDER` | Cost | What Dr. Latsky sees | Setup effort |
|---|---|---|---|
| `ntfy` (default) | **Free**, no account | Push notification from the ntfy app | 2 min |
| `telegram` | **Free** | Message from a Telegram bot | 5 min |
| `pushover` | $5 one-time | Push notification from the Pushover app | 5 min |
| `twilio` | ~$1.50/mo number + ~$0.01/text CAD | A real SMS text | 15 min + card |

Recommendation: start with **ntfy**. It is free, sounds like a text, and works
even when the phone's data is poor because it is just a tiny push. If you
specifically want it to arrive as an SMS in your Messages app, use `twilio`.

---

## Deploy (about 5 minutes)

1. Open this link, which pre-selects the repo:
   <https://vercel.com/new/import?s=https://github.com/drlatsky-aesthetics/clinic-button>
   (or go to <https://vercel.com/new>, sign in with GitHub, and import
   `clinic-button` by hand).
2. Under **Root Directory** click *Edit* and choose `notify`.
3. Under **Environment Variables** add at minimum:
   - `STAFF_PIN` — the PIN staff will type, e.g. `2468`
   - `NOTIFY_PROVIDER` — `ntfy`
   - `NTFY_TOPIC` — a long random name such as `treasury-clinic-9f3k2m8x7q`
   See `.env.example` for the other providers.
4. Click **Deploy**. Vercel gives you a URL like
   `https://clinic-notify.vercel.app`. Bookmark it on the front-desk phone or
   tablet, or "Add to Home Screen" so it behaves like an app.

The live project is linked to this repository. Redeploys happen automatically
whenever `main` changes; the root `vercel.json` handles building from this folder.

---

## Provider setup

### ntfy (free push)
1. Install **ntfy** from the App Store or Google Play on Dr. Latsky's phone.
2. Tap **+** → Subscribe to topic → enter the exact `NTFY_TOPIC` value.
3. In the app's settings, turn on **Instant delivery** (Android) so it is not
   delayed by battery saving. On iPhone this is on by default.
4. Test: open the Vercel URL, enter the PIN, tap the button.

The topic name is the only secret, so make it long and random. Anyone who knows
it can subscribe. For a locked topic, create a free ntfy.sh account, reserve the
topic, and set `NTFY_TOKEN`.

### Telegram (free)
1. In Telegram, message **@BotFather** → `/newbot` → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Message **@userinfobot** to get your numeric ID → `TELEGRAM_CHAT_ID`.
3. Open a chat with your new bot and press **Start** (bots cannot message you
   until you do).

### Pushover ($5 once)
1. Install Pushover, create an account, copy your **User Key** →
   `PUSHOVER_USER_KEY`.
2. At pushover.net → *Create an Application* → copy the **API Token** →
   `PUSHOVER_APP_TOKEN`.

### Twilio (real SMS)
1. Sign up at twilio.com, buy a Canadian number (~$1.50/mo).
2. Copy Account SID, Auth Token, and the number into `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Put your cell in `ALERT_PHONE` in
   `+1XXXXXXXXXX` form.
3. On a free trial, Twilio only texts numbers you have verified in the console
   and prefixes each message with a trial notice. Add a card to remove that.

---

## API

`POST /api/notify` with header `X-Staff-PIN: <pin>` and an empty JSON body `{}`.
Returns `{ ok: true, time }`. Repeat presses within 10 seconds are ignored
with `429`.

This endpoint is also a handy target for a physical Flic button's "Internet
Request" action, so a Flic button can page the doctor directly without the LAN
server.

## Changing the wording

Set `CLINIC_NAME` (default `Treasury Medical`) and `ALERT_TITLE` (default
`You're needed`) as environment variables. No code change needed.

## Local testing

```bash
npm i -g vercel
cd notify
cp .env.example .env.local   # fill in real values
vercel dev
```
