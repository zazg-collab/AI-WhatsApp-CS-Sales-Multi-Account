import * as React from 'react';
import * as Phosphor from '@phosphor-icons/react';

// ponytail: loose prop type (not HTMLAttributes<HTMLSpanElement>) so it's structurally
// compatible with both our <span> mask-icons and Phosphor's <svg>-based components.
type SvgIconProps = {
  className?: string;
  style?: React.CSSProperties;
  size?: number | string;
  mirrored?: boolean;
  [key: string]: unknown;
};

export type Icon = React.ComponentType<SvgIconProps>;

const ICON_BASE = '/icons/core-essential';

// ponytail: pack icons rendered via mask-image (single-color, currentColor-friendly).
function createIcon(fileName: string): Icon {
  return function CoreEssentialIcon({ className, style, size, mirrored, ...props }: SvgIconProps) {
    const dimension = typeof size === 'number' ? `${size}px` : size;
    const resolvedStyle: React.CSSProperties = {
      display: 'inline-block',
      verticalAlign: 'middle',
      backgroundColor: 'currentColor',
      WebkitMaskImage: 'url(' + ICON_BASE + '/' + fileName + ')',
      maskImage: 'url(' + ICON_BASE + '/' + fileName + ')',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      transform: mirrored ? 'scaleX(-1)' : undefined,
      width: dimension,
      height: dimension,
      ...style,
    };
    return <span aria-hidden="true" {...props} className={className} style={resolvedStyle} />;
  };
}

// Icons sourced from Core_Essential_UI_Icons (core-line-free) — thematic matches verified by hand.
export const AddressBook: Icon = createIcon('address-book.svg');
export const Archive: Icon = createIcon('archive.svg');
export const ArrowsClockwise: Icon = createIcon('arrows-clockwise.svg');
export const BellSlash: Icon = createIcon('bell-slash.svg');
export const Books: Icon = createIcon('books.svg');
export const Check: Icon = createIcon('check.svg');
export const Clock: Icon = createIcon('clock.svg');
export const Copy: Icon = createIcon('copy.svg');
export const Cpu: Icon = createIcon('cpu.svg');
export const DeviceMobile: Icon = createIcon('device-mobile.svg');
export const DownloadSimple: Icon = createIcon('download-simple.svg');
export const FilmSlate: Icon = createIcon('film-slate.svg');
export const FloppyDisk: Icon = createIcon('floppy-disk.svg');
export const Folder: Icon = createIcon('folder.svg');
export const Info: Icon = createIcon('info.svg');
export const Lightbulb: Icon = createIcon('lightbulb.svg');
export const MagnifyingGlass: Icon = createIcon('magnifying-glass.svg');
export const MegaphoneSimple: Icon = createIcon('megaphone-simple.svg');
export const PaperPlaneTilt: Icon = createIcon('paper-plane-tilt.svg');
export const PencilSimple: Icon = createIcon('pencil-simple.svg');
export const PhoneCall: Icon = createIcon('phone-call.svg');
export const Pulse: Icon = createIcon('pulse.svg');
export const PushPin: Icon = createIcon('push-pin.svg');
export const Shield: Icon = createIcon('shield.svg');
export const Star: Icon = createIcon('star.svg');
export const Tag: Icon = createIcon('tag.svg');
export const UploadSimple: Icon = createIcon('upload-simple.svg');
export const UserPlus: Icon = createIcon('user-plus.svg');
export const UsersThree: Icon = createIcon('users-three.svg');
export const Warning: Icon = createIcon('warning.svg');
export const WhatsappLogo: Icon = createIcon('whatsapp-logo.svg');

