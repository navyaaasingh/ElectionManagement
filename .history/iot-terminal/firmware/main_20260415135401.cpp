/**
 * IoT Voting Terminal Firmware
 * ESP32 with Fingerprint Sensor
 *
 * Features:
 * - Biometric authentication (SHA-256 hashed)
 * - MQTT communication with backend
 * - Offline vote caching
 * - Tamper detection
 * - NTP time synchronization
 */

#include "BiometricHandler.h"
#include "NetworkManager.h"
#include "OfflineCache.h"
#include "TamperDetection.h"
#include "config.h"
#include <Arduino.h>

// Global instances
BiometricHandler *biometric;
NetworkManager *network;
OfflineCache *cache;
TamperDetection *tamperDetect;

// State variables
enum TerminalState {
  STATE_INIT,
  STATE_READY,
  STATE_SCANNING,
  STATE_AUTHENTICATING,
  STATE_VOTING,
  STATE_SUCCESS,
  STATE_ERROR,
  STATE_TAMPERED
};

TerminalState currentState = STATE_INIT;
String currentVoterId = "";
String currentElectionId = "";
String currentBiometricHash = "";

bool authResponseReceived = false;
bool authResponseSuccess = false;
String authResponseError = "";

bool voteAckReceived = false;
bool voteAckSuccess = false;
String voteAckError = "";

const int MAX_AUTH_CANDIDATES = 16;
String availableCandidates[MAX_AUTH_CANDIDATES];
int availableCandidateCount = 0;

const unsigned long AUTH_RESPONSE_TIMEOUT_MS = 5000;
const unsigned long VOTE_ACK_TIMEOUT_MS = 5000;

// LED functions
void setLED(int pin, bool state) { digitalWrite(pin, state ? HIGH : LOW); }

void blinkLED(int pin, int times, int delayMs = 200) {
  for (int i = 0; i < times; i++) {
    setLED(pin, true);
    delay(delayMs);
    setLED(pin, false);
    delay(delayMs);
  }
}

void clearAllLEDs() {
  setLED(LED_READY_PIN, false);
  setLED(LED_SCANNING_PIN, false);
  setLED(LED_SUCCESS_PIN, false);
  setLED(LED_ERROR_PIN, false);
}

String buttonLabelForIndex(int index) {
  switch (index) {
  case 0:
    return "A";
  case 1:
    return "B";
  case 2:
    return "C";
  case 3:
    return "D";
  default:
    return "?";
  }
}

bool isButtonPressed(uint8_t pin) {
  if (digitalRead(pin) != LOW) {
    return false;
  }

  delay(BUTTON_DEBOUNCE_MS);
  return digitalRead(pin) == LOW;
}

void waitForButtonRelease(uint8_t pin) {
  while (digitalRead(pin) == LOW) {
    delay(10);
  }
}

int waitForCandidateButtonSelection(int selectableCount,
                                    unsigned long timeoutMs) {
  unsigned long start = millis();

  while ((millis() - start) < timeoutMs) {
    if (tamperDetect) {
      tamperDetect->check();
      if (tamperDetect->isTampered()) {
        return -2;
      }
    }

    if (network && network->isWiFiConnected()) {
      network->loop();
    }

    if (selectableCount >= 1 && isButtonPressed(BUTTON_A_PIN)) {
      waitForButtonRelease(BUTTON_A_PIN);
      return 0;
    }

    if (selectableCount >= 2 && isButtonPressed(BUTTON_B_PIN)) {
      waitForButtonRelease(BUTTON_B_PIN);
      return 1;
    }

    if (selectableCount >= 3 && isButtonPressed(BUTTON_C_PIN)) {
      waitForButtonRelease(BUTTON_C_PIN);
      return 2;
    }

    if (selectableCount >= 4 && isButtonPressed(BUTTON_D_PIN)) {
      waitForButtonRelease(BUTTON_D_PIN);
      return 3;
    }

    delay(10);
  }

  return -1;
}

