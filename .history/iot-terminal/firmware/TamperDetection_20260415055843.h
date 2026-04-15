#ifndef TAMPER_DETECTION_H
#define TAMPER_DETECTION_H

#include <Arduino.h>
#include <SPIFFS.h>

class TamperDetection {
private:
  uint8_t switchPin;
  bool enabled;
  bool tampered;
  uint8_t activeReadCount;
  uint8_t requiredActiveReads;
  unsigned long lastCheck;
  unsigned long checkInterval;

public:
  TamperDetection(uint8_t pin, bool enable = true);

  void begin();
  bool isTampered();
  void check();
  void wipeData();
  void setEnabled(bool enable);
  bool isEnabled();

private:
  bool switchActivated();
};

#endif // TAMPER_DETECTION_H
