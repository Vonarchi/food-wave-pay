import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { restaurantMenuUrl } from '@/lib/restaurant';

interface RestaurantQrCardProps {
  slug: string;
  title?: string;
  description?: string;
}

export function RestaurantQrCard({ slug, title = 'Your QR code', description }: RestaurantQrCardProps) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = restaurantMenuUrl(origin, slug);
  const containerId = `qr-${slug}`;

  const download = () => {
    const svg = document.querySelector(`#${containerId} svg`);
    if (!svg) {
      toast.error('QR code is not ready yet.');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.download = `menu-${slug}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      track('qr_downloaded', { restaurant_slug: slug });
      toast.success('QR code downloaded');
    };
    img.onerror = () => toast.error('Could not download the QR code. Try again.');
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Menu link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link. Select it and copy manually.');
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h2 className="font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      <div id={containerId} className="bg-background p-6 rounded-2xl border border-border mt-4 mx-auto w-fit">
        <QRCodeSVG value={url} size={200} level="H" includeMargin className="mx-auto" />
      </div>
      <p className="text-xs text-muted-foreground break-all text-center mt-3">{url}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <Button variant="outline" onClick={copy} className="w-full">
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          Copy link
        </Button>
        <Button variant="outline" onClick={download} className="w-full">
          <Download className="w-4 h-4 mr-2" />
          Download PNG
        </Button>
        <Button variant="outline" className="w-full" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="w-4 h-4 mr-2" />
          Test menu
        </Button>
      </div>
    </div>
  );
}
