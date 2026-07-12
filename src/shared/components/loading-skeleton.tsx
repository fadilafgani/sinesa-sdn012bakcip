import React from 'react';
import { motion } from 'framer-motion';

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-mesh p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Skeleton Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-2xl">
          <div className="flex items-center space-x-4 mb-6">
            {/* Circle shimmer */}
            <div className="relative h-12 w-12 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              />
            </div>
            {/* Text lines shimmer */}
            <div className="flex-1 space-y-2">
              <div className="relative h-4 w-3/4 overflow-hidden rounded bg-white/10">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              </div>
              <div className="relative h-3 w-1/2 overflow-hidden rounded bg-white/10">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              </div>
            </div>
          </div>

          {/* Body shimmers */}
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative h-12 w-full overflow-hidden rounded-xl bg-white/5">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Subtitle */}
        <p className="text-center text-xs text-muted-foreground animate-pulse">
          Menyiapkan modul SINESA...
        </p>
      </div>
    </div>
  );
};
