# Troubleshoot Hub

Diagnose and fix Flic Hub connection issues.

## Checklist to run through with the user

1. **Check Hub IP**
   - Is `FLIC_HUB_HOST` set to the correct LAN IP?
   - Run: `ping $FLIC_HUB_HOST` to confirm reachability
   - Find Hub IP: check router DHCP table, or Flic app → Hub settings

2. **Check port 8124**
   - Run: `nc -zv $FLIC_HUB_HOST 8124`
   - If refused: Hub SDK mode may be disabled — enable in Flic app → Hub settings → Developer mode

3. **Check Hub is online**
   - Flic Hub LR LED should be solid white (connected to cloud + LAN)
   - If blinking: Hub is not connected to internet (SDK still works on LAN)

4. **Check server logs**
   - Look for `[FLIC] Connected` vs `[FLIC] Connection error`
   - If `ECONNREFUSED`: wrong IP or port
   - If `ETIMEDOUT`: Hub unreachable (different subnet or firewall)

5. **Verify button pairing**
   - Buttons must be paired in Flic app AND added to the Hub
   - Server logs `[FLIC] Hub has N verified buttons` — if N=0, buttons aren't paired to Hub

6. **Test without hardware**
   - Run `npm run demo` to confirm server + dashboard work independently of Hub

## Quick fix commands

```bash
# Test Hub reachability
ping 192.168.1.100

# Test SDK port
nc -zv 192.168.1.100 8124

# Run without Hub to isolate
npm run demo
```
