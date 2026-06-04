"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
  targetColor: string;
}

export default function LiquidBackground({ theme }: { theme: "dark" | "light" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Dynamic colors based on theme
    const getColors = (isLight: boolean) => {
      if (isLight) {
        return [
          "rgba(59, 130, 246, 0.12)",  // Soft Blue
          "rgba(147, 51, 234, 0.08)",  // Soft Purple
          "rgba(20, 184, 166, 0.08)",  // Soft Teal
          "rgba(244, 63, 94, 0.05)",   // Soft Rose
        ];
      } else {
        return [
          "rgba(29, 78, 216, 0.20)",   // Blue
          "rgba(109, 40, 217, 0.18)",  // Purple
          "rgba(13, 148, 136, 0.15)",  // Teal
          "rgba(225, 29, 72, 0.08)",   // Rose
        ];
      }
    };

    const colors = getColors(theme === "light");
    const nodes: Node[] = [
      { x: width * 0.2, y: height * 0.2, r: Math.min(width, height) * 0.45, vx: 0.25, vy: 0.2, color: colors[0], targetColor: colors[0] },
      { x: width * 0.8, y: height * 0.3, r: Math.min(width, height) * 0.50, vx: -0.2, vy: 0.25, color: colors[1], targetColor: colors[1] },
      { x: width * 0.3, y: height * 0.7, r: Math.min(width, height) * 0.40, vx: 0.15, vy: -0.2, color: colors[2], targetColor: colors[2] },
      { x: width * 0.7, y: height * 0.8, r: Math.min(width, height) * 0.35, vx: -0.25, vy: -0.15, color: colors[3], targetColor: colors[3] },
    ];

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth color transition on theme change
      const currentColors = getColors(theme === "light");
      nodes.forEach((node, i) => {
        node.targetColor = currentColors[i];
        // Simple lerp for color or just update it
        node.color = node.targetColor;

        // Move nodes
        node.x += node.vx;
        node.y += node.vy;

        // Bounce nodes off boundaries (including radius buffer to keep center on screen)
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        // Draw radial gradient
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.r
        );
        gradient.addColorStop(0, node.color);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none filter blur-[120px] opacity-50 md:opacity-60"
      aria-hidden="true"
    />
  );
}
