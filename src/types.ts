export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export type SlotStatus = 'available' | 'reserved' | 'occupied';

export interface ParkingSlot {
  slot_id: string;
  status: SlotStatus;
  location: string;
  current_booking_id?: string;
  assigned_user_id?: string;
  last_updated?: string;
  manual_override?: boolean;
}

export type BookingStatus = 'active' | 'completed' | 'cancelled';

export interface Booking {
  booking_id: string;
  user_id: string;
  user_name?: string;
  slot_id: string;
  booking_time: string; // ISO String
  expiry_time: string;  // ISO String
  status: BookingStatus;
  qr_code: string;
}

export interface ParkingNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'success' | 'warning' | 'info';
  read: boolean;
}

export interface AdminStats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  occupancyRate: number;
  slotStatusCounts: {
    available: number;
    reserved: number;
    occupied: number;
  };
  dailyBookings: { date: string; bookings: number }[];
  weeklyBookings: { day: string; bookings: number }[];
  peakHours: { hour: string; count: number }[];
}

export interface ESP32Event {
  slot_id: string;
  status: 'occupied' | 'available' | 'reserved';
  timestamp: string;
}
