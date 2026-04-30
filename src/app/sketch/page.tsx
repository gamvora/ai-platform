'use client';

import ImageTransformTool from '@/components/ImageTransformTool';
import { Pencil } from 'lucide-react';

export default function SketchPage() {
  return (
    <ImageTransformTool
      config={{
        slug: 'sketch',
        title: 'Sketch to Image',
        headingStart: 'Turn sketches into',
        headingAccent: 'finished art',
        subtitle:
          'Upload a rough drawing or doodle, describe what it should become, and Nova will render a polished illustration.',
        icon: Pencil,
        gradient: 'from-amber-500 to-orange-500',
        endpoint: '/api/sketch',
        promptPlaceholder:
          'a red sports car in a desert at sunset, cinematic',
        ctaLabel: 'Render sketch',
        busyLabel: 'Rendering…',
        styleChips: [
          'photorealistic',
          'anime',
          '3D render',
          'oil painting',
          'watercolor',
          'comic book',
          'concept art',
          'pixel art',
        ],
        tip:
          'Tip: clean line sketches on white backgrounds produce the best results. Describe composition, lighting and style.',
      }}
    />
  );
}
