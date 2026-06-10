#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

const char* ssid = "Watson";
const char* password = "srini123";

// Firestore collection endpoint (Bulk GET)
const String bulkFirestoreUrl = "https://firestore.googleapis.com/v1/projects/parking-project-39e77/databases/(default)/documents/slots";
// Base endpoint for individual patch requests
const String baseFirestoreUrl = "https://firestore.googleapis.com/v1/projects/parking-project-39e77/databases/(default)/documents/slots/";

// Slot configuration structure
struct ParkingSlot {
  String id;
  int sensorPin;
  int greenLedPin;
  int yellowLedPin;
  int redLedPin;
  
  // States
  String remoteStatus;
  bool manualOverride;
  bool lastStateSentWasOccupied; // Cache to avoid redundant database writes
};

// Exact hardware wiring configuration (pins do not change):
ParkingSlot slots[] = {
  {"A1", 13, 26, 27, 25, "available", false, false},
  {"A2", 14, 32, 33, 4,  "available", false, false},
  {"A3", 12, 21, 19, 18, "available", false, false}
};
const int numSlots = sizeof(slots) / sizeof(slots[0]);

unsigned long lastPollTime = 0;
const unsigned long pollInterval = 2000; // Poll Firestore every 2 seconds

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi Connected");
  Serial.println(WiFi.localIP());
}

// Synchronize system time using NTP for accurate timestamps
void setupNTP() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Synchronizing time via NTP");
  time_t now = time(nullptr);
  // Wait until time is parsed (epochs greater than Jan 1st 2020)
  while (now < 1577836800) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println();
  Serial.println("NTP Time Synchronized");
}

// Get the current ISO-8601 UTC timestamp
String getISOTimestamp() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// Update LEDs physical outputs based on status string (from database)
void updateSlotLEDs(const ParkingSlot& slot, String statusValue) {
  if (statusValue == "occupied") {
    digitalWrite(slot.redLedPin, HIGH);
    digitalWrite(slot.greenLedPin, LOW);
    digitalWrite(slot.yellowLedPin, LOW);
  } 
  else if (statusValue == "reserved") {
    digitalWrite(slot.redLedPin, LOW);
    digitalWrite(slot.greenLedPin, LOW);
    digitalWrite(slot.yellowLedPin, HIGH);
  } 
  else { // available
    digitalWrite(slot.redLedPin, LOW);
    digitalWrite(slot.greenLedPin, HIGH);
    digitalWrite(slot.yellowLedPin, LOW);
  }
}

// Parse status and manual override flags from bulk GET response
void parseSlotFromBulk(const String& response, ParkingSlot& slot) {
  String searchStr = "/slots/" + slot.id;
  int startIdx = response.indexOf(searchStr);
  if (startIdx == -1) return;
  
  // Define end bound for parsing (limit scope to the current slot document entry)
  int endIdx = response.length();
  for (int i = 0; i < numSlots; i++) {
    if (slots[i].id != slot.id) {
      int nextIdx = response.indexOf("/slots/" + slots[i].id, startIdx);
      if (nextIdx != -1 && nextIdx < endIdx) {
        endIdx = nextIdx;
      }
    }
  }
  
  String slotChunk = response.substring(startIdx, endIdx);
  
  // Robust parsing of "status" string value
  int statusIndex = slotChunk.indexOf("\"status\"");
  if (statusIndex != -1) {
    int stringValueIndex = slotChunk.indexOf("\"stringValue\"", statusIndex);
    if (stringValueIndex != -1) {
      int colonIndex = slotChunk.indexOf(":", stringValueIndex);
      if (colonIndex != -1) {
        int quoteStart = slotChunk.indexOf("\"", colonIndex);
        if (quoteStart != -1) {
          int quoteEnd = slotChunk.indexOf("\"", quoteStart + 1);
          if (quoteEnd != -1) {
            slot.remoteStatus = slotChunk.substring(quoteStart + 1, quoteEnd);
          }
        }
      }
    }
  }
  
  // Robust parsing of "manual_override" boolean value
  int overrideIndex = slotChunk.indexOf("\"manual_override\"");
  if (overrideIndex != -1) {
    int boolValueIndex = slotChunk.indexOf("\"booleanValue\"", overrideIndex);
    if (boolValueIndex != -1) {
      int colonIndex = slotChunk.indexOf(":", boolValueIndex);
      if (colonIndex != -1) {
        String valPart = slotChunk.substring(colonIndex + 1);
        valPart.trim();
        if (valPart.startsWith("true")) {
          slot.manualOverride = true;
        } else {
          slot.manualOverride = false;
        }
      }
    }
  } else {
    slot.manualOverride = false; // Default to auto mode if omitted
  }
}

