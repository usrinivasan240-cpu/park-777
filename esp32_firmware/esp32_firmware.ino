/**
 * Smart Parking System - ESP32 Firmware
 * 
 * This sketch runs on an ESP32 microcontroller to monitor parking slots
 * using Infrared (IR) obstacle sensors. When a vehicle is detected (or leaves),
 * it sends an HTTP POST request to the server's update endpoint:
 *   POST /api/esp32/update
 *   Body: { "slot_id": "A1", "status": "occupied" | "available" }
 * 
 * Hardware Setup:
 * - ESP32 Development Board
 * - IR Obstacle Sensors (active LOW: outputs LOW/0 when vehicle is present, HIGH/1 when slot is empty)
 * - Status LEDs (Optional): Green for available, Red for occupied.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Ensure you have the "ArduinoJson" library installed by Benoit Blanchon

const char* ssid = "Watson";
const char* password = "srini123";
// --- API CONFIGURATION ---
// Change to your deployed server URL or local server IP (e.g. "http://192.168.1.100:3000/api/esp32/update")
const char* serverUrl = "https://park-777.vercel.app/api/esp32/update";

// --- PARKING SLOTS CONFIGURATION ---
struct ParkingSlot {
  const char* slotId;
  int sensorPin;
  int redLedPin;   // Optional indicator LED
  int greenLedPin; // Optional indicator LED
  bool lastState;  // true = occupied, false = available
  unsigned long lastDebounceTime;
};

ParkingSlot slots[] = {
  { "A1", 13, 25, 27, false, 0 }, // IR=13, Red=25, Green=27
  { "A2", 14, 4,  33, false, 0 }, // IR=14, Red=4,  Green=33
  { "A3", 12, 21, 18, false, 0 }  // IR=12, Red=21, Green=18
};

const int numSlots = sizeof(slots) / sizeof(slots[0]);
const unsigned long debounceDelay = 2000; // Debounce delay in milliseconds to filter out noise / brief blocks

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Smart Parking System ESP32 Booting ---");

  // Initialize pins
  for (int i = 0; i < numSlots; i++) {
    pinMode(slots[i].sensorPin, INPUT);
    
    if (slots[i].redLedPin >= 0) {
      pinMode(slots[i].redLedPin, OUTPUT);
      digitalWrite(slots[i].redLedPin, LOW);
    }
    if (slots[i].greenLedPin >= 0) {
      pinMode(slots[i].greenLedPin, OUTPUT);
      digitalWrite(slots[i].greenLedPin, HIGH); // Default to green (available)
    }

    // Initialize initial state (read active LOW sensor)
    bool val = (digitalRead(slots[i].sensorPin) == LOW);
    slots[i].lastState = val;
    updateLedIndicator(slots[i], val);
  }

  // Connect to Wi-Fi
  connectToWiFi();
}

void loop() {
  // Verify Wi-Fi connectivity
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  unsigned long currentMillis = millis();

  // Scan all parking slots
  for (int i = 0; i < numSlots; i++) {
    // Read the IR sensor (IR sensor outputs LOW/0 when obstacle/vehicle is detected)
    bool currentState = (digitalRead(slots[i].sensorPin) == LOW);

    // If the sensor state has changed, update the debounce timer
    if (currentState != slots[i].lastState) {
      if (slots[i].lastDebounceTime == 0) {
        slots[i].lastDebounceTime = currentMillis;
      }

      // Check if state change has persisted for the debounce duration
      if ((currentMillis - slots[i].lastDebounceTime) > debounceDelay) {
        slots[i].lastState = currentState;
        slots[i].lastDebounceTime = 0; // Reset debounce timer

        // Update local LEDs
        updateLedIndicator(slots[i], currentState);

        // Send update to the backend server
        sendSlotStatusUpdate(slots[i].slotId, currentState ? "occupied" : "available");
      }
    } else {
      // Reset debounce timer if state matches last registered state
      slots[i].lastDebounceTime = 0;
    }
  }

  delay(200); // Short polling interval
}

// Helper function to update the LEDs for a slot
void updateLedIndicator(ParkingSlot &slot, bool isOccupied) {
  if (isOccupied) {
    if (slot.redLedPin >= 0) digitalWrite(slot.redLedPin, HIGH);
    if (slot.greenLedPin >= 0) digitalWrite(slot.greenLedPin, LOW);
    Serial.printf("[SLOT %s] Status updated locally: OCCUPIED\n", slot.slotId);
  } else {
    if (slot.redLedPin >= 0) digitalWrite(slot.redLedPin, LOW);
    if (slot.greenLedPin >= 0) digitalWrite(slot.greenLedPin, HIGH);
    Serial.printf("[SLOT %s] Status updated locally: AVAILABLE\n", slot.slotId);
  }
}

// Function to establish Wi-Fi Connection
void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Connection Failed! Will retry in the next loop.");
  }
}

// Function to send POST request to the central server
void sendSlotStatusUpdate(const char* slotId, const char* status) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot send update: No Wi-Fi Connection");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Create JSON document
  StaticJsonDocument<200> doc;
  doc["slot_id"] = slotId;
  doc["status"] = status;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.printf("[HTTP] Sending POST to %s with payload: %s\n", serverUrl, requestBody.c_str());

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Response code: %d\n", httpResponseCode);
    Serial.printf("[HTTP] Response: %s\n\n", response.c_str());
  } else {
    Serial.printf("[HTTP] POST failed. Error: %s\n\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}