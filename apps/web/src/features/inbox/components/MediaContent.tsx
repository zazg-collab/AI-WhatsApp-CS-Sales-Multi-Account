import { Image as ImageIcon, Video, FileText, Tag } from '@/components/ui/core-essential-icons';
import { resolveMediaUrl } from '@/lib/api';
import { useT, type Dict } from '@/lib/i18n';
import type { Message } from '../inbox.types';

export type { Message };

const mediaDict: Dict = {
  mediaImage: { id: 'Gambar', en: 'Image' },
  mediaVideo: { id: 'Video', en: 'Video' },
};

export function MediaContent({ message: m }: { message: Message }) {
  const t = useT(mediaDict);
  const mediaSrc = resolveMediaUrl(m.mediaUrl);

  if (m.messageType === 'image') {
    if (mediaSrc) {
      return (
        <span className="block">
          <img src={mediaSrc} alt={m.content ?? t('mediaImage')} className="max-h-60 w-full max-w-[280px] rounded-lg object-cover" loading="lazy" />
          {m.content && <span className="mt-1 block text-[13px] opacity-90">{m.content}</span>}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {m.content ?? t('mediaImage')}
      </span>
    );
  }
  if (m.messageType === 'video') {
    if (mediaSrc) {
      return (
        <span className="block">
          <video src={mediaSrc} controls preload="none" className="max-h-60 w-full max-w-[280px] rounded-lg" />
          {m.content && <span className="mt-1 block text-[13px] opacity-90">{m.content}</span>}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
        {m.content ?? t('mediaVideo')}
      </span>
    );
  }
  if (m.messageType === 'audio') {
    if (mediaSrc) {
      return (
        <span className="block">
          <audio src={mediaSrc} controls preload="none" className="w-full max-w-[240px]" />
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        {m.content ?? 'audio'}
      </span>
    );
  }
  if (m.messageType === 'sticker') {
    if (mediaSrc) {
      return <img src={mediaSrc} alt="sticker" className="max-h-32 max-w-[160px] object-contain" loading="lazy" />;
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
        {m.content ?? 'sticker'}
      </span>
    );
  }
  if (m.messageType === 'document' || m.messageType === 'file') {
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        {m.content ?? m.messageType}
      </span>
    );
  }
  return <p>{m.content ?? <span className="italic opacity-70">[{m.messageType}]</span>}</p>;
}
