#include <WiFi.h>
#include <HTTPClient.h>

#define SENSOR_PIN 18
#define GREEN_LED 25
#define RED_LED 26
#define YELLOW_LED 27  // Yellow LED pin

const char* ssid = "Watson";
const char* password = "srini123";

// Firestore REST Endpoint for Slot A1
String firestoreUrl = "https://firestore.googleapis.com/v1/projects/parking-project-39e77/databases/(default)/documents/slots/A1";

unsigned long lastPollTime = 0;
const unsigned long pollInterval = 2000; // Poll Firestore every 2 seconds

// Cached status from Firestore
String remoteStatus = "available";
bool remoteManualOverride = false;

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

// Function to update Firestore database state (without changing override flag)
void updateFirestore(String statusValue) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(firestoreUrl);
  http.addHeader("Content-Type", "application/json");

  String payload =
  "{"
    "\"fields\":{"
      "\"status\":{"
        "\"stringValue\":\"" + statusValue + "\""
      "}"
    "}"
  "}";

  int httpCode = http.PATCH(payload);
  Serial.print("Firestore Status Update -> HTTP PATCH Code: ");
  Serial.println(httpCode);
  
  if (httpCode > 0) {
    remoteStatus = statusValue; // Cache local state
  }
  http.end();
}

// Function to fetch status AND manual_override flag from Firestore
void fetchFirestoreData() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(firestoreUrl);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String response = http.getString();
    
    // Parse status value without requiring external JSON libraries
    int statusIndex = response.indexOf("\"status\"");
    if (statusIndex != -1) {
      int stringValueIndex = response.indexOf("\"stringValue\"", statusIndex);
      if (stringValueIndex != -1) {
        int quoteStart = response.indexOf("\"", stringValueIndex + 14);
        if (quoteStart != -1) {
          int quoteEnd = response.indexOf("\"", quoteStart + 1);
          if (quoteEnd != -1) {
            remoteStatus = response.substring(quoteStart + 1, quoteEnd);
          }
        }
      }
    }

    // Parse manual_override boolean value
    int overrideIndex = response.indexOf("\"manual_override\"");
    if (overrideIndex != -1) {
      int boolValueIndex = response.indexOf("\"booleanValue\"", overrideIndex);
      if (boolValueIndex != -1) {
        int colonIndex = response.indexOf(":", boolValueIndex);
        if (colonIndex != -1) {
          String valPart = response.substring(colonIndex + 1, colonIndex + 10);
          valPart.trim();
          if (valPart.startsWith("true")) {
            remoteManualOverride = true;
          } else {
            remoteManualOverride = false;
          }
        }
      }
    } else {
      // If manual_override is missing from database document, default to false (sensor auto mode)
      remoteManualOverride = false;
    }
  }
  http.end();
}

// Update physical LED indicators based on state
void updateLEDs(String statusValue) {
  if (statusValue == "occupied") {
    digitalWrite(RED_LED, HIGH);
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    Serial.println("LED State: RED (Occupied)");
  } 
  else if (statusValue == "reserved") {
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, HIGH);
    Serial.println("LED State: YELLOW (Reserved)");
  } 
  else { // available
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(YELLOW_LED, LOW);
    Serial.println("LED State: GREEN (Available)");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(SENSOR_PIN, INPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);

  connectWiFi();

  // Initial LED State: Green
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);

  Serial.println("Smart Parking System Started");
}

void loop() {
  // 1. Read the physical sensor state (HIGH = car present, LOW = empty)
  bool vehiclePresent = (digitalRead(SENSOR_PIN) == HIGH); 
  
  // 2. Poll Firestore database every 2 seconds
  unsigned long currentMillis = millis();
  if (currentMillis - lastPollTime >= pollInterval) {
    lastPollTime = currentMillis;
    
    fetchFirestoreData();
    Serial.print("Remote Firestore status: ");
    Serial.print(remoteStatus);
    Serial.print(" | Manual Override: ");
    Serial.println(remoteManualOverride ? "ACTIVE" : "INACTIVE");

    if (remoteManualOverride) {
      // Locked in Manual Override mode by website administrator.
      // Do NOT send sensor data to Firestore; just update LEDs to match database value.
      updateLEDs(remoteStatus);
    } 
    else {
      // Normal Auto / Sensor Controlled Mode
      if (vehiclePresent) {
        // Vehicle is physically parked. Update database to occupied if it isn't already.
        if (remoteStatus != "occupied") {
          Serial.println("Vehicle arrived! Updating database to occupied...");
          updateFirestore("occupied");
        }
        updateLEDs("occupied");
      } 
      else {
        // No vehicle present on the sensor
        if (remoteStatus == "reserved") {
          // Slot is reserved from website, keep LED Yellow
          updateLEDs("reserved");
        } 
        else if (remoteStatus == "occupied") {
          // Database says occupied, but sensor is vacant (vehicle left). Update state.
          Serial.println("Vehicle departed! Updating database to available...");
          updateFirestore("available");
          updateLEDs("available");
        } 
        else {
          // Slot is available, keep LED Green
          updateLEDs("available");
        }
      }
    }
  }
  
  delay(100);
}
