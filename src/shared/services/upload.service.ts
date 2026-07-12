import { mediaStorageService } from './media-storage';
import type { ServiceResponse } from './base.service';

export const UploadService = {
  async uploadImage(file: File, folder: 'profiles' | 'thumbnails' | 'quiz-images'): Promise<ServiceResponse<{ url: string; filename: string }>> {
    console.log('[SYNC] UploadService.uploadImage', { name: file.name, size: file.size, folder });
    try {
      const res = await mediaStorageService.upload(file, { type: folder });
      if (res.success) {
        return { success: true, data: { url: res.url, filename: res.filename }, error: null };
      }
      return { success: false, data: null, error: res.message || 'Gagal mengunggah gambar' };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  },

  async uploadAudio(file: File): Promise<ServiceResponse<{ url: string; filename: string }>> {
    console.log('[SYNC] UploadService.uploadAudio', { name: file.name, size: file.size });
    try {
      const res = await mediaStorageService.upload(file, { type: 'quiz-audio' });
      if (res.success) {
        return { success: true, data: { url: res.url, filename: res.filename }, error: null };
      }
      return { success: false, data: null, error: res.message || 'Gagal mengunggah audio' };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  },

  async uploadVideo(file: File): Promise<ServiceResponse<{ url: string; filename: string }>> {
    console.log('[SYNC] UploadService.uploadVideo', { name: file.name, size: file.size });
    try {
      const res = await mediaStorageService.upload(file, { type: 'quiz-videos' });
      if (res.success) {
        return { success: true, data: { url: res.url, filename: res.filename }, error: null };
      }
      return { success: false, data: null, error: res.message || 'Gagal mengunggah video' };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  },

  async deleteMedia(fileUrl: string, folder: 'profiles' | 'thumbnails' | 'quiz-images' | 'quiz-audio' | 'quiz-videos'): Promise<ServiceResponse<void>> {
    console.log('[SYNC] UploadService.deleteMedia', { fileUrl, folder });
    try {
      const success = await mediaStorageService.delete(fileUrl, folder);
      if (success) {
        return { success: true, data: null, error: null };
      }
      return { success: false, data: null, error: 'Gagal menghapus berkas media' };
    } catch (err) {
      return { success: false, data: null, error: err };
    }
  }
};
