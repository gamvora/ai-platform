'use client';

import ImageTransformTool from '@/components/ImageTransformTool';
import { Maximize2 } from 'lucide-react';

export default function UpscalePage() {
  return (
    <ImageTransformTool
      config={{
        slug: 'upscale',
        title: 'Upscale & Enhance',
        headingStart: 'Sharpen & enlarge',
        headingAccent: 'any image',
        subtitle:
          'Upload a low-resolution or blurry image and Nova will re-render it in 4K clarity.',
        icon: Maximize2,
        gradient: 'from-cyan-500 to-blue-500',
        endpoint: '/api/upscale',
        promptPlaceholder:
          'Optional: add extra hints (e.g. "remove noise", "restore old photo colors")',
        ctaLabel: 'Upscale',
        busyLabel: 'Enhancing…',
        tip:
          'Tip: works best on faces, landscapes, product shots. Old or scanned photos benefit most.',
      }}
    />
  );
}
