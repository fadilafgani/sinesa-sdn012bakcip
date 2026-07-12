import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Quiz } from '@/types';

export const QuizService = {
  async getQuizzesByTeacherId(teacherId: string): Promise<ServiceResponse<Quiz[]>> {
    console.log('[SYNC] QuizService.getQuizzesByTeacherId', { teacherId });
    return safeCall(
      supabase
        .from('quizzes')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
    );
  },

  async getAllQuizzes(): Promise<ServiceResponse<Quiz[]>> {
    console.log('[SYNC] QuizService.getAllQuizzes');
    return safeCall(
      supabase
        .from('quizzes')
        .select('*')
        .order('created_at', { ascending: false })
    );
  },

  async getQuizById(id: string): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.getQuizById', { id });
    return safeCall(
      supabase
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single()
    );
  },

  async getQuizByPin(pinCode: string): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.getQuizByPin', { pinCode });
    return safeCall(
      supabase
        .from('quizzes')
        .select('*')
        .eq('pin_code', pinCode)
        .single()
    );
  },

  async createQuiz(quiz: Omit<Quiz, 'created_at' | 'updated_at'>): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.createQuiz', quiz);
    return safeCall(
      supabase
        .from('quizzes')
        .insert(quiz)
        .select()
        .single()
    );
  },

  async updateQuiz(id: string, updates: Partial<Quiz>): Promise<ServiceResponse<Quiz>> {
    console.log('[SYNC] QuizService.updateQuiz', { id, updates });
    return safeCall(
      supabase
        .from('quizzes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  },

  async deleteQuiz(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuizService.deleteQuiz', { id });
    return safeCall(
      supabase
        .from('quizzes')
        .delete()
        .eq('id', id)
    );
  }
};
