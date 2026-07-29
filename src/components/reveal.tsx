"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Adds `.is-in` the first time the element scrolls into view, which is what
 * the `.reveal` / `.ink-path` animations key off. Reveals once and then stops
 * observing — re-animating on every scroll pass is nauseating.
 *
 * If IntersectionObserver is unavailable the content is shown immediately, so
 * this can never hide content it fails to reveal.
 */
export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Seconds to stagger this element behind its neighbours. */
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? "is-in" : ""} ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </Tag>
  );
}
