import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { User, ParkingSlot, Booking, ParkingNotification, AdminStats, SlotStatus, BookingStatus } from "./src/types";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

let dbFirestore: any = null;
let firebaseAdminEnabled = false;

try {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = path.join(process.cwd(), "service-account.json");
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountEnv && serviceAccountEnv.trim().startsWith("{")) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountEnv))
    });
    dbFirestore = admin.firestore();
    dbFirestore.settings({ ignoreUndefinedProperties: true });
    firebaseAdminEnabled = true;
    console.log("[FIREBASE] Admin SDK initialized via FIREBASE_SERVICE_ACCOUNT_JSON environment variable.");
  } else if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8")))
    });
    dbFirestore = admin.firestore();
    dbFirestore.settings({ ignoreUndefinedProperties: true });
    firebaseAdminEnabled = true;
    console.log("[FIREBASE] Admin SDK initialized via Service Account JSON file.");
  } else if (projectId) {
    admin.initializeApp({
      projectId: projectId
    });
    dbFirestore = admin.firestore();
    dbFirestore.settings({ ignoreUndefinedProperties: true });
    firebaseAdminEnabled = true;
    console.log("[FIREBASE] Admin SDK initialized via Project ID.");
  } else {
    console.log("[FIREBASE] Configuration not found. Running in local JSON database fallback mode.");
  }
} catch (e) {
  console.error("[FIREBASE] Admin SDK failed to initialize:", e);
}

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), "data-parking.json");

app.use(express.json());

// --- Helper: JWT Token Handlers ---
const JWT_SECRET = "smart-parking-secret-key-1337";

function createToken(user: User): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token: string): any {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (signature !== expectedSig) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch (error) {
    return null;
  }
}

// Auth Middleware
function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access: Token missing" });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized access: Invalid or expired token" });
  }
  req.user = decoded;
  next();
}

// Admin Middleware
function adminMiddleware(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied: Admin permissions required" });
  }
  next();
}

// --- Local PERSISTENT Database Structure ---
interface DB {
  users: Array<any>; // stores users with passwords
  slots: Array<ParkingSlot>;
  bookings: Array<Booking>;
  notifications: Array<ParkingNotification>;
  config: {
    gracePeriodMinutes: number; // grace period before reservation auto-cancels
    hourlyRate: number;
  };
}

// Standard seed data
const initialDB: DB = {
  users: [
    {
      id: "u1",
      name: "John Doe",
      email: "user@example.com",
      password: "password123", // simplicity for demonstration
      role: "user"
    },
    {
      id: "u2",
      name: "Jane Clark",
      email: "admin@example.com",
      password: "admin123",
      role: "admin"
    }
  ],
  slots: [
    { slot_id: "A1", status: "available", location: "Floor 1 - Main Front" },
    { slot_id: "A2", status: "reserved", location: "Floor 1 - Main Front", current_booking_id: "BK-1001", assigned_user_id: "u1" },
    { slot_id: "A3", status: "occupied", location: "Floor 1 - Main Front" },
    { slot_id: "B1", status: "available", location: "Floor 1 - East Wing" },
    { slot_id: "B2", status: "available", location: "Floor 1 - East Wing" },
    { slot_id: "B3", status: "occupied", location: "Floor 1 - East Wing" },
    { slot_id: "C1", status: "available", location: "Floor 2 - Terrace" },
    { slot_id: "C2", status: "available", location: "Floor 2 - Terrace" },
    { slot_id: "C3", status: "available", location: "Floor 2 - Terrace" }
  ],
  bookings: [
    {
      booking_id: "BK-1001",
      user_id: "u1",
      slot_id: "A2",
      booking_time: new Date().toISOString(),
      expiry_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes logic
      status: "active",
      qr_code: "BK-1001-A2-u1-1337"
    },
    {
      booking_id: "BK-9999",
      user_id: "u1",
      slot_id: "B3",
      booking_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      expiry_time: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      status: "completed",
      qr_code: "BK-9999-B3-u1-99"
    }
  ],
  notifications: [
    {
      id: "n1",
      title: "Welcome to Smart Parking",
      message: "Search available spots and book ahead conveniently.",
      timestamp: new Date().toISOString(),
      type: "info",
      read: false
    }
  ],
  config: {
    gracePeriodMinutes: 2, // 2 minutes grace period for fast real-time preview demo testing
    hourlyRate: 5.0
  }
};

