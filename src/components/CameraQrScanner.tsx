"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff, Image as ImageIcon, Loader2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import jsQR from "jsqr";

interface CameraQrScannerProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
  onFallbackSelect: () => void;
}

export default function CameraQrScanner({
  onScanSuccess,
  onClose,
  onFallbackSelect,
}: CameraQrScannerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const onScanSuccessRef = useRef(onScanSuccess);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;
    let localAnimationFrame: number;

    const startCamera = async () => {
      try {
        setIsLoading(true);
        setCameraError(null);

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStream = stream;
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); // Required for iOS Safari
          // Play video, catch potential errors
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn("Video auto-play interrupted:", playErr);
          }
        }

        setIsLoading(false);

        // Check torch capabilities
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          if ("torch" in capabilities) {
            setHasTorch(true);
          }
        }

        // Processing loop
        const scan = () => {
          if (!active) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              // Scale canvas to match video frames
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              
              const decoded = jsQR(imageData.data, imageData.width, imageData.height);
              if (decoded && decoded.data) {
                if (hasScannedRef.current) return;
                hasScannedRef.current = true;

                // Success feedback
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate(100);
                }

                // Stop camera track immediately to prevent camera remaining active during exit transition
                if (localStream) {
                  localStream.getTracks().forEach((track) => track.stop());
                }

                onScanSuccessRef.current(decoded.data);
                return; // Terminate scan loop
              }
            }
          }
          localAnimationFrame = requestAnimationFrame(scan);
        };

        localAnimationFrame = requestAnimationFrame(scan);
      } catch (err: any) {
        console.error("Camera startup error:", err);
        let errorMsg = "カメラの起動に失敗しました。";
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          errorMsg = "カメラのアクセス権限が拒否されました。ブラウザの設定でカメラへのアクセスを許可してください。";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          errorMsg = "利用可能なカメラが見つかりません。カメラデバイスが搭載されているか確認してください。";
        } else if (typeof window !== "undefined" && window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
          errorMsg = "セキュリティ上の理由（非HTTPS通信）により、ブラウザがカメラ機能を制限しています。HTTPS接続でお試しください。";
        }
        setCameraError(errorMsg);
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      active = false;
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (localAnimationFrame) {
        cancelAnimationFrame(localAnimationFrame);
      }
    };
  }, []);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const newTorchState = !torchOn;
        // Native torch constraints apply only if capabilities exist
        await track.applyConstraints({
          advanced: [{ torch: newTorchState }],
        } as any);
        setTorchOn(newTorchState);
      } catch (err) {
        console.error("Failed to toggle flashlight:", err);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 select-none"
    >
      {/* Hidden canvas for decoding */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera Video Feed */}
      {!cameraError && (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Real-time scanning finder mask */}
      {!cameraError && !isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-none">
          {/* Top dark area */}
          <div className="flex-1 bg-black/50 w-full" />
          
          <div className="flex flex-row w-full h-[280px]">
            {/* Left dark area */}
            <div className="flex-1 bg-black/50" />
            
            {/* Scanning viewport box */}
            <div className="w-[280px] h-[280px] relative border border-white/20 overflow-hidden flex items-center justify-center">
              {/* Corner Indicators */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-accent" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-accent" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-accent" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-accent" />
              
              {/* Sliding Scanner Laser Line */}
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scanner shadow-[0_0_8px_var(--accent)]" />
            </div>
            
            {/* Right dark area */}
            <div className="flex-1 bg-black/50" />
          </div>

          {/* Bottom dark area */}
          <div className="flex-1 bg-black/50 w-full flex flex-col items-center justify-center p-4">
            <p className="text-white/80 text-sm font-medium tracking-wide drop-shadow text-center max-w-[280px]">
              相手のQRコードをこの枠内に収めると、自動でスキャンされます
            </p>
          </div>
        </div>
      )}

      {/* Spinner Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
          <p className="text-white/75 text-sm font-medium">カメラを起動しています...</p>
        </div>
      )}

      {/* Camera Error UI Panel */}
      {cameraError && (
        <div className="absolute inset-x-6 max-w-sm mx-auto glass-panel p-8 rounded-3xl border border-glass-border/40 text-center flex flex-col items-center justify-center z-20">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-white font-bold text-lg mb-2">カメラが起動できません</h4>
          <p className="text-text-secondary text-sm leading-relaxed mb-6">
            {cameraError}
          </p>
          <button
            onClick={onFallbackSelect}
            className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-3 px-5 rounded-2xl text-sm transition-all duration-200 shadow-md shadow-accent/15 cursor-pointer"
          >
            写真ライブラリからQRを選択
          </button>
        </div>
      )}

      {/* Floating Control Buttons */}
      <div className="absolute top-8 inset-x-6 z-30 flex items-center justify-between pointer-events-none">
        {/* Flashlight switch */}
        {hasTorch && !cameraError && !isLoading ? (
          <button
            onClick={toggleTorch}
            className="pointer-events-auto w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/90 hover:text-white hover:bg-black/80 transition-all cursor-pointer shadow-lg active:scale-95"
          >
            {torchOn ? <ZapOff className="w-5 h-5 text-amber-400" /> : <Zap className="w-5 h-5" />}
          </button>
        ) : (
          <div className="w-11" />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="pointer-events-auto w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/90 hover:text-white hover:bg-black/80 transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Option Bar (Switch to file input) */}
      {!cameraError && !isLoading && (
        <div className="absolute bottom-10 z-30 inset-x-6 flex justify-center">
          <button
            onClick={onFallbackSelect}
            className="bg-black/70 backdrop-blur-lg border border-white/10 text-white/95 px-6 py-3.5 rounded-full flex items-center gap-2.5 shadow-xl hover:bg-black/90 active:scale-95 cursor-pointer text-sm font-semibold transition-all"
          >
            <ImageIcon className="w-4 h-4 text-accent" />
            <span>写真ライブラリから読み込む</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
