"use client";

import { useState, useEffect, useRef } from "react";

// WebRTC STUN servers
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

const CHUNK_SIZE = 16 * 1024; // 16KB chunks for mobile browser compatibility

export interface TransferProgress {
  fileId: string;
  name: string;
  size: number;
  progress: number; // 0 to 100
  speed: number; // bytes/sec
  timeLeft: number; // seconds
  status: "pending" | "connecting" | "transferring" | "completed" | "failed";
  type: "send" | "receive";
}

export function useWebRTC(
  deviceId: string,
  sendSignal: (targetDeviceId: string, type: "offer" | "answer" | "candidate", payload: unknown) => Promise<void>,
  isTauri: boolean
) {
  const [transfers, setTransfers] = useState<Record<string, TransferProgress>>({});
  const [connectionStates, setConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({});
  const activeTransfersRef = useRef<Record<string, {
    file: File | null;
    receivedChunks: ArrayBuffer[];
    receivedSize: number;
    startTime: number;
    lastUpdateTime: number;
    lastUpdateSize: number;
    tauriFilePath?: string;
  }>>({});
  
  const sendQueueRef = useRef<Array<{ targetDeviceId: string; fileId: string; file: File }>>([]);
  const currentSendingTxRef = useRef<{ targetDeviceId: string; fileId: string; file: File } | null>(null);
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});

  // Keep latest state in ref to avoid stale closures in WebRTC event handlers
  const transfersStateRef = useRef(transfers);
  useEffect(() => {
    transfersStateRef.current = transfers;
  }, [transfers]);

  // Clean up connections on unmount
  useEffect(() => {
    const pcs = peerConnectionsRef.current;
    const dcs = dataChannelsRef.current;
    return () => {
      Object.values(pcs).forEach((pc) => {
        try { pc.close(); } catch (e) {}
      });
      Object.values(dcs).forEach((dc) => {
        try { dc.close(); } catch (e) {}
      });
    };
  }, []);

  const closePeerConnection = (targetDeviceId: string) => {
    console.log(`[WebRTC] Closing peer connection for: ${targetDeviceId}`);
    const pc = peerConnectionsRef.current[targetDeviceId];
    if (pc) {
      try {
        pc.close();
      } catch (e) {
        console.error("Error closing peer connection:", e);
      }
      delete peerConnectionsRef.current[targetDeviceId];
    }
    const dc = dataChannelsRef.current[targetDeviceId];
    if (dc) {
      try {
        dc.close();
      } catch (e) {
        console.error("Error closing data channel:", e);
      }
      delete dataChannelsRef.current[targetDeviceId];
    }
  };

  // Helper to update transfer progress
  const updateTransfer = (fileId: string, updates: Partial<TransferProgress>) => {
    setTransfers((prev) => {
      const current = prev[fileId];
      if (!current) return prev;
      return {
        ...prev,
        [fileId]: { ...current, ...updates },
      };
    });
  };

  // Helper to dynamically calculate speed and remaining time
  const trackProgress = (fileId: string, currentSize: number, totalSize: number) => {
    const meta = activeTransfersRef.current[fileId];
    if (!meta) return;

    const now = Date.now();
    const elapsed = (now - meta.lastUpdateTime) / 1000; // in seconds

    // Update statistics every 500ms
    if (elapsed >= 0.5 || currentSize === totalSize) {
      const bytesSentSinceLastUpdate = currentSize - meta.lastUpdateSize;
      const currentSpeed = bytesSentSinceLastUpdate / elapsed; // bytes/sec
      
      // Smooth speed using a moving average (70% current, 30% historical)
      const prevSpeed = transfersStateRef.current[fileId]?.speed || currentSpeed;
      const smoothedSpeed = prevSpeed === 0 ? currentSpeed : prevSpeed * 0.3 + currentSpeed * 0.7;

      const remainingBytes = totalSize - currentSize;
      const timeLeft = smoothedSpeed > 0 ? Math.ceil(remainingBytes / smoothedSpeed) : 9999;

      meta.lastUpdateTime = now;
      meta.lastUpdateSize = currentSize;

      updateTransfer(fileId, {
        progress: Math.min(100, Math.round((currentSize / totalSize) * 100)),
        speed: Math.round(smoothedSpeed),
        timeLeft: currentSize === totalSize ? 0 : timeLeft,
        status: currentSize === totalSize ? "completed" : "transferring",
      });
    }
  };

  // Setup WebRTC peer connection listeners
  const setupPeerConnection = (targetDeviceId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current[targetDeviceId]) {
      return peerConnectionsRef.current[targetDeviceId];
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current[targetDeviceId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(targetDeviceId, "candidate", event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionStates((prev) => ({
        ...prev,
        [targetDeviceId]: pc.connectionState,
      }));

      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        console.warn(`P2P Connection lost with peer: ${targetDeviceId}`);
        // Mark active transfers for this peer as failed
        Object.keys(transfersStateRef.current).forEach((fid) => {
          if (fid.startsWith(`${targetDeviceId}-`)) {
            updateTransfer(fid, { status: "failed" });
          }
        });

        // Also check if current sending transfer belongs to this peer, and if so, fail it and clear it
        if (currentSendingTxRef.current && currentSendingTxRef.current.targetDeviceId === targetDeviceId) {
          currentSendingTxRef.current = null;
        }

        // Close peer connection and delete references
        closePeerConnection(targetDeviceId);

        // Process next in queue
        processSendQueue();
      }
    };

    if (isInitiator) {
      // Create Data Channel
      const dc = pc.createDataChannel("file-transfer", { ordered: true });
      setupDataChannel(targetDeviceId, dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(targetDeviceId, event.channel);
      };
    }

    return pc;
  };

  // Setup data channel listeners for receiving/sending data
  const setupDataChannel = (peerId: string, dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = 256 * 1024; // 256KB low watermark for flow control
    dataChannelsRef.current[peerId] = dc;

    dc.onopen = () => {
      console.log(`WebRTC Data Channel open with: ${peerId}`);
      // Send active transfer header if it matches the opened data channel's peer
      const currentTx = currentSendingTxRef.current;
      if (currentTx && currentTx.targetDeviceId === peerId) {
        console.log(`[WebRTC] Sending active transfer header for: ${currentTx.file.name} to ${peerId}`);
        updateTransfer(currentTx.fileId, { status: "connecting" });
        dc.send(
          JSON.stringify({
            type: "header",
            fileId: currentTx.fileId,
            name: currentTx.file.name,
            size: currentTx.file.size,
            mimeType: currentTx.file.type,
          })
        );
      } else {
        // Check if there are other files queued
        processSendQueue();
      }
    };

    dc.onclose = () => {
      console.log(`WebRTC Data Channel closed with: ${peerId}`);
      // Fail active transfers for this peer
      Object.keys(transfersStateRef.current).forEach((fid) => {
        if (fid.startsWith(`${peerId}-`)) {
          updateTransfer(fid, { status: "failed" });
        }
      });
      // Clear current transaction if it was to this peer
      const currentTx = currentSendingTxRef.current;
      if (currentTx && currentTx.targetDeviceId === peerId) {
        currentSendingTxRef.current = null;
      }
      closePeerConnection(peerId);
      processSendQueue();
    };

    dc.onmessage = async (event) => {
      if (typeof event.data === "string") {
        // Handle metadata messages
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "header") {
            const { fileId, name, size } = msg;
            console.log(`Incoming file header: ${name} (${size} bytes)`);

            // Initialize receiver record
            activeTransfersRef.current[fileId] = {
              file: null,
              receivedChunks: [],
              receivedSize: 0,
              startTime: Date.now(),
              lastUpdateTime: Date.now(),
              lastUpdateSize: 0,
            };

            // In Tauri mode: prepare file save path
            if (isTauri) {
              try {
                const { downloadDir } = await import("@tauri-apps/api/path");
                
                // Get system downloads path
                const dlPath = await downloadDir();
                const filePath = `${dlPath}/${name}`;
                activeTransfersRef.current[fileId].tauriFilePath = filePath;
              } catch (e) {
                console.error("Tauri FS preparation failed, falling back to RAM buffer:", e);
              }
            }

            setTransfers((prev) => ({
              ...prev,
              [fileId]: {
                fileId,
                name,
                size,
                progress: 0,
                speed: 0,
                timeLeft: 0,
                status: "transferring",
                type: "receive",
              },
            }));
            
            // Confirm receiver is ready
            dc.send(JSON.stringify({ type: "ack", fileId }));
          } 
          
          else if (msg.type === "eof") {
            const { fileId } = msg;
            const meta = activeTransfersRef.current[fileId];
            if (!meta) return;

            console.log(`EOF received for fileId: ${fileId}. Finalizing... (${meta.receivedChunks.length} chunks, ${meta.receivedSize} bytes)`);

            if (isTauri && meta.tauriFilePath) {
              // File is already saved chunk-by-chunk
              updateTransfer(fileId, { progress: 100, status: "completed", speed: 0, timeLeft: 0 });
              
              // Trigger a system notification in Tauri
              try {
                const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
                let hasPerm = await isPermissionGranted();
                if (!hasPerm) {
                  hasPerm = (await requestPermission()) === "granted";
                }
                if (hasPerm) {
                  sendNotification({ title: "ファイル受信完了", body: `「${transfersStateRef.current[fileId]?.name}」を受信しました。` });
                }
              } catch (e) {
                console.error(e);
              }
            } else {
              // Build blob from collected chunks and trigger browser download
              // Use small batches to avoid mobile memory pressure
              try {
                const fileName = transfersStateRef.current[fileId]?.name || "downloaded-file";
                const blob = new Blob(meta.receivedChunks);
                
                // Free the chunk references immediately to release memory
                meta.receivedChunks = [];
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                
                // Delay cleanup to ensure download starts
                setTimeout(() => {
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }, 1000);
                
                updateTransfer(fileId, { progress: 100, status: "completed", speed: 0, timeLeft: 0 });
              } catch (e) {
                console.error("Failed to assemble received file:", e);
                updateTransfer(fileId, { status: "failed" });
              }
            }

            // Cleanup local reference immediately
            delete activeTransfersRef.current[fileId];
          } 
          
          else if (msg.type === "ack") {
            // Sender gets acknowledgment to start streaming
            const { fileId } = msg;
            streamFileChunks(peerId, fileId);
          }
        } catch (e) {
          console.error("Data channel message parse error:", e);
        }
      } else {
        // Handle binary packet (File chunk)
        const arrayBuffer = event.data as ArrayBuffer;
        
        // Find which file is currently active in the activeTransfersRef for this peer.
        // It must match peerId, not have a local file reference (is a receive operation), and be currently transferring.
        const fileId = Object.keys(activeTransfersRef.current).find(
          (fid) => fid.startsWith(peerId) && 
                   !activeTransfersRef.current[fid].file &&
                   transfersStateRef.current[fid]?.status === "transferring"
        );
        
        if (!fileId) return;
        const meta = activeTransfersRef.current[fileId];
        if (!meta) return;

        meta.receivedChunks.push(arrayBuffer);
        meta.receivedSize += arrayBuffer.byteLength;

        // If in Tauri, write to disk chunk by chunk
        if (isTauri && meta.tauriFilePath) {
          try {
            const { writeFile } = await import("@tauri-apps/plugin-fs");
            const dataBytes = new Uint8Array(arrayBuffer);
            await writeFile(meta.tauriFilePath, dataBytes, { append: true });
          } catch (e) {
            console.error("Tauri direct disk write error:", e);
          }
        }

        // Get total size from state if available, fallback to 0
        const totalSize = transfersStateRef.current[fileId]?.size || 0;
        trackProgress(fileId, meta.receivedSize, totalSize);
      }
    };
  };

  // Helper function to stream file chunks safely with flow control
  const streamFileChunks = async (peerId: string, fileId: string) => {
    const dc = dataChannelsRef.current[peerId];
    const meta = activeTransfersRef.current[fileId];
    if (!dc || !meta || !meta.file) {
      if (currentSendingTxRef.current?.fileId === fileId) {
        currentSendingTxRef.current = null;
        processSendQueue();
      }
      return;
    }

    const file = meta.file;
    const totalSize = file.size;
    let offset = 0;

    meta.startTime = Date.now();
    meta.lastUpdateTime = Date.now();

    const stream = async () => {
      try {
        while (offset < totalSize) {
          if (dc.readyState !== "open") {
            throw new Error(`Data channel closed (state: ${dc.readyState})`);
          }

          // Flow control: Polling approach (highly reliable across all mobile browsers)
          if (dc.bufferedAmount > 1024 * 1024) { // 1MB threshold
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }

          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const buffer = await slice.arrayBuffer();
          
          if (dc.readyState !== "open") {
            throw new Error(`Data channel closed (state: ${dc.readyState})`);
          }
          
          dc.send(buffer);
          offset += buffer.byteLength;
          trackProgress(fileId, offset, totalSize);
          
          // Yield to UI loop occasionally
          if (offset % (CHUNK_SIZE * 10) === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
        
        // Wait for buffer to drain before sending EOF
        while (dc.bufferedAmount > 0 && dc.readyState === "open") {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "eof", fileId }));
        }

        updateTransfer(fileId, { progress: 100, status: "completed", speed: 0, timeLeft: 0 });
        delete activeTransfersRef.current[fileId];
        if (currentSendingTxRef.current?.fileId === fileId) {
          currentSendingTxRef.current = null;
          processSendQueue();
        }

      } catch (err) {
        console.error("WebRTC streaming error:", err);
        updateTransfer(fileId, { status: "failed" });
        if (currentSendingTxRef.current?.fileId === fileId) {
          currentSendingTxRef.current = null;
          processSendQueue();
        }
      }
    };

    stream();
  };

  // API: Initiate connection to a target peer
  const connectToPeer = async (targetDeviceId: string) => {
    console.log(`Initiating P2P connection to: ${targetDeviceId}`);
    const pc = setupPeerConnection(targetDeviceId, true);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(targetDeviceId, "offer", offer);
    } catch (e) {
      console.error("Failed to create/send WebRTC offer:", e);
      // If we fail here, the active transfer cannot proceed.
      const currentTx = currentSendingTxRef.current;
      if (currentTx && currentTx.targetDeviceId === targetDeviceId) {
        updateTransfer(currentTx.fileId, { status: "failed" });
        currentSendingTxRef.current = null;
        processSendQueue();
      }
    }
  };

  const processPendingCandidates = async (peerId: string, pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current[peerId] || [];
    if (candidates.length === 0) return;
    console.log(`[WebRTC] Processing ${candidates.length} buffered ICE candidates for ${peerId}`);
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error(`[WebRTC] Failed to add buffered ICE candidate for ${peerId}`, e);
      }
    }
    delete pendingCandidatesRef.current[peerId];
  };

  // API: Process incoming WebRTC signaling messages
  const handleSignal = async (msg: { from: string; type: "offer" | "answer" | "candidate"; payload: unknown }) => {
    const { from, type, payload } = msg;
    console.log(`Received signal: ${type} from ${from}`);

    let pc = peerConnectionsRef.current[from];

    if (type === "offer") {
      pc = setupPeerConnection(from, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(from, "answer", answer);
        
        // Flush any buffered candidates
        await processPendingCandidates(from, pc);
      } catch (e) {
        console.error("Failed to answer incoming WebRTC offer:", e);
      }
    } else if (type === "answer") {
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          
          // Flush any buffered candidates
          await processPendingCandidates(from, pc);
        } catch (e) {
          console.error("Failed to set remote WebRTC description:", e);
        }
      }
    } else if (type === "candidate") {
      const candidatePayload = payload as RTCIceCandidateInit;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
        } catch (e) {
          console.error("Failed to add ICE candidate:", e);
        }
      } else {
        // Buffer candidate until remote description is set
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidatePayload);
        console.log(`[WebRTC] Buffered incoming ICE candidate from ${from} (PC/remoteDesc not ready)`);
      }
    }
  };

  // Queue processing logic
  const processSendQueue = async () => {
    if (currentSendingTxRef.current) {
      console.log("[WebRTC Queue] Already sending another file, waiting...");
      return;
    }
    if (sendQueueRef.current.length === 0) {
      console.log("[WebRTC Queue] Send queue is empty.");
      return;
    }

    const nextTx = sendQueueRef.current.shift();
    if (!nextTx) return;

    currentSendingTxRef.current = nextTx;
    const { targetDeviceId, fileId, file } = nextTx;

    console.log(`[WebRTC Queue] Processing next file in queue: ${file.name} (ID: ${fileId})`);
    updateTransfer(fileId, { status: "connecting" });

    const dc = dataChannelsRef.current[targetDeviceId];
    if (dc && dc.readyState === "open") {
      console.log(`[WebRTC Queue] Data channel open for ${targetDeviceId}. Sending header.`);
      dc.send(
        JSON.stringify({
          type: "header",
          fileId,
          name: file.name,
          size: file.size,
          mimeType: file.type,
        })
      );
    } else {
      console.log(`[WebRTC Queue] Data channel not ready for ${targetDeviceId}. Initiating connection.`);
      await connectToPeer(targetDeviceId);
    }
  };

  // API: Send a file to a connected peer
  const sendFile = async (targetDeviceId: string, file: File) => {
    // Generate a unique transaction id for this transfer
    const uniqueSuffix = Math.random().toString(36).substring(2, 9);
    const fileId = `${deviceId}-${targetDeviceId}-${Date.now()}-${uniqueSuffix}`;
    
    // Store file metadata locally
    activeTransfersRef.current[fileId] = {
      file,
      receivedChunks: [],
      receivedSize: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      lastUpdateSize: 0,
    };

    // Register initial transfer status as "pending"
    setTransfers((prev) => ({
      ...prev,
      [fileId]: {
        fileId,
        name: file.name,
        size: file.size,
        progress: 0,
        speed: 0,
        timeLeft: 0,
        status: "pending",
        type: "send",
      },
    }));

    // Queue the transfer
    sendQueueRef.current.push({ targetDeviceId, fileId, file });
    
    // Process the queue
    processSendQueue();
  };

  // API: Cancel an active or pending transfer and clean up connection
  const cancelTransfer = (targetDeviceId: string) => {
    console.log(`[WebRTC] Cancelling transfer for peer: ${targetDeviceId}`);
    
    // Remove all queued files for this target peer
    sendQueueRef.current = sendQueueRef.current.filter((tx) => tx.targetDeviceId !== targetDeviceId);

    // Fail any active transfer in the React state for this peer
    Object.keys(transfersStateRef.current).forEach((fileId) => {
      if (fileId.includes(`-${targetDeviceId}-`) && (transfersStateRef.current[fileId].status === "connecting" || transfersStateRef.current[fileId].status === "transferring" || transfersStateRef.current[fileId].status === "pending")) {
        updateTransfer(fileId, { status: "failed" });
      }
    });

    // Reset current active sending transaction if it matches
    const currentTx = currentSendingTxRef.current;
    if (currentTx && currentTx.targetDeviceId === targetDeviceId) {
      currentSendingTxRef.current = null;
    }

    // Close and delete peer connection references
    closePeerConnection(targetDeviceId);

    // Move to the next item in the queue
    processSendQueue();
  };

  return {
    transfers,
    connectionStates,
    connectToPeer,
    handleSignal,
    sendFile,
    cancelTransfer,
  };
}
