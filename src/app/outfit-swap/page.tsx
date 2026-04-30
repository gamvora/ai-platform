'use client';

import ImageTransformTool from '@/components/ImageTransformTool';
import { Shirt } from 'lucide-react';

export default function OutfitSwapPage() {
  return (
    <ImageTransformTool
      config={{
        slug: 'outfit-swap',
        title: 'Outfit Swap',
        headingStart: 'Change outfits in',
        headingAccent: 'any photo',
        subtitle: 'Upload a portrait and describe the outfit you want.',
        icon: Shirt,
        gradient: 'from-indigo-500 to-purple-500',
        endpoint: '/api/outfit-swap',
        promptPlaceholder:
          'a royal red velvet gown with gold embroidery',
        ctaLabel: 'Swap outfit',
        busyLabel: 'Swapping…',
        requireUserPrompt: true,
        styleChips: [
          'business suit',
          'summer dress',
          'leather jacket',
          'hoodie',
          'wedding gown',
          'astronaut suit',
          'streetwear',
          'traditional kimono',
        ],
        tip:
          'Tip: describe fabric, color and style — e.g. "black tailored tuxedo with silk lapels".',
      }}
    />
  );
}
