import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { getSafeMediaUrl } from '@/shared/utils/media';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
  containerClassName?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = 'Image',
  className = '',
  containerClassName = '',
  fallbackSrc = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60', // premium abstract placeholder
  ...props
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {/* Loading Placeholder Spinner/Pulse */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-muted/60 dark:bg-muted/10 animate-pulse flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground/30 animate-bounce" />
        </div>
      )}

      {/* Error state */}
      {error ? (
        <div className="absolute inset-0 bg-muted/30 flex flex-col items-center justify-center p-2 text-center border border-dashed rounded-xl">
          <ImageIcon className="h-6 w-6 text-destructive/40 mb-1" />
          <span className="text-[10px] text-muted-foreground/60 font-semibold select-none">Gagal memuat gambar</span>
        </div>
      ) : (
        <img
          src={getSafeMediaUrl(src) || fallbackSrc}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`${className} transition-opacity duration-300 ease-in-out ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}
    </div>
  );
};
export default LazyImage;
