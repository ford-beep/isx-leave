"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

export function ChristmasGingerbread() {
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
          "/seasonal/christmas/Jingerbread.json",
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load gingerbread animation: ${response.status}`,
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
        console.error("Christmas gingerbread:", error);
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
      className="christmas-gingerbread-animation"
      aria-hidden="true"
    />
  );
}
