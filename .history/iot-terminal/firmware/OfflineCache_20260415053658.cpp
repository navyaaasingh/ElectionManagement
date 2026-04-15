#include "OfflineCache.h"
#include "config.h"

OfflineCache::OfflineCache(const char *filename) {
  cacheFile = String(filename);
  initialized = false;
  voteCount = 0;
}

/**
 * Initialize SPIFFS filesystem
 */
bool OfflineCache::begin() {
  Serial.println("\n💾 Initializing offline storage...");

  if (!SPIFFS.begin(true)) {
    Serial.println("❌ SPIFFS initialization failed");
    return false;
  }

  Serial.println("✅ SPIFFS initialized");

  // Show storage info
  size_t totalBytes = SPIFFS.totalBytes();
  size_t usedBytes = SPIFFS.usedBytes();

  Serial.print("   Total: ");
  Serial.print(totalBytes / 1024);
  Serial.println(" KB");
  Serial.print("   Used: ");
  Serial.print(usedBytes / 1024);
  Serial.println(" KB");
  Serial.print("   Free: ");
  Serial.print((totalBytes - usedBytes) / 1024);
  Serial.println(" KB");

  initialized = true;
  loadCache();

  return true;
}

/**
 * Add vote to offline cache
 */
bool OfflineCache::addVote(String voterId, String candidateId,
                           String biometricHash, String timestamp) {
  if (!initialized) {
    Serial.println("❌ Offline cache not initialized");
    return false;
  }

  if (voteCount >= MAX_OFFLINE_VOTES) {
    Serial.println("❌ Offline cache full!");
    return false;
  }

  Serial.println("💾 Caching vote offline...");

  // Load existing cache
  StaticJsonDocument<4096> doc;

  File file = SPIFFS.open(cacheFile, "r");
  if (file) {
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
      Serial.println("⚠️ Cache file corrupt, creating new one");
      doc.clear();
    }
  }

  // Add new vote
  JsonArray votes = doc["votes"].as<JsonArray>();
  if (!votes) {
    votes = doc.createNestedArray("votes");
  }

  JsonObject vote = votes.createNestedObject();
  vote["voterId"] = voterId;
  vote["candidateId"] = candidateId;
  vote["biometricHash"] = biometricHash;
  vote["timestamp"] = timestamp;
  vote["terminalId"] = TERMINAL_ID;

  // Save to file
  file = SPIFFS.open(cacheFile, "w");
  if (!file) {
    Serial.println("❌ Failed to open cache file for writing");
    return false;
  }

  serializeJson(doc, file);
  file.close();

  voteCount++;

  Serial.print("✅ Vote cached (");
  Serial.print(voteCount);
  Serial.println(" total)");

  return true;
}

/**
 * Check if there are cached votes
 */
bool OfflineCache::hasVotes() { return voteCount > 0; }

/**
 * Get number of cached votes
 */
int OfflineCache::getVoteCount() { return voteCount; }

/**
 * Get vote at index
 */
CachedVote OfflineCache::getVote(int index) {
  CachedVote vote;

  if (!initialized || index >= voteCount) {
    return vote;
  }

  File file = SPIFFS.open(cacheFile, "r");
  if (!file) {
    return vote;
  }

  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, file);
  file.close();

  if (error) {
    return vote;
  }

  JsonArray votes = doc["votes"];
  if (votes && index < votes.size()) {
    JsonObject voteObj = votes[index];
    vote.voterId = voteObj["voterId"].as<String>();
    vote.candidateId = voteObj["candidateId"].as<String>();
    vote.biometricHash = voteObj["biometricHash"].as<String>();
    vote.timestamp = voteObj["timestamp"].as<String>();
  }

  return vote;
}

/**
 * Remove vote at index (after successful sync)
 */
bool OfflineCache::removeVote(int index) {
  if (!initialized || index >= voteCount) {
    return false;
  }

  File file = SPIFFS.open(cacheFile, "r");
  if (!file) {
    return false;
  }

  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, file);
  file.close();

  if (error) {
    return false;
  }

  JsonArray votes = doc["votes"];
  if (!votes) {
    return false;
  }

  // Remove element at index
  votes.remove(index);

  // Save updated cache
  file = SPIFFS.open(cacheFile, "w");
  if (!file) {
    return false;
  }

  serializeJson(doc, file);
  file.close();

  voteCount--;

  Serial.print("🗑️ Removed cached vote (");
  Serial.print(voteCount);
  Serial.println(" remaining)");

  return true;
}

/**
 * Clear all cached votes
 */
void OfflineCache::clearAll() {
  if (!initialized) {
    return;
  }

  SPIFFS.remove(cacheFile);
  voteCount = 0;

  Serial.println("🗑️ All cached votes cleared");
}

/**
 * Load cache from file
 */
bool OfflineCache::loadCache() {
  File file = SPIFFS.open(cacheFile, "r");
  if (!file) {
    voteCount = 0;
    return false;
  }

  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, file);
  file.close();

  if (error) {
    voteCount = 0;
    return false;
  }

  JsonArray votes = doc["votes"];
  voteCount = votes ? votes.size() : 0;

  if (voteCount > 0) {
    Serial.print("📂 Loaded ");
    Serial.print(voteCount);
    Serial.println(" cached votes");
  }

  return true;
}

bool OfflineCache::saveCache() {
  // Implemented in addVote and removeVote
  return true;
}
