# Add Room

Add a new Flic button + room to the clinic system.

## Steps

1. Ask the user for:
   - Room display name (e.g. "Room 4" or "Consultation Suite")
   - Flic button Bluetooth address (format: xx:xx:xx:xx:xx:xx, from Flic app)
   - Optional: custom label (defaults to room name)

2. Add the button to `BUTTON_MAP` in `server.js`:
   ```js
   "ADDRESS": { room: "ROOM_NAME", label: "LABEL" },
   ```

3. Add the room tile to `ROOMS` array in `dashboard.html`:
   ```js
   { id: "room_id_snake_case", label: "ROOM_NAME" },
   ```

4. Confirm the changes and remind the user to restart the server (`npm start`).

## Notes
- `roomId` in dashboard.html must match the snake_case version of `room` in server.js
- Formula: room name → lowercase, spaces to underscores (e.g. "Aesthetics Suite" → "aesthetics_suite")
- Bluetooth addresses are case-insensitive in the Flic SDK but use lowercase in our BUTTON_MAP for consistency
