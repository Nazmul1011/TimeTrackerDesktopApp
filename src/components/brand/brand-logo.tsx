/**
 * Gr8r brand mark — blue while idle/running, red while the timer is paused.
 */
"use client";

import { cn } from "@/lib/utils";

type Props = {
  paused?: boolean;
  className?: string;
  title?: string;
};

export function BrandLogo({ paused = false, className, title }: Props) {
  const fill = paused ? "#DC2626" : "#2B7FFF";

  return (
    <svg
      className={cn("block size-full", className)}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M0 6C0 2.68629 2.68629 0 6 0H26C29.3137 0 32 2.68629 32 6V26C32 29.3137 29.3137 32 26 32H6C2.68629 32 0 29.3137 0 26V6Z"
        fill={fill}
      />
      <path
        d="M19.4531 17.91C18.5532 17.5152 17.0681 17.2871 15.3957 17.059C14.1829 16.8923 13.8894 16.8098 13.8894 16.4361C13.8894 16.1044 14.1829 15.9798 15.5 15.9588C19.4743 15.9167 20.5615 14.8797 20.5615 12.9285C20.5615 11.9739 20.2274 11.2054 19.2444 10.8106L20.8957 10.5L20.9381 8.48562H15.9597C11.1297 8.48562 10.3341 10.5 10.3341 12.2424C10.3341 13.6338 10.6683 14.7341 12.0914 15.357C10.6276 15.6061 10.1043 16.1448 10.1043 17.08C10.1043 18.5329 11.6725 18.8031 13.7851 19.1137C15.4788 19.3629 17.1318 19.3418 17.1318 20.1928C17.1318 20.6508 16.7552 21.0228 15.668 21.0228C13.9938 21.0228 13.8682 20.4419 13.8276 19.7576H10C10 22.2896 11.2552 23.5144 15.6467 23.5144C19.9552 23.5144 21 21.8334 21 20.0892C21 18.9469 20.4785 18.3258 19.4531 17.91ZM13.8346 11.0545H16.8825V13.8812H13.8346V11.0545Z"
        fill="white"
      />
    </svg>
  );
}
