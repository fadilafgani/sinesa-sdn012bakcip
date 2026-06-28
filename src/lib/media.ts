/**
 * Safely format media URL to prevent Mixed Content issues in production
 */
export const getSafeMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  // If the website is running over HTTPS, ensure the media resource also uses HTTPS
  if (window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  
  return url;
};