// Database I/O state Helpers
function loadDB(): DB {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to parse database file, resorting to initial seed", err);
  }
  saveDB(initialDB);
  return initialDB;
}

function saveDB(db: DB) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
    if (firebaseAdminEnabled && dbFirestore) {
      console.log("[FIREBASE] Syncing database state to Firestore...");
      (async () => {
        try {
          const batch = dbFirestore.batch();
          db.slots.forEach(slot => {
            batch.set(dbFirestore.collection("slots").doc(slot.slot_id), slot);
          });
          db.bookings.forEach(booking => {
            batch.set(dbFirestore.collection("bookings").doc(booking.booking_id), booking);
          });
          db.notifications.forEach(notif => {
            batch.set(dbFirestore.collection("notifications").doc(notif.id), notif);
          });
          batch.set(dbFirestore.collection("config").doc("global"), db.config);
          await batch.commit();
          console.log("[FIREBASE] Firestore database sync complete!");
        } catch (err: any) {
          console.error("[FIREBASE] Firestore sync failed. Disabling admin sync until credentials are set:", err.message);
          firebaseAdminEnabled = false;
        }
      })();
    } else {
      console.log("[FIREBASE] Admin sync skipped. firebaseAdminEnabled:", firebaseAdminEnabled);
    }
  } catch (err) {
    console.error("Failed to write to database file", err);
  }
}

// --- Init State ---
let dbState = loadDB();
saveDB(dbState);

// Add helper to create notification
function addNotification(title: string, message: string, type: 'success' | 'warning' | 'info') {
  const newNotif: ParkingNotification = {
    id: `notif_${Date.now()}`,
    title,
    message,
    timestamp: new Date().toISOString(),
    type,
    read: false
  };
  dbState.notifications.unshift(newNotif);
  if (dbState.notifications.length > 30) {
    dbState.notifications.pop();
  }
  saveDB(dbState);
}

// --- Active Background Processes (Grace Period check) ---
// Runs a background task every 3 seconds to check for expired reservations
setInterval(() => {
  const now = new Date();
  let dbChanged = false;

  dbState.bookings.forEach((booking) => {
    if (booking.status === "active") {
      const expiry = new Date(booking.expiry_time);
      if (now > expiry) {
        // Find corresponding slot status
        const slot = dbState.slots.find((s) => s.slot_id === booking.slot_id);
        
        // If still reserved (meaning the user never arrived to make it 'occupied')
        if (slot && slot.status === "reserved" && slot.current_booking_id === booking.booking_id) {
          // CANCEL booking automatically
          booking.status = "cancelled";
          slot.status = "available";
          slot.current_booking_id = undefined;
          slot.assigned_user_id = undefined;
          dbChanged = true;

          // Notify
          const user = dbState.users.find(u => u.id === booking.user_id);
          addNotification(
            "Reservation Auto-Cancelled",
            `Reservation on Slot ${booking.slot_id} has expired due to grace period timeout (${dbState.config.gracePeriodMinutes} mins).`,
            "warning"
          );
          console.log(`Auto-cancelled expired booking ${booking.booking_id} on Slot ${booking.slot_id}`);
        }
      }
    }
  });

  if (dbChanged) {
    saveDB(dbState);
  }
}, 4000);

// ============================================
//               API ROUTES
// ============================================

