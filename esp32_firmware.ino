#include <WiFi.h>
#include <HTTPClient.h>

#define SENSOR_PIN 18
#define GREEN_LED 25
#define RED_LED 26
#define YELLOW_LED 27  // Added Yellow LED pin

const char* ssid = "Watson";
const char* password = "srini123";

// Firestore REST Endpoint for Slot A1
String firestoreUrl = "https://firestore.googleapis.com/v1/projects/parking-project-39e77/databases/(default)/documents/slots/A1";

unsigned long lastPollTime = 0;
const unsigned long pollInterval = 2000; // Poll Firestore every 2 seconds
String currentLocalStatus = "available"; 

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

// Function to update Firestore database state
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
    currentLocalStatus = statusValue; // Cache local state
  }
  http.end();
}

// Function to fetch state from Firestore
String fetchFirestoreStatus() {
  if (WiFi.status() != WL_CONNECTED) return "";

  HTTPClient http;
  http.begin(firestoreUrl);
  int httpCode = http.GET();
  
  String dbStatus = "";
  if (httpCode == 200) {
    String response = http.getString();
    
    // Parse the status value without requiring external JSON libraries
    int statusIndex = response.indexOf("\"status\"");
    if (statusIndex != -1) {
      int stringValueIndex = response.indexOf("\"stringValue\"", statusIndex);
      if (stringValueIndex != -1) {
        int quoteStart = response.indexOf("\"", stringValueIndex + 14);
        if (quoteStart != -1) {
          int quoteEnd = response.indexOf("\"", quoteStart + 1);
          if (quoteEnd != -1) {
            dbStatus = response.substring(quoteStart + 1, quoteEnd);
          }
        }
      }
    }
  }
  http.end();
  return dbStatus;
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
  // 1. Read the physical infrared/proximity sensor state
  bool vehiclePresent = (digitalRead(SENSOR_PIN) == HIGH); 
  
  // 2. Poll Firestore database every 'pollInterval' (2 seconds)
  unsigned long currentMillis = millis();
  if (currentMillis - lastPollTime >= pollInterval) {
    lastPollTime = currentMillis;
    
    String remoteStatus = fetchFirestoreStatus();
    Serial.print("Remote Firestore status: ");
    Serial.println(remoteStatus.length() > 0 ? remoteStatus : "FAIL_TO_FETCH");

    if (vehiclePresent) {
      // Vehicle is physical parked. Override database state to occupied if it isn't already.
      if (remoteStatus != "occupied") {
        Serial.println("Vehicle arrived! Updating database to occupied...");
        updateFirestore("occupied");
      }
      updateLEDs("occupied");
    } 
    else {
      // No vehicle present on the sensor
      if (remoteStatus == "reserved") {
        // Slot is reserved by a user from website, light yellow LED
        updateLEDs("reserved");
      } 
      else if (remoteStatus == "occupied") {
        // Database says occupied, but sensor says empty (e.g. vehicle just left)
        Serial.println("Vehicle departed! Updating database to available...");
        updateFirestore("available");
        updateLEDs("available");
      } 
      else {
        // Slot is available, light green LED
        updateLEDs("available");
      }
    }
  }
  
  // Minor delay to yield and avoid watchdogs
  delay(100);
}
