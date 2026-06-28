/**
 * Safely format media URL to prevent Mixed Content issues in production
 */
export const getSafeMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  // If the URL is a self-hosted upload path, dynamically route it to the current origin.
  // This ensures that database entries referencing 'evaluasi-bakcip.test' or other domains
  // resolve correctly to the current environment's hosting server.
  if (url.includes('/uploads/')) {
    const uploadIndex = url.indexOf('/uploads/');
    const relativePath = url.substring(uploadIndex); // e.g., "/uploads/quiz-videos/..."
    return window.location.origin + relativePath;
  }
  
  // Fallback: If current page is HTTPS, ensure the media URL is HTTPS as well
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  
  return url;
};
