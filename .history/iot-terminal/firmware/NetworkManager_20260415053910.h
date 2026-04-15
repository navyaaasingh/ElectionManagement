#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <ArduinoJson.h>
#include <NTPClient.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiUdp.h>

class NetworkManager {
private:
  WiFiClient wifiClient;
  PubSubClient *mqttClient;
  WiFiUDP ntpUDP;
  NTPClient *timeClient;
  String clientId;
  bool connected;

  // Callback function pointer
  void (*messageCallback)(String topic, String payload);

public:
  NetworkManager();
  ~NetworkManager();

  bool connectWiFi(const char *ssid, const char *password);
  bool isWiFiConnected();
  bool connectMQTT(const char *server, int port, const char *username,
                   const char *password);
  bool isMQTTConnected();
  void loop();

  bool publish(const char *topic, const char *payload);
  bool publishVote(String voterId, String electionId, String candidateId,
                   String biometricHash);
  bool publishAuth(String biometricHash);
  void subscribe(const char *topic);
  void setMessageCallback(void (*callback)(String, String));

  String getTimestamp();
  void syncTime();

private:
  static void mqttCallback(char *topic, byte *payload, unsigned int length);
  static NetworkManager *instance;
};

#endif // NETWORK_MANAGER_H
