import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LayoutDashboard(props: IconProps) {
  return <Icon {...props}><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></Icon>;
}

export function Inbox(props: IconProps) {
  return <Icon {...props}><path d="M4 4h16l-2 10h-4a2 2 0 0 1-4 0H6L4 4Z" /><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></Icon>;
}

export function ContactRound(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></Icon>;
}

export function GitBranch(props: IconProps) {
  return <Icon {...props}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 6h4a4 4 0 0 1 4 4v6" /><path d="M6 8v8" /></Icon>;
}

export function Megaphone(props: IconProps) {
  return <Icon {...props}><path d="M3 11v2a2 2 0 0 0 2 2h2l4 4v-4l8 2V7l-8 2H5a2 2 0 0 0-2 2Z" /><path d="M19 8.5a4 4 0 0 1 0 7" /></Icon>;
}

export function BookOpen(props: IconProps) {
  return <Icon {...props}><path d="M12 6.5A6 6 0 0 0 5 4v14a6 6 0 0 1 7 2" /><path d="M12 6.5A6 6 0 0 1 19 4v14a6 6 0 0 0-7 2" /><path d="M12 6.5V20" /></Icon>;
}

export function ShieldCheck(props: IconProps) {
  return <Icon {...props}><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></Icon>;
}

export function History(props: IconProps) {
  return <Icon {...props}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></Icon>;
}

export function ChartNoAxesCombined(props: IconProps) {
  return <Icon {...props}><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /><path d="m7 9 5-4 5 7" /></Icon>;
}

export function UsersRound(props: IconProps) {
  return <Icon {...props}><path d="M16 21a5 5 0 0 0-10 0" /><circle cx="11" cy="8" r="4" /><path d="M22 21a4 4 0 0 0-4-4" /><path d="M17 4a4 4 0 0 1 0 8" /></Icon>;
}

export function Settings(props: IconProps) {
  return <Icon {...props}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" /></Icon>;
}

export function Pencil(props: IconProps) { return <Icon {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></Icon>; }
export function CircleCheck(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></Icon>; }
export function Hand(props: IconProps) { return <Icon {...props}><path d="M18 11.5V10a2 2 0 0 0-4 0V8a2 2 0 0 0-4 0v2-1a2 2 0 0 0-4 0v5" /><path d="M6 14 5 13a2 2 0 0 0-3 2l4 5a6 6 0 0 0 5 2h2a5 5 0 0 0 5-5v-5.5" /></Icon>; }
export function ArrowUpRight(props: IconProps) { return <Icon {...props}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Icon>; }
export function TriangleAlert(props: IconProps) { return <Icon {...props}><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></Icon>; }
export function CircleX(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></Icon>; }
export function Unplug(props: IconProps) { return <Icon {...props}><path d="m19 5-3 3" /><path d="m8 16-3 3" /><path d="m12 8 4 4" /><path d="m8 12 4 4" /><path d="M9 7 7 9a4.2 4.2 0 0 0 6 6l2-2" /></Icon>; }
export function FileSearch(props: IconProps) { return <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><circle cx="11" cy="14" r="2.5" /><path d="m13 16 2 2" /></Icon>; }
export function ScrollText(props: IconProps) { return <Icon {...props}><path d="M8 21h8a4 4 0 0 0 4-4V5a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h1" /><path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" /></Icon>; }
export function Workflow(props: IconProps) { return <Icon {...props}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="4" width="6" height="5" rx="1" /><rect x="9" y="15" width="6" height="5" rx="1" /><path d="M9 6.5h6" /><path d="M6 9v3a3 3 0 0 0 3 3" /><path d="M18 9v3a3 3 0 0 1-3 3" /></Icon>; }
export function Send(props: IconProps) { return <Icon {...props}><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></Icon>; }
export function Search(props: IconProps) { return <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>; }
export function LogOut(props: IconProps) { return <Icon {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>; }
export function Code(props: IconProps) { return <Icon {...props}><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></Icon>; }
export function MessageSquareReply(props: IconProps) { return <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="m10 9-3 3 3 3" /><path d="M7 12h8" /></Icon>; }
export function Clock3(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>; }
export function Check(props: IconProps) { return <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>; }
export function CheckCheck(props: IconProps) { return <Icon {...props}><path d="m3 12 3 3 6-6" /><path d="m11 12 3 3 7-8" /></Icon>; }
export function X(props: IconProps) { return <Icon {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>; }
export function Plus(props: IconProps) { return <Icon {...props}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>; }
export function Paperclip(props: IconProps) { return <Icon {...props}><path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Icon>; }
export function Bot(props: IconProps) { return <Icon {...props}><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4" /><path d="M9 13h.01" /><path d="M15 13h.01" /><path d="M10 17h4" /></Icon>; }
export function Phone(props: IconProps) { return <Icon {...props}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9Z" /></Icon>; }
export function Sun(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></Icon>; }
export function Moon(props: IconProps) { return <Icon {...props}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></Icon>; }