void resetSession() {
  currentVoterId = "";
  currentElectionId = "";
  currentBiometricHash = "";

  availableCandidateCount = 0;
  for (int i = 0; i < MAX_AUTH_CANDIDATES; i++) {
    availableCandidates[i] = "";
  }

  authResponseReceived = false;
  authResponseSuccess = false;
  authResponseError = "";

  voteAckReceived = false;
  voteAckSuccess = false;
  voteAckError = "";
}

void syncCachedVotes() {
  if (!cache->hasVotes()) {
    return;
  }

  if (!network->isMQTTConnected()) {
    Serial.println("⚠️ Cannot sync cache: MQTT offline");
    return;
  }

  int initialCount = cache->getVoteCount();
  int syncedCount = 0;
  int failedCount = 0;
  int index = 0;

  while (index < cache->getVoteCount()) {
    CachedVote vote = cache->getVote(index);

    if (vote.voterId.length() == 0 || vote.electionId.length() == 0 ||
        vote.candidateId.length() == 0 ||
        vote.biometricHash.length() == 0) {
      Serial.println("⚠️ Dropping invalid cached vote entry");
      cache->removeVote(index);
      continue;
    }

    if (network->publishVote(vote.voterId, vote.electionId,
                             vote.candidateId,
                             vote.biometricHash)) {
      cache->removeVote(index);
      syncedCount++;
      delay(100);
      continue;
    }

    failedCount++;
    index++;
  }

  Serial.print("✅ Cache sync complete: ");
  Serial.print(syncedCount);
  Serial.print("/");
  Serial.print(initialCount);
  Serial.println(" synced");

  if (failedCount > 0) {
    Serial.print("⚠️ Cache sync pending votes: ");
    Serial.println(failedCount);
  }
}

