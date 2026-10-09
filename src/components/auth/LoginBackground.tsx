import { AnimatedNetworkBackground } from "./AnimatedNetworkBackground";
import { FloatingWorkIcons } from "./FloatingWorkIcons";

/** Decoração institucional: não interfere em cliques nem nos campos de login. */
export function LoginBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, #002747 0%, #003866 28%, #15558a 52%, #5f93bd 72%, var(--background) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="absolute -top-40 -left-40 h-[30rem] w-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(51,153,204,0.25), transparent 70%)" }}
      />
      <div
        className="absolute left-1/3 top-1/3 h-[26rem] w-[26rem] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(143,194,62,0.09), transparent 70%)" }}
      />
      <AnimatedNetworkBackground />
      <FloatingWorkIcons />
      <div className="absolute inset-0 bg-gradient-to-r from-[#002747]/10 via-transparent to-background/15" />
    </div>
  );
}
