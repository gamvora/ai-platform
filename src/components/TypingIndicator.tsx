'use client';

import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-blue-500 grid place-items-center">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="bg-surface border border-border rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </motion.div>
  );
}
