"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Settings as SettingsIcon, 
  QrCode, 
  RefreshCw, 
  Check, 
  X, 
  Download, 
  Upload, 
  Sun, 
  Moon,  
  Copy, 
  Laptop, 
  Smartphone, 
  User,
  ArrowRight,
  Info,
  Clock,
  Shield,
  Zap,
  Folder,
  Wifi,
  Camera,
  ChevronRight,
  MoreVertical,
  RotateCw,
  FileText
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import confetti from "canvas-confetti";

import LiquidBackground from "./LiquidBackground";
import CameraQrScanner from "./CameraQrScanner";
import { useFirebaseSignaling } from "../hooks/useFirebaseSignaling";
import { useWebRTC } from "../hooks/useWebRTC";
import { useSharedText } from "../hooks/useSharedText";

// Preset abstract gradient avatars
const PRESET_AVATARS = [
  { id: "av-1", name: "Aurora Blue", gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" },
  { id: "av-2", name: "Cosmic Purple", gradient: "linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)" },
  { id: "av-3", name: "Mint Emerald", gradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)" },
  { id: "av-4", name: "Sunset Rose", gradient: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)" },
  { id: "av-5", name: "Golden Amber", gradient: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)" },
  { id: "av-6", name: "Deep Cyan", gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" },
];

export default function CrossDropApp() {
  // App settings & profile states
  const [deviceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let storedId = localStorage.getItem("crossdrop-device-id");
    if (!storedId) {
      storedId = "dev-" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("crossdrop-device-id", storedId);
    }
    return storedId;
  });
  const [deviceName, setDeviceName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("crossdrop-device-name") || "";
  });
  const [deviceAvatar, setDeviceAvatar] = useState<string>(() => {
    if (typeof window === "undefined") return "av-1";
    return localStorage.getItem("crossdrop-device-avatar") || "av-1";
  });
  const [pin, setPin] = useState<string>("----");
  const [isManualPin, setIsManualPin] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if the user has set a manual PIN override in localStorage
    const manualPin = localStorage.getItem("crossdrop-manual-pin");
    if (manualPin) {
      setPin(manualPin);
      setIsManualPin(true);
      return;
    }

    // Otherwise, attempt automatic local Wi-Fi IP-based discovery
    const fetchIpAndSetPin = async () => {
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = await res.json();
        if (data && data.ip) {
          // Hash public IP to a stable 4-digit PIN
          let hash = 0;
          const ipStr = data.ip;
          for (let i = 0; i < ipStr.length; i++) {
            hash = ipStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          const generatedPin = (1000 + (Math.abs(hash) % 9000)).toString();
          setPin(generatedPin);
          console.log(`[Auto-Discovery] Hashed public IP ${ipStr} to PIN: ${generatedPin}`);
        } else {
          throw new Error("Invalid IP payload");
        }
      } catch (e) {
        console.warn("[Auto-Discovery] Failed to fetch public IP, falling back to random PIN", e);
        // Fallback to random PIN
        let storedPin = localStorage.getItem("crossdrop-pin");
        if (!storedPin) {
          storedPin = Math.floor(1000 + Math.random() * 9000).toString();
          localStorage.setItem("crossdrop-pin", storedPin);
        }
        setPin(storedPin);
      }
    };

    fetchIpAndSetPin();
  }, []);
  const [isTauri] = useState<boolean>(() => 
    typeof window !== "undefined" && 
    ((window as { __TAURI_ENV__?: unknown }).__TAURI_ENV__ !== undefined ||
     (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined ||
     (window as { __TAURI_IPC__?: unknown }).__TAURI_IPC__ !== undefined)
  );
  const [initialized, setInitialized] = useState<boolean>(false);
  const triggeredConfettiRef = useRef<Set<string>>(new Set());

  // UI state
  const [theme, setTheme] = useState<"dark" | "light" | "auto">("dark");
  const [currentActiveTheme, setCurrentActiveTheme] = useState<"dark" | "light">("dark");
  const [activeTab, setActiveTab] = useState<"radar" | "receive" | "text">("radar");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "connection" | "files" | "appearance">("general");
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  
  // Setup inputs
  const [tempName, setTempName] = useState(() => {
    if (typeof window === "undefined") return "";
    const name = localStorage.getItem("crossdrop-device-name") || "";
    if (name) return name;
    const inTauri = typeof window !== "undefined" && (window as { __TAURI_ENV__?: unknown }).__TAURI_ENV__ !== undefined;
    const osName = inTauri ? "PC" : "Browser";
    const randomId = Math.floor(100 + Math.random() * 900);
    return `My ${osName} ${randomId}`;
  });
  const [tempAvatar, setTempAvatar] = useState("av-1");

  // Connection settings
  const [saveDirectory, setSaveDirectory] = useState<string>(() => {
    if (typeof window === "undefined") return "Downloads";
    return localStorage.getItem("crossdrop-save-directory") || "Downloads";
  });
  const [customSaveDir, setCustomSaveDir] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("crossdrop-custom-save-dir") || "";
  });
  const [askSavePath, setAskSavePath] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("crossdrop-ask-save-path") === "true";
  });
  const [opacity, setOpacity] = useState<number>(90);
  const [animationLevel, setAnimationLevel] = useState<number>(100);

  // Recipient Selection Modal states
  const [filesToSend, setFilesToSend] = useState<File[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [showRecipientModal, setShowRecipientModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const onboardingAvatarFileRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const [showHistory, setShowHistory] = useState<boolean>(false);

  const processScannedCode = (data: string): { success: boolean; pin?: string; error?: string } => {
    try {
      const url = new URL(data);
      const scannedPin = url.searchParams.get("pin");
      if (scannedPin && scannedPin.length === 4) {
        setPin(scannedPin);
        localStorage.setItem("crossdrop-manual-pin", scannedPin);
        setIsManualPin(true);
        setActiveTab("radar");
        return { success: true, pin: scannedPin };
      } else {
        return { success: false, error: "CrossDropのQRコードではありませんでした。" };
      }
    } catch (err) {
      if (data.length === 4 && /^\d{4}$/.test(data)) {
        setPin(data);
        localStorage.setItem("crossdrop-manual-pin", data);
        setIsManualPin(true);
        setActiveTab("radar");
        return { success: true, pin: data };
      } else {
        return { success: false, error: "無効なQRコードです。" };
      }
    }
  };

  const handleQrScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (code) {
            const result = processScannedCode(code.data);
            if (result.success) {
              alert(`QRコードを読み込みました！ (PIN: ${result.pin})`);
            } else {
              alert(result.error || "無効なQRコードです。");
            }
          } else {
            alert("QRコードが検出できませんでした。もう少し明るい場所で、正面から撮影してみてください。");
          }
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    if (qrInputRef.current) qrInputRef.current.value = "";
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
          const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
          setDeviceAvatar(croppedDataUrl);
          localStorage.setItem("crossdrop-device-avatar", croppedDataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleOnboardingAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
          const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
          setTempAvatar(croppedDataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    
    // Automatically generate display name and avatar if not set
    let storedName = localStorage.getItem("crossdrop-device-name");
    if (!storedName) {
      const inTauri = typeof window !== "undefined" && (window as { __TAURI_ENV__?: unknown }).__TAURI_ENV__ !== undefined;
      const osName = inTauri ? "PC" : "Browser";
      const randomId = Math.floor(100 + Math.random() * 900);
      storedName = `My ${osName} ${randomId}`;
      localStorage.setItem("crossdrop-device-name", storedName);
      setDeviceName(storedName);
    }
    
    let storedAvatar = localStorage.getItem("crossdrop-device-avatar");
    if (!storedAvatar) {
      const defaultAvatar = "av-1";
      localStorage.setItem("crossdrop-device-avatar", defaultAvatar);
      setDeviceAvatar(defaultAvatar);
    }
    
    setInitialized(true);
  }, []);

  // Theme observer
  useEffect(() => {
    const applyTheme = (t: "dark" | "light") => {
      const root = document.documentElement;
      if (t === "light") {
        root.classList.add("light-theme");
      } else {
        root.classList.remove("light-theme");
      }
      setCurrentActiveTheme(t);
    };

    if (theme === "auto") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      applyTheme(media.matches ? "light" : "dark");

      const listener = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? "light" : "dark");
      };
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    } else {
      applyTheme(theme);
    }
    localStorage.setItem("crossdrop-theme", theme);
  }, [theme]);

  // Hook up WebRTC and Signaling (single instance to avoid duplicate Firebase connections)
  const { peers, sendSignal, registerSignalHandler, isMock, connectionStatus } = useFirebaseSignaling(
    deviceId,
    deviceName,
    deviceAvatar,
    pin,
    isTauri
  );

  const { sharedText, updateSharedText } = useSharedText(pin, deviceId);

  const {
    transfers,
    handleSignal,
    sendFile,
    cancelTransfer,
  } = useWebRTC(deviceId, sendSignal, isTauri, saveDirectory, customSaveDir, askSavePath);

  // Register signal handler for incoming WebRTC signals
  useEffect(() => {
    registerSignalHandler((msg) => {
      handleSignal(msg);
    });
  }, [registerSignalHandler, handleSignal]);

  // Monitor transfer completions to trigger confetti
  useEffect(() => {
    const activeTransferIds = Object.keys(transfers);
    if (activeTransferIds.length === 0) return;

    activeTransferIds.forEach((id) => {
      if (transfers[id]?.status === "completed" && !triggeredConfettiRef.current.has(id)) {
        triggeredConfettiRef.current.add(id);
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.8 },
          colors: ["#0a84ff", "#5ac8fa", "#bf5af2", "#ffffff"],
        });
      }
    });
  }, [transfers]);

  // Handle setup form submit
  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;

    localStorage.setItem("crossdrop-device-name", tempName.trim());
    localStorage.setItem("crossdrop-device-avatar", tempAvatar);
    
    setDeviceName(tempName.trim());
    setDeviceAvatar(tempAvatar);
    setInitialized(true);
  };

  // Regenerate PIN
  const handleRegeneratePin = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem("crossdrop-manual-pin", newPin);
    setIsManualPin(true);
    setPin(newPin);
  };

  // Context Menu State for Reveal in Finder/Explorer
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    savedPath?: string;
  }>({ visible: false, x: 0, y: 0 });

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [contextMenu.visible]);

  const handleRevealFile = async (savedPath?: string) => {
    if (!savedPath || !isTauri) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      // Find parent directory path
      const lastSlash = Math.max(savedPath.lastIndexOf("/"), savedPath.lastIndexOf("\\"));
      if (lastSlash !== -1) {
        const parentDir = savedPath.substring(0, lastSlash);
        await open(parentDir);
      } else {
        await open(savedPath);
      }
    } catch (e) {
      console.error("Failed to reveal folder:", e);
    }
  };

  const handleHistoryItemContextMenu = (e: React.MouseEvent, savedPath?: string) => {
    if (!isTauri || !savedPath) return;
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      savedPath,
    });
  };

  // File selection triggering
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  const triggerFileSelection = (peerId: string) => {
    setSelectedPeerId(peerId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (selectedPeerId) {
        Array.from(e.target.files).forEach((file) => {
          sendFile(selectedPeerId, file);
        });
        setSelectedPeerId(null);
      } else {
        const files = Array.from(e.target.files);
        setFilesToSend(files);
        setSelectedRecipients(peers.map((p) => p.id));
        setShowRecipientModal(true);
      }
      e.target.value = "";
    }
  };

  // Drag and Drop handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setFilesToSend(files);
      setSelectedRecipients(peers.map((p) => p.id));
      setShowRecipientModal(true);
    }
  };

  // Format bytes helper
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const formatTime = (secs: number) => {
    if (secs === 9999) return "計算中...";
    if (secs < 60) return `${secs}秒`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}分${remainingSecs}秒`;
  };

  // Get avatar gradient
  const getAvatarGradient = (id: string) =>
    PRESET_AVATARS.find((a) => a.id === id)?.gradient;

  const renderAvatar = (avatar: string, isTauriDevice: boolean, sizeClass = "w-12 h-12", iconSizeClass = "w-5.5 h-5.5") => {
    const isCustom = avatar && avatar.startsWith("data:image/");
    return (
      <div 
        className={`${sizeClass} rounded-full flex items-center justify-center text-white shadow-md overflow-hidden relative border border-glass-border/30 flex-shrink-0 bg-surface-tertiary/20`}
        style={isCustom ? {} : { background: getAvatarGradient(avatar) || getAvatarGradient("av-1") }}
      >
        {isCustom ? (
          <img src={avatar} className="w-full h-full object-cover animate-fade-in" alt="Avatar" />
        ) : (
          isTauriDevice ? <Laptop className={iconSizeClass} /> : <Smartphone className={iconSizeClass} />
        )}
      </div>
    );
  };

  const activeTransfer = Object.values(transfers).find(
    (tr) => tr.status === "transferring" || tr.status === "connecting"
  );
  
  const recentTransfers = Object.values(transfers).filter(
    (tr) => tr.status === "completed" || tr.status === "failed"
  );

  const getPeerFromTransfer = (tr: typeof activeTransfer) => {
    if (!tr) return null;
    const peer = peers.find(p => tr.fileId.includes(p.id));
    if (peer) return peer;
    return {
      id: "unknown",
      name: tr.type === "send" ? "受信デバイス" : "送信デバイス",
      avatar: "av-1",
      pin: "----",
      isTauri: false,
      lastActive: Date.now()
    };
  };

  if (!mounted) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden select-none z-10">
        <canvas className="fixed inset-0 w-full h-full -z-10 pointer-events-none filter blur-[120px] opacity-50 md:opacity-60" />
      </div>
    );
  }

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden select-none z-10 font-sans flex items-center justify-center"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      style={{ opacity: opacity / 100 }}
    >
      <LiquidBackground theme={currentActiveTheme} />

      {/* ===== DRAG & DROP OVERLAY ===== */}
      <AnimatePresence>
        {dragActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl pointer-events-none"
          >
            <div className="glass-panel w-full max-w-sm p-10 rounded-3xl flex flex-col items-center justify-center border-2 border-dashed border-accent/40 text-center">
              <Upload className="w-14 h-14 text-accent mb-4 ping-slow" />
              <h3 className="text-xl font-bold mb-2">ファイルをここにドロップ</h3>
              <p className="text-sm text-text-secondary">
                ファイルをドロップして送信先を選択します
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MAIN CARD ===== */}
      <div className="w-full h-full flex flex-col relative overflow-hidden transition-all duration-300">

        {!initialized ? (
          /* ===== ONBOARDING ===== */
          <div className="flex-1 flex flex-col justify-center items-center px-6 py-10 md:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-sm flex flex-col gap-6"
            >
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-1.5 tracking-tight text-white">CrossDropへようこそ</h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  表示名とアバターを選択して開始します
                </p>
              </div>

              <form onSubmit={handleOnboardingSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">表示名</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    maxLength={20}
                    className="w-full bg-surface-secondary border border-glass-border px-4 py-3 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all placeholder-text-tertiary text-white"
                    placeholder="デバイス名を入力"
                    required
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">アバター</label>
                  <div className="flex items-center gap-4 mb-2">
                    <div 
                      className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-white shadow-lg overflow-hidden bg-surface-tertiary border border-glass-border relative"
                      style={tempAvatar.startsWith("data:image/") ? {} : { background: getAvatarGradient(tempAvatar) }}
                    >
                      {tempAvatar.startsWith("data:image/") ? (
                        <img src={tempAvatar} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        isTauri ? <Laptop className="w-7 h-7" /> : <Smartphone className="w-7 h-7" />
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => onboardingAvatarFileRef.current?.click()}
                        className="px-4 py-2.5 bg-surface-secondary hover:bg-surface-tertiary border border-glass-border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer text-white"
                      >
                        <Camera className="w-4 h-4 text-text-secondary" /> 写真をアップロード
                      </button>
                      <input 
                        type="file"
                        ref={onboardingAvatarFileRef}
                        onChange={handleOnboardingAvatarUpload}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider">またはプリセットを選択</label>
                    <div className="grid grid-cols-6 gap-3 w-full">
                      {PRESET_AVATARS.map((av) => (
                        <button
                          key={av.id}
                          type="button"
                          onClick={() => setTempAvatar(av.id)}
                          className={`relative w-full aspect-square rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 ${
                            tempAvatar === av.id ? "scale-110 ring-[3px] ring-accent ring-offset-2 ring-offset-transparent z-10" : "hover:scale-105 opacity-70 hover:opacity-100"
                          }`}
                          style={{ background: av.gradient }}
                        >
                          {tempAvatar === av.id && (
                            <Check className="w-4.5 h-4.5 text-white drop-shadow" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-3 rounded-xl text-base transition-all duration-200 shadow-lg shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] mt-2"
                >
                  はじめる <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        ) : (
          /* ===== MAIN APPLICATION ===== */
          <>
            {/* 1. DESKTOP WIDESCREEN LAYOUT (>= lg) */}
            <div className="hidden lg:flex flex-col h-full w-full overflow-hidden">
              
              {/* ===== TOP HEADER BAR ===== */}
              <header className="flex items-center justify-between px-7 py-4 border-b border-glass-border/30 flex-shrink-0">
                <div className="flex items-center gap-4">

                  {/* Brand */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8">
                      {renderAvatar(deviceAvatar, isTauri, "w-8 h-8", "w-4 h-4")}
                    </div>
                    <span className="font-bold tracking-tight text-white text-[17px]">CrossDrop</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="w-11 h-11 rounded-full flex items-center justify-center bg-surface-secondary/50 border border-glass-border/60 text-text-secondary hover:text-white hover:bg-surface-secondary transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    {currentActiveTheme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="w-11 h-11 rounded-full flex items-center justify-center bg-surface-secondary/50 border border-glass-border/60 text-text-secondary hover:text-white hover:bg-surface-secondary transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    <SettingsIcon className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {/* ===== MAIN 3-COLUMN CONTENT ===== */}
              <div className="flex-1 flex flex-row overflow-hidden gap-8 px-6 py-4">
                
                {/* LEFT SIDEBAR */}
                <div className="w-[260px] flex-shrink-0 p-6 flex flex-col gap-6 select-none overflow-y-auto no-scrollbar bg-surface-secondary/15 backdrop-blur-xl border border-glass-border rounded-3xl shadow-lg">
                  
                  {/* Tab Cards */}
                  <div className="flex gap-4 w-full">
                    <button
                      onClick={() => { setShowHistory(false); setActiveTab("radar"); }}
                      className={`flex-1 py-6 px-2 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer ${
                        !showHistory && activeTab === "radar"
                          ? "bg-accent/10 border-accent/30 shadow-lg shadow-accent/5"
                          : "bg-surface-secondary/20 border-glass-border/40 hover:bg-surface-secondary/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        !showHistory && activeTab === "radar"
                          ? "bg-accent text-white shadow-md shadow-accent/30"
                          : "bg-surface-secondary/50 text-text-secondary"
                      }`}>
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <p className={`text-sm font-bold leading-tight ${!showHistory && activeTab === "radar" ? "text-white" : "text-text-secondary"}`}>送信</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setShowHistory(false); setActiveTab("receive"); }}
                      className={`flex-1 py-6 px-2 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer ${
                        !showHistory && activeTab === "receive"
                          ? "bg-accent/10 border-accent/30 shadow-lg shadow-accent/5"
                          : "bg-surface-secondary/20 border-glass-border/40 hover:bg-surface-secondary/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        !showHistory && activeTab === "receive"
                          ? "bg-accent text-white shadow-md shadow-accent/30"
                          : "bg-surface-secondary/50 text-text-secondary"
                      }`}>
                        <Download className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <p className={`text-sm font-bold leading-tight ${!showHistory && activeTab === "receive" ? "text-white" : "text-text-secondary"}`}>受信</p>
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={() => { setShowHistory(false); setActiveTab("text"); }}
                    className={`w-full py-4 px-4 rounded-2xl border flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer ${
                      !showHistory && activeTab === "text"
                        ? "bg-accent/10 border-accent/30 shadow-lg shadow-accent/5"
                        : "bg-surface-secondary/20 border-glass-border/40 hover:bg-surface-secondary/40"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      !showHistory && activeTab === "text"
                        ? "bg-accent text-white shadow-md shadow-accent/30"
                        : "bg-surface-secondary/50 text-text-secondary"
                    }`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <p className={`text-sm font-bold ${!showHistory && activeTab === "text" ? "text-white" : "text-text-secondary"}`}>テキスト共有</p>
                  </button>

                  {/* PIN Card */}
                  <div className="bg-surface-secondary/25 border border-glass-border/50 rounded-2xl px-4 py-5 flex flex-col items-center justify-center gap-2 mt-auto mb-4 text-center">
                    <div className="flex items-center gap-2 mb-2 w-full justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--green)] animate-pulse flex-shrink-0" />
                      <span className="text-[12px] font-bold text-text-secondary">接続待機中</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-text-tertiary font-bold mb-1">この端末のPIN</p>
                      <h3 className="text-[48px] font-black text-white leading-none tracking-widest">{pin}</h3>
                    </div>
                    <p className="text-[10px] text-text-tertiary leading-relaxed mt-2">
                      相手の画面で「受け取る」を開き<br/>このPINを入力してください
                    </p>
                  </div>
                </div>

                {/* CENTER PANEL (Dropzone / Active Transfer) */}
                <div className="flex-1 flex flex-col px-8 py-8 overflow-hidden select-none bg-surface-secondary/15 backdrop-blur-xl border border-glass-border rounded-3xl shadow-lg relative">
                  
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={activeTransfer ? "transfer" : activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                      className="flex-1 flex flex-col justify-center"
                    >
                      {activeTransfer ? (
                        /* Active P2P Progress Card */
                        <div className="flex items-center justify-center w-full">
                          {(() => {
                            const peer = getPeerFromTransfer(activeTransfer);
                            if (!peer) return null;
                            return (
                              <div className="bg-surface-secondary/30 border border-glass-border/60 rounded-3xl p-8 flex flex-col items-center w-full max-w-md shadow-lg backdrop-blur-xl">
                                <div className="flex items-center justify-between w-full mb-6">
                                  <div className="flex flex-col items-center gap-2">
                                    {renderAvatar(activeTransfer.type === "send" ? deviceAvatar : peer.avatar, activeTransfer.type === "send" ? isTauri : peer.isTauri, "w-16 h-16", "w-7.5 h-7.5")}
                                    <span className="text-xs font-bold text-white truncate max-w-[90px]">
                                      {activeTransfer.type === "send" ? "自分" : peer.name}
                                    </span>
                                  </div>

                                  {/* Connecting/Transferring Line */}
                                  <div className="flex-1 px-4 relative flex items-center justify-center">
                                    <div className="w-full border-t-2 border-dashed border-accent/40 relative">
                                      {activeTransfer.status === "transferring" && (
                                        <div className="transfer-pulse-dot animate-pulse" />
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center gap-2">
                                    {renderAvatar(activeTransfer.type === "send" ? peer.avatar : deviceAvatar, activeTransfer.type === "send" ? peer.isTauri : isTauri, "w-16 h-16", "w-7.5 h-7.5")}
                                    <span className="text-xs font-bold text-white truncate max-w-[90px]">
                                      {activeTransfer.type === "send" ? peer.name : "自分"}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-center w-full mb-6">
                                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/25 uppercase tracking-wider mb-2.5 inline-block">
                                    {activeTransfer.type === "send" ? "送信中" : "受信中"}
                                  </span>
                                  <h4 className="text-base font-bold truncate max-w-[320px] mx-auto text-white mb-1.5" title={activeTransfer.name}>{activeTransfer.name}</h4>
                                  <p className="text-xs text-text-secondary">{formatBytes(activeTransfer.size)}</p>
                                </div>

                                <div className="w-full mb-6">
                                  <div className="flex justify-between text-xs font-medium text-text-secondary mb-2">
                                    <span>{activeTransfer.status === "connecting" ? "接続を確立中..." : `${activeTransfer.progress}%`}</span>
                                    {activeTransfer.status === "transferring" && (
                                      <span>{formatBytes(activeTransfer.speed)}/s · 残り {formatTime(activeTransfer.timeLeft)}</span>
                                    )}
                                  </div>
                                  <div className="w-full bg-surface-tertiary/40 rounded-full h-2 overflow-hidden">
                                    <div 
                                      className="h-full bg-accent rounded-full transition-all duration-300"
                                      style={{ width: `${activeTransfer.progress}%` }}
                                    />
                                  </div>
                                </div>

                                <button
                                  onClick={() => cancelTransfer(peer.id)}
                                  className="bg-red/10 hover:bg-red/20 border border-red/20 text-red text-sm font-semibold rounded-2xl transition-all cursor-pointer shadow-sm"
                                  style={{ padding: '16px 24px', minHeight: '52px' }}
                                >
                                  キャンセル
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      ) : activeTab === "text" ? (
                        /* Text Shared View */
                        <div className="flex-1 flex flex-col h-full bg-surface-secondary/20 border border-glass-border overflow-hidden" style={{ borderRadius: '24px', display: 'flex', flexDirection: 'column' }}>
                          <div className="border-b border-glass-border bg-surface-secondary/40" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px' }}>
                            <FileText className="w-5 h-5 text-accent flex-shrink-0" />
                            <h3 className="font-bold text-white" style={{ margin: 0 }}>リアルタイムテキスト</h3>
                            <span className="bg-accent/20 text-accent font-bold" style={{ marginLeft: 'auto', fontSize: '10px', padding: '4px 8px', borderRadius: '9999px' }}>全員が編集可能</span>
                          </div>
                          <textarea
                            value={sharedText}
                            onChange={(e) => updateSharedText(e.target.value)}
                            placeholder="ここにテキストを入力すると、同じPINコードを持つすべてのデバイスにリアルタイムで同期されます..."
                            className="w-full bg-transparent resize-none outline-none text-white/90 leading-relaxed placeholder-text-tertiary"
                            style={{ flex: 1, padding: '24px', minHeight: '300px', fontSize: '15px' }}
                          />
                        </div>
                      ) : activeTab === "radar" ? (
                        /* Send View: Dropzone Area */
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className={`dashed-dropzone flex-1 rounded-[28px] p-10 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-300 ${dragActive ? "active" : ""}`}
                        >
                          <div className="glowing-orb w-20 h-20 rounded-full flex items-center justify-center mb-6 text-accent">
                            <Folder className="w-10 h-10 animate-pulse text-accent" />
                          </div>
                          
                          <h3 className="text-xl font-bold text-white mb-3">ファイルをここにドロップ</h3>
                          <p className="text-sm text-text-secondary leading-relaxed max-w-[280px] mb-8">
                            またはクリックしてファイルを選択
                          </p>

                          <div className="flex gap-4">
                            <span className="px-4 py-2 rounded-full text-[11px] font-semibold bg-surface-secondary/40 border border-glass-border/40 text-text-secondary flex items-center gap-2 shadow-sm">
                              <Shield className="w-4 h-4 text-accent" /> 暗号化済み（エンドツーエンド）
                            </span>
                            <span className="px-4 py-2 rounded-full text-[11px] font-semibold bg-surface-secondary/40 border border-glass-border/40 text-text-secondary flex items-center gap-2 shadow-sm">
                              <Zap className="w-4 h-4 text-[var(--green)]" /> 高速P2P転送
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* Receive View */
                        <div className="flex-1 flex flex-col justify-center items-center py-6 text-center">
                          <div className="bg-white rounded-[24px] shadow-lg mb-8 transition-transform hover:scale-105 select-none" style={{ padding: '24px' }}>
                            <QRCodeSVG 
                              value={`https://crossdrop.app/connect?pin=${pin}`} 
                              size={160} 
                              level={"M"}
                              includeMargin={false}
                              bgColor={"#ffffff"}
                              fgColor={"#1e293b"}
                            />
                          </div>
                          
                          <span className="text-[12px] font-bold text-accent uppercase tracking-widest mb-2">受信 PIN コード</span>
                          <input
                            type="text"
                            value={pin}
                            maxLength={4}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              setPin(val);
                              if (val.length === 4) {
                                localStorage.setItem("crossdrop-manual-pin", val);
                                setIsManualPin(true);
                              }
                            }}
                            className="text-5xl lg:text-6xl font-black tracking-[0.2em] text-gradient pl-[0.2em] mb-5 bg-transparent border-none outline-none text-center w-full placeholder-white/20 transition-all focus:scale-105"
                            placeholder="----"
                          />
                          
                          <p className="text-sm text-text-secondary max-w-[320px] mb-8">
                            送信側の端末でこのPINコードを入力するか、QRコードをスキャンして共有を開始します
                          </p>

                          <div className="flex gap-4 mt-4">
                            <button
                              onClick={handleRegeneratePin}
                              className="bg-surface-secondary/40 hover:bg-surface-secondary/85 border border-glass-border rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                              style={{ padding: '16px 32px', minHeight: '54px' }}
                            >
                              <RefreshCw className="w-4 h-4 text-text-secondary" /> 再生成
                            </button>
                            <button
                              onClick={() => navigator.clipboard.writeText(pin)}
                              className="bg-surface-secondary/40 hover:bg-surface-secondary/85 border border-glass-border rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                              style={{ padding: '16px 32px', minHeight: '54px' }}
                            >
                              <Copy className="w-4 h-4 text-text-secondary" /> コピー
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* RIGHT SIDEBAR (Devices) */}
                <div className="w-[280px] flex-shrink-0 px-6 py-6 flex flex-col overflow-hidden select-none bg-surface-secondary/15 backdrop-blur-xl border border-glass-border rounded-3xl shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[13px] font-bold text-text-secondary">
                      接続可能なデバイス
                    </h3>
                    <button className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-white hover:bg-surface-secondary/50 transition-all cursor-pointer">
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar pb-4">
                    {peers.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="bg-surface-secondary/15 border border-glass-border/40 rounded-2xl p-10 py-16 flex items-center justify-center text-[13px] font-bold text-text-secondary shadow-inner text-center">
                          探索中...
                        </div>
                        {connectionStatus === "mock" && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-[11px] text-amber-500 leading-relaxed text-center font-medium">
                            ⚠️ 現在はオフライン検証用(Mock)モードです。TauriアプリとWebブラウザ間など異なる環境では認識できません。
                          </div>
                        )}
                        {(connectionStatus === "auth_error" || connectionStatus === "db_error") && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3.5 text-[11px] text-[var(--red)] leading-relaxed text-center font-medium">
                            ⚠️ Firebaseエラーにより検出できません。匿名認証やDBセキュリティルールの設定を確認してください。
                          </div>
                        )}
                      </div>
                    ) : (
                      peers.map((peer) => (
                        <button
                          key={peer.id}
                          onClick={() => triggerFileSelection(peer.id)}
                          className="w-full bg-surface-secondary/20 hover:bg-surface-secondary/50 border border-glass-border/50 hover:border-accent/30 rounded-2xl p-4 flex items-center gap-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98]"
                        >
                          {renderAvatar(peer.avatar, peer.isTauri, "w-11 h-11", "w-5 h-5")}
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white truncate leading-tight">{peer.name}</h4>
                            <p className="text-[10px] text-text-secondary mt-1">
                              {peer.isTauri ? "デスクトップ" : "ブラウザ"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                              <span className="text-[9px] text-[var(--green)] font-semibold">オンライン</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="signal-bars">
                              <span className="signal-bar active" />
                              <span className="signal-bar active" />
                              <span className="signal-bar active" />
                              <span className="signal-bar" />
                            </div>
                            <ChevronRight className="w-4 h-4 text-text-tertiary" />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  
                  {/* Hint */}
                  <div className="mt-auto pt-4 text-[10px] text-text-tertiary leading-relaxed px-1">
                    <p>同じネットワーク上のデバイスが自動的に表示されます。見つからない場合は、更新ボタンを押してください。</p>
                  </div>
                </div>
              </div>

              {/* ===== BOTTOM RECENT TRANSFERS STRIP ===== */}
              <div className="border-t border-glass-border/30 px-7 py-5 mt-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-bold text-text-secondary flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-accent" /> 最近の転送
                  </h3>
                  {recentTransfers.length > 0 && (
                    <span className="text-[10px] text-text-tertiary cursor-pointer hover:text-accent transition-colors">すべて表示 &gt;</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {recentTransfers.length === 0 ? (
                    <div className="col-span-3 bg-surface-secondary/10 border border-dashed border-glass-border/30 rounded-2xl p-4 text-center text-xs text-text-tertiary">
                      転送履歴はありません
                    </div>
                  ) : (
                    recentTransfers.slice(-3).reverse().map((tr) => (
                      <div 
                        key={tr.fileId} 
                        className={`bg-surface-secondary/15 border border-glass-border/40 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-surface-secondary/30 transition-all duration-200 ${isTauri && tr.savedPath ? "cursor-context-menu" : ""}`}
                        onContextMenu={(e) => handleHistoryItemContextMenu(e, tr.savedPath)}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          tr.status === "completed" 
                            ? "bg-[var(--green)]/15 text-[var(--green)]" 
                            : "bg-[var(--red)]/15 text-[var(--red)]"
                        }`}>
                          {tr.type === "send" ? <Upload className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold truncate text-white" title={tr.name}>{tr.name}</h4>
                          <p className="text-[9px] text-text-secondary mt-0.5">
                            {formatBytes(tr.size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {tr.status === "completed" ? (
                            <>
                              {isTauri && tr.savedPath && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRevealFile(tr.savedPath);
                                  }}
                                  className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary border border-glass-border text-text-secondary hover:text-white transition-all cursor-pointer mr-1"
                                  title="保存フォルダを開く"
                                >
                                  <Folder className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <Check className="w-3.5 h-3.5 text-[var(--green)]" />
                              <span className="text-[10px] font-semibold text-[var(--green)]">完了</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5 text-[var(--red)]" />
                              <span className="text-[10px] font-semibold text-[var(--red)]">失敗</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ===== FOOTER STATUS BAR ===== */}
              <footer className="border-t border-glass-border/20 px-7 py-2.5 flex items-center justify-between text-[10px] text-text-tertiary flex-shrink-0 bg-surface-secondary/10">
                <div className="flex items-center gap-6">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    CrossDrop v0.1.0
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" /> P2P接続中
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> 暗号化済み
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3 h-3" /> LAN優先
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> WebRTC
                  </span>
                  <span className="font-mono font-semibold text-[var(--green)]">
                    4ms
                  </span>
                </div>
              </footer>
            </div>

            {/* 2. MOBILE APP LAYOUT (< lg) */}
            <div className="lg:hidden flex-1 flex flex-col overflow-hidden relative">
              {/* Mobile Header */}
              <header className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0 relative">
                <div className="w-9 h-9">
                  {renderAvatar(deviceAvatar, isTauri, "w-9 h-9", "w-4.5 h-4.5")}
                </div>
                
                <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pt-1 font-bold text-base text-white tracking-wide">
                  CrossDrop
                </h1>

                <button 
                  onClick={() => setShowSettings(true)}
                  className="w-9 h-9 flex items-center justify-center text-text-secondary hover:text-white transition-all active:scale-95 cursor-pointer"
                >
                  <SettingsIcon className="w-5.5 h-5.5" />
                </button>
              </header>


              {/* Main Scrolling Area */}
              <main className="flex-1 overflow-y-auto px-5 pb-24 no-scrollbar">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={showHistory ? "history" : activeTransfer ? "active-transfer" : "dashboard"}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full"
                  >
                    {showHistory ? (
                      /* Mobile history page style */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-accent" /> 転送履歴
                          </h3>
                          <span className="text-[10px] text-text-secondary">全 {recentTransfers.length} 件</span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {recentTransfers.length === 0 ? (
                            <div className="text-center py-12 text-xs text-text-secondary">
                              履歴はありません
                            </div>
                          ) : (
                            recentTransfers.slice().reverse().map((tr) => (
                              <div 
                                key={tr.fileId} 
                                className={`bg-surface-secondary/30 border border-glass-border/40 ${isTauri && tr.savedPath ? "cursor-context-menu" : ""}`} 
                                style={{ padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}
                                onContextMenu={(e) => handleHistoryItemContextMenu(e, tr.savedPath)}
                              >
                                <div className={`rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  tr.status === "completed" 
                                    ? "bg-[var(--green)]/10 text-[var(--green)]" 
                                    : "bg-[var(--red)]/10 text-[var(--red)]"
                                }`} style={{ width: '44px', height: '44px' }}>
                                  {tr.type === "send" ? <Upload className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-bold text-white truncate" style={{ marginBottom: '4px' }}>{tr.name}</h4>
                                  <p className="text-[10px] text-text-secondary">
                                    {formatBytes(tr.size)} · {tr.status === "completed" ? "完了" : "失敗"}
                                  </p>
                                </div>
                                {tr.status === "completed" ? (
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {isTauri && tr.savedPath && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRevealFile(tr.savedPath);
                                        }}
                                        className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary border border-glass-border text-text-secondary hover:text-white transition-all cursor-pointer"
                                        title="保存フォルダを開く"
                                      >
                                        <Folder className="w-4 h-4" />
                                      </button>
                                    )}
                                    <Check className="w-5 h-5 text-[var(--green)]" />
                                  </div>
                                ) : (
                                  <X className="w-5 h-5 text-[var(--red)] flex-shrink-0" />
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : activeTransfer ? (
                      /* Mobile active progress view */
                      <div className="py-6 flex items-center justify-center h-full my-auto">
                        {(() => {
                          const peer = getPeerFromTransfer(activeTransfer);
                          if (!peer) return null;
                          return (
                            <div className="bg-surface-secondary/30 border border-glass-border/60 rounded-3xl p-6 flex flex-col items-center w-full shadow-lg">
                              <div className="flex items-center justify-between w-full mb-6">
                                <div className="flex flex-col items-center gap-1.5">
                                  {renderAvatar(activeTransfer.type === "send" ? deviceAvatar : peer.avatar, activeTransfer.type === "send" ? isTauri : peer.isTauri, "w-12 h-12", "w-5.5 h-5.5")}
                                  <span className="text-[10px] font-bold text-text-secondary truncate max-w-[80px]">
                                    {activeTransfer.type === "send" ? "自分" : peer.name}
                                  </span>
                                </div>

                                <div className="flex-1 px-3 relative flex items-center justify-center">
                                  <div className="w-full border-t border-dashed border-accent/40 relative">
                                    {activeTransfer.status === "transferring" && (
                                      <div className="transfer-pulse-dot" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col items-center gap-1.5">
                                  {renderAvatar(activeTransfer.type === "send" ? peer.avatar : deviceAvatar, activeTransfer.type === "send" ? peer.isTauri : isTauri, "w-12 h-12", "w-5.5 h-5.5")}
                                  <span className="text-[10px] font-bold text-text-secondary truncate max-w-[80px]">
                                    {activeTransfer.type === "send" ? peer.name : "自分"}
                                  </span>
                                </div>
                              </div>

                              <div className="text-center w-full mb-4">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-accent/15 text-accent border border-accent/25 uppercase tracking-wider mb-2 inline-block">
                                  {activeTransfer.type === "send" ? "送信中" : "受信中"}
                                </span>
                                <h4 className="text-sm font-bold truncate max-w-[240px] mx-auto text-white mb-1">{activeTransfer.name}</h4>
                                <p className="text-[10px] text-text-secondary">{formatBytes(activeTransfer.size)}</p>
                              </div>

                              <div className="w-full mb-5">
                                <div className="flex justify-between text-[11px] text-text-secondary mb-1.5">
                                  <span>{activeTransfer.status === "connecting" ? "接続中..." : `${activeTransfer.progress}%`}</span>
                                  {activeTransfer.status === "transferring" && (
                                    <span>{formatBytes(activeTransfer.speed)}/s · 残り {formatTime(activeTransfer.timeLeft)}</span>
                                  )}
                                </div>
                                <div className="w-full bg-surface-tertiary/40 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className="h-full bg-accent rounded-full transition-all duration-300"
                                    style={{ width: `${activeTransfer.progress}%` }}
                                  />
                                </div>
                              </div>

                              <button
                                onClick={() => cancelTransfer(peer.id)}
                                className="bg-red/10 hover:bg-red/20 border border-red/20 text-red text-xs font-bold rounded-xl transition-all cursor-pointer"
                                style={{ padding: '16px 24px', minHeight: '52px' }}
                              >
                                キャンセル
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    ) : activeTab === "text" ? (
                      /* Mobile Text Shared View */
                      <div className="flex flex-col h-full" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', paddingTop: '16px', paddingBottom: '32px' }}>
                        <div className="border border-glass-border bg-surface-secondary/40 rounded-2xl shadow-sm" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
                          <FileText className="w-5 h-5 text-accent flex-shrink-0" />
                          <h3 className="font-bold text-white text-sm" style={{ margin: 0 }}>リアルタイムテキスト</h3>
                          <span className="bg-accent/20 text-accent font-bold tracking-wide" style={{ marginLeft: 'auto', fontSize: '9px', padding: '4px 8px', borderRadius: '9999px' }}>全員が編集可能</span>
                        </div>
                        <textarea
                          value={sharedText}
                          onChange={(e) => updateSharedText(e.target.value)}
                          placeholder="ここにテキストを入力すると、同じPINコードを持つすべてのデバイスにリアルタイムで同期されます..."
                          className="w-full bg-surface-secondary/20 border border-glass-border resize-none outline-none text-white/90 leading-relaxed placeholder-text-tertiary shadow-inner focus:border-accent/40 transition-colors"
                          style={{ flex: 1, padding: '20px', borderRadius: '24px', fontSize: '15px' }}
                        />
                      </div>
                    ) : (
                      /* Main Dashboard (Matches Mockup) */
                      <div className="flex flex-col gap-6">
                        
                        {/* PIN Section */}
                        <div className="text-center mt-2">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
                            <span className="text-[12px] font-bold text-text-secondary">接続待機中</span>
                          </div>
                          <p className="text-[11px] text-text-tertiary font-semibold mb-1">この端末のPIN</p>
                          <h2 className="text-[64px] font-black text-white leading-none tracking-wider mb-3">{pin}</h2>
                        </div>

                        {/* Radar Animation (Reverted) */}
                        <div className="flex flex-col items-center justify-center w-full gap-4 mt-4">
                          <div className="relative w-[160px] h-[160px] flex items-center justify-center flex-shrink-0">
                            <div className="absolute inset-0 rounded-full border border-accent/20 animate-ping opacity-40" style={{ animationDuration: "3s" }} />
                            <div className="absolute inset-4 rounded-full border border-accent/15 animate-pulse" style={{ animationDuration: "4s" }} />
                            <div className="absolute w-20 h-20 rounded-full bg-surface-secondary border border-glass-border flex items-center justify-center shadow-xl z-10">
                              {renderAvatar(deviceAvatar, isTauri, "w-12 h-12", "w-5 h-5")}
                            </div>
                          </div>

                          <div className="text-center flex flex-col items-center justify-center w-full">
                            <h3 className="text-[14px] font-bold text-white mb-1.5 text-center">近くの端末を探しています</h3>
                            <p className="text-[11px] text-text-secondary leading-relaxed max-w-[220px] text-center">
                              送信するデバイスをタップしてください
                            </p>
                          </div>
                        </div>

                        {/* Device List */}
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <h3 className="text-[13px] font-bold text-text-secondary">
                              接続可能なデバイス
                            </h3>
                            <button className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-white hover:bg-surface-secondary/50 transition-all cursor-pointer">
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {peers.length === 0 ? (
                            <div className="bg-surface-secondary/15 border border-glass-border/40 rounded-2xl p-8 text-center text-xs text-text-secondary">
                              探索中...
                            </div>
                          ) : (
                            peers.map((peer) => (
                              <button
                                key={peer.id}
                                onClick={() => triggerFileSelection(peer.id)}
                                className="w-full bg-surface-secondary/20 hover:bg-surface-secondary/50 border border-glass-border/50 hover:border-accent/30 rounded-[18px] p-4 flex items-center gap-4 text-left transition-all duration-200 cursor-pointer active:scale-[0.98]"
                              >
                                {renderAvatar(peer.avatar, peer.isTauri, "w-[46px] h-[46px]", "w-5 h-5")}
                                
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-[15px] font-bold text-white truncate leading-tight">{peer.name}</h4>
                                  <p className="text-[11px] text-text-secondary mt-1">
                                    {peer.isTauri ? "デスクトップ" : "ブラウザ"}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                                    <span className="text-[10px] text-[var(--green)] font-semibold tracking-wide">オンライン</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className="signal-bars scale-[0.85]">
                                    <span className="signal-bar active" />
                                    <span className="signal-bar active" />
                                    <span className="signal-bar active" />
                                    <span className="signal-bar" />
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>

              {/* QR Scan Floating Button */}
              {!showHistory && !activeTransfer && (
                <div className="absolute inset-x-0 z-40 flex justify-center pointer-events-none" style={{ bottom: '104px' }}>
                  <div className="pointer-events-auto">
                    <button
                      onClick={() => setShowCameraScanner(true)}
                      className="bg-accent/90 hover:bg-accent backdrop-blur-md text-white shadow-lg shadow-accent/20 border border-accent/50 rounded-full flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                      style={{ padding: '14px 28px' }}
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-sm font-bold tracking-wide">QRをスキャン</span>
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={qrInputRef}
                      onChange={handleQrScan}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {/* Mobile Floating Bottom Navigation Bar */}
              <div className="absolute bottom-0 inset-x-0 bg-surface/95 border-t border-glass-border/60 flex items-center justify-around z-30 px-6 backdrop-blur-xl" style={{ paddingBottom: '32px', paddingTop: '16px' }}>
                <button
                  onClick={() => {
                    setShowHistory(false);
                    if (activeTab === "text") setActiveTab("radar");
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    !showHistory && activeTab !== "text" ? "text-[#0A84FF]" : "text-text-secondary hover:text-white"
                  }`}
                  style={{ minWidth: '64px' }}
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-[10px] font-bold">送受信</span>
                </button>

                <button
                  onClick={() => {
                    setShowHistory(true);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    showHistory ? "text-[#0A84FF]" : "text-text-secondary hover:text-white"
                  }`}
                  style={{ minWidth: '64px' }}
                >
                  <Clock className="w-6 h-6" />
                  <span className="text-[10px] font-bold">履歴</span>
                </button>

                <button
                  onClick={() => {
                    setShowHistory(false);
                    setActiveTab("text");
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    !showHistory && activeTab === "text" ? "text-[#0A84FF]" : "text-text-secondary hover:text-white"
                  }`}
                  style={{ minWidth: '64px' }}
                >
                  <FileText className="w-6 h-6" />
                  <span className="text-[10px] font-bold">テキスト</span>
                </button>
              </div>
            </div>

            {/* Hidden file selector input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
          </>
        )}
      </div>

      {/* ===== PREMIUM SYSTEM SETTINGS MODAL ===== */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="glass-panel w-full max-w-[500px] sm:max-w-[700px] h-[640px] sm:h-[560px] rounded-3xl overflow-hidden flex flex-col z-10 shadow-[0_25px_60px_rgba(0,0,0,0.55)] border border-glass-border"
            >
              {/* Settings Header */}
              <div className="flex items-center justify-between px-6 sm:px-8 pt-5 sm:pt-6 pb-4 sm:pb-5 border-b border-glass-border">
                <h3 className="text-lg sm:text-[20px] font-bold tracking-tight text-white flex items-center gap-2">
                  <SettingsIcon className="w-5.5 h-5.5 text-accent" /> システム設定
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-secondary flex items-center justify-center hover:bg-surface-tertiary transition-all active:scale-95 cursor-pointer border border-glass-border text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Settings Content Container */}
              <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
                
                {/* Left Sidebar (Desktop only) */}
                <div className="hidden sm:flex flex-col w-[200px] border-r border-glass-border/40 bg-surface-secondary/15 p-4 gap-1 select-none">
                  {(["general", "connection", "files", "appearance"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`sidebar-btn text-left ${settingsTab === tab ? "active" : "text-text-secondary hover:text-white"}`}
                    >
                      {tab === "general" && <User className="w-4 h-4" />}
                      {tab === "connection" && <Wifi className="w-4 h-4" />}
                      {tab === "files" && <Folder className="w-4 h-4" />}
                      {tab === "appearance" && <Sun className="w-4 h-4" />}
                      
                      <span>
                        {tab === "general" && "アカウント & プロフィール"}
                        {tab === "connection" && "接続 & PIN設定"}
                        {tab === "files" && "保存ディレクトリ"}
                        {tab === "appearance" && "テーマ & 外観"}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Segmented control for Mobile settings */}
                <div className="px-6 pt-4 pb-2 sm:hidden select-none">
                  <div className="segmented-control p-1 rounded-xl">
                    {(["general", "connection", "files", "appearance"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setSettingsTab(tab)}
                        className={`segmented-control-btn py-2 text-[10px] ${settingsTab === tab ? "active" : ""}`}
                      >
                        {tab === "general" && "アカウント"}
                        {tab === "connection" && "接続"}
                        {tab === "files" && "保存先"}
                        {tab === "appearance" && "外観"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Pane (Scrollable settings form) */}
                <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 sm:py-6 no-scrollbar">
                  {settingsTab === "general" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                      <div className="bg-surface-secondary/20 border border-glass-border/60 rounded-2xl" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">プロフィール設定</h4>
                        
                        {/* Device Name input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label className="text-xs font-bold text-text-secondary">デバイス表示名</label>
                          <input
                            type="text"
                            value={deviceName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDeviceName(val);
                              localStorage.setItem("crossdrop-device-name", val);
                            }}
                            maxLength={20}
                            className="w-full bg-surface-secondary border border-glass-border rounded-xl text-sm focus:outline-none focus:ring-1.5 focus:ring-accent/50 transition-all text-white placeholder-text-tertiary"
                            style={{ padding: '14px 16px', minHeight: '48px' }}
                            placeholder="デバイス名を入力"
                          />
                        </div>

                        {/* Photo avatar upload */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <label className="text-xs font-bold text-text-secondary">カスタムアバター画像</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            {renderAvatar(deviceAvatar, isTauri, "w-16 h-16", "w-7 h-7")}

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={() => avatarFileInputRef.current?.click()}
                                className="bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer text-center hover:scale-[1.02] active:scale-98 shadow-md shadow-accent/10"
                                style={{ padding: '14px 20px', minHeight: '46px' }}
                              >
                                写真をアップロード
                              </button>
                              <p className="text-[10px] text-text-secondary leading-snug">JPG, PNGに対応 (自動で正方形にトリミング & 圧縮)</p>
                              <input 
                                type="file"
                                ref={avatarFileInputRef}
                                onChange={handleAvatarUpload}
                                accept="image/*"
                                className="hidden"
                              />
                            </div>
                          </div>

                          {/* Preset avatar grid */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">またはプリセットグラデーション</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '16px' }}>
                              {PRESET_AVATARS.map((av) => (
                                <button
                                  key={av.id}
                                  type="button"
                                  onClick={() => {
                                    setDeviceAvatar(av.id);
                                    localStorage.setItem("crossdrop-device-avatar", av.id);
                                  }}
                                  className={`relative w-full aspect-square rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
                                    deviceAvatar === av.id ? "scale-105 ring-2 ring-accent ring-offset-2 ring-offset-transparent z-10" : "hover:scale-105 opacity-80 hover:opacity-100"
                                  }`}
                                  style={{ background: av.gradient }}
                                >
                                  {deviceAvatar === av.id && (
                                    <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="h-px bg-glass-border/40" />

                      {/* General options toggles */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                          <div style={{ flex: 1 }}>
                            <p className="text-sm font-semibold text-white" style={{ marginBottom: '4px' }}>自動起動</p>
                            <p className="text-xs text-text-secondary">PCのブート時にバックグラウンドで起動</p>
                          </div>
                          <label className="switch">
                            <input type="checkbox" />
                            <span className="slider"></span>
                          </label>
                        </div>

                        <div className="h-px bg-glass-border/20" />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                          <div style={{ flex: 1 }}>
                            <p className="text-sm font-semibold text-white" style={{ marginBottom: '4px' }}>トレイに最小化</p>
                            <p className="text-xs text-text-secondary">ウィンドウを閉じるとタスクトレイに格納</p>
                          </div>
                          <label className="switch">
                            <input type="checkbox" defaultChecked />
                            <span className="slider"></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "connection" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                        <div style={{ flex: 1 }}>
                          <p className="text-sm font-semibold text-white" style={{ marginBottom: '4px' }}>接続を維持</p>
                          <p className="text-xs text-text-secondary">転送完了後もピアとの接続セッションをキープ</p>
                        </div>
                        <label className="switch">
                          <input type="checkbox" defaultChecked />
                          <span className="slider"></span>
                        </label>
                      </div>
                      
                      <div className="h-px bg-glass-border/40" />

                      <div style={{ padding: '12px 0' }}>
                        <p className="text-sm font-semibold text-white" style={{ marginBottom: '8px' }}>接続ステータス</p>
                        <div className="bg-surface-secondary/45 border border-glass-border rounded-2xl p-4 flex flex-col gap-3">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span className="text-xs text-text-secondary">シグナリングサーバー:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className={`w-2 h-2 rounded-full ${
                                connectionStatus === "connected" ? "bg-[var(--green)] animate-pulse" :
                                connectionStatus === "mock" ? "bg-amber-500" :
                                connectionStatus === "auth_error" || connectionStatus === "db_error" ? "bg-[var(--red)]" :
                                "bg-blue-500"
                              }`} />
                              <span className="text-xs font-bold text-white">
                                {connectionStatus === "connected" && "オンライン接続中 (Firebase)"}
                                {connectionStatus === "mock" && "ローカル検証用 (Mockモード)"}
                                {connectionStatus === "authenticating" && "Firebase 認証中..."}
                                {connectionStatus === "authenticated" && "Firebase 認証完了"}
                                {connectionStatus === "initializing" && "初期化中..."}
                                {connectionStatus === "auth_error" && "認証エラー (要設定確認)"}
                                {connectionStatus === "db_error" && "DBアクセスエラー (要ルール確認)"}
                              </span>
                            </div>
                          </div>
                          
                          {connectionStatus === "mock" && (
                            <p className="text-[11px] text-amber-500/90 leading-relaxed">
                              ⚠️ 環境変数に Firebase の設定がないため、BroadcastChannel による Mock モードで動作しています。同じPC・同じブラウザの異なるタブ間でのみ接続が可能です。アプリ版とブラウザ間など異なるコンテキストでは認識できません。
                            </p>
                          )}
                          {(connectionStatus === "auth_error" || connectionStatus === "db_error") && (
                            <p className="text-[11px] text-[var(--red)]/90 leading-relaxed">
                              ⚠️ Firebaseへの接続でエラーが発生しました。匿名認証が有効になっているか、または Realtime Database のセキュリティルールが正しく設定されているかご確認ください。
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-glass-border/40" />

                      <div style={{ padding: '12px 0' }}>
                        <p className="text-sm font-semibold text-white" style={{ marginBottom: '16px' }}>カスタム PIN ルームコード</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <input 
                              type="text" 
                              value={pin}
                              maxLength={4}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                setPin(val);
                                if (val.length === 4) {
                                  localStorage.setItem("crossdrop-manual-pin", val);
                                  setIsManualPin(true);
                                }
                              }}
                              className="bg-surface-secondary border border-glass-border rounded-xl text-base font-black text-center w-28 tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-accent/50 text-white"
                              style={{ padding: '12px 16px', minHeight: '44px' }}
                            />
                            <button
                              onClick={handleRegeneratePin}
                              className="bg-accent text-white hover:bg-accent/90 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md shadow-accent/10"
                              style={{ padding: '12px 20px', minHeight: '44px' }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> PINを再生成
                            </button>
                          </div>
                          {isManualPin && (
                            <button
                              type="button"
                              onClick={async () => {
                                localStorage.removeItem("crossdrop-manual-pin");
                                setIsManualPin(false);
                                setPin("----");
                                try {
                                  const res = await fetch("https://api.ipify.org?format=json");
                                  const data = await res.json();
                                  if (data && data.ip) {
                                    let hash = 0;
                                    const ipStr = data.ip;
                                    for (let i = 0; i < ipStr.length; i++) {
                                      hash = ipStr.charCodeAt(i) + ((hash << 5) - hash);
                                    }
                                    const generatedPin = (1000 + (Math.abs(hash) % 9000)).toString();
                                    setPin(generatedPin);
                                  }
                                } catch {
                                  const storedPin = Math.floor(1000 + Math.random() * 9000).toString();
                                  setPin(storedPin);
                                }
                              }}
                              className="text-xs text-accent hover:underline text-left cursor-pointer font-semibold"
                              style={{ marginTop: '12px' }}
                            >
                              ← ローカルWi-Fi自動接続（IP検出）に戻す
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "files" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      {isTauri ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
                            <div style={{ flex: 1 }}>
                              <p className="text-sm font-semibold text-white" style={{ marginBottom: '4px' }}>保存先を毎回選択（その都度聞く）</p>
                              <p className="text-xs text-text-secondary">ファイル受信時に保存先を選択するダイアログを表示</p>
                            </div>
                            <label className="switch">
                              <input 
                                type="checkbox" 
                                checked={askSavePath} 
                                onChange={(e) => {
                                  setAskSavePath(e.target.checked);
                                  localStorage.setItem("crossdrop-ask-save-path", String(e.target.checked));
                                }} 
                              />
                              <span className="slider"></span>
                            </label>
                          </div>
                          
                          <div className="h-px bg-glass-border/40" />

                          <div style={{ padding: '8px 0', opacity: askSavePath ? 0.5 : 1, pointerEvents: askSavePath ? 'none' : 'auto' }}>
                            <p className="text-sm font-semibold text-white" style={{ marginBottom: '16px' }}>既定の保存先フォルダ</p>
                            <input 
                              type="text" 
                              value={saveDirectory === "Downloads" ? "システムダウンロードフォルダ" : customSaveDir} 
                              readOnly
                              className="w-full bg-surface-secondary border border-glass-border rounded-xl text-xs text-text-secondary truncate"
                              style={{ padding: '16px 20px', minHeight: '52px', marginBottom: '16px' }}
                            />
                            <button
                              onClick={async () => {
                                try {
                                  const { open } = await import("@tauri-apps/plugin-dialog");
                                  const selected = await open({
                                    directory: true,
                                    multiple: false,
                                  });
                                  if (selected && typeof selected === "string") {
                                    setCustomSaveDir(selected);
                                    localStorage.setItem("crossdrop-custom-save-dir", selected);
                                    setSaveDirectory("custom");
                                    localStorage.setItem("crossdrop-save-directory", "custom");
                                  }
                                } catch (e) {
                                  console.error("Tauri dialog open error:", e);
                                }
                              }}
                              className="w-full bg-surface-secondary/40 hover:bg-surface-secondary border border-glass-border rounded-xl text-xs font-bold transition-all hover:scale-[1.01] cursor-pointer text-center text-white"
                              style={{ padding: '16px 20px', minHeight: '52px' }}
                            >
                              保存フォルダを変更する
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="bg-surface-secondary/15 border border-glass-border/40 rounded-2xl p-6 text-center text-xs text-text-secondary leading-relaxed">
                          ブラウザ環境では、ブラウザで設定された既定のダウンロード先に保存されます。
                        </div>
                      )}

                      <div className="h-px bg-glass-border/40" />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
                        <div style={{ flex: 1 }}>
                          <p className="text-sm font-semibold text-white" style={{ marginBottom: '4px' }}>同名ファイルの上書きを回避</p>
                          <p className="text-xs text-text-secondary">競合時に自動で連番インデックスを付与</p>
                        </div>
                        <label className="switch">
                          <input type="checkbox" defaultChecked />
                          <span className="slider"></span>
                        </label>
                      </div>
                    </div>
                  )}

                  {settingsTab === "appearance" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                      <div style={{ padding: '12px 0' }}>
                        <p className="text-sm font-semibold text-white" style={{ marginBottom: '16px' }}>システムカラーテーマ</p>
                        <div className="segmented-control p-1 rounded-xl">
                          {(["dark", "light", "auto"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setTheme(t)}
                              className={`segmented-control-btn text-xs ${theme === t ? "active" : ""}`}
                              style={{ padding: '12px', minHeight: '44px' }}
                            >
                              {t === "auto" ? "自動 (OS追従)" : t === "dark" ? "ダークモード" : "ライトモード"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="h-px bg-glass-border/40" />

                      <div style={{ padding: '12px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <span className="text-sm font-semibold text-white">ウィンドウ透明度</span>
                          <span className="text-sm text-accent font-bold font-mono">{opacity}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="40" 
                          max="100" 
                          value={opacity}
                          onChange={(e) => setOpacity(parseInt(e.target.value))}
                          className="w-full animate-none" 
                        />
                      </div>

                      <div style={{ padding: '12px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <span className="text-sm font-semibold text-white">UIアニメーション処理速度</span>
                          <span className="text-sm text-accent font-bold font-mono">{animationLevel}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={animationLevel}
                          onChange={(e) => setAnimationLevel(parseInt(e.target.value))}
                          className="w-full animate-none" 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Settings Footer */}
              <div className="px-8 py-4 sm:py-5 border-t border-glass-border flex items-center justify-between text-xs text-text-secondary bg-surface-secondary/15 select-none">
                <span className="flex items-center gap-1.5 font-semibold text-text-tertiary">
                  <Info className="w-4 h-4 text-text-tertiary" /> Version 0.1.0
                </span>
                <span className="font-semibold text-text-tertiary">Powered by Next.js & WebRTC</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== RECIPIENT SELECTION MODAL ===== */}
      <AnimatePresence>
        {showRecipientModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowRecipientModal(false);
                setFilesToSend([]);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col z-10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-glass-border/50 bg-[#0f1115]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-glass-border" style={{ padding: '24px 32px' }}>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    <Upload className="w-5 h-5 text-accent animate-pulse" /> 送信先を選択
                  </h3>
                  <p className="text-xs text-text-secondary mt-1">
                    {filesToSend.length}個のファイル ({formatBytes(filesToSend.reduce((acc, f) => acc + f.size, 0))})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRecipientModal(false);
                    setFilesToSend([]);
                  }}
                  className="w-9 h-9 rounded-full bg-surface-secondary flex items-center justify-center hover:bg-surface-tertiary transition-all active:scale-95 cursor-pointer border border-glass-border text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Files list preview */}
              <div className="bg-surface-secondary/20 border-b border-glass-border/40 max-h-[140px] overflow-y-auto no-scrollbar" style={{ padding: '16px 32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filesToSend.map((file, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[12px] text-white/90 font-medium">
                      <span className="truncate max-w-[250px]">{file.name}</span>
                      <span className="font-mono">{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recipient list */}
              <div className="flex-1 overflow-y-auto no-scrollbar max-h-[350px]" style={{ padding: '24px 32px' }}>
                {peers.length === 0 ? (
                  <div className="py-14 text-center flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center border border-glass-border text-text-tertiary">
                      <Wifi className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">接続可能なデバイスが見つかりません</p>
                      <p className="text-xs text-text-secondary mt-1 max-w-[250px] mx-auto leading-relaxed">
                        相手のデバイスでCrossDropを開き、同じPINコードを入力して接続してください。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="flex justify-between items-center" style={{ paddingBottom: '8px' }}>
                      <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">オンラインデバイス</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedRecipients(peers.map(p => p.id))}
                          className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                        >
                          すべて選択
                        </button>
                        <span className="text-[10px] text-text-tertiary">|</span>
                        <button 
                          onClick={() => setSelectedRecipients([])}
                          className="text-[10px] font-bold text-text-secondary hover:underline cursor-pointer"
                        >
                          クリア
                        </button>
                      </div>
                    </div>

                    {peers.map((peer) => {
                      const isSelected = selectedRecipients.includes(peer.id);
                      return (
                        <button
                          key={peer.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRecipients(prev => prev.filter(id => id !== peer.id));
                            } else {
                              setSelectedRecipients(prev => [...prev, peer.id]);
                            }
                          }}
                          className={`w-full bg-surface-secondary/20 hover:bg-surface-secondary/40 border rounded-2xl flex items-center text-left transition-all duration-200 cursor-pointer ${
                            isSelected ? "border-accent/40 bg-accent/5" : "border-glass-border/50"
                          }`}
                          style={{ padding: '16px', gap: '16px' }}
                        >
                          {renderAvatar(peer.avatar, peer.isTauri, "w-10 h-10", "w-4.5 h-4.5")}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-white truncate leading-tight">{peer.name}</h4>
                            <p className="text-[9px] text-text-secondary mt-0.5">
                              {peer.isTauri ? "デスクトップ" : "ブラウザ"}
                            </p>
                          </div>
                          <div className="flex items-center justify-center w-5 h-5 rounded-md border border-glass-border flex-shrink-0 transition-all">
                            {isSelected && (
                              <div className="w-full h-full bg-accent flex items-center justify-center rounded-[5px]">
                                <Check className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="border-t border-glass-border bg-surface-secondary/15" style={{ padding: '24px 32px', display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => {
                    setShowRecipientModal(false);
                    setFilesToSend([]);
                  }}
                  className="flex-1 bg-surface-secondary hover:bg-surface-tertiary border border-glass-border text-white text-[13px] font-bold rounded-2xl transition-all cursor-pointer text-center shadow-md"
                  style={{ padding: '18px 24px', minHeight: '56px' }}
                >
                  キャンセル
                </button>
                <button
                  disabled={selectedRecipients.length === 0 || filesToSend.length === 0}
                  onClick={() => {
                    // Send files to each selected recipient
                    selectedRecipients.forEach(peerId => {
                      filesToSend.forEach(file => {
                        sendFile(peerId, file);
                      });
                    });
                    setShowRecipientModal(false);
                    setFilesToSend([]);
                  }}
                  className={`flex-1 text-white text-[13px] font-bold rounded-2xl transition-all text-center flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                    selectedRecipients.length === 0 || filesToSend.length === 0
                      ? "bg-accent/35 text-white/50 cursor-not-allowed border border-transparent shadow-none"
                      : "bg-accent hover:bg-accent/90 hover:scale-[1.02] active:scale-98 shadow-accent/15"
                  }`}
                  style={{ padding: '18px 24px', minHeight: '56px' }}
                >
                  送信する <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCameraScanner && (
          <CameraQrScanner
            onScanSuccess={(data) => {
              setShowCameraScanner(false);
              setTimeout(() => {
                const result = processScannedCode(data);
                if (result.success) {
                  alert(`QRコードを読み込みました！ (PIN: ${result.pin})`);
                } else {
                  alert(result.error || "無効なQRコードです。");
                }
              }, 100);
            }}
            onClose={() => setShowCameraScanner(false)}
            onFallbackSelect={() => {
              setShowCameraScanner(false);
              qrInputRef.current?.click();
            }}
          />
        )}
      </AnimatePresence>

      {contextMenu.visible && (
        <div 
          className="fixed z-50 glass-panel py-1.5 rounded-xl shadow-lg border border-glass-border/60 bg-surface-secondary/95 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              handleRevealFile(contextMenu.savedPath);
              setContextMenu({ ...contextMenu, visible: false });
            }}
            className="w-full text-left px-4 py-2 hover:bg-accent/15 hover:text-accent text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            保存フォルダを開く
          </button>
        </div>
      )}
    </div>
  );
}