// ponytail: Core_Essential_UI_Icons has no generic UI primitives (caret, clock-history,
// plus, x, cube, dots-menu, etc.) in any of its 8 style packs — fall back to
// @phosphor-icons/react for those rather than forcing a mismatched thematic icon.
export const ArrowLeft: Icon = Phosphor.ArrowLeft;
export const ArrowRight: Icon = Phosphor.ArrowRight;
export const ArrowUpRight: Icon = Phosphor.ArrowUpRight;
export const ArrowUUpLeft: Icon = Phosphor.ArrowUUpLeft;
export const ArrowsSplit: Icon = Phosphor.ArrowsSplit;
export const Bell: Icon = Phosphor.Bell;
export const BellRinging: Icon = Phosphor.BellRinging;
export const CaretLeft: Icon = Phosphor.CaretLeft;
export const CaretRight: Icon = Phosphor.CaretRight;
export const ChartLineUp: Icon = Phosphor.ChartLineUp;
export const ChatCircle: Icon = Phosphor.ChatCircle;
export const ChatText: Icon = Phosphor.ChatText;
export const CheckCircle: Icon = Phosphor.CheckCircle;
export const Checks: Icon = Phosphor.Checks;
export const CheckSingle: Icon = Phosphor.Check;
export const ClockCounterClockwise: Icon = Phosphor.ClockCounterClockwise;
export const Cube: Icon = Phosphor.Cube;
export const DotsThreeVertical: Icon = Phosphor.DotsThreeVertical;
export const FileText: Icon = Phosphor.FileText;
export const Image: Icon = Phosphor.Image;
export const List: Icon = Phosphor.List;
export const Moon: Icon = Phosphor.Moon;
export const Package: Icon = Phosphor.Package;
export const Plus: Icon = Phosphor.Plus;
export const Prohibit: Icon = Phosphor.Prohibit;
export const ShieldStar: Icon = Phosphor.ShieldStar;
export const ShieldWarning: Icon = Phosphor.ShieldWarning;
export const CircleNotch: Icon = Phosphor.CircleNotch;
export const PlugsConnected: Icon = Phosphor.PlugsConnected;
export const Hand: Icon = Phosphor.Hand;
export const Sun: Icon = Phosphor.Sun;
export const Translate: Icon = Phosphor.Translate;
export const Trash: Icon = Phosphor.Trash;
export const TrendUp: Icon = Phosphor.TrendUp;
export const Video: Icon = Phosphor.Video;
export const X: Icon = Phosphor.X;
export const XCircle: Icon = Phosphor.XCircle;
export const CaretDown: Icon = Phosphor.CaretDown;
export const QrCode: Icon = Phosphor.QrCode;
export const ArrowCounterClockwise: Icon = Phosphor.ArrowCounterClockwise;
export const Link: Icon = Phosphor.Link;
export const Eye: Icon = Phosphor.Eye;
export const Pause: Icon = Phosphor.Pause;
export const GraduationCap: Icon = Phosphor.GraduationCap;
export const Sparkle: Icon = Phosphor.Sparkle;
export const User: Icon = Phosphor.User;
export const Brain: Icon = Phosphor.Brain;
export const Target: Icon = Phosphor.Target;
export const SpinnerGap: Icon = Phosphor.SpinnerGap;
export const SquaresFour: Icon = Phosphor.SquaresFour;
export const Tray: Icon = Phosphor.Tray;
export const Gear: Icon = Phosphor.Gear;
export const SignOut: Icon = Phosphor.SignOut;
export const Key: Icon = Phosphor.Key;
export const BookOpen: Icon = Phosphor.BookOpen;
export const Images: Icon = Phosphor.Images;
export const Paperclip: Icon = Phosphor.Paperclip;
export const MapPin: Icon = Phosphor.MapPin;
export const Lightning: Icon = Phosphor.Lightning;
export const ChartBar: Icon = Phosphor.ChartBar;
export const UserCircle: Icon = Phosphor.UserCircle;
export const ArrowBendUpLeft: Icon = Phosphor.ArrowBendUpLeft;
export const ArrowBendUpRight: Icon = Phosphor.ArrowBendUpRight;
export const Smiley: Icon = Phosphor.Smiley;
export const ChatsCircle: Icon = Phosphor.ChatsCircle;
export const Megaphone: Icon = Phosphor.Megaphone;
export const SealCheck: Icon = Phosphor.SealCheck;
export const Plugs: Icon = Phosphor.Plugs;
export const Radio: Icon = Phosphor.Radio;
