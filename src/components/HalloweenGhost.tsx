"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

export function HalloweenGhost() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animation: AnimationItem | null = null;
    let cancelled = false;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    async function loadAnimation() {
      try {
        const response = await fetch(
          "/seasonal/halloween/WhiteGhost.json",
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load Halloween ghost animation: ${response.status}`,
          );
        }

        const animationData = await response.json();

        if (cancelled || !container) return;

        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: !reducedMotion,
          autoplay: !reducedMotion,
          animationData,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
          },
        });

        if (reducedMotion) {
          animation.goToAndStop(0, true);
        }
      } catch (error) {
        console.error("Halloween ghost:", error);
      }
    }

    loadAnimation();

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="halloween-greeting-ghost"
      aria-hidden="true"
    />
  );
}