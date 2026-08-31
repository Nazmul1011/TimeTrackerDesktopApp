import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-[#1e2939] shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#1e2939] placeholder:text-[#99a1af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b7fff]/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
