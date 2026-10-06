import type * as React from "react";
import { cn } from "@/lib/utils";

interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  pauseOnHover?: boolean;
  direction?: "left" | "right";
  speed?: number;
  repeat?: number;
}

export function Marquee({
  children,
  pauseOnHover = false,
  direction = "left",
  speed = 30,
  repeat = 4,
  className,
  ...props
}: MarqueeProps) {
  const animationStyle = { "--marquee-duration": `${speed * repeat}s` } as React.CSSProperties;

  return (
    <div className={cn("marquee-mask w-full overflow-hidden", className)} {...props}>
      <div
        className={cn(
          "marquee-track flex w-max items-center",
          pauseOnHover && "marquee-pause-on-hover",
          direction === "right" && "marquee-reverse",
        )}
        style={animationStyle}
      >
        {/* Cada metade repete os itens várias vezes para cobrir telas muito largas (até 4K+) sem espaços vazios. */}
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0 items-center" aria-hidden={half === 1 ? true : undefined}>
            {Array.from({ length: repeat }, (_, i) => (
              <div key={i} className="flex shrink-0 items-center" aria-hidden={i > 0 ? true : undefined}>
                {children}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}