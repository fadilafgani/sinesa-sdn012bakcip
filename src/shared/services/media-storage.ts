/**
 * Media Storage Service for SINESA
 * Handles file upload, replace, delete, and client-side optimization.
 */
import { supabase } from '@/core/supabase';

export interface MediaUploadOptions {
  type: 'profiles' | 'thumbnails' | 'quiz-images' | 'quiz-audio' | 'quiz-videos';
  onProgress?: (progress: number) => void;
  retries?: number;
}

export interface MediaUploadResult {
  success: boolean;
  url: string;
  filename: string;
  message?: string;
}

export interface IMediaStorageService {
  upload(file: File, options: MediaUploadOptions): Promise<MediaUploadResult>;
  delete(fileUrl: string, type: 'profiles' | 'thumbnails' | 'quiz-images' | 'quiz-audio' | 'quiz-videos'): Promise<boolean>;
  replace(newFile: File, oldUrl: string, options: MediaUploadOptions): Promise<MediaUploadResult>;
}

// Client-side image compression and WebP conversion
export const compressAndConvertToWebP = (file: File, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimension constraints to keep file size small (e.g. 1920px max dimension)
        const MAX_DIM = 1920;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas content to WebP blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create a Blob with a proper WebP name
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/webp',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

// Retry handler helper
const retryPromise = <T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1500
): Promise<T> => {
  return fn().catch((err) => {
    if (retries <= 0) {
      return Promise.reject(err);
    }
    console.warn(`Upload failed, retrying... (${retries} attempts left)`);
    return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
      retryPromise(fn, retries - 1, delayMs)
    );
  });
};

// XMLHttpRequest Upload helper to track upload progress
const uploadWithXHR = (
  url: string,
  formData: FormData,
  token: string,
  onProgress?: (progress: number) => void
): Promise<MediaUploadResult> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 400) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch (e) {
          reject(new Error('Respon server tidak valid (bukan JSON).'));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.message || `Gagal mengunggah berkas. Status: ${xhr.status}`));
        } catch (e) {
          reject(new Error(`Gagal mengunggah berkas. Status: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Koneksi jaringan terputus atau gagal terhubung ke server hosting.'));
    xhr.send(formData);
  });
};

class MediaStorageService implements IMediaStorageService {
  private getApiUrl(): string {
    const envUrl = import.meta.env.VITE_UPLOAD_API_URL;
    if (envUrl) return envUrl;
    
    // Fallback dynamically based on current origin to support local dev
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Connect to the production website API during local testing for convenience
      return 'https://sinesa-sdn012bakcip.com/api/upload.php';
    }
    
    return '/api/upload.php';
  }

  // Upload operation
  async upload(file: File, options: MediaUploadOptions): Promise<MediaUploadResult> {
    const retries = options.retries !== undefined ? options.retries : 2;
    const apiUrl = this.getApiUrl();

    // 1. Optimize images (compress + convert to WebP client-side)
    let fileToUpload: File | Blob = file;
    if (file.type.startsWith('image/')) {
      try {
        fileToUpload = await compressAndConvertToWebP(file);
      } catch (e) {
        console.warn('Gagal melakukan optimasi gambar, menggunakan berkas asli:', e);
      }
    }

    // 2. Prepare FormData
    const formData = new FormData();
    // Rename filename suffix to .webp if it was converted
    let filename = file.name;
    if (fileToUpload instanceof Blob && !(fileToUpload instanceof File)) {
      filename = file.name.substring(0, file.name.lastIndexOf('.')) + '.webp';
    }
    
    formData.append('file', fileToUpload, filename);
    formData.append('type', options.type);
    formData.append('action', 'upload');

    // 3. Retrieve auth session token
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token || '';

    // 4. Upload with retry logic
    return retryPromise(
      () => uploadWithXHR(apiUrl, formData, token, options.onProgress),
      retries
    );
  }

  // Delete operation
  async delete(
    fileUrl: string,
    type: 'profiles' | 'thumbnails' | 'quiz-images' | 'quiz-audio' | 'quiz-videos'
  ): Promise<boolean> {
    if (!fileUrl) return true;
    
    // Ignore placeholder avatars and external links
    if (fileUrl.includes('dicebear.com') || !fileUrl.includes('/uploads/')) {
      return true;
    }

    const apiUrl = this.getApiUrl();
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('type', type);
    formData.append('file_url', fileUrl);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token || '';

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await response.json();
      return data.success;
    } catch (e) {
      console.warn('Gagal menghapus berkas di server hosting:', e);
      return false;
    }
  }

  // Replace operation (delete old file, upload new file)
  async replace(
    newFile: File,
    oldUrl: string,
    options: MediaUploadOptions
  ): Promise<MediaUploadResult> {
    // 1. Try to delete the old file if it exists
    if (oldUrl) {
      await this.delete(oldUrl, options.type);
    }
    // 2. Upload the new file
    return this.upload(newFile, options);
  }
}

export const mediaStorageService = new MediaStorageService();
