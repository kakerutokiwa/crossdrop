"use client";

import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, onChildAdded, remove, off, serverTimestamp, onDisconnect } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// Firebase Config configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCYVWBR9DSVDXk1o3D_wXavnIITl7HNnvI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "crossdrop-f17d5.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://crossdrop-f17d5-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crossdrop-f17d5",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "crossdrop-f17d5.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "951224428476",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:951224428476:web:daa22e3cd3af2306036db9",
};

// Firebase is configured if either environment variables are present OR we use the default fallback configurations
const isFirebaseConfigured = !!(
  firebaseConfig.databaseURL &&
  firebaseConfig.apiKey
);

export interface Device {
  id: string;
  name: string;
  avatar: string;
  pin: string;
  isTauri: boolean;
  lastActive: number;
}

export interface SignalMessage {
  id?: string;
  from: string;
  type: "offer" | "answer" | "candidate";
  payload: unknown;
}

export type SignalingStatus =
  | "initializing"
  | "authenticating"
  | "authenticated"
  | "connected"
  | "auth_error"
  | "db_error"
  | "mock";

export function useFirebaseSignaling(
  deviceId: string,
  deviceName: string,
  deviceAvatar: string,
  pin: string,
  isTauri: boolean
) {
  const [peers, setPeers] = useState<Device[]>([]);
  const isMock = !isFirebaseConfigured;
  const [connectionStatus, setConnectionStatus] = useState<SignalingStatus>(
    isMock ? "mock" : "initializing"
  );
  const onSignalReceivedRef = useRef<((msg: SignalMessage) => void) | null>(null);
  
  const serverTimeOffsetRef = useRef<number>(0);
  const getSyncedTime = () => Date.now() + serverTimeOffsetRef.current;

  // Use refs to prevent stale closures in event listeners
  const infoRef = useRef({ deviceId, deviceName, deviceAvatar, pin, isTauri });
  useEffect(() => {
    infoRef.current = { deviceId, deviceName, deviceAvatar, pin, isTauri };
  }, [deviceId, deviceName, deviceAvatar, pin, isTauri]);

  // Keep a reference to broadcast channel for mock mode
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Expose register signaling callback
  const registerSignalHandler = (handler: (msg: SignalMessage) => void) => {
    onSignalReceivedRef.current = handler;
  };

  // Function to send signals
  const sendSignal = async (targetDeviceId: string, type: "offer" | "answer" | "candidate", payload: unknown) => {
    if (isMock) {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          targetDeviceId,
          from: deviceId,
          type,
          payload,
        });
      }
    } else {
      try {
        const db = getDatabase();
        const signalRef = ref(db, `rooms/${pin}/signals/${targetDeviceId}`);
        const newSignalRef = push(signalRef);
        await set(newSignalRef, {
          from: deviceId,
          type,
          payload: JSON.stringify(payload),
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("Firebase signal send error:", err);
      }
    }
  };

  useEffect(() => {
    if (!pin) return;

    let cleanup = () => {};

    if (!isFirebaseConfigured) {
      // --- MOCK MODE: BroadcastChannel ---
      console.log(`[Signaling] Mock mode activated for room: ${pin}`);
      
      const channel = new BroadcastChannel(`crossdrop-room-${pin}`);
      broadcastChannelRef.current = channel;

      // Track local mock peer list
      const mockPeersMap = new Map<string, Device>();

      const handleChannelMessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data) return;

        // Presence check
        if (data.type === "ping") {
          // Send pong back
          channel.postMessage({
            type: "pong",
            device: {
              id: infoRef.current.deviceId,
              name: infoRef.current.deviceName,
              avatar: infoRef.current.deviceAvatar,
              pin: infoRef.current.pin,
              isTauri: infoRef.current.isTauri,
              lastActive: Date.now(),
            },
          });
          
          if (data.device.id !== infoRef.current.deviceId) {
            mockPeersMap.set(data.device.id, data.device);
            setPeers(Array.from(mockPeersMap.values()));
          }
        } else if (data.type === "pong") {
          if (data.device.id !== infoRef.current.deviceId) {
            mockPeersMap.set(data.device.id, data.device);
            setPeers(Array.from(mockPeersMap.values()));
          }
        } else if (data.type === "disconnect") {
          mockPeersMap.delete(data.from);
          setPeers(Array.from(mockPeersMap.values()));
        } else if (data.targetDeviceId === infoRef.current.deviceId) {
          // This is a direct signaling message for us
          if (onSignalReceivedRef.current) {
            onSignalReceivedRef.current({
              from: data.from,
              type: data.type,
              payload: data.payload,
            });
          }
        }
      };

      channel.addEventListener("message", handleChannelMessage);

      // Ping to discover other peers and advertise presence
      channel.postMessage({
        type: "ping",
        device: {
          id: deviceId,
          name: deviceName,
          avatar: deviceAvatar,
          pin: pin,
          isTauri: isTauri,
          lastActive: Date.now(),
        },
      });

      // Periodically ping and prune stale mock peers
      const mockInterval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        mockPeersMap.forEach((p, pid) => {
          if ((now - p.lastActive) > 15000) {
            mockPeersMap.delete(pid);
            changed = true;
          }
        });
        if (changed) {
          setPeers(Array.from(mockPeersMap.values()));
        }

        channel.postMessage({
          type: "ping",
          device: {
            id: deviceId,
            name: infoRef.current.deviceName,
            avatar: infoRef.current.deviceAvatar,
            pin: infoRef.current.pin,
            isTauri: infoRef.current.isTauri,
            lastActive: now,
          },
        });
      }, 5000);

      // Cleanup
      cleanup = () => {
        clearInterval(mockInterval);
        channel.postMessage({
          type: "disconnect",
          from: deviceId,
        });
        channel.removeEventListener("message", handleChannelMessage);
        channel.close();
        broadcastChannelRef.current = null;
      };

    } else {
      // --- FIREBASE MODE ---
      console.log(`[Signaling] Firebase mode activated for room: ${pin}`);
      
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const auth = getAuth(app);
      const db = getDatabase(app);

      // Synchronize with Firebase server time
      const offsetRef = ref(db, ".info/serverTimeOffset");
      const unsubscribeOffset = onValue(offsetRef, (snap) => {
        serverTimeOffsetRef.current = snap.val() || 0;
        console.log(`[Signaling] Firebase server time offset: ${serverTimeOffsetRef.current}ms`);
      });

      let isUnmounted = false;
      let cleanupDatabase = () => {};

      const setupDatabaseConnection = () => {
        if (isUnmounted) return;

        // 1. Register presence
        const myPresenceRef = ref(db, `rooms/${pin}/devices/${deviceId}`);
        
        // Setup onDisconnect hook to automatically clean up database presence on drop
        onDisconnect(myPresenceRef).remove().catch((err) => {
          console.error("[Signaling] Failed to setup onDisconnect removal:", err);
        });

        set(myPresenceRef, {
          id: deviceId,
          name: deviceName,
          avatar: deviceAvatar,
          pin: pin,
          isTauri: isTauri,
          lastActive: getSyncedTime(),
        }).then(() => {
          if (!isUnmounted) {
            setConnectionStatus("connected");
          }
        }).catch((err) => {
          console.error("[Signaling] Failed to register presence in database (check rules):", err);
          setConnectionStatus("db_error");
        });

        // 2. Listen for peers
        const devicesRef = ref(db, `rooms/${pin}/devices`);
        const unsubscribePeers = onValue(devicesRef, (snapshot) => {
          const val = snapshot.val();
          if (val) {
            const list = Object.values(val) as Device[];
            const now = getSyncedTime();
            
            // Filter out self and any peer whose lastActive is older than 20 seconds
            const filtered = list.filter(
              (p) => p.id !== infoRef.current.deviceId && (now - p.lastActive) < 20000
            );
            setPeers(filtered);

            // Clean up stale device records from the database
            list.forEach((p) => {
              if (p.id !== infoRef.current.deviceId && (now - p.lastActive) > 30000) {
                console.log(`[Signaling] Pruning stale peer from database: ${p.id}`);
                const stalePeerRef = ref(db, `rooms/${pin}/devices/${p.id}`);
                remove(stalePeerRef).catch(() => {});
              }
            });
          } else {
            setPeers([]);
          }
          if (!isUnmounted) {
            setConnectionStatus("connected");
          }
        }, (err) => {
          console.error("[Signaling] Peer listener permission error:", err);
          setConnectionStatus("db_error");
        });

        // 3. Listen for signals directed to me
        const mySignalsRef = ref(db, `rooms/${pin}/signals/${deviceId}`);
        const signalUnsubscribe = onChildAdded(mySignalsRef, (snapshot) => {
          const val = snapshot.val();
          if (val && val.from !== infoRef.current.deviceId) {
            let parsedPayload = val.payload;
            try {
              parsedPayload = JSON.parse(val.payload);
            } catch {
              // Keep original if not JSON
            }

            if (onSignalReceivedRef.current) {
              onSignalReceivedRef.current({
                id: snapshot.key || undefined,
                from: val.from,
                type: val.type,
                payload: parsedPayload,
              });
            }
            // Consume/Delete the signal once processed
            const specificSignalRef = ref(db, `rooms/${pin}/signals/${deviceId}/${snapshot.key}`);
            remove(specificSignalRef);
          }
        });

        cleanupDatabase = () => {
          onDisconnect(myPresenceRef).cancel();
          remove(myPresenceRef).catch(() => {});
          off(devicesRef);
          off(mySignalsRef);
          unsubscribePeers();
        };
      };

      // Periodically update our own presence lastActive timestamp and prune stale local peers
      const dbInterval = setInterval(() => {
        const now = getSyncedTime();
        try {
          const myPresenceRef = ref(db, `rooms/${pin}/devices/${deviceId}`);
          set(myPresenceRef, {
            id: deviceId,
            name: infoRef.current.deviceName,
            avatar: infoRef.current.deviceAvatar,
            pin: infoRef.current.pin,
            isTauri: infoRef.current.isTauri,
            lastActive: now,
          }).catch(() => {});
        } catch (e) {}

        // Local UI pruning
        setPeers((prev) => {
          const filtered = prev.filter((p) => (now - p.lastActive) < 20000);
          if (filtered.length !== prev.length) {
            return filtered;
          }
          return prev;
        });
      }, 5000);

      // Authenticate anonymously to comply with database rules requiring authenticated requests
      setConnectionStatus("authenticating");
      signInAnonymously(auth)
        .then(() => {
          if (isUnmounted) return;
          console.log(`[Signaling] Firebase authenticated anonymously`);
          setConnectionStatus("authenticated");
          setupDatabaseConnection();
        })
        .catch((err) => {
          console.warn("[Signaling] Firebase anonymous authentication failed:", err);
          console.log("[Signaling] Falling back to unauthenticated database connection (rules may be public)...");
          setConnectionStatus("auth_error");
          setupDatabaseConnection();
        });

      cleanup = () => {
        isUnmounted = true;
        clearInterval(dbInterval);
        cleanupDatabase();
        unsubscribeOffset();
      };
    }

    return () => {
      cleanup();
    };
  }, [pin, deviceId, isTauri]);

  // Update presence details immediately in the database or broadcast channel when name or avatar changes
  useEffect(() => {
    if (!pin) return;
    const now = getSyncedTime();
    if (isMock) {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "ping",
          device: {
            id: deviceId,
            name: deviceName,
            avatar: deviceAvatar,
            pin: pin,
            isTauri: isTauri,
            lastActive: now,
          },
        });
      }
    } else {
      try {
        if (getApps().length > 0) {
          const db = getDatabase();
          const myPresenceRef = ref(db, `rooms/${pin}/devices/${deviceId}`);
          set(myPresenceRef, {
            id: deviceId,
            name: deviceName,
            avatar: deviceAvatar,
            pin: pin,
            isTauri: isTauri,
            lastActive: now,
          }).catch(() => {});
        }
      } catch (e) {
        // Firebase might not be fully initialized yet
      }
    }
  }, [deviceName, deviceAvatar, pin, deviceId, isTauri, isMock]);

  return {
    peers,
    sendSignal,
    registerSignalHandler,
    isMock,
    connectionStatus,
  };
}

