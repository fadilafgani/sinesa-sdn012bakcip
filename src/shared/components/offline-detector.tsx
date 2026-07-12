import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const OfflineDetector: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      const timer = setTimeout(() => setShowBackOnline(false), 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowBackOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 z-[9999] w-full max-w-sm -translate-x-1/2 px-4"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-950/80 p-4 text-red-200 shadow-2xl backdrop-blur-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <WifiOff className="h-5 w-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Koneksi Terputus</p>
              <p className="text-xs text-red-300">Menunggu internet tersambung kembali...</p>
            </div>
          </div>
        </motion.div>
      )}

      {showBackOnline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 z-[9999] w-full max-w-sm -translate-x-1/2 px-4"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-4 text-emerald-200 shadow-2xl backdrop-blur-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Wifi className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Terhubung Kembali</p>
              <p className="text-xs text-emerald-300">Koneksi internet Anda sudah pulih.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
