'use client';

import ImageTransformTool from '@/components/ImageTransformTool';
import { Users } from 'lucide-react';

export default function FaceSwapPage() {
  return (
    <ImageTransformTool
      config={{
        slug: 'face-swap',
        title: 'Face Swap',
        headingStart: 'Swap faces with',
        headingAccent: 'AI precision',
        subtitle:
          'Upload a source photo and a target face. Nova will blend them together.',
        icon: Users,
        gradient: 'from-pink-500 to-rose-500',
        endpoint: '/api/face-swap',
        promptPlaceholder:
          'Optional: additional style or mood hints (e.g. "soft cinematic lighting")',
        ctaLabel: 'Swap faces',
        busyLabel: 'Swapping…',
        secondImage: {
          label: 'Target face',
          placeholder: 'Upload the face to use',
          field: 'targetFaceUrl',
        },
        tip:
          'Tip: use clear, front-facing portraits with good lighting for the most convincing swap.',
      }}
    />
  );
}
