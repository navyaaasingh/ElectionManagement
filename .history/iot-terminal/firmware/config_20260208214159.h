#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "ElectionNetwork"
#define WIFI_PASSWORD "SecureElectionWiFi2024"
#define WIFI_TIMEOUT_MS 20000
#define WIFI_RETRY_DELAY_MS 5000

// MQTT Configuration
#define MQTT_SERVER "localhost"
#define MQTT_PORT 1883
#define MQTT_USERNAME "election_terminal"
#define MQTT_PASSWORD "terminal_mqtt_password"
#define MQTT_CLIENT_ID_PREFIX "TERMINAL_"
#define MQTT_TOPIC_VOTE "election/votes"
#define MQTT_TOPIC_AUTH "election/auth"
#define MQTT_TOPIC_STATUS "election/terminal/status"
#define MQTT_RECONNECT_DELAY_MS 5000

// Fingerprint Sensor Configuration (Adafruit AS608)
#define FINGERPRINT_RX_PIN 16
#define FINGERPRINT_TX_PIN 17
#define FINGERPRINT_BAUDRATE 57600
#define FINGERPRINT_PASSWORD 0x00000000

// Terminal Configuration
#define TERMINAL_ID "TERMINAL_001"
#define DISTRICT_ID "DISTRICT_001"

// Tamper Detection
#define TAMPER_SWITCH_PIN 34
#define TAMPER_CHECK_INTERVAL_MS 1000

// LED Indicators
#define LED_READY_PIN 25
#define LED_SCANNING_PIN 26
#define LED_SUCCESS_PIN 27
#define LED_ERROR_PIN 14

// Offline Cache
#define OFFLINE_CACHE_FILE "/votes_cache.json"
#define MAX_OFFLINE_VOTES 100

// Security
#define ENABLE_TAMPER_DETECTION true
#define WIPE_ON_TAMPER true

// Timeouts
#define FINGERPRINT_TIMEOUT_MS 10000
#define VOTE_SUBMISSION_TIMEOUT_MS 5000

// NTP Configuration
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 19800  // IST: UTC+5:30
#define DAYLIGHT_OFFSET_SEC 0

#endif // CONFIG_H
