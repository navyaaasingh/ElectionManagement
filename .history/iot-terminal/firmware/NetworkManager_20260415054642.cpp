#include "NetworkManager.h"
#include "config.h"

NetworkManager *NetworkManager::instance = nullptr;

NetworkManager::NetworkManager() {
  instance = this;
  mqttClient = new PubSubClient(wifiClient);
  timeClient = new NTPClient(ntpUDP, NTP_SERVER, GMT_OFFSET_SEC, 60000);
  clientId = String(MQTT_CLIENT_ID_PREFIX) + String(TERMINAL_ID);
  connected = false;
  messageCallback = nullptr;
}

NetworkManager::~NetworkManager() {
  delete mqttClient;
  delete timeClient;
}

/**
 * Connect to WiFi network
 */
bool NetworkManager::connectWiFi(const char *ssid, const char *password) {
  Serial.println("\n📡 Connecting to WiFi...");
  Serial.print("   SSID: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startTime > WIFI_TIMEOUT_MS) {
      Serial.println("❌ WiFi connection timeout");
      return false;
    }
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ WiFi connected!");
  Serial.print("   IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("   Signal: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");

  // Sync time with NTP
  syncTime();

  return true;
}

bool NetworkManager::isWiFiConnected() { return WiFi.status() == WL_CONNECTED; }

/**
 * Connect to MQTT broker
 */
bool NetworkManager::connectMQTT(const char *server, int port,
                                 const char *username, const char *password) {
  mqttClient->setServer(server, port);
  mqttClient->setCallback(mqttCallback);

  Serial.println("\n📨 Connecting to MQTT broker...");
  Serial.print("   Server: ");
  Serial.print(server);
  Serial.print(":");
  Serial.println(port);

  int attempts = 0;
  while (!mqttClient->connected() && attempts < 5) {
    Serial.print("   Attempt ");
    Serial.print(attempts + 1);
    Serial.println("...");

    if (mqttClient->connect(clientId.c_str(), username, password)) {
      Serial.println("✅ MQTT connected!");
      Serial.print("   Client ID: ");
      Serial.println(clientId);

      // Subscribe to terminal topics
      subscribe(MQTT_TOPIC_STATUS);

      String authResponseTopic =
          String(MQTT_TOPIC_AUTH_RESPONSE_PREFIX) + String(TERMINAL_ID);
      subscribe(authResponseTopic.c_str());

      String voteAckTopic = String(MQTT_TOPIC_VOTE_ACK_PREFIX) +
                            String(TERMINAL_ID);
      subscribe(voteAckTopic.c_str());

      String terminalCommandTopic =
          String("election/terminal/") + String(TERMINAL_ID) + "/command";
      subscribe(terminalCommandTopic.c_str());
      subscribe("election/command");

      // Publish online status
      String statusPayload = "{\"terminalId\":\"" + String(TERMINAL_ID) +
                             "\",\"status\":\"online\",\"timestamp\":\"" +
                             getTimestamp() + "\"}";
      publish(MQTT_TOPIC_STATUS, statusPayload.c_str());

      connected = true;
      return true;
    } else {
      Serial.print("❌ MQTT connection failed, rc=");
      Serial.println(mqttClient->state());
      delay(MQTT_RECONNECT_DELAY_MS);
      attempts++;
    }
  }

  return false;
}

bool NetworkManager::isMQTTConnected() { return mqttClient->connected(); }

/**
 * Must be called in main loop
 */
void NetworkManager::loop() {
  if (!mqttClient->connected()) {
    connected = false;
  }
  mqttClient->loop();
  timeClient->update();
}

/**
 * Publish message to MQTT topic
 */
bool NetworkManager::publish(const char *topic, const char *payload) {
  if (!mqttClient->connected()) {
    Serial.println("⚠️ MQTT not connected, cannot publish");
    return false;
  }

  bool success = mqttClient->publish(topic, payload);
  if (success) {
    Serial.print("📤 Published to ");
    Serial.println(topic);
  } else {
    Serial.print("❌ Failed to publish to ");
    Serial.println(topic);
  }
  return success;
}

/**
 * Publish vote to backend
 */
bool NetworkManager::publishVote(String voterId, String electionId,
                                 String candidateId, String biometricHash) {
  StaticJsonDocument<512> doc;

  doc["terminalId"] = TERMINAL_ID;
  doc["voterId"] = voterId;
  doc["electionId"] = electionId;
  doc["candidateId"] = candidateId;
  doc["districtId"] = DISTRICT_ID;
  doc["biometricHash"] = biometricHash;
  doc["timestamp"] = getTimestamp();

  String payload;
  serializeJson(doc, payload);

  return publish(MQTT_TOPIC_VOTE, payload.c_str());
}

/**
 * Publish authentication request
 */
bool NetworkManager::publishAuth(String biometricHash) {
  StaticJsonDocument<256> doc;

  doc["terminalId"] = TERMINAL_ID;
  doc["biometricHash"] = biometricHash;
  doc["timestamp"] = getTimestamp();

  String payload;
  serializeJson(doc, payload);

  return publish(MQTT_TOPIC_AUTH, payload.c_str());
}

/**
 * Subscribe to MQTT topic
 */
void NetworkManager::subscribe(const char *topic) {
  if (mqttClient->subscribe(topic)) {
    Serial.print("📥 Subscribed to ");
    Serial.println(topic);
  } else {
    Serial.print("❌ Failed to subscribe to ");
    Serial.println(topic);
  }
}

/**
 * Set callback for incoming messages
 */
void NetworkManager::setMessageCallback(void (*callback)(String, String)) {
  messageCallback = callback;
}

/**
 * MQTT callback (static)
 */
void NetworkManager::mqttCallback(char *topic, byte *payload,
                                  unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("📬 Message received on ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(message);

  if (instance && instance->messageCallback) {
    instance->messageCallback(String(topic), message);
  }
}

/**
 * Get ISO 8601 timestamp
 */
String NetworkManager::getTimestamp() { return timeClient->getFormattedTime(); }

/**
 * Sync time with NTP server
 */
void NetworkManager::syncTime() {
  Serial.println("🕐 Syncing time with NTP server...");
  timeClient->begin();
  timeClient->update();
  Serial.print("✅ Time synced: ");
  Serial.println(timeClient->getFormattedTime());
}