// Send GET request to fetch status/config for all slots
void fetchAllSlotsData() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(bulkFirestoreUrl);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String response = http.getString();
    for (int i = 0; i < numSlots; i++) {
      parseSlotFromBulk(response, slots[i]);
    }
  } else {
    Serial.print("Bulk Fetch Error -> HTTP GET Code: ");
    Serial.println(httpCode);
  }
  http.end();
}

// Update specific Firestore slot document via PATCH
void updateFirestoreSlot(ParkingSlot& slot, String statusValue) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = baseFirestoreUrl + slot.id + "?updateMask.fieldPaths=status&updateMask.fieldPaths=last_updated";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String isoTime = getISOTimestamp();
  String payload =
  "{"
    "\"fields\":{"
      "\"status\":{"
        "\"stringValue\":\"" + statusValue + "\""
      "},"
      "\"last_updated\":{"
        "\"stringValue\":\"" + isoTime + "\""
      "}"
    "}"
  "}";

  // Using sendRequest("PATCH", payload) for universal compatibility with all ESP32 HTTP libraries
  int httpCode = http.sendRequest("PATCH", payload);
  Serial.print("Firestore update for Slot ");
  Serial.print(slot.id);
  Serial.print(" -> HTTP PATCH Code: ");
  Serial.println(httpCode);
  
  if (httpCode == 200 || httpCode == 201) {
    slot.remoteStatus = statusValue; // Keep local cache updated
  }
  http.end();
}

void setup() {
  Serial.begin(115200);

  // Initialize GPIO pins for each slot
  for (int i = 0; i < numSlots; i++) {
    pinMode(slots[i].sensorPin, INPUT);
    pinMode(slots[i].greenLedPin, OUTPUT);
    pinMode(slots[i].yellowLedPin, OUTPUT);
    pinMode(slots[i].redLedPin, OUTPUT);
    
    // Default start state: available (Green ON)
    digitalWrite(slots[i].greenLedPin, HIGH);
    digitalWrite(slots[i].yellowLedPin, LOW);
    digitalWrite(slots[i].redLedPin, LOW);
  }

  connectWiFi();
  setupNTP();

  Serial.println("Smart Parking System Multi-Slot Upgraded Node Ready!");
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Poll Firestore database periodically
  if (currentMillis - lastPollTime >= pollInterval) {
    lastPollTime = currentMillis;
    
    // Fetch latest states from database (including manual override status)
    fetchAllSlotsData();
    
    Serial.println("\n--- Current Slots Sync Check ---");
    for (int i = 0; i < numSlots; i++) {
      // Read current physical IR sensor value (LOW = vehicle present/blocked)
      bool vehiclePresent = (digitalRead(slots[i].sensorPin) == LOW);
      
      Serial.print("Slot [");
      Serial.print(slots[i].id);
      Serial.print("] - DB Status: ");
      Serial.print(slots[i].remoteStatus);
      Serial.print(" | Manual Override: ");
      Serial.print(slots[i].manualOverride ? "ACTIVE" : "INACTIVE");
      Serial.print(" | Sensor detected vehicle: ");
      Serial.println(vehiclePresent ? "YES" : "NO");

      if (slots[i].manualOverride) {
        // 1. MANUAL OVERRIDE FORCE MODE
        // LEDs follow DB status directly. 
        // The sensor reading is completely ignored and NOT sent to the database.
        updateSlotLEDs(slots[i], slots[i].remoteStatus);
      }
      else {
        // 2. AUTO MODE (Sensor Controlled)
        // Sensor detects status changes and updates database
        if (vehiclePresent && slots[i].remoteStatus != "occupied") {
          updateFirestoreSlot(slots[i], "occupied");
        }
        else if (!vehiclePresent && slots[i].remoteStatus == "occupied") {
          updateFirestoreSlot(slots[i], "available");
        }

        // LEDs follow the updated status from the database
        updateSlotLEDs(slots[i], slots[i].remoteStatus);
      }
    }
  }
  
  delay(100);
}