// 1. AUTH API
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existing = dbState.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "Email already registered" });
  }

  const newUser = {
    id: `u_${Date.now()}`,
    name,
    email,
    password,
    role: "user" as const
  };

  dbState.users.push(newUser);
  saveDB(dbState);

  const token = createToken({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
  res.status(201).json({
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email and password" });
  }

  const user = dbState.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const token = createToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.get("/api/auth/me", authMiddleware, (req: any, res) => {
  const user = dbState.users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  });
});

app.post("/api/auth/update-profile", authMiddleware, (req: any, res) => {
  const { name, email, password } = req.body;
  const userIndex = dbState.users.findIndex((u) => u.id === req.user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (name) dbState.users[userIndex].name = name;
  if (email) {
    // Check duplication
    const dup = dbState.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== req.user.id);
    if (dup) {
      return res.status(400).json({ error: "Email is already taken" });
    }
    dbState.users[userIndex].email = email;
  }
  if (password) dbState.users[userIndex].password = password;

  saveDB(dbState);
  res.json({
    message: "Profile updated successfully",
    user: {
      id: dbState.users[userIndex].id,
      name: dbState.users[userIndex].name,
      email: dbState.users[userIndex].email,
      role: dbState.users[userIndex].role
    }
  });
});


// 2. PARKING SLOTS & BOOKINGS API
app.get("/api/parking/slots", (req, res) => {
  res.json(dbState.slots);
});

app.post("/api/parking/book", authMiddleware, (req: any, res) => {
  const { slot_id, booking_minutes } = req.body;
  if (!slot_id) {
    return res.status(400).json({ error: "Slot identification is required" });
  }

  const slotIndex = dbState.slots.findIndex((s) => s.slot_id === slot_id);
  if (slotIndex === -1) {
    return res.status(404).json({ error: "Parking slot not found" });
  }

  const slot = dbState.slots[slotIndex];
  if (slot.status !== "available") {
    return res.status(400).json({ error: `Parking slot ${slot_id} is currently ${slot.status}` });
  }

  // Double booking validation
  const existingActive = dbState.bookings.find(
    (b) => b.user_id === req.user.id && b.status === "active"
  );
  if (existingActive) {
    return res.status(400).json({ error: "You currently have an active parking booking. Please complete or cancel it first." });
  }

  const minutes = booking_minutes || 60; // default 60 mins
  const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date();
  
  // Expiry includes grace period!
  const totalDurationMinutes = minutes + dbState.config.gracePeriodMinutes;
  const expiry = new Date(now.getTime() + totalDurationMinutes * 60 * 1000);

  const newBooking: Booking = {
    booking_id: bookingId,
    user_id: req.user.id,
    slot_id,
    booking_time: now.toISOString(),
    expiry_time: expiry.toISOString(),
    status: "active",
    qr_code: `BK-QR-${bookingId}-${slot_id}-${req.user.id}`
  };

  // Update Slot
  dbState.slots[slotIndex].status = "reserved";
  dbState.slots[slotIndex].current_booking_id = bookingId;
  dbState.slots[slotIndex].assigned_user_id = req.user.id;
  dbState.slots[slotIndex].last_updated = now.toISOString();

  // Save Booking
  dbState.bookings.push(newBooking);
  saveDB(dbState);

  // Send Notification
  addNotification(
    "Booking Confirmed!",
    `Slot ${slot_id} is reserved for you. Drive over! Your grace period expires strictly at ${expiry.toLocaleTimeString()}`,
    "success"
  );

  res.status(201).json({
    message: "Slot booked successfully",
    booking: newBooking
  });
});

app.post("/api/parking/cancel", authMiddleware, (req: any, res) => {
  const { booking_id } = req.body;
  if (!booking_id) {
    return res.status(400).json({ error: "Booking ID is required" });
  }

  const bIdx = dbState.bookings.findIndex((b) => b.booking_id === booking_id);
  if (bIdx === -1) {
    return res.status(404).json({ error: "Booking not found" });
  }

  const booking = dbState.bookings[bIdx];
  // Validation: Only self or admin can cancel
  if (booking.user_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized operation" });
  }

  if (booking.status !== "active") {
    return res.status(400).json({ error: `Booking is already ${booking.status}` });
  }

  // Update booking
  dbState.bookings[bIdx].status = "cancelled";

  // Free up corresponding slot
  const sIdx = dbState.slots.findIndex((s) => s.slot_id === booking.slot_id);
  if (sIdx !== -1) {
    const slot = dbState.slots[sIdx];
    if (slot.current_booking_id === booking_id) {
      dbState.slots[sIdx].status = "available";
      dbState.slots[sIdx].current_booking_id = undefined;
      dbState.slots[sIdx].assigned_user_id = undefined;
      dbState.slots[sIdx].last_updated = new Date().toISOString();
    }
  }

  saveDB(dbState);
  addNotification(
    "Booking Cancelled",
    `Booking id ${booking_id} on slot ${booking.slot_id} has been cancelled.`,
    "info"
  );

  res.json({ message: "Booking cancelled successfully", booking: dbState.bookings[bIdx] });
});

app.get("/api/parking/history", authMiddleware, (req: any, res) => {
  const history = dbState.bookings
    .filter((b) => b.user_id === req.user.id)
    .map((b) => {
      return {
        ...b,
        user_name: dbState.users.find(u => u.id === b.user_id)?.name || "User"
      };
    })
    .sort((a, b) => new Date(b.booking_time).getTime() - new Date(a.booking_time).getTime());

  res.json(history);
});

// Notifications API
app.get("/api/notifications", (req, res) => {
  res.json(dbState.notifications);
});

app.post("/api/notifications/read-all", (req, res) => {
  dbState.notifications.forEach(n => n.read = true);
  saveDB(dbState);
  res.json({ message: "All read" });
});


// 3. PHYSICAL ESP32 DEVICE INTEGRATION (REST API FOR ESP32 DEVICES)
// Receives updates from IR sensors e.g. POST /api/esp32/update
app.post("/api/esp32/update", (req, res) => {
  const { slot_id, status } = req.body;
  if (!slot_id || !status) {
    return res.status(400).json({ error: "Missing required parameters: slot_id and status" });
  }

  const currentStatusString = ['available', 'reserved', 'occupied'].includes(status.toLowerCase()) 
    ? status.toLowerCase() as SlotStatus
    : null;

  if (!currentStatusString) {
    return res.status(400).json({ error: "Invalid status value: must be 'available', 'reserved', or 'occupied'" });
  }

  const sIdx = dbState.slots.findIndex((s) => s.slot_id.toUpperCase() === slot_id.toUpperCase());
  if (sIdx === -1) {
    return res.status(404).json({ error: `Parking slot ${slot_id} not registered in database` });
  }

  const slot = dbState.slots[sIdx];
  const oldStatus = slot.status;
  const nowStr = new Date().toISOString();

  console.log(`[ESP32 TRIGGER] Hardware reporting Slot ${slot_id} transitioned from ${oldStatus} -> ${status}`);

  // --- Dynamic Hardware Business Rules ---
  if (status === "occupied") {
    // 1. "When the ESP32 reports vehicle detection in a reserved slot, update status from Reserved to Occupied."
    if (oldStatus === "reserved") {
      slot.status = "occupied";
      slot.last_updated = nowStr;
      
      // Mark current booking as checked-in/active
      if (slot.current_booking_id) {
        const bIdx = dbState.bookings.findIndex(b => b.booking_id === slot.current_booking_id);
        if (bIdx !== -1) {
          addNotification(
            "Arrived & Checked In",
            `Vehicle detected! Welcome to Slot ${slot_id}. Sensor checked in successfully.`,
            "success"
          );
        }
      }
    } else if (oldStatus === "available") {
      // Direct rogue parking or instant occupancy without reservation
      slot.status = "occupied";
      slot.last_updated = nowStr;
      addNotification(
        "Instant Slot Occupied",
        `A vehicle has parked directly in Slot ${slot_id} without prior booking.`,
        "info"
      );
    }
  } else if (status === "available") {
    // 2. "When the vehicle leaves, update status from Occupied to Available."
    if (oldStatus === "occupied") {
      slot.status = "available";
      slot.last_updated = nowStr;

      // Complete any active booking associated
      if (slot.current_booking_id) {
        const bIdx = dbState.bookings.findIndex(b => b.booking_id === slot.current_booking_id);
        if (bIdx !== -1) {
          dbState.bookings[bIdx].status = "completed";
          addNotification(
            "Departure Complete",
            `Vehicle left! Slot ${slot_id} is now available. Thank you for using Smart Parking.`,
            "info"
          );
        }
      } else {
        addNotification(
          "Slot Cleared",
          `Vehicle has vacated Slot ${slot_id}. Spot is available.`,
          "success"
        );
      }
      
      slot.current_booking_id = undefined;
      slot.assigned_user_id = undefined;
    } else if (oldStatus === "reserved") {
      // Incorrect state reset or booking cancel
      slot.status = "available";
      slot.last_updated = nowStr;
      
      if (slot.current_booking_id) {
        const bIdx = dbState.bookings.findIndex(b => b.booking_id === slot.current_booking_id);
        if (bIdx !== -1) {
          dbState.bookings[bIdx].status = "cancelled";
        }
      }
      slot.current_booking_id = undefined;
      slot.assigned_user_id = undefined;
    }
  } else if (status === "reserved") {
    // Treat as reserved manually by system admin or trigger
    slot.status = "reserved";
    slot.last_updated = nowStr;
  }

  saveDB(dbState);

  res.json({
    success: true,
    slot_id: slot.slot_id,
    previous_status: oldStatus,
    new_status: slot.status,
    timestamp: nowStr
  });
});

// Direct simulator route for testing inside application context UI
app.post("/api/esp32/simulate", (req, res) => {
  const { slot_id, action } = req.body;
  if (!slot_id || !action) {
    return res.status(400).json({ error: "Missing parameters: slot_id and action" });
  }

  // Map user actions to hardware sensor readings
  let status: 'occupied' | 'available' | 'reserved' = 'available';
  if (action === "car_arrive") {
    status = "occupied";
  } else if (action === "car_leave") {
    status = "available";
  } else if (action === "reserve") {
    status = "reserved";
  }

  // Forward to standard update route handler directly
  const sIdx = dbState.slots.findIndex((s) => s.slot_id.toUpperCase() === slot_id.toUpperCase());
  if (sIdx === -1) {
    return res.status(404).json({ error: `Slot ${slot_id} not found` });
  }

  // Trigger local logic
  const responseData: any = {
    slot_id,
    status,
    timestamp: new Date().toISOString()
  };

  // Emulate physical API call
  const updateReq = { body: responseData };
  const updateRes = {
    status: (code: number) => ({
      json: (data: any) => res.status(code).json(data)
    }),
    json: (data: any) => res.json(data)
  };

  // We reuse actual ESP32 router handler logic
  const handleESP32 = (reqBody: any) => {
    const slotIdx = dbState.slots.findIndex((s) => s.slot_id === reqBody.slot_id);
    const currSlot = dbState.slots[slotIdx];
    const prevStatus = currSlot.status;

    if (reqBody.status === "occupied") {
      currSlot.status = "occupied";
      if (prevStatus === "reserved") {
        addNotification(
          "[ESP32 Sensor] Arrived",
          `Check-in successful! Car detected at Reserved space ${reqBody.slot_id}.`,
          "success"
        );
      } else {
        addNotification(
          "[ESP32 Sensor] Rogue Vehicle Detected",
          `Rogue car docked straight into empty Slot ${reqBody.slot_id}!`,
          "warning"
        );
      }
    } else if (reqBody.status === "available") {
      currSlot.status = "available";
      
      if (currSlot.current_booking_id) {
        const bIdx = dbState.bookings.findIndex(b => b.booking_id === currSlot.current_booking_id);
        if (bIdx !== -1) {
          dbState.bookings[bIdx].status = "completed";
          addNotification(
            "[ESP32 Sensor] Departed",
            `Car left Slot ${reqBody.slot_id}. Booking verified complete.`,
            "success"
          );
        }
      } else {
        addNotification(
          "[ESP32 Sensor] Slot Available",
          `Sensor reports Slot ${reqBody.slot_id} is clear and open.`,
          "info"
        );
      }
      currSlot.current_booking_id = undefined;
      currSlot.assigned_user_id = undefined;
    }
    
    currSlot.last_updated = new Date().toISOString();
    saveDB(dbState);
    return {
      success: true,
      slot_id: reqBody.slot_id,
      previous_status: prevStatus,
      new_status: currSlot.status,
      timestamp: currSlot.last_updated
    };
  };

  const result = handleESP32(responseData);
  res.json(result);
});


// 4. ADMIN FEATURES API
app.get("/api/admin/bookings", authMiddleware, adminMiddleware, (req, res) => {
  const bookingsWithNames = dbState.bookings.map((booking) => {
    const user = dbState.users.find((u) => u.id === booking.user_id);
    return {
      ...booking,
      user_name: user ? user.name : "Anonymous User",
      user_email: user ? user.email : "Undefined Email"
    };
  }).sort((a, b) => new Date(b.booking_time).getTime() - new Date(a.booking_time).getTime());

  res.json(bookingsWithNames);
});

// Add a brand new Slot
app.post("/api/admin/slots", authMiddleware, adminMiddleware, (req, res) => {
  const { slot_id, location } = req.body;
  if (!slot_id || !location) {
    return res.status(400).json({ error: "Slot ID and Location are required" });
  }

  const existing = dbState.slots.find((s) => s.slot_id.toUpperCase() === slot_id.toUpperCase());
  if (existing) {
    return res.status(400).json({ error: `Slot ${slot_id.toUpperCase()} already exists` });
  }

  const newSlot: ParkingSlot = {
    slot_id: slot_id.toUpperCase(),
    status: "available",
    location
  };

  dbState.slots.push(newSlot);
  saveDB(dbState);

  addNotification(
    "Slot Inventory Added",
    `Slot ${newSlot.slot_id} successfully added to standard parking roster.`,
    "success"
  );

  res.status(201).json(newSlot);
});

// Edit existing Slot
app.put("/api/admin/slots/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  const { location, status } = req.body;

  const sIdx = dbState.slots.findIndex((s) => s.slot_id === id);
  if (sIdx === -1) {
    return res.status(404).json({ error: "Parking slot not found" });
  }

  if (location) dbState.slots[sIdx].location = location;
  if (status && ["available", "reserved", "occupied"].includes(status)) {
    dbState.slots[sIdx].status = status;
  }

  saveDB(dbState);
  res.json(dbState.slots[sIdx]);
});

