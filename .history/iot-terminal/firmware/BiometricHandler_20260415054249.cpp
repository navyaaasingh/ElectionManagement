#include "BiometricHandler.h"
#include "config.h"

BiometricHandler::BiometricHandler(uint8_t rxPin, uint8_t txPin,
                                   uint32_t baudrate) {
  serialPort = new HardwareSerial(2);
  serialPort->begin(baudrate, SERIAL_8N1, rxPin, txPin);
  finger = new Adafruit_Fingerprint(serialPort, FINGERPRINT_PASSWORD);
}

BiometricHandler::~BiometricHandler() {
  delete finger;
  delete serialPort;
}

bool BiometricHandler::begin() {
  Serial.println("🔍 Initializing fingerprint sensor...");

  if (finger->verifyPassword()) {
    Serial.println("✅ Fingerprint sensor connected!");
    Serial.print("   Sensor contains ");
    Serial.print(finger->templateCount);
    Serial.println(" templates");
    return true;
  } else {
    Serial.println("❌ Fingerprint sensor not found!");
    return false;
  }
}

bool BiometricHandler::isConnected() { return finger->verifyPassword(); }

/**
 * Capture fingerprint and return SHA-256 hash
 */
String BiometricHandler::captureAndHash() {
  Serial.println("\n👆 Place finger on sensor...");

  // Wait for finger
  uint8_t p = -1;
  unsigned long startTime = millis();

  while (p != FINGERPRINT_OK) {
    p = finger->getImage();

    if (millis() - startTime > FINGERPRINT_TIMEOUT_MS) {
      Serial.println("⏱️ Timeout waiting for finger");
      return "";
    }

    if (p == FINGERPRINT_NOFINGER) {
      delay(50);
      continue;
    } else if (p == FINGERPRINT_OK) {
      Serial.println("✅ Image captured");
      break;
    } else {
      Serial.print("❌ Error capturing image: ");
      Serial.println(p);
      return "";
    }
  }

  // Convert image to template
  p = finger->image2Tz();
  if (p != FINGERPRINT_OK) {
    Serial.print("❌ Error converting image: ");
    Serial.println(p);
    return "";
  }

  Serial.println("✅ Image converted to template");

  // Get template hash
  return getTemplateHash();
}

uint8_t BiometricHandler::getImage() { return finger->getImage(); }

uint8_t BiometricHandler::convertImage() { return finger->image2Tz(); }

/**
 * Get SHA-256 hash of fingerprint template
 * This ensures no raw biometric data is stored
 */
String BiometricHandler::getTemplateHash() {
  // Ask sensor to upload template from CharBuffer1 over UART.
  uint8_t p = finger->getModel();
  if (p != FINGERPRINT_OK) {
    Serial.print("❌ Error getting template model: ");
    Serial.println(p);
    return "";
  }

  uint8_t packetSeed[64] = {0};
  Adafruit_Fingerprint_Packet packet(FINGERPRINT_DATAPACKET,
                                     sizeof(packetSeed), packetSeed);

  size_t templateLength = 0;

  // Stream template data packets until END packet, hashing payload bytes.
  sha256.reset();
  while (true) {
    p = finger->getStructuredPacket(&packet, 2000);
    if (p != FINGERPRINT_OK) {
      Serial.print("❌ Error receiving template packet: ");
      Serial.println(p);
      return "";
    }

    if (packet.type != FINGERPRINT_DATAPACKET &&
        packet.type != FINGERPRINT_ENDDATAPACKET) {
      Serial.print("❌ Unexpected template packet type: ");
      Serial.println(packet.type);
      return "";
    }

    uint16_t payloadLength = packet.length > 2 ? packet.length - 2 : 0;
    if (payloadLength > 0) {
      sha256.update(packet.data, payloadLength);
      templateLength += payloadLength;
    }

    if (packet.type == FINGERPRINT_ENDDATAPACKET) {
      break;
    }
  }

  Serial.print("Template length: ");
  Serial.println(templateLength);

  uint8_t hash[32];
  sha256.finalize(hash, 32);

  // Convert hash to hex string
  String hashString = bytesToHex(hash, 32);

  Serial.print("🔐 SHA-256 Hash: ");
  Serial.println(hashString);

  return hashString;
}

void BiometricHandler::clearBuffer() { finger->emptyDatabase(); }

/**
 * Convert byte array to hex string
 */
String BiometricHandler::bytesToHex(uint8_t *data, size_t length) {
  String hexString = "";
  for (size_t i = 0; i < length; i++) {
    if (data[i] < 0x10) {
      hexString += "0";
    }
    hexString += String(data[i], HEX);
  }
  hexString.toLowerCase();
  return hexString;
}
