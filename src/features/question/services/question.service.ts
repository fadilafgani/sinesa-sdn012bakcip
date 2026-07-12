import { supabase } from '@/core/supabase';
import { safeCall, cachedSafeCall, clearQueryCache } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Question, Option } from '@/types';

export const QuestionService = {
  async getQuestions(quizId: string): Promise<ServiceResponse<Question[]>> {
    console.log('[SYNC] QuestionService.getQuestions', { quizId });
    return cachedSafeCall(`questions_${quizId}`, 15000, () =>
      supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true })
    );
  },

  async createQuestion(question: any): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.createQuestion', question);
    const res = await safeCall<Question>(
      supabase
        .from('questions')
        .insert(question)
        .select()
        .single()
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async updateQuestion(id: string, updates: Partial<Question>): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.updateQuestion', { id, updates });
    const res = await safeCall<Question>(
      supabase
        .from('questions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async deleteQuestion(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestion', { id });
    const res = await safeCall<void>(
      supabase
        .from('questions')
        .delete()
        .eq('id', id)
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async deleteQuestionsByQuizId(quizId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestionsByQuizId', { quizId });
    const res = await safeCall<void>(
      supabase
        .from('questions')
        .delete()
        .eq('quiz_id', quizId)
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async getQuestionOptions(questionId: string): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getQuestionOptions', { questionId });
    return cachedSafeCall(`options_${questionId}`, 15000, () =>
      supabase
        .from('options')
        .select('*')
        .eq('question_id', questionId)
    );
  },

  async getOptionsForQuestions(questionIds: string[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getOptionsForQuestions', { count: questionIds.length });
    const cacheKey = `options_qids_${questionIds.slice().sort().join('_')}`;
    return cachedSafeCall(cacheKey, 15000, () =>
      supabase
        .from('options')
        .select('*')
        .in('question_id', questionIds)
    );
  },

  async createOptions(options: any[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.createOptions', { count: options.length });
    const res = await safeCall<Option[]>(
      supabase
        .from('options')
        .insert(options)
        .select()
    );
    if (res.success) {
      clearQueryCache('options');
    }
    return res;
  },

  async deleteOptionsByQuestionId(questionId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteOptionsByQuestionId', { questionId });
    const res = await safeCall<void>(
      supabase
        .from('options')
        .delete()
        .eq('question_id', questionId)
    );
    if (res.success) {
      clearQueryCache('options');
    }
    return res;
  }
};
