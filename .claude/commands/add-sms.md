# Add SMS Alerts

Add Twilio SMS notifications for alerts that go unacknowledged for more than 5 minutes.

## Implementation plan

1. Install Twilio: `npm install twilio`

2. Add env vars to `.env` (create if needed):
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_FROM=+1XXXXXXXXXX
   ALERT_PHONE=+1XXXXXXXXXX
   ```

3. In `server.js`, add after `handleButtonPress()`:
   ```js
   const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

   function scheduleEscalation(roomId, roomName) {
     setTimeout(() => {
       if (alerts[roomId] && !alerts[roomId].acknowledged) {
         twilio.messages.create({
           body: `⚠️ CLINIC ALERT: ${roomName} has been waiting 5+ minutes and is unacknowledged.`,
           from: process.env.TWILIO_FROM,
           to: process.env.ALERT_PHONE,
         }).catch(err => console.error("[SMS] Failed:", err.message));
       }
     }, 5 * 60 * 1000); // 5 minutes
   }
   ```

4. Call `scheduleEscalation(roomId, config.room)` at the end of `handleButtonPress()`

5. Add `dotenv` for env loading:
   ```bash
   npm install dotenv
   ```
   Add `require("dotenv").config()` as first line of `server.js`

6. Add `.env` to `.gitignore`

## Notes
- PHIPA note: SMS content should not include patient names or health info — room name only is fine
- Twilio free trial works for testing; upgrade for production use
- Consider adding `ESCALATION_MINUTES` as a configurable env var
