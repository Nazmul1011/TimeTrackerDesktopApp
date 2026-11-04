import { cn } from "@/lib/utils";

/** Grey placeholder block that pulses while content loads. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-[#eef1f5] dark:bg-white/[0.07]", className)}
      {...props}
    />
  );
}

export { Skeleton };
