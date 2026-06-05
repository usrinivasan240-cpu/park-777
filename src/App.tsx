import React, { useState, useEffect, useRef } from 'react';
import { 
  Car, 
  Clock, 
  User as UserIcon, 
  Settings, 
  LogOut, 
  LogIn, 
  Shield, 
  Bell, 
  QrCode, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Gauge, 
  TrendingUp, 
  DollarSign, 
  Activity, 
  Database,
  Cpu,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Info,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { User, ParkingSlot, Booking, ParkingNotification, AdminStats, SlotStatus } from './types';
import { isFirebaseEnabled, db, auth } from './firebase';
import { onSnapshot, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut, updateProfile, updateEmail, updatePassword } from 'firebase/auth';

export default function App() {
  // --- States ---
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('parking_token'));
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [history, setHistory] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<ParkingNotification[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [config, setConfig] = useState({ gracePeriodMinutes: 2, hourlyRate: 5.0 });

  // UI States
  const [activeTab, setActiveTab] = useState<'parking' | 'bookings' | 'admin' | 'profile'>('parking');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [filterFloor, setFilterFloor] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Forms States
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [bookingMinutes, setBookingMinutes] = useState<number>(30);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingInProcess, setBookingInProcess] = useState(false);
  const [bookingError, setBookingError] = useState('');

  // Admin Forms
  const [newSlotId, setNewSlotId] = useState('');
  const [newSlotLoc, setNewSlotLoc] = useState('');
  const [adminSlotError, setAdminSlotError] = useState('');
  const [editGrace, setEditGrace] = useState<number>(2);
  const [editRate, setEditRate] = useState<number>(5.0);
  
  // Profile Forms
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Simulator State
  const [simSlotId, setSimSlotId] = useState<string>('A1');
  const [simAction, setSimAction] = useState<'car_arrive' | 'car_leave'>('car_arrive');
  const [simStatusMsg, setSimStatusMsg] = useState<{ text: string; type: 'success' | 'refused' } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // QR Scanner State
  const [scanBookingId, setScanBookingId] = useState<string>('');
  const [scanStatusMsg, setScanStatusMsg] = useState<{ text: string; type: 'success' | 'refused' } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Appearance
  const [darkMode, setDarkMode] = useState<boolean>(
    localStorage.getItem('parking_theme') === 'dark' || true
  );

  // Poll intervals
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  // --- Theme effect ---
  useEffect(() => {
    localStorage.setItem('parking_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // --- Initial Profile Fetch & Auto Fetch Sync ---
  useEffect(() => {
    if (token) {
      fetchUserProfile();
    } else {
      setUser(null);
    }
  }, [token]);

  // Real-time Firebase Sync (if enabled)
  useEffect(() => {
    if (!isFirebaseEnabled || !db) return;

    // Listen to slots collection
    const unsubSlots = onSnapshot(collection(db, 'slots'), (snapshot) => {
      const slotsList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          slot_id: doc.id
        } as ParkingSlot;
      });
      if (snapshot.size > 0) {
        setSlots(slotsList);
        setLastSynced(new Date());
      } else {
        // Auto-populate Firestore with standard slots if empty
        const defaultSlots: ParkingSlot[] = [
          { slot_id: "A1", status: "available", location: "Floor 1 - Main Front" },
          { slot_id: "A2", status: "available", location: "Floor 1 - Main Front" },
          { slot_id: "A3", status: "available", location: "Floor 1 - Main Front" },
          { slot_id: "B1", status: "available", location: "Floor 1 - East Wing" },
          { slot_id: "B2", status: "available", location: "Floor 1 - East Wing" },
          { slot_id: "B3", status: "available", location: "Floor 1 - East Wing" },
          { slot_id: "C1", status: "available", location: "Floor 2 - Terrace" },
          { slot_id: "C2", status: "available", location: "Floor 2 - Terrace" },
          { slot_id: "C3", status: "available", location: "Floor 2 - Terrace" }
        ];
        defaultSlots.forEach(s => {
          setDoc(doc(db, 'slots', s.slot_id), s).catch(console.error);
        });
        setSlots(defaultSlots);
        setLastSynced(new Date());
      }
    }, (error) => {
      console.error("Firestore slots listener error:", error);
    });

    // Listen to notifications collection
    const unsubNotifs = onSnapshot(collection(db, 'notifications'), (snapshot) => {
      const notifsList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id
        } as ParkingNotification;
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (notifsList.length > 0) {
        setNotifications(notifsList);
      }
    }, (error) => {
      console.error("Firestore notifications listener error:", error);
    });

    // Listen to bookings collection
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const bookingsList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          booking_id: doc.id
        } as Booking;
      });
      
      // If user is admin, allBookings has everything
      if (user?.role === 'admin') {
        const sortedAll = [...bookingsList].sort((a, b) => new Date(b.booking_time).getTime() - new Date(a.booking_time).getTime());
        setAllBookings(sortedAll);
      }

      // Filter local user history
      if (user) {
        const userHistory = bookingsList
          .filter(b => b.user_id === user.id)
          .sort((a, b) => new Date(b.booking_time).getTime() - new Date(a.booking_time).getTime());
        setHistory(userHistory);
      }
    }, (error) => {
      console.error("Firestore bookings listener error:", error);
    });

    // Listen to config collection/document
    const unsubConfig = onSnapshot(doc(db, 'config', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.data() as any);
      } else {
        // Initialize default global config if it doesn't exist
        const defaultConfig = {
          gracePeriodMinutes: 15,
          hourlyRate: 5,
          iotHeartbeatIntervalMs: 5000
        };
        setDoc(doc(db, 'config', 'global'), defaultConfig).catch(console.error);
        setConfig(defaultConfig);
      }
    }, (error) => {
      console.error("Firestore config listener error:", error);
    });

    return () => {
      unsubSlots();
      unsubNotifs();
      unsubBookings();
      unsubConfig();
    };
  }, [isFirebaseEnabled, user]);

  // Real-time client-side stats calculator for Admin Dashboard when Firebase is enabled
  useEffect(() => {
    if (!isFirebaseEnabled || user?.role !== 'admin') return;

    const billingRate = config.hourlyRate || 5;
    const completeBookingsCount = allBookings.filter(b => b.status === "completed").length;
    const activeBookingsCount = allBookings.filter(b => b.status === "active").length;
    const averageHoursPerBooking = 1.5;
    const totalRevenue = Math.round((completeBookingsCount + activeBookingsCount) * billingRate * averageHoursPerBooking * 100) / 100;

    const totalSlotsCount = slots.length;
    const busySlotsCount = slots.filter(s => s.status === 'occupied' || s.status === 'reserved').length;
    const occupancyRate = totalSlotsCount > 0 ? Math.round((busySlotsCount / totalSlotsCount) * 100) : 0;

    const slotStatusCounts = {
      available: slots.filter(s => s.status === 'available').length,
      reserved: slots.filter(s => s.status === 'reserved').length,
      occupied: slots.filter(s => s.status === 'occupied').length
    };

    const totalBookings = allBookings.length;
    const uniqueUserIds = new Set(allBookings.map(b => b.user_id));
    const totalUsers = Math.max(uniqueUserIds.size, 2);

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

    setAdminStats({
      totalUsers,
      totalBookings,
      totalRevenue,
      occupancyRate,
      slotStatusCounts,
      dailyBookings,
      weeklyBookings
    });
  }, [isFirebaseEnabled, user, slots, allBookings, config]);

  // Unified Poller for real-time ESP32/Slots Updates
  const syncAllData = async () => {
    if (isFirebaseEnabled && db) {
      // Data is synced in real-time by onSnapshot listeners
      setIsSyncing(true);
      setLastSynced(new Date());
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Fetch Slots
      const slotsRes = await fetch('/api/parking/slots');
      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        setSlots(slotsData);
      }

      // 2. Fetch notifications
      const notifRes = await fetch('/api/notifications');
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData);
      }

      // 3. Fetch configs
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      // If user is authenticated, fetch history
      if (token) {
        const historyRes = await fetch('/api/parking/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setHistory(historyData);
        }

        // If user is Admin, fetch bookings log + admin stats
        const decoded = parseJwt(token);
        if (decoded && decoded.role === 'admin') {
          const adminBookingsRes = await fetch('/api/admin/bookings', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (adminBookingsRes.ok) {
            const adminB = await adminBookingsRes.json();
            setAllBookings(adminB);
          }

          const statsRes = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setAdminStats(statsData);
          }
        }
      }

      setLastSynced(new Date());
    } catch (e) {
      console.error('Real-time sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isFirebaseEnabled) return; // Skip API polling when using Firebase real-time listeners
    syncAllData();
    // Real-time API Poller (Every 3 seconds to ensure rapid testing transitions show as live updates)
    const interval = setInterval(() => {
      syncAllData();
    }, 3000);
    return () => clearInterval(interval);
  }, [token, isFirebaseEnabled]);

  // Load grace and rate input sliders when config loads
  useEffect(() => {
    setEditGrace(config.gracePeriodMinutes);
    setEditRate(config.hourlyRate);
  }, [config]);

  // Helper decoded token info without full outer library
  function parseJwt(t: string): any {
    try {
      const base64Url = t.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  const fetchUserProfile = async () => {
    if (isFirebaseEnabled && auth) {
      auth.onAuthStateChanged((fbUser: any) => {
        if (fbUser) {
          const userRole = (fbUser.email === 'watson777@gmail.com' || fbUser.email === 'sriadmin@gmail.com') ? 'admin' : 'user';
          const profile = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            email: fbUser.email || '',
            role: userRole
          };
          setUser(profile);
          setProfileName(profile.name);
          setProfileEmail(profile.email);
        } else {
          setUser(null);
          setToken(null);
        }
      });
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setProfileName(data.name);
        setProfileEmail(data.email);
      } else {
        handleSignOut();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Auth Handlers ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (isFirebaseEnabled && auth) {
      try {
        if (authMode === 'login') {
          const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
          const fbUser = userCredential.user;
          const userRole = (fbUser.email === 'watson777@gmail.com' || fbUser.email === 'sriadmin@gmail.com') ? 'admin' : 'user';
          
          const profile = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            email: fbUser.email || authEmail,
            role: userRole
          };
          
          setUser(profile);
          const mockToken = fbUser.uid;
          localStorage.setItem('parking_token', mockToken);
          setToken(mockToken);
          setShowAuthModal(false);
          setAuthEmail('');
          setAuthPassword('');
          setAuthName('');
        } else {
          const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
          const fbUser = userCredential.user;
          const userRole = (fbUser.email === 'watson777@gmail.com' || fbUser.email === 'sriadmin@gmail.com') ? 'admin' : 'user';
          
          const profile = {
            id: fbUser.uid,
            name: authName || fbUser.email?.split('@')[0] || 'User',
            email: fbUser.email || authEmail,
            role: userRole
          };
          
          if (db) {
            await setDoc(doc(db, 'users', fbUser.uid), profile);
          }

          setUser(profile);
          const mockToken = fbUser.uid;
          localStorage.setItem('parking_token', mockToken);
          setToken(mockToken);
          setShowAuthModal(false);
          setAuthEmail('');
          setAuthPassword('');
          setAuthName('');
        }
      } catch (err: any) {
        setAuthError(err.message || 'Firebase Authentication failed.');
      }
      return;
    }

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login' 
      ? { email: authEmail, password: authPassword }
      : { name: authName, email: authEmail, password: authPassword };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication occurred an error');
      } else {
        localStorage.setItem('parking_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setShowAuthModal(false);
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
        setTimeout(() => syncAllData(), 300);
      }
    } catch (err) {
      setAuthError('Connection failed. Please verify status.');
    }
  };

  const handleSignOut = () => {
    if (isFirebaseEnabled && auth) {
      fbSignOut(auth).catch(console.error);
    }
    localStorage.removeItem('parking_token');
    setToken(null);
    setUser(null);
    setHistory([]);
    setAllBookings([]);
    setAdminStats(null);
    setActiveTab('parking');
  };

  // --- Profile update ---

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess('');
    setProfileError('');

    if (isFirebaseEnabled && auth && auth.currentUser) {
      try {
        const currentUser = auth.currentUser;
        
        // 1. Update Display Name in Firebase Auth
        await updateProfile(currentUser, { displayName: profileName });
        
        // 2. Update Email in Firebase Auth if it changed
        if (profileEmail && profileEmail !== currentUser.email) {
          await updateEmail(currentUser, profileEmail);
        }
        
        // 3. Update Password in Firebase Auth if entered
        if (profilePassword) {
          await updatePassword(currentUser, profilePassword);
        }
        
        // 4. Update Profile doc in Firestore
        if (db) {
          const userRole = (profileEmail === 'watson777@gmail.com' || profileEmail === 'sriadmin@gmail.com') ? 'admin' : 'user';
          const updatedProfile = {
            id: currentUser.uid,
            name: profileName,
            email: profileEmail,
            role: userRole
          };
          await setDoc(doc(db, 'users', currentUser.uid), updatedProfile, { merge: true });
          setUser(updatedProfile);
        }

        setProfilePassword('');
        setProfileSuccess('Profile credentials updated successfully!');
      } catch (err: any) {
        setProfileError(err.message || 'Failed to update profile.');
      }
      return;
    }

    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          password: profilePassword || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setProfilePassword('');
        setProfileSuccess('Profile credentials updated successfully!');
      } else {
        setProfileError(data.error || 'Failed to update profile.');
      }
    } catch (e) {
      setProfileError('Failed to establish server update route.');
    }
  };

  // --- Booking creation/cancellation Handlers ---
  const handleOpenBooking = (slotId: string) => {
    if (!token) {
      setShowAuthModal(true);
      setAuthMode('login');
      return;
    }
    const targetSlot = slots.find(s => s.slot_id === slotId);
    if (!targetSlot || targetSlot.status !== 'available') return;
    
    // Check double booking rule
    const activeBooking = history.find(b => b.status === 'active');
    if (activeBooking) {
      alert(`Double Booking Blocked: You already hold an active reservation for ${activeBooking.slot_id}. Please resolve or cancel it before reserving another space!`);
      return;
    }

    setSelectedSlot(slotId);
    setShowBookingModal(true);
    setBookingMinutes(30);
    setBookingError('');
  };

  const handleConfirmReservation = async () => {
    if (!selectedSlot) return;
    setBookingInProcess(true);
    setBookingError('');

    if (isFirebaseEnabled && db && user) {
      try {
        const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
        const expiry = new Date(Date.now() + (bookingMinutes + config.gracePeriodMinutes) * 60000);
        
        const newBooking: Booking = {
          booking_id: bookingId,
          user_id: user.id,
          slot_id: selectedSlot,
          booking_time: new Date().toISOString(),
          expiry_time: expiry.toISOString(),
          status: 'active',
          qr_code: `BK-QR-${bookingId}-${selectedSlot}-${user.id}`
        };

        const slot = slots.find(s => s.slot_id === selectedSlot);
        if (slot) {
          const updatedSlot = {
            ...slot,
            status: 'reserved' as const,
            current_booking_id: bookingId,
            assigned_user_id: user.id,
            last_updated: new Date().toISOString()
          };
          await setDoc(doc(db, 'slots', selectedSlot), updatedSlot);
        }
        
        await setDoc(doc(db, 'bookings', bookingId), newBooking);
        
        const newNotif = {
          id: `notif_${Date.now()}`,
          title: "Booking Confirmed!",
          message: `Slot ${selectedSlot} is reserved for you. Drive over! Your grace period expires strictly at ${expiry.toLocaleTimeString()}`,
          timestamp: new Date().toISOString(),
          type: 'success' as const,
          read: false
        };
        await setDoc(doc(db, 'notifications', newNotif.id), newNotif);

        setShowBookingModal(false);
      } catch (err: any) {
        setBookingError(err.message || 'Failed to complete booking reservation.');
      } finally {
        setBookingInProcess(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/parking/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slot_id: selectedSlot,
          booking_minutes: bookingMinutes
        })
      });
      const data = await res.json();
      if (res.ok) {
        setShowBookingModal(false);
        syncAllData();
      } else {
        setBookingError(data.error || 'Failed to complete booking reservation.');
      }
    } catch (e) {
      setBookingError('Dynamic backend reservation connection failed.');
    } finally {
      setBookingInProcess(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you absolutely sure you want to cancel this booking and surrender your parking space?')) return;

    if (isFirebaseEnabled && db) {
      try {
        const booking = allBookings.find(b => b.booking_id === bookingId) || history.find(b => b.booking_id === bookingId);
        if (booking) {
          await setDoc(doc(db, 'bookings', bookingId), {
            ...booking,
            status: 'cancelled' as const
          });

          const slot = slots.find(s => s.slot_id === booking.slot_id);
          if (slot && slot.current_booking_id === bookingId) {
            const updatedSlot = {
              ...slot,
              status: 'available' as const,
              current_booking_id: null,
              assigned_user_id: null,
              last_updated: new Date().toISOString()
            };
            await setDoc(doc(db, 'slots', booking.slot_id), updatedSlot);
          }
        }
      } catch (err: any) {
        alert(err.message || 'Failed to cancel booking.');
      }
      return;
    }

    try {
      const res = await fetch('/api/parking/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ booking_id: bookingId })
      });
      if (res.ok) {
        syncAllData();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to cancel booking.');
      }
    } catch (e) {
      alert('Network transmission failed.');
    }
  };

  const handleExpireBooking = async (bookingId: string) => {
    if (isFirebaseEnabled && db) {
      try {
        const booking = allBookings.find(b => b.booking_id === bookingId) || history.find(b => b.booking_id === bookingId);
        if (booking && booking.status === 'active') {
          await setDoc(doc(db, 'bookings', bookingId), {
            ...booking,
            status: 'cancelled' as const
          });

          const slot = slots.find(s => s.slot_id === booking.slot_id);
          if (slot && slot.current_booking_id === bookingId) {
            const updatedSlot = {
              ...slot,
              status: 'available' as const,
              current_booking_id: null,
              assigned_user_id: null,
              last_updated: new Date().toISOString()
            };
            await setDoc(doc(db, 'slots', booking.slot_id), updatedSlot);
          }

          // Add a notification for grace period expiration
          const newNotif = {
            id: `notif_${Date.now()}`,
            title: "Reservation Expired",
            message: `The booking reservation ${bookingId} on Slot ${booking.slot_id} has expired and was auto-cancelled.`,
            timestamp: new Date().toISOString(),
            type: 'warning' as const,
            read: false
          };
          await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
        }
      } catch (err: any) {
        console.error('Failed to auto-expire booking:', err);
      }
      return;
    }

    try {
      await fetch('/api/parking/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ booking_id: bookingId })
      });
      syncAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // --- ESP32 IR Sensor Real-Time Hardware Simulator Engine ---
  const handleTransmitSimulate = async () => {
    setIsSimulating(true);
    setSimStatusMsg(null);
    try {
      const uSlotId = simSlotId.toUpperCase();
      let status: 'occupied' | 'available' | 'reserved' = 'available';
      if (simAction === "car_arrive") {
        status = "occupied";
      } else if (simAction === "car_leave") {
        status = "available";
      } else if (simAction === "reserve") {
        status = "reserved";
      }

      if (isFirebaseEnabled && db) {
        const slotRef = doc(db, 'slots', uSlotId);
        const slotObj = slots.find(s => s.slot_id === uSlotId);
        const prevStatus = slotObj ? slotObj.status : 'available';

        let updateData: any = {
          status: status,
          last_updated: new Date().toISOString()
        };

        let notifTitle = '';
        let notifMsg = '';
        let notifType: 'success' | 'warning' | 'info' = 'info';

        if (status === "occupied") {
          if (prevStatus === "reserved") {
            notifTitle = "[ESP32 Sensor] Arrived";
            notifMsg = `Check-in successful! Car detected at Reserved space ${uSlotId}.`;
            notifType = "success";
          } else {
            notifTitle = "[ESP32 Sensor] Rogue Vehicle Detected";
            notifMsg = `Rogue car docked straight into empty Slot ${uSlotId}!`;
            notifType = "warning";
          }
        } else if (status === "available") {
          const bookingId = slotObj?.current_booking_id;
          if (bookingId) {
            const bookingRef = doc(db, 'bookings', bookingId);
            await setDoc(bookingRef, { status: 'completed' }, { merge: true });
            
            notifTitle = "[ESP32 Sensor] Departed";
            notifMsg = `Car left Slot ${uSlotId}. Booking verified complete.`;
            notifType = "success";
          } else {
            notifTitle = "[ESP32 Sensor] Slot Available";
            notifMsg = `Sensor reports Slot ${uSlotId} is clear and open.`;
            notifType = "info";
          }
          updateData.current_booking_id = null;
          updateData.assigned_user_id = null;
        }

        await setDoc(slotRef, updateData, { merge: true });

        if (notifTitle) {
          const newNotif = {
            id: `notif_${Date.now()}`,
            title: notifTitle,
            message: notifMsg,
            timestamp: new Date().toISOString(),
            type: notifType,
            read: false
          };
          await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
        }

        setSimStatusMsg({
          text: `ESP-NOW Transmit Successful: Slot ${uSlotId} status updated to [${status.toUpperCase()}].`,
          type: 'success'
        });
        return;
      }

      const res = await fetch('/api/esp32/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: simSlotId,
          action: simAction
        })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setSimStatusMsg({
          text: `ESP-NOW Transmit Successful: Slot ${simSlotId} status updated to [${data.new_status.toUpperCase()}].`,
          type: 'success'
        });
        // Pull updates instantly
        syncAllData();
      } else {
        setSimStatusMsg({
          text: `Hardware Rejected: ${data.error || 'Incorrect state transition map.'}`,
          type: 'refused'
        });
      }
    } catch (e) {
      setSimStatusMsg({
        text: 'ESP32 Device Node offline or out-of-range.',
        type: 'refused'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleScanQR = async () => {
    if (!scanBookingId.trim()) {
      setScanStatusMsg({ text: 'Please enter a valid Booking Token or select one.', type: 'refused' });
      return;
    }
    setIsScanning(true);
    setScanStatusMsg(null);
    try {
      // Find the booking
      const booking = allBookings.find((b: any) => b.booking_id.toUpperCase() === scanBookingId.trim().toUpperCase());
      if (!booking) {
        setScanStatusMsg({ text: `Invalid QR code: Booking "${scanBookingId}" not found in system logs.`, type: 'refused' });
        setIsScanning(false);
        return;
      }

      if (booking.status !== 'active') {
        setScanStatusMsg({ text: `Rejected: Ticket is already ${booking.status.toUpperCase()}.`, type: 'refused' });
        setIsScanning(false);
        return;
      }

      // Find the slot to see if it is occupied or reserved
      const slot = slots.find(s => s.slot_id === booking.slot_id);
      if (!slot) {
        setScanStatusMsg({ text: `Associated slot ${booking.slot_id} not found.`, type: 'refused' });
        setIsScanning(false);
        return;
      }

      const action = slot.status === 'reserved' ? 'car_arrive' : 'car_leave';

      if (isFirebaseEnabled && db) {
        const uSlotId = booking.slot_id;
        const slotRef = doc(db, 'slots', uSlotId);
        
        let newStatus: 'occupied' | 'available' = action === 'car_arrive' ? 'occupied' : 'available';
        let updateData: any = {
          status: newStatus,
          last_updated: new Date().toISOString()
        };

        let notifTitle = '';
        let notifMsg = '';
        let notifType: 'success' | 'warning' | 'info' = 'info';

        if (newStatus === "occupied") {
          notifTitle = "[ESP32 Sensor] Arrived";
          notifMsg = `Check-in successful! Car detected at Reserved space ${uSlotId}.`;
          notifType = "success";
        } else {
          const bookingRef = doc(db, 'bookings', booking.booking_id);
          await setDoc(bookingRef, { status: 'completed' }, { merge: true });

          notifTitle = "[ESP32 Sensor] Departed";
          notifMsg = `Car left Slot ${uSlotId}. Booking verified complete.`;
          notifType = "success";
          
          updateData.current_booking_id = null;
          updateData.assigned_user_id = null;
        }

        await setDoc(slotRef, updateData, { merge: true });

        if (notifTitle) {
          const newNotif = {
            id: `notif_${Date.now()}`,
            title: notifTitle,
            message: notifMsg,
            timestamp: new Date().toISOString(),
            type: notifType,
            read: false
          };
          await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
        }

        const statusVerb = action === 'car_arrive' ? 'CHECKED IN (Occupied)' : 'CHECKED OUT (Available)';
        setScanStatusMsg({
          text: `QR Scan Validated! Booking ${booking.booking_id} has been ${statusVerb} successfully at Slot ${booking.slot_id}.`,
          type: 'success'
        });
        setIsScanning(false);
        return;
      }

      const res = await fetch('/api/esp32/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: booking.slot_id,
          action: action
        })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        const statusVerb = action === 'car_arrive' ? 'CHECKED IN (Occupied)' : 'CHECKED OUT (Available)';
        setScanStatusMsg({
          text: `QR Scan Validated! Booking ${booking.booking_id} has been ${statusVerb} successfully at Slot ${booking.slot_id}.`,
          type: 'success'
        });
        syncAllData();
      } else {
        setScanStatusMsg({
          text: `Verification Refused: ${data.error || 'Failed to trigger gate status.'}`,
          type: 'refused'
        });
      }
    } catch (e) {
      setScanStatusMsg({ text: 'Error communicating with validation server.', type: 'refused' });
    } finally {
      setIsScanning(false);
    }
  };


  // --- Admin Roster & Configurations Handlers ---
  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSlotError('');
    if (!newSlotId || !newSlotLoc) {
      setAdminSlotError('Fill in clean values.');
      return;
    }

    if (isFirebaseEnabled && db) {
      try {
        const uSlotId = newSlotId.toUpperCase();
        const newSlotObj = {
          slot_id: uSlotId,
          status: 'available' as const,
          location: newSlotLoc
        };
        await setDoc(doc(db, 'slots', uSlotId), newSlotObj);
        
        const newNotif = {
          id: `notif_${Date.now()}`,
          title: "Slot Inventory Added",
          message: `Slot ${uSlotId} successfully added to standard parking roster.`,
          timestamp: new Date().toISOString(),
          type: 'success' as const,
          read: false
        };
        await setDoc(doc(db, 'notifications', newNotif.id), newNotif);

        setNewSlotId('');
        setNewSlotLoc('');
      } catch (err: any) {
        setAdminSlotError(err.message || 'Failed to add slot to Firebase.');
      }
      return;
    }

    try {
      const res = await fetch('/api/admin/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ slot_id: newSlotId, location: newSlotLoc })
      });
      const data = await res.json();
      if (res.ok) {
        setNewSlotId('');
        setNewSlotLoc('');
        syncAllData();
      } else {
        setAdminSlotError(data.error || 'Refused to append slot node.');
      }
    } catch (e) {
      setAdminSlotError('Fail communicating admin portal.');
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm(`Confirm absolute deletion of slot node ${slotId} from system index?`)) return;

    if (isFirebaseEnabled && db) {
      try {
        await deleteDoc(doc(db, 'slots', slotId));
      } catch (err: any) {
        alert(err.message || 'Failed to delete slot from Firebase.');
      }
      return;
    }

    try {
      const res = await fetch(`/api/admin/slots/${slotId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        syncAllData();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed.');
      }
    } catch (e) {
      alert('Fail.');
    }
  };

  const handleManualSlotStatusChange = async (slotId: string, newStatus: SlotStatus | 'release') => {
    if (isFirebaseEnabled && db) {
      try {
        const slotRef = doc(db, 'slots', slotId);
        
        if (newStatus === 'release') {
          await setDoc(slotRef, {
            manual_override: false,
            last_updated: new Date().toISOString()
          }, { merge: true });

          const newNotif = {
            id: `notif_${Date.now()}`,
            title: "[Admin] Sensor Control Released",
            message: `Manual control on Slot ${slotId} released. Hardware sensor control resumed.`,
            timestamp: new Date().toISOString(),
            type: 'info' as const,
            read: false
          };
          await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
        } else {
          await setDoc(slotRef, {
            status: newStatus,
            manual_override: true,
            last_updated: new Date().toISOString()
          }, { merge: true });

          // Add a notification for manual status override
          const newNotif = {
            id: `notif_${Date.now()}`,
            title: "[Admin] Manual State Override",
            message: `Slot ${slotId} was manually updated to [${newStatus.toUpperCase()}] and locked by administrator.`,
            timestamp: new Date().toISOString(),
            type: newStatus === 'available' ? 'success' : newStatus === 'reserved' ? 'info' : 'warning',
            read: false
          };
          await setDoc(doc(db, 'notifications', newNotif.id), newNotif);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to update slot status manually.');
      }
      return;
    }

    try {
      const res = await fetch('/api/esp32/update', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slot_id: slotId,
          status: newStatus === 'release' ? 'available' : newStatus,
          manual_override: newStatus !== 'release'
        })
      });
      if (res.ok) {
        syncAllData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update slot status manually.');
      }
    } catch (e) {
      alert('Failed to connect to API server.');
    }
  };

  const handleUpdateConfig = async () => {
    if (isFirebaseEnabled && db) {
      try {
        await setDoc(doc(db, 'config', 'global'), {
          gracePeriodMinutes: editGrace,
          hourlyRate: editRate
        }, { merge: true });
        alert('Global configuration payload compiled successfully!');
      } catch (err: any) {
        alert(err.message || 'Fail updating config.');
      }
      return;
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          gracePeriodMinutes: editGrace,
          hourlyRate: editRate
        })
      });
      if (res.ok) {
        alert('Global configuration payload compiled successfully!');
        syncAllData();
      }
    } catch (e) {
      alert('Fail updating server settings config.');
    }
  };

  const handleReadAllNotifications = async () => {
    if (isFirebaseEnabled && db) {
      try {
        for (const notif of notifications) {
          if (!notif.read) {
            await setDoc(doc(db, 'notifications', notif.id), { read: true }, { merge: true });
          }
        }
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      syncAllData();
    } catch (e) {}
  };

  // --- Calculations for user metrics panel ---
  const activeBooking = history.find(b => b.status === 'active');
  const availableSlots = slots.filter(s => s.status === 'available');
  const reservedSlots = slots.filter(s => s.status === 'reserved');
  const occupiedSlots = slots.filter(s => s.status === 'occupied');

  const filteredSlots = slots.filter(s => {
    // Floor Filter
    if (filterFloor !== 'all') {
      const floorNum = filterFloor === 'floor1' ? 'Floor 1' : 'Floor 2';
      if (!(s.location || '').toLowerCase().includes(floorNum.toLowerCase())) return false;
    }
    // Status Filter
    if (filterStatus !== 'all') {
      if (s.status !== filterStatus) return false;
    }
    // Search Term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return s.slot_id.toLowerCase().includes(search) || (s.location || '').toLowerCase().includes(search);
    }
    return true;
  });

  // Countdown clock component inside App context
  function CountdownTimer({ targetTime, onExpire }: { targetTime: string; onExpire: () => void }) {
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [secondsLeft, setSecondsLeft] = useState<number>(0);

    useEffect(() => {
      const updateTimer = () => {
        const now = new Date().getTime();
        const expiry = new Date(targetTime).getTime();
        const diff = expiry - now;

        if (diff <= 0) {
          setTimeLeft('Expired (Grace Timeout)');
          setSecondsLeft(0);
          onExpire();
          return;
        }

        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
        setSecondsLeft(diff / 1000);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [targetTime]);

    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-500 font-mono text-xs">
        <Clock size={12} className={secondsLeft < 30 ? "animate-pulse" : ""} />
        <span>Time Remaining:</span>
        <span className="font-semibold">{timeLeft}</span>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans`}>
      {/* --- Top Header Nav --- */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200 shadow-xs'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/25">
              <Car size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-display tracking-tight">ParkQuantum</h1>
                <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  ESP32 Linked
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Smart Automated IoT Parking Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark Mode toggle */}
            <button 
              id="theme-toggler"
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border transition-colors ${darkMode ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}
              title="Toggle theme"
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Sync feedback */}
            <button 
              onClick={syncAllData} 
              className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-mono transition-colors ${darkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin text-blue-500" : ""} />
              <span className="hidden md:inline">Sync {lastSynced.toLocaleTimeString()}</span>
            </button>

            {/* Authentication Indicator */}
            {user ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-semibold">{user.name}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'text-rose-500' : 'text-blue-500'}`}>
                    {user.role} Space
                  </p>
                </div>
                <button
                  id="sign-out-btn"
                  onClick={handleSignOut}
                  className={`p-2 sm:px-3 sm:py-1.5 rounded-lg border flex items-center gap-2 text-xs font-medium cursor-pointer transition-colors ${
                    darkMode ? 'border-red-500/30 text-red-400 bg-red-950/10 hover:bg-red-950/30' : 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                id="sign-in-prompt-btn"
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-shadow shadow-xs hover:shadow-md cursor-pointer"
              >
                <LogIn size={13} />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- Main Contents Container --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* --- Unified Header Notice & Booking Countdown Widget --- */}
        {activeBooking && (
          <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-600/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <QrCode size={20} />
              </div>
              <div>
                <p className="text-xs text-blue-500 uppercase tracking-widest font-bold">Your Live Parking Reservation</p>
                <h4 className="text-sm font-semibold mt-0.5">
                  Slot <span className="text-blue-500 font-mono font-bold text-lg">{activeBooking.slot_id}</span> is fully locked for your vehicle
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Arrive at the slot before countdown expires. Your ESP32 sensor logs checking-in automatically upon bumper arrival.
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <CountdownTimer 
                targetTime={activeBooking.expiry_time} 
                onExpire={() => {
                  handleExpireBooking(activeBooking.booking_id);
                }} 
              />
              <button
                onClick={() => handleCancelBooking(activeBooking.booking_id)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
              >
                Cancel Space Node
              </button>
            </div>
          </div>
        )}



        {/* --- Real-Time Analytics Dashboard Indicators (Top Widgets) --- */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-500 font-semibold font-display uppercase tracking-wider">Total Slots</span>
              <span className="p-1 px-1.5 text-[10px] rounded bg-slate-500/10 text-slate-400 font-mono font-semibold">Nodes</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display">{slots.length}</span>
              <span className="text-[10px] text-slate-400 font-medium">registered</span>
            </div>
            <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1">
              <div className="bg-slate-300 h-1 rounded-full w-full" />
            </div>
          </div>

          <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
            <div className="flex justify-between items-start">
              <span className="text-xs text-emerald-500 font-semibold font-display uppercase tracking-wider">Available</span>
              <span className="p-1 px-1.5 text-[10px] rounded bg-emerald-500/10 text-emerald-500 font-mono font-semibold">READY</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-emerald-500">{availableSlots.length}</span>
              <span className="text-[10px] text-slate-400 font-medium font-mono">{Math.round((availableSlots.length/slots.length)*100 || 0)}% free</span>
            </div>
            <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1">
              <div 
                className="bg-emerald-500 h-1 rounded-full transition-all duration-500" 
                style={{ width: `${(availableSlots.length/slots.length)*100 || 0}%` }} 
              />
            </div>
          </div>

          <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
            <div className="flex justify-between items-start">
              <span className="text-xs text-amber-500 font-semibold font-display uppercase tracking-wider">Reserved</span>
              <span className="p-1 px-1.5 text-[10px] rounded bg-amber-500/10 text-amber-500 font-mono font-semibold">GRACE</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-amber-500">{reservedSlots.length}</span>
              <span className="text-[10px] text-slate-400 font-medium">authorized</span>
            </div>
            <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1">
              <div 
                className="bg-amber-500 h-1 rounded-full transition-all duration-500" 
                style={{ width: `${(reservedSlots.length/slots.length)*100 || 0}%` }} 
              />
            </div>
          </div>

          <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
            <div className="flex justify-between items-start">
              <span className="text-xs text-red-500 font-semibold font-display uppercase tracking-wider">Occupied</span>
              <span className="p-1 px-1.5 text-[10px] rounded bg-red-500/10 text-red-500 font-mono font-semibold">SENSORS</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-red-500">{occupiedSlots.length}</span>
              <span className="text-[10px] text-slate-400 font-medium">vehicles live</span>
            </div>
            <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1">
              <div 
                className="bg-red-500 h-1 rounded-full transition-all duration-500" 
                style={{ width: `${(occupiedSlots.length/slots.length)*100 || 0}%` }} 
              />
            </div>
          </div>
        </section>

        {/* --- Tab Navigation Rail --- */}
        <div className="flex items-center justify-between border-b border-slate-800/20 mb-6 pb-px flex-wrap gap-2">
          <nav className="flex space-x-2">
            <button
              onClick={() => setActiveTab('parking')}
              className={`pb-3 px-4 text-xs font-semibold transition-all relative border-b-2 hover:text-blue-500 cursor-pointer ${
                activeTab === 'parking' 
                  ? 'border-blue-500 text-blue-500 font-bold' 
                  : 'border-transparent text-slate-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Car size={13} />
                Real-Time Decks
              </div>
            </button>

            {user && (
              <button
                onClick={() => setActiveTab('bookings')}
                className={`pb-3 px-4 text-xs font-semibold transition-all relative border-b-2 hover:text-blue-500 cursor-pointer ${
                  activeTab === 'bookings' 
                    ? 'border-blue-500 text-blue-500 font-bold' 
                    : 'border-transparent text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Activity size={13} />
                  My Booking Logs
                </div>
              </button>
            )}

            {user && user.role === 'admin' && (
              <button
                id="admin-dashboard-tab"
                onClick={() => setActiveTab('admin')}
                className={`pb-3 px-4 text-xs font-semibold transition-all relative border-b-2 hover:text-blue-500 cursor-pointer ${
                  activeTab === 'admin' 
                    ? 'border-blue-500 text-blue-500 font-bold' 
                    : 'border-transparent text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5 text-rose-500 font-semibold">
                  <Shield size={13} />
                  Admin Analytics Workspace
                </div>
              </button>
            )}

            {user && (
              <button
                onClick={() => setActiveTab('profile')}
                className={`pb-3 px-4 text-xs font-semibold transition-all relative border-b-2 hover:text-blue-500 cursor-pointer ${
                  activeTab === 'profile' 
                    ? 'border-blue-500 text-blue-500 font-bold' 
                    : 'border-transparent text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <UserIcon size={13} />
                  Profile Configuration
                </div>
              </button>
            )}
          </nav>
          
          <div className="pb-3 text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Rate: <span className="font-semibold text-blue-500">₹{config.hourlyRate?.toFixed(2)}/hr</span>
            <span className="text-slate-600">|</span>
            Grace Period: <span className="font-semibold text-amber-500">{config.gracePeriodMinutes} mins</span>
          </div>
        </div>

        {/* ========================================================
            TAB: REAL-TIME DECK MAP & HARDWARE EMULATION
           ======================================================== */}
        {activeTab === 'parking' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Block: Search and Floor Plan Layout Schematic */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Filter controls panel */}
              <div className={`p-4 rounded-xl border flex flex-wrap gap-4 items-center justify-between transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-2 max-w-xs w-full">
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search node or location..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full bg-transparent border-none text-xs focus:ring-0 focus:outline-hidden ${darkMode ? 'text-slate-100 placeholder-slate-500' : 'text-slate-950 placeholder-slate-450'}`}
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="p-0.5 hover:text-red-500">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 font-medium">Decks:</span>
                    <select
                      value={filterFloor}
                      onChange={(e) => setFilterFloor(e.target.value)}
                      className={`px-2 py-1 rounded text-xs focus:outline-hidden ${darkMode ? 'bg-slate-850 border-slate-700 text-slate-100' : 'bg-slate-100 border-slate-350'}`}
                    >
                      <option value="all" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>All Levels</option>
                      <option value="floor1" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>Deck Level 1</option>
                      <option value="floor2" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>Deck Level 2</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className={`px-2 py-1 rounded text-xs focus:outline-hidden ${darkMode ? 'bg-slate-850 border-slate-700 text-slate-100' : 'bg-slate-100 border-slate-350'}`}
                    >
                      <option value="all" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>All Statuses</option>
                      <option value="available" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>Available</option>
                      <option value="reserved" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>Reserved</option>
                      <option value="occupied" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>Occupied</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dynamic Schematic Visual Map Grid */}
              <div className={`p-6 rounded-2xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between mb-4 border-b border-slate-800/10 pb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="font-display font-semibold text-sm">Interactive Deck Floor Layout</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Click any pulsating Available green node to reserve a space instantly.</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Available</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Reserved</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Occupied</span>
                  </div>
                </div>

                {/* Simulated Road schematic map design */}
                <div className={`border p-4 rounded-xl border-dashed relative overflow-x-auto ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100/50 border-slate-350'}`}>
                  
                  {/* Outer Frame Floor Map */}
                  <div className="min-w-[600px] space-y-8">
                    
                    {/* Floor 1 Section */}
                    { (filterFloor === 'all' || filterFloor === 'floor1') && (
                      <div>
                        {/* Floor Label */}
                        <div className="flex justify-between items-center px-2 mb-2">
                          <span className="text-[10px] font-bold font-mono tracking-widest text-slate-500">DECK LEVEL 1 — FRONT & EAST GATEWAY</span>
                          <span className="text-[10px] text-slate-500 font-mono">Sensors active: {slots.filter(s => (s.location || '').toLowerCase().includes('floor 1') || s.slot_id.toUpperCase().startsWith('A') || s.slot_id.toUpperCase().startsWith('B')).length} nodes</span>
                        </div>

                        {/* Layout grid containing slots & road lanes */}
                        <div className="grid grid-cols-12 items-center gap-2">
                          
                          {/* Left Slots lane A */}
                          <div className="col-span-5 grid grid-cols-3 gap-2.5">
                            {filteredSlots
                              .filter(s => s.slot_id.toUpperCase().startsWith('A'))
                              .map(s => <ParkingSlotCard key={s.slot_id} slot={s} onClick={handleOpenBooking} />)
                            }
                            {filteredSlots.filter(s => s.slot_id.toUpperCase().startsWith('A')).length === 0 && (
                              <div className="col-span-3 py-4 text-center text-xs text-slate-500 border border-slate-800 border-dashed rounded">None found</div>
                            )}
                          </div>

                          {/* Central Roadway lane */}
                          <div className={`col-span-2 py-8 rounded-lg flex flex-col justify-between items-center font-mono text-[9px] font-bold tracking-wider ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400'}`}>
                            <span>↑ ENTRY</span>
                            <div className="h-6 border-l-2 border-dashed border-amber-500/40"></div>
                            <span>SLOW</span>
                            <div className="h-6 border-l-2 border-dashed border-amber-500/40"></div>
                            <span>↓ EXIT</span>
                          </div>

                          {/* Right Slots lane B */}
                          <div className="col-span-5 grid grid-cols-3 gap-2.5">
                            {filteredSlots
                              .filter(s => s.slot_id.toUpperCase().startsWith('B'))
                              .map(s => <ParkingSlotCard key={s.slot_id} slot={s} onClick={handleOpenBooking} />)
                            }
                            {filteredSlots.filter(s => s.slot_id.toUpperCase().startsWith('B')).length === 0 && (
                              <div className="col-span-3 py-4 text-center text-xs text-slate-500 border border-slate-800 border-dashed rounded">None found</div>
                            )}
                          </div>

                        </div>
                      </div>
                    )}

                    {/* Floor separation marker */}
                    { filterFloor === 'all' && (
                      <div className="border-t border-slate-800/20 border-dashed relative py-1 flex justify-center">
                        <span className={`px-3 py-0.5 rounded text-[9px] font-mono tracking-widest ${darkMode ? 'bg-slate-900 text-slate-500' : 'bg-white border text-slate-400'}`}>RAMP ELEVATION TO UPPER DECK</span>
                      </div>
                    )}

                    {/* Floor 2 Section */}
                    { (filterFloor === 'all' || filterFloor === 'floor2') && (
                      <div>
                        {/* Floor Label */}
                        <div className="flex justify-between items-center px-2 mb-2">
                          <span className="text-[10px] font-bold font-mono tracking-widest text-slate-500">DECK LEVEL 2 — TERRACE LANES</span>
                          <span className="text-[10px] text-slate-500 font-mono font-medium">Sensors active: {slots.filter(s => (s.location || '').toLowerCase().includes('floor 2') || s.slot_id.toUpperCase().startsWith('C')).length} nodes</span>
                        </div>

                        {/* Layout grid containing slots & road lanes */}
                        <div className="grid grid-cols-12 items-center gap-2">
                          
                          {/* West Slots Lane */}
                          <div className="col-span-5 grid grid-cols-3 gap-2.5">
                            {filteredSlots
                              .filter(s => s.slot_id.toUpperCase().startsWith('C'))
                              .slice(0, 3)
                              .map(s => <ParkingSlotCard key={s.slot_id} slot={s} onClick={handleOpenBooking} />)
                            }
                            {filteredSlots.filter(s => s.slot_id.toUpperCase().startsWith('C')).length === 0 && (
                              <div className="col-span-3 py-4 text-center text-xs text-slate-500 border border-slate-800 border-dashed rounded">None found</div>
                            )}
                          </div>

                          {/* Central Roadway lane */}
                          <div className={`col-span-2 py-8 rounded-lg flex flex-col justify-between items-center font-mono text-[9px] font-bold tracking-wider ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400'}`}>
                            <span>↑ IN</span>
                            <div className="h-4 border-l-2 border-dashed border-amber-500/40"></div>
                            <span>TURN</span>
                            <div className="h-4 border-l-2 border-dashed border-amber-500/40"></div>
                            <span>↓ OUT</span>
                          </div>

                          {/* East Slots Lane */}
                          <div className="col-span-5 grid grid-cols-3 gap-2.5">
                            {filteredSlots
                              .filter(s => s.slot_id.toUpperCase().startsWith('C'))
                              .slice(3)
                              .map(s => <ParkingSlotCard key={s.slot_id} slot={s} onClick={handleOpenBooking} />)
                            }
                            {filteredSlots.filter(s => s.slot_id.toUpperCase().startsWith('C')).slice(3).length === 0 && (
                              <div className="col-span-3 py-4 text-center text-xs text-slate-500 border border-slate-800 border-dashed rounded">None found</div>
                            )}
                          </div>

                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>

            {/* Right Block: ESP32 Hardware Emulator Control Panel & System Notifications */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* ESP32 Hardware Device Emulator Engine */}
              {user?.role === 'admin' && (
                <div className={`p-5 rounded-2xl border relative overflow-hidden transition-colors ${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-200/40 border-slate-350 shadow-inner'}`}>
                  {/* Circuit Grid Decoration */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-md pointer-events-none" />

                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1 px-1.5 rounded-md bg-blue-500/10 text-blue-500 text-[10px] font-bold font-mono uppercase tracking-widest flex items-center gap-1 border border-blue-500/20">
                      <Cpu size={12} />
                      IoT EMULATOR
                    </div>
                    <h4 className="text-xs font-mono font-bold text-slate-400">ESP32-WROOM-32</h4>
                  </div>

                  <h3 className="font-display font-semibold text-sm">ESP32 IR Sensor Array Emulator</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Avoid setup barriers. Directly simulate physical infrared barrier gates & bumper distance-sensor triggers updating the system DB in real-time.
                  </p>

                  <div className="space-y-3.5 mt-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Target IoT Slot Node</label>
                      <select
                        value={simSlotId}
                        onChange={(e) => setSimSlotId(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                      >
                        {slots.map(s => (
                          <option key={s.slot_id} value={s.slot_id} style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>
                            {s.slot_id} — Current: [{s.status.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">Action Trigger Type (Hardware signal)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSimAction('car_arrive')}
                          className={`py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            simAction === 'car_arrive'
                              ? 'bg-red-500/10 border-red-500/50 text-red-500 shadow-sm'
                              : `${darkMode ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-350' : 'bg-white border-slate-300 text-slate-600'}`
                          }`}
                        >
                          <Car size={13} className="shrink-0" />
                          Car Arrives
                        </button>

                        <button
                          type="button"
                          onClick={() => setSimAction('car_leave')}
                          className={`py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            simAction === 'car_leave'
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 shadow-sm'
                              : `${darkMode ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-350' : 'bg-white border-slate-300 text-slate-600'}`
                          }`}
                        >
                          <CheckCircle2 size={13} className="shrink-0" />
                          Car Vaults (Leaves)
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTransmitSimulate}
                      disabled={isSimulating}
                      className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:shadow-blue-500/10 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <Cpu size={14} className={isSimulating ? "animate-spin" : ""} />
                      Transmit Sensors payload
                    </button>

                    <AnimatePresence mode="wait">
                      {simStatusMsg && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2 ${
                            simStatusMsg.type === 'success'
                              ? `${darkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50/75 border-emerald-200 text-emerald-700'}`
                              : `${darkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-450' : 'bg-rose-50 border-rose-200 text-rose-700'}`
                          }`}
                        >
                          {simStatusMsg.type === 'success' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                          <span>{simStatusMsg.text}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Business rules reference box */}
                    <div className={`p-2.5 rounded-lg border text-[10px] text-slate-500 space-y-1 ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <p className="font-semibold text-slate-400 flex items-center gap-1">
                        <Sliders size={10} /> IoT Firmware Handcoded Gates:
                      </p>
                      <p>• Car Detection inside <b className="text-amber-500 font-medium">RESERVED</b> space updates status straight to <b className="text-red-500 font-medium">OCCUPIED</b>.</p>
                      <p>• Vehicle vacating <b className="text-red-500 font-medium">OCCUPIED</b> space updates it clean back to <b className="text-emerald-500 font-medium font-bold">AVAILABLE</b>, setting active reservation booking complete.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* System Live Notification Center */}
              <div className={`p-5 rounded-2xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={15} className="text-blue-500" />
                    <h3 className="font-display font-semibold text-sm">IoT Broadcast Feed</h3>
                  </div>
                  {notifications.some(n => !n.read) && (
                    <button 
                      onClick={handleReadAllNotifications} 
                      className="text-[10px] text-blue-500 hover:underline cursor-pointer"
                    >
                      Clear Badge
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`p-3 rounded-xl border text-xs transition-all relative ${
                        !notif.read ? 'border-blue-500/10 bg-blue-500/5' : `${darkMode ? 'border-slate-850 bg-slate-950/30' : 'border-slate-100 bg-slate-50'}`
                      }`}
                    >
                      <div className="flex items-center gap-1.5 justify-between">
                        <span className={`font-semibold ${
                          notif.type === 'success' ? 'text-emerald-500' : notif.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
                        }`}>
                          {notif.title}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono font-medium">
                          {new Date(notif.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-1 leading-normal text-[11px]">{notif.message}</p>
                    </div>
                  ))}

                  {notifications.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No broadcast notifications yet
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================
            TAB: USER BOOKINGS LOGS HISTORY
           ======================================================== */}
        {activeTab === 'bookings' && (
          <div className={`p-6 rounded-2xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2 className="font-display font-bold text-base">My Booking History Workspace</h2>
                <p className="text-xs text-slate-500">Track and view credentials, check-in statuses, and system receipt tallies.</p>
              </div>
              <button 
                onClick={syncAllData} 
                className="p-1 px-2.5 rounded border border-slate-800 hover:bg-slate-850 text-xs text-slate-400 flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={12} /> Sync Logs
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b capitalize font-medium ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <th className="py-3 px-4">Booking Token</th>
                    <th className="py-3 px-4">Reserved Spot</th>
                    <th className="py-3 px-4">Checked-In At</th>
                    <th className="py-3 px-4">Duration/Grace Period Limit</th>
                    <th className="py-3 px-4">Gate Ticket Badge</th>
                    <th className="py-3 px-4">Operational Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/10">
                  {history.map((log) => (
                    <tr key={log.booking_id} className={`hover:bg-slate-850/20 transition-all ${!darkMode && 'hover:bg-slate-50'}`}>
                      <td className="py-4 px-4 font-mono font-semibold text-blue-500">{log.booking_id}</td>
                      <td className="py-4 px-4">
                        <span className="font-bold text-slate-300 font-mono text-sm bg-slate-800/50 p-1 px-2 rounded">{log.slot_id}</span>
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {new Date(log.booking_time).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">
                        {new Date(log.expiry_time).toLocaleTimeString()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                          <QrCode size={13} className="text-slate-400" />
                          <span>{log.booking_id}-KEY</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          log.status === 'active' 
                            ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20 animate-pulse' 
                            : log.status === 'completed' 
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                            : 'bg-slate-800/15 text-slate-500 border border-slate-800/30'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        {log.status === 'active' && (
                          <button
                            onClick={() => handleCancelBooking(log.booking_id)}
                            className="text-red-500 hover:underline font-semibold text-xs cursor-pointer"
                          >
                            Surrender / Cancel
                          </button>
                        )}
                        {log.status !== 'active' && (
                          <span className="text-slate-500 text-[11px] font-medium">-</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {history.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                        You have not reserved any smart parking spaces yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Visual ticket print card mock */}
            {activeBooking && (
              <div className="mt-8 border-t border-slate-800/30 pt-6 flex justify-center">
                <div className={`p-6 rounded-2xl max-w-sm w-full border relative overflow-hidden ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-350'}`}>
                  {/* Circle cutouts for ticket look */}
                  <div className={`absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-full border-r ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`} />
                  <div className={`absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-full border-l ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`} />

                  <div className="text-center pb-4 border-b border-dashed border-slate-800/40">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-blue-500">GATE TICKET PASS</p>
                    <h3 className="font-display font-bold text-lg mt-0.5">ParkQuantum IoT Node</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Scan upon arrival if requested</p>
                  </div>

                  <div className="py-6 flex flex-col items-center justify-center">
                    {/* Simulated vector clean QR Code */}
                    <div className="p-3 bg-white rounded-xl border-4 border-slate-250 shadow-sm relative">
                      <div className="grid grid-cols-5 gap-1.5 w-28 h-28">
                        {/* QR Corners */}
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-300 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>

                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-white rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-white rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>

                        <div className="bg-slate-300 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-300 rounded-xs"></div>

                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-white rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-white rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>

                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-300 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                        <div className="bg-slate-950 rounded-xs"></div>
                      </div>
                      <div className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg">
                        <Car size={13} />
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 mt-2 font-semibold">TOKEN ID: {activeBooking.booking_id}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-mono border-t border-dashed border-slate-800/40 pt-4">
                    <div>
                      <p className="text-slate-500">ASSIGNED SLOT</p>
                      <p className="font-bold text-sm text-slate-300 mt-0.5">{activeBooking.slot_id}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">BOOKED AT</p>
                      <p className="font-medium mt-0.5">{new Date(activeBooking.booking_time).toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ========================================================
            TAB: ADMIN CONTROL WORKSPACE (RECHARTS ANALYTICS)
           ======================================================== */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-6">
            
            {/* Top Admin Analytics Summary metrics row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex gap-2 items-center text-slate-500 text-xs uppercase tracking-wider font-semibold font-display">
                  <UserIcon size={14} className="text-rose-500" />
                  <span>Total Users</span>
                </div>
                <div className="text-2xl font-black mt-2 font-display">{adminStats?.totalUsers || 0}</div>
                <p className="text-[10px] text-slate-500 mt-1">Excludes Operator Admin accounts</p>
              </div>

              <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex gap-2 items-center text-slate-500 text-xs uppercase tracking-wider font-semibold font-display">
                  <Activity size={14} className="text-rose-500" />
                  <span>Total Bookings</span>
                </div>
                <div className="text-2xl font-black mt-2 font-display">{adminStats?.totalBookings || 0}</div>
                <p className="text-[10px] text-slate-500 mt-1">Cumulative bookings logged</p>
              </div>

              <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex gap-2 items-center text-slate-500 text-xs uppercase tracking-wider font-semibold font-display">
                  <DollarSign size={14} className="text-emerald-500" />
                  <span>Total Revenue</span>
                </div>
                <div className="text-2xl font-black mt-2 font-display text-emerald-500">₹{adminStats?.totalRevenue?.toFixed(2) || '0.00'}</div>
                <p className="text-[10px] text-slate-500 mt-1">Calculated from hours consumed</p>
              </div>

              <div className={`p-4 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex gap-2 items-center text-slate-500 text-xs uppercase tracking-wider font-semibold font-display">
                  <Gauge size={14} className="text-blue-500" />
                  <span>Active Occupancy</span>
                </div>
                <div className="text-2xl font-black mt-2 font-display text-blue-500">{adminStats?.occupancyRate || 0}%</div>
                <p className="text-[10px] text-slate-500 mt-1">Portion of unavailable slot nodes</p>
              </div>
            </div>

            {/* Recharts Graphical Dashboards Block */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Peak Hours load graph */}
              <div className={`p-5 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-semibold text-sm">Peak Demand Hours (Schedules)</h3>
                  <span className="p-1 px-1.5 text-[9px] font-mono rounded bg-rose-500/10 text-rose-500">24-HR CLOCK MONITOR</span>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adminStats?.peakHours || []} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#1e293b" : "#edf2f7"} />
                      <XAxis dataKey="hour" stroke="#64748b" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? '#0f172a' : '#ffffff', 
                          borderColor: darkMode ? '#334155' : '#cbd5e1',
                          color: darkMode ? '#f8fafc' : '#0f172a',
                          fontSize: 11
                        }} 
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Reservations Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weekly logs timeline graphs */}
              <div className={`p-5 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-semibold text-sm">Weekly Bookings Timeline</h3>
                  <span className="p-1 px-1.5 text-[9px] font-mono rounded bg-emerald-500/10 text-emerald-500">LIVE CHRONOLOGY</span>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={adminStats?.weeklyBookings || []} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#1e293b" : "#edf2f7"} />
                      <XAxis dataKey="day" stroke="#64748b" style={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? '#0f172a' : '#ffffff', 
                          borderColor: darkMode ? '#334155' : '#cbd5e1',
                          color: darkMode ? '#f8fafc' : '#0f172a',
                          fontSize: 11
                        }} 
                      />
                      <Area type="monotone" dataKey="bookings" stroke="#10b981" fillOpacity={1} fill="url(#colorBookings)" name="Slots Booked" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Inventory Management & System Setup Configurations Router */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Global Config & QR Scanner (Col span 4) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Global Config setup sliders */}
                <div className={`p-5 rounded-xl border space-y-4 h-fit transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 border-b border-slate-800/10 pb-2.5">
                    <Settings size={14} className="text-blue-500" />
                    <h3 className="font-display font-semibold text-sm">Operator Global Parameters</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-slate-500">Hourly Multiplier (Price calculated)</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-blue-500">₹</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={0.5}
                            value={editRate}
                            onChange={(e) => setEditRate(Math.max(1, Number(e.target.value)))}
                            className={`w-16 px-1.5 py-0.5 rounded text-xs font-bold border text-right focus:outline-none ${
                              darkMode ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-slate-50 border-slate-200 text-blue-600'
                            }`}
                          />
                          <span className="font-bold text-blue-500">/hr</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        step={0.5}
                        value={editRate}
                        onChange={(e) => setEditRate(Number(e.target.value))}
                        className="w-full cursor-pointer accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-slate-500">IoT Auto Grace Expiry Period</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={60}
                            step={1}
                            value={editGrace}
                            onChange={(e) => setEditGrace(Math.max(1, Number(e.target.value)))}
                            className={`w-14 px-1.5 py-0.5 rounded text-xs font-bold border text-right focus:outline-none ${
                              darkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-slate-50 border-slate-200 text-amber-600'
                            }`}
                          />
                          <span className="font-bold text-amber-500"> mins</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={60}
                        step={1}
                        value={editGrace}
                        onChange={(e) => setEditGrace(Number(e.target.value))}
                        className="w-full cursor-pointer accent-amber-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">Time allotted for ESP32 sensors to record check-in arrival before auto-vandalizing bookings.</p>
                    </div>

                    <button
                      onClick={handleUpdateConfig}
                      className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Commit Parameters to System
                    </button>
                  </div>
                </div>

                {/* Smart QR Ticket Scanner Simulator */}
                <div className={`p-5 rounded-xl border space-y-4 h-fit transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-1.5 border-b border-slate-800/10 pb-2.5">
                    <QrCode size={14} className="text-rose-500" />
                    <h3 className="font-display font-semibold text-sm">Smart QR Ticket Scanner</h3>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Emulate gate barcode/QR code scanners. Enter or select a booking token ID below to scan and automatically process vehicle check-in or checkout gates.
                    </p>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Select Active Booking QR</label>
                      <select
                        value={scanBookingId}
                        onChange={(e) => setScanBookingId(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                      >
                        <option value="" style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>-- Choose Active Ticket --</option>
                        {allBookings.filter((b: any) => b.status === 'active').map((b: any) => (
                          <option key={b.booking_id} value={b.booking_id} style={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', color: darkMode ? '#f8fafc' : '#0f172a' }}>
                            {b.booking_id} ({b.user_name} - Slot {b.slot_id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Or enter manually:</span>
                      <input
                        type="text"
                        placeholder="e.g. BK-1001"
                        value={scanBookingId}
                        onChange={(e) => setScanBookingId(e.target.value)}
                        className={`px-2 py-1 rounded text-xs w-28 text-center focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                      />
                    </div>

                    <button
                      onClick={handleScanQR}
                      disabled={isScanning}
                      className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <QrCode size={14} className={isScanning ? "animate-pulse" : ""} />
                      {isScanning ? "Scanning Pass..." : "Validate & Scan QR Ticket"}
                    </button>

                    <AnimatePresence mode="wait">
                      {scanStatusMsg && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2 ${
                            scanStatusMsg.type === 'success'
                              ? `${darkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50/75 border-emerald-200 text-emerald-700'}`
                              : `${darkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-450' : 'bg-rose-50 border-rose-200 text-rose-700'}`
                          }`}
                        >
                          {scanStatusMsg.type === 'success' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                          <span>{scanStatusMsg.text}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

              </div>

              {/* Roster Slots Addition Inventory (Col span 8) */}
              <div className={`lg:col-span-8 p-5 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <h3 className="font-display font-semibold text-sm mb-3">Parking Node Slots Register Inventory</h3>
                
                {/* Inline Addition form */}
                <form onSubmit={handleAddSlot} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4 p-3.5 rounded-lg bg-slate-950/40 border border-slate-800/20">
                  <div>
                    <input
                      type="text"
                      placeholder="Slot ID (e.g. D1)"
                      value={newSlotId}
                      onChange={(e) => setNewSlotId(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-950'}`}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Floor Location Details"
                      value={newSlotLoc}
                      onChange={(e) => setNewSlotLoc(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-950'}`}
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-1.5 px-3 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-500 font-semibold text-xs flex items-center justify-center gap-1 hover:bg-rose-600/20 cursor-pointer"
                  >
                    <Plus size={13} />
                    Add Node
                  </button>
                  {adminSlotError && <p className="col-span-1 sm:col-span-3 text-[10px] text-red-500 font-semibold">{adminSlotError}</p>}
                </form>

                {/* Slots inventory mini tables */}
                <div className="overflow-y-auto max-h-[250px] pr-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/30 text-slate-500 font-medium">
                        <th className="py-2 px-3">Slot Code</th>
                        <th className="py-2 px-3">Deck Section</th>
                        <th className="py-2 px-3">Active State</th>
                        <th className="py-2 px-3 text-right">Gate Operations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {slots.map(s => (
                        <tr key={s.slot_id} className="hover:bg-slate-850/10 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-slate-300 text-sm">{s.slot_id}</td>
                          <td className="py-2 px-3 text-slate-400">{s.location}</td>
                          <td className="py-2 px-3 flex items-center gap-2 mt-1">
                            {/* Physical ESP32 LED Indicator representation */}
                            <span className={`w-3 h-3 rounded-full border border-slate-700/20 flex-shrink-0 animate-pulse ${
                              s.status === 'available' 
                                ? 'bg-emerald-500 shadow-[0_0_8px_#10b981,inset_0_1px_1px_rgba(255,255,255,0.4)]' 
                                : s.status === 'reserved' 
                                ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b,inset_0_1px_1px_rgba(255,255,255,0.4)]' 
                                : 'bg-red-500 shadow-[0_0_8px_#ef4444,inset_0_1px_1px_rgba(255,255,255,0.4)]'
                            }`} title={`Physical ESP32 LED Light: ${s.status.toUpperCase()}`} />

                            <select
                              value={s.manual_override ? s.status : 'release'}
                              onChange={(e) => handleManualSlotStatusChange(s.slot_id, e.target.value as SlotStatus | 'release')}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border outline-none cursor-pointer focus:ring-1 focus:ring-blue-500 ${
                                !s.manual_override
                                  ? 'bg-slate-800/20 text-slate-400 border-slate-700/30'
                                  : s.status === 'available' 
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                  : s.status === 'reserved' 
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}
                              style={{
                                backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                                color: !s.manual_override ? '#94a3b8' : s.status === 'available' ? '#10b981' : s.status === 'reserved' ? '#f59e0b' : '#ef4444'
                              }}
                            >
                              <option value="release" style={{ color: '#94a3b8', backgroundColor: darkMode ? '#0f172a' : '#ffffff' }}>AUTO (Sensor Controlled)</option>
                              <option value="available" style={{ color: '#10b981', backgroundColor: darkMode ? '#0f172a' : '#ffffff' }}>FORCE AVAILABLE (Green LED)</option>
                              <option value="reserved" style={{ color: '#f59e0b', backgroundColor: darkMode ? '#0f172a' : '#ffffff' }}>FORCE RESERVED (Yellow LED)</option>
                              <option value="occupied" style={{ color: '#ef4444', backgroundColor: darkMode ? '#0f172a' : '#ffffff' }}>FORCE OCCUPIED (Red LED)</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => handleDeleteSlot(s.slot_id)}
                              className="p-1 rounded text-red-400 hover:bg-red-500/15 cursor-pointer inline"
                              title="Delete Slot"
                            >
                              <Trash2 size={12} className="inline mr-1" /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>

            {/* Global Master Bookings Record Tally */}
            <div className={`p-5 rounded-xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
              <h3 className="font-display font-semibold text-sm mb-3">Live System-Wide Bookings Record Logs</h3>
              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/30 text-slate-500 font-medium">
                      <th className="py-2.5 px-3">Booking ID</th>
                      <th className="py-2.5 px-3">Operator User Name</th>
                      <th className="py-2.5 px-3">Slot No</th>
                      <th className="py-2.5 px-3">Locked At</th>
                      <th className="py-2.5 px-3">Expires At</th>
                      <th className="py-2.5 px-3">System status</th>
                      <th className="py-2.5 px-3 text-right">Trigger Authority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/10">
                    {allBookings.map((b) => (
                      <tr key={b.booking_id} className="hover:bg-slate-850/10 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-blue-500">{b.booking_id}</td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-300">{b.user_name}</p>
                          <p className="text-[10px] text-slate-500">{b.user_email}</p>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-300 font-mono text-sm bg-slate-800/50 p-1 px-1.5 rounded">{b.slot_id}</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">{new Date(b.booking_time).toLocaleString()}</td>
                        <td className="py-3 px-3 font-mono text-slate-400">{new Date(b.expiry_time).toLocaleTimeString()}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            b.status === 'active' 
                              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20' 
                              : b.status === 'completed' 
                              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                              : 'bg-slate-800/15 text-slate-500 border border-slate-800/30'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {b.status === 'active' && (
                            <button
                              onClick={() => handleCancelBooking(b.booking_id)}
                              className="text-red-500 hover:underline font-semibold font-mono text-[10px] uppercase"
                            >
                              FORCED CANCEL
                            </button>
                          )}
                          {b.status !== 'active' && <span className="text-slate-600">-</span>}
                        </td>
                      </tr>
                    ))}
                    {allBookings.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500">
                          No active, completed, or cancelled booking logs registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================
            TAB: USER PROFILE SETTINGS
           ======================================================== */}
        {activeTab === 'profile' && user && (
          <div className="max-w-xl mx-auto">
            <div className={`p-6 rounded-2xl border transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3 border-b border-slate-800/10 pb-3 mb-5">
                <div className="p-2.5 rounded-full bg-blue-600/10 text-blue-500">
                  <UserIcon size={18} />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base">Edit Profile Identity Settings</h2>
                  <p className="text-xs text-slate-500">Modify your login particulars safely inside the secure interface.</p>
                </div>
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-4">
                {profileSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 size={13} />
                    <span>{profileSuccess}</span>
                  </div>
                )}
                {profileError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs rounded-lg flex items-center gap-1.5 animate-shake">
                    <AlertTriangle size={13} />
                    <span>{profileError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-850 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Registered Gate Email ID</label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-855 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Update Security Password</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current password"
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-855 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Transmit Account updates
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================
          MODAL: BOOKING DURATION SELECTION MODAL
         ======================================================== */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`p-5 rounded-2xl border max-w-sm w-full transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex justify-between items-center border-b border-slate-800/10 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Car size={16} className="text-blue-500" />
                <h3 className="font-display font-semibold text-sm">Lock Slot Reservation</h3>
              </div>
              <button 
                onClick={() => setShowBookingModal(false)} 
                className="p-1 hover:text-red-500 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/10 flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Selected Slot Node</p>
                  <p className="text-lg font-black font-mono text-slate-300 mt-0.5">{selectedSlot}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Hourly Rate Multiplier</p>
                  <p className="text-sm font-bold text-emerald-500 mt-0.5">₹{config.hourlyRate.toFixed(2)}</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-500 font-medium">Reservation Duration Time</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={10}
                      max={240}
                      step={5}
                      value={bookingMinutes}
                      onChange={(e) => setBookingMinutes(Math.max(1, Number(e.target.value)))}
                      className={`w-14 px-1.5 py-0.5 rounded text-xs font-bold border text-right focus:outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-slate-50 border-slate-200 text-blue-600'
                      }`}
                    />
                    <span className="font-bold text-blue-500"> mins</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={240}
                  step={5}
                  value={bookingMinutes}
                  onChange={(e) => setBookingMinutes(Number(e.target.value))}
                  className="w-full cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono font-semibold mt-1">
                  <span>10 mins</span>
                  <span>1 hour</span>
                  <span>2 hours</span>
                  <span>4 hours</span>
                </div>
              </div>

              {/* Subtotal preview math */}
              <div className={`p-2.5 rounded-lg border flex justify-between items-center text-xs ${darkMode ? 'bg-slate-950/60 border-slate-805' : 'bg-slate-50 border-slate-350'}`}>
                <span className="text-slate-500">Estimated Total Cost:</span>
                <span className="font-bold font-mono text-sm text-emerald-500">
                  ₹{((bookingMinutes / 60) * config.hourlyRate).toFixed(2)}
                </span>
              </div>

              {bookingError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs rounded-lg flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  <span>{bookingError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    darkMode ? 'border-slate-800 text-slate-400 hover:text-slate-300' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReservation}
                  disabled={bookingInProcess}
                  className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 shadow-md hover:shadow-blue-500/15 cursor-pointer"
                >
                  Confirm Lock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: LOGIN / REGISTER GATE MODAL
         ======================================================== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`p-6 rounded-2xl border max-w-sm w-full transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex justify-between items-center border-b border-slate-800/10 pb-3 mb-4">
              <h3 className="font-display font-bold text-sm">
                {authMode === 'login' ? 'Welcome Back Operator Sign In' : 'Operator Register Center'}
              </h3>
              <button 
                onClick={() => setShowAuthModal(false)} 
                className="p-1 hover:text-red-500 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-450 text-xs rounded-lg flex items-center gap-1.5">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Full Operator Name</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Gate Email ID</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Passphrase Code</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-100 border-slate-350 text-slate-900'}`}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  {authMode === 'login' ? 'Confirm Operator Entry' : 'Issue Credentials Node'}
                </button>
              </div>

              <div className="text-center text-xs text-slate-500">
                {authMode === 'login' ? (
                  <p>
                    New space user?{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className="text-blue-500 hover:underline font-semibold cursor-pointer"
                    >
                      Create Credentials
                    </button>
                  </p>
                ) : (
                  <p>
                    Already validated?{' '}
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-blue-500 hover:underline font-semibold cursor-pointer"
                    >
                      Sign In Now
                    </button>
                  </p>
                )}
              </div>
            </form>



          </div>
        </div>
      )}

      {/* --- Footer Signature --- */}
      <footer className={`border-t py-6 text-center text-xs transition-colors ${darkMode ? 'border-slate-900 bg-slate-950 text-slate-500' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
        <p>© 2026 ParkQuantum IoT Solutions. All rights reserved.</p>
        <p className="text-[10px] text-slate-600 font-mono mt-1">Compiled securely under Express-Vite Fullstack environment • Port: 3000</p>
      </footer>
    </div>
  );
}

// Subcomponent: Individual parking space deck slot node card
function ParkingSlotCard({ slot, onClick }: { slot: ParkingSlot; onClick: (id: string) => void; key?: string }) {
  // Styles based on status
  const getStatusStyles = () => {
    switch (slot.status) {
      case 'available':
        return {
          bg: 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30 hover:border-emerald-500/50',
          badgeText: 'text-emerald-500',
          badgeBg: 'bg-emerald-500/10',
          borderAccent: 'border-emerald-500/50',
          hoverState: 'cursor-pointer group'
        };
      case 'reserved':
        return {
          bg: 'bg-amber-500/10 border-amber-500/25',
          badgeText: 'text-amber-500',
          badgeBg: 'bg-amber-500/10',
          borderAccent: 'border-amber-500/30',
          hoverState: 'cursor-default opacity-85'
        };
      case 'occupied':
        return {
          bg: 'bg-red-500/10 border-red-500/25',
          badgeText: 'text-red-500',
          badgeBg: 'bg-red-500/10',
          borderAccent: 'border-red-500/30',
          hoverState: 'cursor-default opacity-85'
        };
    }
  };

  const style = getStatusStyles();

  return (
    <div 
      onClick={() => slot.status === 'available' && onClick(slot.slot_id)}
      className={`p-3 rounded-xl border text-left transition-all ${style.bg} ${style.hoverState}`}
    >
      <div className="flex justify-between items-start">
        <span className="font-mono text-sm tracking-tight font-extrabold text-slate-300 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800/10">
          {slot.slot_id}
        </span>
        <span className={`text-[8px] font-extrabold uppercase px-1 py-px rounded font-mono ${style.badgeText} ${style.badgeBg}`}>
          {slot.status}
        </span>
      </div>

      <p className="text-[10px] text-slate-500 mt-2 font-medium truncate" title={slot.location}>
        {slot.location}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800/10 pt-2 flex-wrap gap-1">
        {slot.status === 'available' ? (
          <>
            <span className="text-[8px] uppercase tracking-wider text-emerald-500 font-bold group-hover:underline flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Book Space
            </span>
            <ChevronRight size={10} className="text-emerald-500 font-bold transition-transform group-hover:translate-x-0.5" />
          </>
        ) : slot.status === 'reserved' ? (
          <span className="text-[9px] text-amber-500 flex items-center gap-1 font-mono font-medium">
            <Clock size={10} /> Locked / countdown
          </span>
        ) : (
          <span className="text-[9px] text-red-500 flex items-center gap-1 font-mono font-medium">
            <Car size={10} /> Vehicle parked
          </span>
        )}
      </div>
    </div>
  );
}
