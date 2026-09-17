# Clinic Notify — Vercel project

A single web page for clinic staff with one metallic button per physician.
Staff tap a name and only that doctor's phone gets a "Dr. X — You're needed"
alert within a second or two. No hardware, no LAN, works from any phone or
tablet with internet.

| Button | Colour | Doctor id used by the API |
|---|---|---|
| Dr. Latsky | deep rose pink | `latsky` |
| Dr. Tom | red | `tom` |
| Dr. Baker | blue | `baker` |
| Dr. Di Donato | green | `didonato` |

```
[Staff phone/tablet] → public/index.html → POST /api/notify → ntfy / Telegram / Pushover / Twilio → [that doctor's phone]
```

The page asks for a shared PIN once per device and remembers it. The message
is a fixed line plus the time — no patient information ever leaves the clinic
(PHIPA).

## One notification channel per doctor

Each doctor gets their own delivery address, so a tap pages that doctor alone.
For ntfy that means one topic each: `NTFY_TOPIC_LATSKY`, `NTFY_TOPIC_TOM`,
`NTFY_TOPIC_BAKER`, `NTFY_TOPIC_DIDONATO`. Each doctor subscribes only to their
own topic in the ntfy app.

Any doctor whose own variable is missing falls back to the shared base variable
(`NTFY_TOPIC`), which is useful while rolling out — but everyone subscribed to
that shared topic hears every alert, so set the four per-doctor topics before
handing the page to staff. The same base-plus-suffix rule applies to the other
providers: `TELEGRAM_CHAT_ID_TOM`, `PUSHOVER_USER_KEY_BAKER`,
`ALERT_PHONE_DIDONATO`, and so on.

---

## Which delivery method?

| `NOTIFY_PROVIDER` | Cost | What the doctor sees | Setup effort |
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
   - `NTFY_TOPIC_LATSKY`, `NTFY_TOPIC_TOM`, `NTFY_TOPIC_BAKER`,
     `NTFY_TOPIC_DIDONATO` — a long random name for each
   See `.env.example` for the other providers.
4. Click **Deploy**. Vercel gives you a URL like
   `https://clinic-notify.vercel.app`. Bookmark it on the front-desk phone or
   tablet, or "Add to Home Screen" so it behaves like an app.

The live project is linked to this repository. Redeploys happen automatically
whenever `main` changes; the root `vercel.json` handles building from this folder.

---

## Provider setup

### ntfy (free push)
1. Install **ntfy** from the App Store or Google Play on each doctor's phone.
2. Tap **+** → Subscribe to topic → enter that doctor's exact topic value.
   Do this once on each doctor's phone, with their own topic only.
3. In the app's settings, turn on **Instant delivery** (Android) so it is not
   delayed by battery saving. On iPhone this is on by default.
4. Test: open the Vercel URL, enter the PIN, tap that doctor's button.

### Making sure it is heard

Alerts are published at ntfy's **priority 5 (max)**, which the app documents as
"really long vibration bursts, default notification sound with a pop-over
notification". The sender cannot choose the sound; the receiving phone decides.
If an alert arrives silently, fix it on the phone:

- **Android.** ntfy creates one notification channel per priority. Open the
  ntfy app → Settings → the max-priority channel, and set a channel-specific
  sound and, if the doctor wants to be reachable during Do Not Disturb, turn on
  **Override Do Not Disturb**. Also turn on **Instant delivery** so messages
  arrive even in doze mode.
- **iPhone.** Make sure notifications are allowed for ntfy, the ringer is not
  muted, and ntfy is added to any Focus mode the doctor uses so alerts are not
  held back.

Have each doctor confirm they actually hear a test before the page goes to the
front desk — delivery to ntfy proves nothing about the phone's own settings.

A topic name is the only secret protecting it, so make each one long and random.
Anyone who knows a name can subscribe to it. For locked topics, create a free
ntfy.sh account, reserve them, and set `NTFY_TOKEN`.

### Telegram (free)
1. In Telegram, message **@BotFather** → `/newbot` → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Each doctor messages **@userinfobot** for their numeric ID →
   `TELEGRAM_CHAT_ID_<THEIR ID>`.
3. Open a chat with your new bot and press **Start** (bots cannot message you
   until you do).

### Pushover ($5 once)
1. Each doctor installs Pushover and creates an account; copy each **User Key**
   → `PUSHOVER_USER_KEY_<THEIR ID>`.
2. At pushover.net → *Create an Application* → copy the **API Token** →
   `PUSHOVER_APP_TOKEN`.

### Twilio (real SMS)
1. Sign up at twilio.com, buy a Canadian number (~$1.50/mo).
2. Copy Account SID, Auth Token, and the number into `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Put each doctor's cell in
   `ALERT_PHONE_<THEIR ID>` in `+1XXXXXXXXXX` form.
3. On a free trial, Twilio only texts numbers you have verified in the console
   and prefixes each message with a trial notice. Add a card to remove that.

---

## API

`POST /api/notify` with header `X-Staff-PIN: <pin>` and a JSON body naming the
doctor:

```json
{ "doctor": "latsky" }
```

`doctor` is one of `latsky`, `tom`, `baker`, `didonato`, and defaults to
`latsky` when omitted. Returns `{ ok: true, doctor, time }`. Repeat presses for
the same doctor within 10 seconds are ignored with `429` ("Sent moments ago").

This endpoint is also a handy target for a physical Flic button's "Internet
Request" action: give each doctor's button its own body and one press pages
them directly, without the LAN server.

## Changing the wording

Set `CLINIC_NAME` (default `Treasury Medical`) and `ALERT_TITLE` (default
`You're needed`) as environment variables. No code change needed.

## Adding or removing a doctor

1. Add an entry to `DOCTORS` in `api/notify.js` (id → display name).
2. Add the same id and name to `DOCTORS` in `public/index.html`.
3. Add a colour block for that id in the page's CSS, following the existing
   four: `--m-light` / `--m-base` / `--m-dark` for the metal, plus `--edge`,
   `--ink` and `--ink-shadow`. All four plates use white ink on a mid-tone
   metal, which keeps white-text contrast in the 5.3–5.7 range; pick a base
   dark enough to stay there.
4. Add their `NTFY_TOPIC_<ID>` in Vercel and subscribe their phone to it.

## Local testing

```bash
npm i -g vercel
cd notify
cp .env.example .env.local   # fill in real values
vercel dev
```
