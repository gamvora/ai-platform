'use client';

import ImageTransformTool from '@/components/ImageTransformTool';
import { Scissors } from 'lucide-react';

export default function RemoveBgPage() {
  return (
    <ImageTransformTool
      config={{
        slug: 'remove-bg',
        title: 'Remove Background',
        headingStart: 'Clean backgrounds in',
        headingAccent: 'one click',
        subtitle:
          'Upload an image and Nova will replace its background with a clean studio white — or any scene you describe.',
        icon: Scissors,
        gradient: 'from-emerald-500 to-teal-500',
        endpoint: '/api/remove-bg',
        promptPlaceholder:
          'Optional: describe a new background (e.g. "tropical beach at sunset")',
        ctaLabel: 'Remove background',
        busyLabel: 'Working…',
        styleChips: [
          'pure white studio',
          'black seamless',
          'soft gradient',
          'tropical beach',
          'city skyline',
          'forest',
          'abstract blur',
        ],
        tip:
          'Tip: leave the prompt empty for a clean white background, or describe any scene you want.',
      }}
    />
  );
}