// MQTT callback
void onMQTTMessage(String topic, String payload) {
  Serial.print("📬 MQTT: ");
  Serial.print(topic);
  Serial.print(" -> ");
  Serial.println(payload);

  StaticJsonDocument<512> doc;
  DeserializationError parseError = deserializeJson(doc, payload);
  if (parseError) {
    Serial.print("⚠️ MQTT payload parse failed: ");
    Serial.println(parseError.c_str());
    return;
  }

  if (topic.startsWith(MQTT_TOPIC_AUTH_RESPONSE_PREFIX)) {
    authResponseReceived = true;

    String status = doc["status"] | "failed";
    authResponseSuccess = status == "success";
    authResponseError = doc["error"] | "";

    if (authResponseSuccess) {
      currentVoterId = doc["voterId"] | "";
      currentElectionId = doc["electionId"] | "";

      availableCandidateCount = 0;
      JsonArray candidateIds = doc["candidateIds"].as<JsonArray>();
      if (!candidateIds.isNull()) {
        for (JsonVariant value : candidateIds) {
          if (availableCandidateCount >= MAX_AUTH_CANDIDATES) {
            break;
          }

          String candidateId = value.as<String>();
          if (candidateId.length() > 0) {
            availableCandidates[availableCandidateCount] = candidateId;
            availableCandidateCount++;
          }
        }
      }

      if (availableCandidateCount <= 0) {
        authResponseSuccess = false;
        authResponseError = "No candidates in auth response";
        Serial.println("❌ Auth response missing candidate IDs");
      } else {
        Serial.println("✅ Auth response accepted");
        Serial.print("   Candidate pool loaded: ");
        Serial.println(availableCandidateCount);
      }
    } else {
      Serial.println("❌ Auth response rejected");
    }
    return;
  }

  if (topic.startsWith(MQTT_TOPIC_VOTE_ACK_PREFIX)) {
    voteAckReceived = true;

    String status = doc["status"] | "FAILED";
    voteAckSuccess = status == "SUCCESS" || status == "success";
    voteAckError = doc["error"] | "";
    return;
  }

  String terminalCommandTopic =
      String("election/terminal/") + String(TERMINAL_ID) + "/command";

  if (topic == "election/command" || topic == terminalCommandTopic) {
    String command = doc["command"] | "";

    if (command == "DISABLE" || command == "DEACTIVATE") {
      Serial.println("⚠️ Terminal deactivated by backend command");
      currentState = STATE_ERROR;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  SECURE ELECTION MANAGEMENT SYSTEM    ║");
  Serial.println("║    IoT Voting Terminal v1.0.0         ║");
  Serial.println("╚════════════════════════════════════════╝\n");

  // Initialize LED pins
  pinMode(LED_READY_PIN, OUTPUT);
  pinMode(LED_SCANNING_PIN, OUTPUT);
  pinMode(LED_SUCCESS_PIN, OUTPUT);
  pinMode(LED_ERROR_PIN, OUTPUT);

  // Initialize candidate-selection button pins
  pinMode(BUTTON_A_PIN, INPUT_PULLUP);
  pinMode(BUTTON_B_PIN, INPUT_PULLUP);
  pinMode(BUTTON_C_PIN, INPUT_PULLUP);
  pinMode(BUTTON_D_PIN, INPUT_PULLUP);

  Serial.println("🔘 Candidate buttons initialized");
  Serial.println("   A->GPIO" + String(BUTTON_A_PIN) +
                 " B->GPIO" + String(BUTTON_B_PIN) +
                 " C->GPIO" + String(BUTTON_C_PIN) +
                 " D->GPIO" + String(BUTTON_D_PIN));

  clearAllLEDs();

  // Show startup sequence
  blinkLED(LED_READY_PIN, 3, 100);

  // Initialize components
  Serial.println("═══════════ SYSTEM INITIALIZATION ═══════════\n");

  // 1. Tamper Detection
  tamperDetect =
      new TamperDetection(TAMPER_SWITCH_PIN, ENABLE_TAMPER_DETECTION);
  tamperDetect->begin();

  if (tamperDetect->isTampered()) {
    Serial.println("🚨 SYSTEM LOCKED - TAMPER DETECTED");
    currentState = STATE_TAMPERED;
    while (true) {
      blinkLED(LED_ERROR_PIN, 1, 500);
    }
  }

  // 2. Offline Cache
  cache = new OfflineCache(OFFLINE_CACHE_FILE);
  if (!cache->begin()) {
    Serial.println("⚠️ Warning: Offline cache initialization failed");
  }

  // 3. Fingerprint Sensor
  biometric = new BiometricHandler(FINGERPRINT_RX_PIN, FINGERPRINT_TX_PIN,
                                   FINGERPRINT_BAUDRATE);
  if (!biometric->begin()) {
    Serial.println("❌ FATAL: Fingerprint sensor not found!");
    blinkLED(LED_ERROR_PIN, 10, 200);
    currentState = STATE_ERROR;
    while (true) {
      delay(1000);
    }
  }

  // 4. Network Connection
  network = new NetworkManager();
  network->setMessageCallback(onMQTTMessage);

  if (network->connectWiFi(WIFI_SSID, WIFI_PASSWORD)) {
    if (network->connectMQTT(MQTT_SERVER, MQTT_PORT, MQTT_USERNAME,
                             MQTT_PASSWORD)) {
      Serial.println("\n✅ Network connected - Online mode");

      // Sync cached votes if any
      if (cache->hasVotes()) {
        Serial.print("📤 Syncing ");
        Serial.print(cache->getVoteCount());
        Serial.println(" cached votes...");
        syncCachedVotes();
      }
    } else {
      Serial.println("\n⚠️ MQTT connection failed - Offline mode");
    }
  } else {
    Serial.println("\n⚠️ WiFi connection failed - Offline mode");
  }

  Serial.println("\n═══════════════════════════════════════════════\n");
  Serial.println("✅ SYSTEM READY");
  Serial.println("   Terminal ID: " + String(TERMINAL_ID));
  Serial.println("   District: " + String(DISTRICT_ID));
  Serial.println("   Mode: " +
                 String(network->isMQTTConnected() ? "ONLINE" : "OFFLINE"));
  Serial.println("\n═══════════════════════════════════════════════\n");

  currentState = STATE_READY;
  setLED(LED_READY_PIN, true);
}

void loop() {
  // Check for tampering
  tamperDetect->check();
  if (tamperDetect->isTampered()) {
    currentState = STATE_TAMPERED;
    clearAllLEDs();
    blinkLED(LED_ERROR_PIN, 1, 500);
    return;
  }

  // Network maintenance
  if (network->isWiFiConnected()) {
    network->loop();
  }

  // State machine
  switch (currentState) {
  case STATE_READY: {
    Serial.println("\n👤 READY FOR VOTER");
    Serial.println("   Place finger on sensor to begin...\n");
    setLED(LED_READY_PIN, true);

    currentState = STATE_SCANNING;
    break;
  }

  case STATE_SCANNING: {
    setLED(LED_SCANNING_PIN, true);
    setLED(LED_READY_PIN, false);

    String biometricHash = biometric->captureAndHash();

    if (biometricHash.length() > 0) {
      currentBiometricHash = biometricHash;
      Serial.println("\n🔐 Biometric captured and hashed");
      currentState = STATE_AUTHENTICATING;
    } else {
      Serial.println("\n❌ Failed to capture biometric");
      blinkLED(LED_ERROR_PIN, 3, 200);
      delay(2000);
      currentState = STATE_READY;
      setLED(LED_SCANNING_PIN, false);
    }
    break;
  }

  case STATE_AUTHENTICATING: {
    Serial.println("\n🔍 Authenticating voter...");

    // Send to backend via MQTT
    if (network->isMQTTConnected()) {
      authResponseReceived = false;
      authResponseSuccess = false;
      authResponseError = "";
      currentVoterId = "";
      currentElectionId = "";

      if (network->publishAuth(currentBiometricHash)) {
        Serial.println("✅ Authentication request sent");

        unsigned long authStart = millis();
        while (!authResponseReceived &&
               (millis() - authStart) < AUTH_RESPONSE_TIMEOUT_MS) {
          network->loop();
          delay(20);
        }

        if (authResponseReceived && authResponseSuccess &&
            currentVoterId.length() > 0 && currentElectionId.length() > 0) {
          Serial.println("✅ Voter authenticated!");
          Serial.println("   Voter ID: " + currentVoterId);
          Serial.println("   Election ID: " + currentElectionId);
          currentState = STATE_VOTING;
        } else {
          if (authResponseReceived) {
            Serial.println("❌ Authentication rejected: " + authResponseError);
          } else {
            Serial.println("❌ Authentication timeout");
          }

          blinkLED(LED_ERROR_PIN, 3, 200);
          delay(2000);
          currentState = STATE_READY;
        }
      } else {
        Serial.println("❌ Authentication failed");
        blinkLED(LED_ERROR_PIN, 3, 200);
        delay(2000);
        currentState = STATE_READY;
      }
    } else {
      Serial.println("⚠️ Offline mode - cannot authenticate");
      blinkLED(LED_ERROR_PIN, 3, 200);
      delay(2000);
      currentState = STATE_READY;
    }

    setLED(LED_SCANNING_PIN, false);
    break;
  }

  case STATE_VOTING: {
    Serial.println("\n🗳️  VOTING IN PROGRESS");
    Serial.println("   Select candidate using buttons...\n");

    if (availableCandidateCount <= 0) {
      Serial.println("❌ No candidate IDs available for vote");
      currentState = STATE_ERROR;
      break;
    }

    int selectableCount = availableCandidateCount;
    if (selectableCount > 4) {
      selectableCount = 4;
      Serial.println(
          "⚠️ More than 4 candidates available, using first 4 for button "
          "mapping");
    }

    for (int i = 0; i < selectableCount; i++) {
      Serial.print("   Button ");
      Serial.print(buttonLabelForIndex(i));
      Serial.print(" -> ");
      Serial.println(availableCandidates[i]);
    }

    Serial.println("   Waiting for button press...");
    int selectedIndex = waitForCandidateButtonSelection(
        selectableCount, CANDIDATE_SELECT_TIMEOUT_MS);

    if (selectedIndex == -2) {
      Serial.println("❌ Voting interrupted: tamper detected");
      currentState = STATE_TAMPERED;
      break;
    }

    if (selectedIndex < 0 || selectedIndex >= selectableCount) {
      Serial.println("❌ Candidate selection timeout");
      currentState = STATE_ERROR;
      break;
    }

    String selectedCandidate = availableCandidates[selectedIndex];

    Serial.print("   Selected: ");
    Serial.println(selectedCandidate);

    // Get biometric hash again for vote verification
    String voteHash = biometric->captureAndHash();

    if (voteHash.length() > 0) {
      // Submit vote
      bool voteSubmitted = false;
      bool shouldCacheVote = false;
      bool backendRejectedVote = false;

      if (network->isMQTTConnected()) {
        voteAckReceived = false;
        voteAckSuccess = false;
        voteAckError = "";

        Serial.println("\n📤 Submitting vote to blockchain...");
        bool publishSuccess =
            network->publishVote(currentVoterId, currentElectionId,
                                 selectedCandidate, voteHash);

        if (publishSuccess) {
          unsigned long ackStart = millis();
          while (!voteAckReceived &&
                 (millis() - ackStart) < VOTE_ACK_TIMEOUT_MS) {
            network->loop();
            delay(20);
          }

          if (voteAckReceived) {
            if (voteAckSuccess) {
              voteSubmitted = true;
              Serial.println("✅ Vote submitted successfully!");
            } else {
              backendRejectedVote = true;
              Serial.println("❌ Vote rejected by backend: " + voteAckError);
            }
          } else {
            shouldCacheVote = true;
            Serial.println("⚠️ Vote ACK timeout - caching for retry");
          }
        } else {
          shouldCacheVote = true;
          Serial.println("❌ Vote submission failed");
        }
      } else {
        shouldCacheVote = true;
      }

      // Cache if offline or transport failed, but not if backend explicitly
      // rejected the vote.
      if (!voteSubmitted && shouldCacheVote && !backendRejectedVote) {
        Serial.println("\n💾 Caching vote offline...");
        String timestamp = network->getTimestamp();
        if (cache->addVote(currentVoterId, currentElectionId,
                           selectedCandidate, voteHash, timestamp)) {
          Serial.println("✅ Vote cached - will sync when online");
          voteSubmitted = true;
        } else {
          Serial.println("❌ Failed to cache vote");
        }
      }

      if (voteSubmitted) {
        currentState = STATE_SUCCESS;
      } else {
        currentState = STATE_ERROR;
      }
    } else {
      Serial.println("❌ Biometric verification failed");
      currentState = STATE_ERROR;
    }
    break;
  }

  case STATE_SUCCESS: {
    Serial.println("\n✅ ═══════════════════════════════════");
    Serial.println("   VOTE CAST SUCCESSFULLY!");
    Serial.println("   Thank you for voting.");
    Serial.println("   ═══════════════════════════════════\n");

    blinkLED(LED_SUCCESS_PIN, 5, 300);

    delay(3000);

    // Reset for next voter
    resetSession();
    currentState = STATE_READY;
    clearAllLEDs();
    break;
  }

  case STATE_ERROR: {
    Serial.println("\n❌ ═══════════════════════════════════");
    Serial.println("   ERROR OCCURRED");
    Serial.println("   Please contact election officials.");
    Serial.println("   ═══════════════════════════════════\n");

    blinkLED(LED_ERROR_PIN, 5, 300);

    delay(3000);

    // Reset
    resetSession();
    currentState = STATE_READY;
    clearAllLEDs();
    break;
  }

  case STATE_TAMPERED: {
    // Already handled above
    break;
  }
  }

  delay(100);
}
