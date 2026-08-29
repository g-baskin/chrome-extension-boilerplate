import type { SVGProps } from "react";

type IconName = "arrow" | "search" | "trash";
interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> { name: IconName; label?: string }

const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  trash: <><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" /><path d="M10 11v5m4-5v5" /></>,
};

export function Icon({ name, label, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} {...props}>{paths[name]}</svg>;
}
