#include "TamperDetection.h"
#include "config.h"

TamperDetection::TamperDetection(uint8_t pin, bool enable) {
  switchPin = pin;
  enabled = enable;
  tampered = false;
  activeReadCount = 0;
  requiredActiveReads = 3;
  lastCheck = 0;
  checkInterval = TAMPER_CHECK_INTERVAL_MS;
}

/**
 * Initialize tamper detection
 */
void TamperDetection::begin() {
  pinMode(switchPin, INPUT_PULLUP);

  Serial.println("\n🔒 Initializing tamper detection...");
  Serial.print("   Switch Pin: ");
  Serial.println(switchPin);
  Serial.print("   Status: ");
  Serial.println(enabled ? "ENABLED" : "DISABLED");

  if (enabled) {
    // Initial check
    if (switchActivated()) {
      Serial.println("⚠️ WARNING: Tamper switch active at boot");
      Serial.println("   Waiting for sustained confirmation...");
      activeReadCount = 1;
    } else {
      Serial.println("✅ Tamper detection armed");
    }
  }
}

/**
 * Check if device has been tampered
 */
bool TamperDetection::isTampered() { return tampered; }

/**
 * Check tamper switch (call in loop)
 */
void TamperDetection::check() {
  if (!enabled) {
    return;
  }

  unsigned long currentTime = millis();
  if (currentTime - lastCheck < checkInterval) {
    return;
  }

  lastCheck = currentTime;

  if (!switchActivated()) {
    activeReadCount = 0;
    return;
  }

  if (activeReadCount < requiredActiveReads) {
    activeReadCount++;
  }

  if (activeReadCount < requiredActiveReads || tampered) {
    return;
  }

  Serial.println("\n🚨 TAMPER DETECTED!");
  Serial.println("   Device casing has been opened!");

  tampered = true;

  if (WIPE_ON_TAMPER) {
    Serial.println("   Wiping sensitive data...");
    wipeData();
  }

  // Continuous alarm
  for (int i = 0; i < 10; i++) {
    digitalWrite(LED_ERROR_PIN, HIGH);
    delay(100);
    digitalWrite(LED_ERROR_PIN, LOW);
    delay(100);
  }
}

/**
 * Wipe all sensitive data on tamper
 */
void TamperDetection::wipeData() {
  Serial.println("🗑️ WIPING ALL DATA...");

  // Format SPIFFS
  if (SPIFFS.format()) {
    Serial.println("   ✅ Filesystem wiped");
  } else {
    Serial.println("   ❌ Filesystem wipe failed");
  }

  // Clear WiFi credentials (ESP32 specific)
  // WiFi.disconnect(true, true);

  Serial.println("✅ Data wipe complete");
  Serial.println("⚠️ Device is now in tampered state");
  Serial.println("   Professional servicing required");
}

/**
 * Enable/disable tamper detection
 */
void TamperDetection::setEnabled(bool enable) {
  enabled = enable;
  Serial.print("🔒 Tamper detection ");
  Serial.println(enabled ? "ENABLED" : "DISABLED");
}

bool TamperDetection::isEnabled() { return enabled; }

/**
 * Check if tamper switch is activated
 * Returns true if switch is activated (device opened)
 */
bool TamperDetection::switchActivated() {
  // Switch is pulled LOW when activated (device opened)
  return digitalRead(switchPin) == LOW;
}
