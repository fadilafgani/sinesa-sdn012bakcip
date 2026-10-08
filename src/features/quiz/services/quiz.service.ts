import { apiClient } from '@/core/api-client';
import { safeCall, cachedSafeCall, clearQueryCache } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Quiz } from '@/types';

export const QuizService = {
  async getQuizzesByTeacherId(teacherId: string): Promise<ServiceResponse<Quiz[]>> {
    console.log('[SYNC] QuizService.getQuizzesByTeacherId', { teacherId });
    return cachedSafeCall(`quizzes_teacher_${teacherId}`, 10000, () =>
      apiClient.get<Quiz[]>('/quizzes', { params: { teacher_id: teacherId } })
    );
  },

  async getAllQuizzes(): Promise<ServiceResponse<Quiz[]>> {
    console.log('[SYNC] QuizService.getAllQuizzes');
    return cachedSafeCall('quizzes_all', 10000, () =>
      apiClient.get<Quiz[]>('/quizzes')
    );
  },

  async getQuizById(id: string): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.getQuizById', { id });
    return cachedSafeCall(`quiz_${id}`, 15000, () =>
      apiClient.get<Quiz>('/quizzes', { params: { id } })
    );
  },

  async getQuizByPin(pinCode: string): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.getQuizByPin', { pinCode });
    return cachedSafeCall(`quiz_pin_${pinCode}`, 15000, () =>
      apiClient.get<Quiz>('/quizzes', { params: { pin: pinCode } })
    );
  },

  async createQuiz(quiz: Omit<Quiz, 'created_at' | 'updated_at'>): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.createQuiz', quiz);
    const res = await safeCall<Quiz>(
      apiClient.post<Quiz>('/quizzes', quiz)
    );
    if (res.success) {
      clearQueryCache('quizzes');
    }
    return res;
  },

  async updateQuiz(id: string, updates: Partial<Quiz>): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.updateQuiz', { id, updates });
    const res = await safeCall<Quiz>(
      apiClient.put<Quiz>('/quizzes', updates, { params: { id } })
    );
    if (res.success) {
      clearQueryCache('quizzes');
      clearQueryCache(`quiz_${id}`);
      if (res.data?.pin_code) {
        clearQueryCache(`quiz_pin_${res.data.pin_code}`);
      }
    }
    return res;
  },

  async deleteQuiz(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuizService.deleteQuiz', { id });
    const res = await safeCall<void>(
      apiClient.delete<void>('/quizzes', { params: { id } })
    );
    if (res.success) {
      clearQueryCache('quizzes');
      clearQueryCache(`quiz_${id}`);
    }
    return res;
  }
};
