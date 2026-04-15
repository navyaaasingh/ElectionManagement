# Arduino Fingerprint Board Connection
Status: In Progress (Production Mode)

## Mode Selection (Do Not Mix)

### Production Mode (active)
- Firmware: `iot-terminal/firmware/main.cpp`
- Network: Station mode (`ElectionNetwork`) + MQTT backend
- Vote path: Terminal -> MQTT -> backend IoT service -> vote service

### Demo Mode (legacy)
- Firmware: `iot-terminal/firmware/user_voting_kiosk.ino`
- Network: AP mode (`Voting_Station`) + local web dashboard
- Note: Use only for standalone hardware demo, not backend validation

## Step 1: Verify USB Connection ✅
- `/dev/cu.usbserial-0001` detected
- CP210x drivers OK

## Step 2: Hardware Check
- Fingerprint sensor -> ESP32 UART2
   - Sensor TX -> GPIO16 (ESP32 RX)
   - Sensor RX -> GPIO17 (ESP32 TX)
   - Sensor GND -> ESP32 GND
- Candidate buttons (INPUT_PULLUP, active LOW)
   - Button A -> GPIO13
   - Button B -> GPIO12
   - Button C -> GPIO33
   - Button D -> GPIO32
- Tamper switch -> GPIO34 (INPUT_PULLUP, active LOW)

## Step 3: Flash Production Firmware
```bash
cd iot-terminal
platformio lib install
platformio run --target upload -e esp32dev
platformio device monitor
```
## Step 4: Production Pass/Fail Criteria

1. Boot + Sensor
- PASS:
   - `✅ Fingerprint sensor connected!`
- FAIL:
   - `❌ FATAL: Fingerprint sensor not found!`

2. WiFi + MQTT
- PASS:
   - `✅ WiFi connected!`
   - `✅ MQTT connected!`
- FAIL:
   - `Reason: 201 - NO_AP_FOUND`
   - `❌ WiFi connection timeout`
   - `❌ MQTT connection failed`

3. Biometric Capture + Auth
- PASS:
   - `🔐 SHA-256 Hash: <64-hex>`
   - `✅ Auth response accepted`
   - `Candidate pool loaded: <N>` (N > 0)
   - `✅ Voter authenticated!`
- FAIL:
   - `❌ Failed to capture biometric`
   - `❌ Authentication timeout`
   - `❌ Authentication rejected: ...`
   - `❌ Auth response missing candidate IDs`

4. Vote Submit + ACK
- PASS:
   - `Button A/B/C/D -> <candidate-uuid>`
   - `Selected: <candidate-uuid>`
   - `📤 Published to election/vote/submit`
   - `✅ Vote submitted successfully!`
- FAIL:
   - `❌ Candidate set exceeds button capacity (max 4 candidates)`
   - `❌ Candidate selection timeout`
   - `❌ Vote rejected by backend: ...`
   - `❌ Vote submission failed`

5. Offline Cache + Replay
- Offline PASS:
   - `✅ Vote cached - will sync when online`
- Reconnect PASS:
   - `✅ Cache sync complete: X/Y synced`

6. Tamper
- Trigger condition: GPIO34 LOW (not HIGH)
- PASS:
   - `🚨 TAMPER DETECTED!`
   - `✅ Data wipe complete`

## Step 5: Rollback (Production)
```bash
cd iot-terminal
platformio run --target erase -e esp32dev
platformio run --target upload -e esp32dev
```

## Optional: Demo Mode Quick Test
Only if you intentionally flash `user_voting_kiosk.ino`:
- Expected logs:
   - `Found fingerprint sensor!`
   - `AP IP address: 192.168.4.1`
- Dashboard reset route `/reset` is demo-only

Task: Production terminal path is now the primary implementation target.



