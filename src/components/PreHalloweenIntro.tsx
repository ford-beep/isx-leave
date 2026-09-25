"use client";

import { useEffect, useState } from "react";

const PRE_HALLOWEEN_DATES = new Set([
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
]);

export function PreHalloweenIntro({
  today,
}: {
  today: string;
}) {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!PRE_HALLOWEEN_DATES.has(today)) {
      return;
    }

    const storageKey =
      `isx-pre-halloween-seen-${today}`;

    try {
      if (
        window.localStorage.getItem(storageKey)
      ) {
        return;
      }

      window.localStorage.setItem(
        storageKey,
        "1",
      );
    } catch {
      // Still show the teaser if storage
      // is unavailable.
    }

    const showTimer = window.setTimeout(() => {
      setActive(true);
      setVisible(true);
    }, 250);

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
    }, 2550);

    const removeTimer = window.setTimeout(() => {
      setActive(false);
    }, 3650);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [today]);

  if (!active) {
    return null;
  }

  return (
    <div
      className={`pre-halloween ${
        visible
          ? "pre-halloween-visible"
          : "pre-halloween-leaving"
      }`}
      aria-hidden="true"
    >
      <div className="pre-halloween-darkness" />

      <div className="pre-halloween-flicker" />

      <div className="pre-halloween-ghost-wrap">
        <div className="pre-halloween-ghost">
          👻
        </div>

        <div className="pre-halloween-message">
          <span>Something spooky</span>
          <strong>is coming...</strong>
        </div>
      </div>

      <div className="pre-halloween-spark pre-halloween-spark-1">
        ✦
      </div>

      <div className="pre-halloween-spark pre-halloween-spark-2">
        ✦
      </div>

      <div className="pre-halloween-spark pre-halloween-spark-3">
        ✦
      </div>

      <style jsx>{`
        .pre-halloween {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
          overflow: hidden;
        }

        .pre-halloween-darkness {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 75% 50%,
              rgba(83, 45, 120, 0.2),
              transparent 38%
            ),
            rgba(5, 4, 10, 0.36);
          opacity: 0;
          animation:
            halloween-darkness 1.8s ease forwards;
        }

        .pre-halloween-flicker {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.12);
          opacity: 0;
          animation:
            halloween-flicker 0.5s linear;
        }

        .pre-halloween-ghost-wrap {
          position: absolute;
          right: -240px;
          top: 50%;
          display: flex;
          align-items: center;
          gap: 18px;
          transform:
            translateY(-50%) rotate(-3deg);
          animation:
            halloween-peek 3.1s
            cubic-bezier(
              0.2,
              0.8,
              0.2,
              1
            )
            forwards;
        }

        .pre-halloween-ghost {
  font-size: clamp(
    120px,
    17vw,
    220px
  );
  line-height: 1;

  filter:
    drop-shadow(
      0 12px 24px
      rgba(55, 25, 90, 0.24)
    );

  animation:
    ghost-float 1.1s
    ease-in-out
    infinite;
}

        .pre-halloween-message {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 14px 18px;
          border-radius: 16px;
          background:
            rgba(22, 15, 33, 0.9);
          border:
            1px solid
            rgba(255, 255, 255, 0.18);
          box-shadow:
            0 14px 40px
            rgba(0, 0, 0, 0.24);
          color: white;
          white-space: nowrap;
          opacity: 0;
          transform:
            translateX(12px)
            translateY(8px);
          animation:
            halloween-message 1.55s
            0.42s ease forwards;
        }

        .pre-halloween-message span {
          font-size: 13px;
          opacity: 0.72;
          letter-spacing: 0.02em;
        }

        .pre-halloween-message strong {
          font-size: clamp(
            18px,
            2vw,
            25px
          );
          letter-spacing: -0.03em;
        }

        .pre-halloween-spark {
          position: absolute;
          color: rgba(
            255,
            255,
            255,
            0.8
          );
          opacity: 0;
          animation:
            halloween-spark 1.2s
            ease forwards;
        }

        .pre-halloween-spark-1 {
          right: 12%;
          top: 27%;
          font-size: 22px;
          animation-delay: 0.6s;
        }

        .pre-halloween-spark-2 {
          right: 28%;
          top: 66%;
          font-size: 14px;
          animation-delay: 0.78s;
        }

        .pre-halloween-spark-3 {
          right: 7%;
          top: 71%;
          font-size: 18px;
          animation-delay: 0.9s;
        }

        .pre-halloween-leaving {
          animation:
            halloween-exit 0.45s
            ease forwards;
        }

        @keyframes halloween-flicker {
          0%,
          100% {
            opacity: 0;
          }

          15% {
            opacity: 0.5;
          }

          25% {
            opacity: 0;
          }

          36% {
            opacity: 0.22;
          }

          48% {
            opacity: 0;
          }
        }

        @keyframes ghost-float {
  0%,
  100% {
    transform:
      translateY(0)
      rotate(5deg);
  }

  50% {
    transform:
      translateY(-12px)
      rotate(-3deg);
  }
}
        @keyframes halloween-darkness {
          0% {
            opacity: 0;
          }

          15%,
          75% {
            opacity: 1;
          }

          100% {
            opacity: 0;
          }
        }

       @keyframes halloween-peek {
  0% {
    right: -240px;
  }

  18% {
    right: 4vw;
  }

  82% {
    right: 4vw;
  }

  100% {
    right: -280px;
  }
}

        @keyframes halloween-message {
          0% {
            opacity: 0;
            transform:
              translateX(12px)
              translateY(8px);
          }

          20%,
          70% {
            opacity: 1;
            transform:
              translateX(0)
              translateY(0);
          }

          100% {
            opacity: 0;
            transform:
              translateX(8px)
              translateY(-4px);
          }
        }

        @keyframes halloween-spark {
          0% {
            opacity: 0;
            transform:
              scale(0.4)
              rotate(0deg);
          }

          40% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform:
              scale(1.25)
              rotate(30deg);
          }
        }

        @keyframes halloween-exit {
          to {
            opacity: 0;
          }
        }

        @media (max-width: 640px) {
          .pre-halloween-ghost-wrap {
            gap: 4px;
          }

          .pre-halloween-ghost {
            font-size: 120px;
          }

          .pre-halloween-message {
            position: absolute;
            right: 85px;
            top: 100%;
          }
        }

        @media (
          prefers-reduced-motion:
          reduce
        ) {
          .pre-halloween-flicker {
            display: none;
          }

          .pre-halloween-ghost-wrap {
            right: 4vw;
            animation: none;
          }

          .pre-halloween-message {
            opacity: 1;
            transform: none;
            animation: none;
          }

          .pre-halloween-darkness {
            opacity: 1;
            animation: none;
          }

          .pre-halloween-spark {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}