// Delete slot
app.delete("/api/admin/slots/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  const sIdx = dbState.slots.findIndex((s) => s.slot_id === id);
  if (sIdx === -1) {
    return res.status(404).json({ error: "Parking slot not found" });
  }

  dbState.slots.splice(sIdx, 1);
  saveDB(dbState);

  res.json({ message: `Slot ${id} deleted successfully` });
});

// Get configurations/edit config
app.get("/api/config", (req, res) => {
  res.json(dbState.config);
});

app.post("/api/config", authMiddleware, adminMiddleware, (req, res) => {
  const { gracePeriodMinutes, hourlyRate } = req.body;
  if (gracePeriodMinutes !== undefined) dbState.config.gracePeriodMinutes = Number(gracePeriodMinutes);
  if (hourlyRate !== undefined) dbState.config.hourlyRate = Number(hourlyRate);
  saveDB(dbState);
  res.json(dbState.config);
});

// Analytics & Dashboard Stats
app.get("/api/admin/stats", authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = dbState.users.filter(u => u.role !== 'admin').length;
  const totalBookings = dbState.bookings.length;
  
  // Calculate revenue: active/completed bookings earn hourlyRate
  const billingRate = dbState.config.hourlyRate;
  const completeBookingsCount = dbState.bookings.filter(b => b.status === "completed").length;
  const activeBookingsCount = dbState.bookings.filter(b => b.status === "active").length;
  // Let's assume on average they park for 1.5 hours
  const averageHoursPerBooking = 1.5;
  const totalRevenue = Math.round((completeBookingsCount + activeBookingsCount) * billingRate * averageHoursPerBooking * 100) / 100;

  // Calculate live occupancy rate
  const totalSlotsCount = dbState.slots.length;
  const busySlotsCount = dbState.slots.filter(s => s.status === 'occupied' || s.status === 'reserved').length;
  const occupancyRate = totalSlotsCount > 0 ? Math.round((busySlotsCount / totalSlotsCount) * 100) : 0;

  // Counts of status
  const slotStatusCounts = {
    available: dbState.slots.filter(s => s.status === 'available').length,
    reserved: dbState.slots.filter(s => s.status === 'reserved').length,
    occupied: dbState.slots.filter(s => s.status === 'occupied').length
  };

  // Standard Mock series arrays derived realistically to feed charts
  const dailyBookings = [
    { date: "May 31", bookings: Math.floor(totalBookings * 0.12) || 4 },
    { date: "Jun 01", bookings: Math.floor(totalBookings * 0.15) || 5 },
    { date: "Jun 02", bookings: Math.floor(totalBookings * 0.20) || 7 },
    { date: "Jun 03", bookings: Math.floor(totalBookings * 0.22) || 8 },
    { date: "Jun 04", bookings: Math.floor(totalBookings * 0.25) || 12 },
    { date: "Jun 05 (Today)", bookings: Math.max(completeBookingsCount + activeBookingsCount, 2) }
  ];

  const weeklyBookings = [
    { day: "Mon", bookings: Math.floor(totalBookings * 0.1) || 3 },
    { day: "Tue", bookings: Math.floor(totalBookings * 0.15) || 4 },
    { day: "Wed", bookings: Math.floor(totalBookings * 0.13) || 4 },
    { day: "Thu", bookings: Math.floor(totalBookings * 0.18) || 6 },
    { day: "Fri", bookings: Math.max(completeBookingsCount + activeBookingsCount + 2, 8) },
    { day: "Sat", bookings: Math.floor(totalBookings * 0.1) || 2 },
    { day: "Sun", bookings: Math.floor(totalBookings * 0.08) || 1 }
  ];

  const peakHours = [
    { hour: "08 AM", count: 12 },
    { hour: "10 AM", count: 19 },
    { hour: "12 PM", count: 25 },
    { hour: "02 PM", count: 16 },
    { hour: "04 PM", count: 22 },
    { hour: "06 PM", count: 28 },
    { hour: "08 PM", count: 14 }
  ];

  const stats: AdminStats = {
    totalUsers,
    totalBookings,
    totalRevenue,
    occupancyRate,
    slotStatusCounts,
    dailyBookings,
    weeklyBookings,
    peakHours
  };

  res.json(stats);
});


// ============================================
//         VITE / STATIC ROUTING ASSETS
// ============================================

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  }).then((vite) => {
    app.use(vite.middlewares);
    
    // Fallback error catching
    app.listen(PORT, "localhost", () => {
      console.log(`[DEV SERVER] Listening securely at http://localhost:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "localhost", () => {
    console.log(`[PROD SERVER] Listening securely at http://localhost:${PORT}`);
  });
}
