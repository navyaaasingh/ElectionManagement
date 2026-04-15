#ifndef OFFLINE_CACHE_H
#define OFFLINE_CACHE_H

#include <ArduinoJson.h>
#include <FS.h>
#include <SPIFFS.h>

struct CachedVote {
  String voterId;
  String electionId;
  String candidateId;
  String biometricHash;
  String timestamp;
};

class OfflineCache {
private:
  bool initialized;
  String cacheFile;
  int voteCount;

public:
  OfflineCache(const char *filename);

  bool begin();
  bool addVote(String voterId, String electionId, String candidateId,
               String biometricHash, String timestamp);
  bool hasVotes();
  int getVoteCount();
  CachedVote getVote(int index);
  bool removeVote(int index);
  void clearAll();
  bool syncVotes();

private:
  bool loadCache();
  bool saveCache();
};

#endif // OFFLINE_CACHE_H
