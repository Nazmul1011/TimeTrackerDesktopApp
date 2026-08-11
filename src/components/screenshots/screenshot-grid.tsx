/**
 * Screenshot grid — Figma 2-column layout.
 */
"use client";

import { useState } from "react";
import { INITIAL_SCREENSHOTS, type ScreenshotItem } from "@/constants/demo-data";
import { ScreenshotCard } from "@/components/screenshots/screenshot-card";

export function ScreenshotGrid() {
  const [items, setItems] = useState<ScreenshotItem[]>(INITIAL_SCREENSHOTS);

  const handleRequestDelete = (id: string) => {
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, deleteRequested: true } : s)),
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <ScreenshotCard key={item.id} item={item} onRequestDelete={handleRequestDelete} />
      ))}
    </div>
  );
}
