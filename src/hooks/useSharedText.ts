"use client";

import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isFirebaseConfigured = !!(
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY
);

export function useSharedText(pin: string, deviceId: string) {
  const [sharedText, setSharedText] = useState("");
  const isMock = !isFirebaseConfigured;
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const updateSharedText = (newText: string) => {
    setSharedText(newText);
    
    if (!pin) return;

    if (isMock) {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "text_update",
          text: newText,
          from: deviceId,
        });
      }
    } else {
      try {
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        const db = getDatabase(app);
        const textRef = ref(db, `rooms/${pin}/sharedText`);
        set(textRef, { text: newText, lastUpdatedBy: deviceId, timestamp: Date.now() }).catch(() => {});
      } catch (err) {
        console.error("Firebase update sharedText error:", err);
      }
    }
  };

  useEffect(() => {
    if (!pin) return;

    setSharedText(""); // Reset text on pin change
    let cleanup = () => {};

    if (isMock) {
      const channel = new BroadcastChannel(`crossdrop-room-${pin}-text`);
      broadcastChannelRef.current = channel;

      const handleChannelMessage = (e: MessageEvent) => {
        const data = e.data;
        if (data && data.type === "text_update" && data.from !== deviceId) {
          setSharedText(data.text);
        } else if (data && data.type === "request_text" && data.from !== deviceId) {
          setSharedText((current) => {
            if (current) {
              channel.postMessage({
                type: "text_update",
                text: current,
                from: deviceId,
              });
            }
            return current;
          });
        }
      };

      channel.addEventListener("message", handleChannelMessage);
      
      channel.postMessage({
        type: "request_text",
        from: deviceId,
      });

      cleanup = () => {
        channel.removeEventListener("message", handleChannelMessage);
        channel.close();
        broadcastChannelRef.current = null;
      };

    } else {
      try {
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        const auth = getAuth(app);
        const db = getDatabase(app);

        let isUnmounted = false;
        let cleanupDatabase = () => {};

        const setupDatabaseConnection = () => {
          if (isUnmounted) return;
          const textRef = ref(db, `rooms/${pin}/sharedText`);
          const unsubscribe = onValue(textRef, (snapshot) => {
            const val = snapshot.val();
            // Update local state if the last update was NOT from this device,
            // OR if we just joined and need the initial text
            if (val && val.lastUpdatedBy !== deviceId) {
              setSharedText(val.text || "");
            }
          });

          cleanupDatabase = () => {
            off(textRef);
            unsubscribe();
          };
        };

        signInAnonymously(auth).then(() => {
          if (isUnmounted) return;
          setupDatabaseConnection();
        }).catch(() => {
          setupDatabaseConnection();
        });

        cleanup = () => {
          isUnmounted = true;
          cleanupDatabase();
        };
      } catch (err) {
        console.error("Firebase sharedText sync error:", err);
      }
    }

    return cleanup;
  }, [pin, deviceId, isMock]);

  return {
    sharedText,
    updateSharedText,
  };
}
