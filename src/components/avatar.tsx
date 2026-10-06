import { initials } from "@/lib/catalog";

export function Avatar({ name, size }: { name: string; size?: "lg" }) {
  return (
    <span className={size === "lg" ? "avatar avatar-lg" : "avatar"} aria-hidden>
      {initials(name || "?")}
    </span>
  );
}
