#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Adafruit_Fingerprint.h>

// --- Configuration ---
const char* ssid = "Voting_Station";
const char* password = "password123";

// --- Pin Definitions ---
#define BTN_A 13
#define BTN_B 12
#define BTN_C 14
#define BTN_D 27

HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&amp;mySerial);

WebServer server(80);
Preferences preferences;

// --- Global Variables ---
int votesA = 0;
int votesB = 0;
int votesC = 0;
int votesD = 0;
int nextVoterID = 1; // Tracks the next available fingerprint ID

char pendingCandidate = 'X';
unsigned long buttonPressTime = 0;
const unsigned long SCAN_WAIT_TIME = 10000;

void setup() {
  Serial.begin(115200);

  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(BTN_C, INPUT_PULLUP);
  pinMode(BTN_D, INPUT_PULLUP);

  preferences.begin("election", false);
  votesA = preferences.getInt("votesA", 0);
  votesB = preferences.getInt("votesB", 0);
  votesC = preferences.getInt("votesC", 0);
  votesD = preferences.getInt("votesD", 0);
  nextVoterID = preferences.getInt("nextID", 1); // Get next available ID

  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("Found fingerprint sensor!");
  } else {
    Serial.println("Did not find fingerprint sensor :(");
    while (1) { delay(1); }
  }

  WiFi.softAP(ssid, password);
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/reset", handleReset);
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();

  if (pendingCandidate == 'X') {
    if (digitalRead(BTN_A) == LOW) { setPendingVote('A'); }
    else if (digitalRead(BTN_B) == LOW) { setPendingVote('B'); }
    else if (digitalRead(BTN_C) == LOW) { setPendingVote('C'); }
    else if (digitalRead(BTN_D) == LOW) { setPendingVote('D'); }
  }

  if (pendingCandidate != 'X') {
    if (millis() - buttonPressTime > SCAN_WAIT_TIME) {
      Serial.println("Time expired. Please press a button again.");
      pendingCandidate = 'X';
    } else {
      processFingerprint();
    }
  }
}

void setPendingVote(char candidate) {
  pendingCandidate = candidate;
  buttonPressTime = millis();
  Serial.print("Candidate ");
  Serial.print(candidate);
  Serial.println(" selected. Place finger on sensor...");
  delay(500);
}

void processFingerprint() {
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;

  p = finger.image2Tz(1); // Process the first image
  if (p != FINGERPRINT_OK) {
    Serial.println("Messy scan. Try again.");
    return;
  }

  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    // --- SCENARIO 1: FINGERPRINT FOUND IN SYSTEM ---
    int voterID = finger.fingerID;
    Serial.print("Found Voter ID #"); Serial.println(voterID);
    
    String voterKey = "voter_" + String(voterID);
    if (preferences.getBool(voterKey.c_str(), false)) {
      Serial.println("FRAUD ALERT: This fingerprint has already voted!");
      pendingCandidate = 'X';
      delay(2000);
      return;
    }
    
    castVote(voterID); // If they haven't voted, cast it (shouldn't happen often with this logic)

  } else if (p == FINGERPRINT_NOTFOUND) {
    // --- SCENARIO 2: BRAND NEW VOTER (AUTO-ENROLL) ---
    Serial.println("New voter! Lift finger, then place it again to register...");
    delay(2000); // Give them time to read the monitor and lift
    
    // Wait for finger to be removed
    while (finger.getImage() != FINGERPRINT_NOFINGER) { delay(100); }
    
    Serial.println("Place same finger again...");
    
    // Wait for finger to be placed again
    unsigned long enrollTimeout = millis();
    while (finger.getImage() != FINGERPRINT_OK) { 
      if (millis() - enrollTimeout > 5000) {
        Serial.println("Enrollment timed out.");
        pendingCandidate = 'X';
        return;
      }
      delay(100); 
    }
    
    p = finger.image2Tz(2); // Process the second image
    if (p != FINGERPRINT_OK) { Serial.println("Messy scan. Canceled."); pendingCandidate = 'X'; return; }
    
    p = finger.createModel(); // Combine both images to make the profile
    if (p == FINGERPRINT_OK) {
      p = finger.storeModel(nextVoterID); // Save it to the sensor
      if (p == FINGERPRINT_OK) {
        Serial.print("Registered as New Voter ID #"); Serial.println(nextVoterID);
        castVote(nextVoterID); // Automatically cast their vote
        
        nextVoterID++; // Bump the ID up for the next new person
        preferences.putInt("nextID", nextVoterID); // Save the counter to memory
      } else {
        Serial.println("Error saving fingerprint to sensor.");
        pendingCandidate = 'X';
      }
    } else {
      Serial.println("Fingerprints did not match. Canceled.");
      pendingCandidate = 'X';
    }
  }
}

void castVote(int voterID) {
  // Mark this specific voter as having voted
  String voterKey = "voter_" + String(voterID);
  preferences.putBool(voterKey.c_str(), true);

  // Add the vote
  if (pendingCandidate == 'A') { votesA++; preferences.putInt("votesA", votesA); }
  if (pendingCandidate == 'B') { votesB++; preferences.putInt("votesB", votesB); }
  if (pendingCandidate == 'C') { votesC++; preferences.putInt("votesC", votesC); }
  if (pendingCandidate == 'D') { votesD++; preferences.putInt("votesD", votesD); }

  Serial.println("Vote successfully recorded! Check the dashboard.");
  pendingCandidate = 'X';
  delay(2000);
}

// --- Dashboard HTML ---
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='5'>";
  html += "<style>body{font-family: Arial; text-align: center; margin-top: 50px; background-color: #f4f4f9;}";
  html += "h1{color: #333;} .card{background: white; padding: 20px; margin: 10px auto; width: 300px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);}";
  html += "h2{margin: 0; color: #0056b3;}</style></head><body>";
  html += "<h1>Live Election Dashboard</h1>";
  html += "<div class='card'><h3>Candidate A</h3><h2>" + String(votesA) + "</h2></div>";
  html += "<div class='card'><h3>Candidate B</h3><h2>" + String(votesB) + "</h2></div>";
  html += "<div class='card'><h3>Candidate C</h3><h2>" + String(votesC) + "</h2></div>";
  html += "<div class='card'><h3>Candidate D</h3><h2>" + String(votesD) + "</h2></div>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

// Hidden route to wipe the memory for a new election
void handleReset() {
  preferences.clear();
  votesA = 0; votesB = 0; votesC = 0; votesD = 0;
  nextVoterID = 1; 
  finger.emptyDatabase(); // CLEARS THE FINGERPRINT SENSOR MEMORY TOO
  server.send(200, "text/plain", "Election memory &amp; fingerprints cleared. Reboot the ESP32.");
}

