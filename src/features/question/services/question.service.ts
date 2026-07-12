import { supabase } from '@/core/supabase';
import { safeCall } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Question, Option } from '@/types';

export const QuestionService = {
  async getQuestions(quizId: string): Promise<ServiceResponse<Question[]>> {
    console.log('[SYNC] QuestionService.getQuestions', { quizId });
    return safeCall(
      supabase
        .from('questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true })
    );
  },

  async createQuestion(question: any): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.createQuestion', question);
    return safeCall(
      supabase
        .from('questions')
        .insert(question)
        .select()
        .single()
    );
  },

  async updateQuestion(id: string, updates: Partial<Question>): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.updateQuestion', { id, updates });
    return safeCall(
      supabase
        .from('questions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
    );
  },

  async deleteQuestion(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestion', { id });
    return safeCall(
      supabase
        .from('questions')
        .delete()
        .eq('id', id)
    );
  },

  async deleteQuestionsByQuizId(quizId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestionsByQuizId', { quizId });
    return safeCall(
      supabase
        .from('questions')
        .delete()
        .eq('quiz_id', quizId)
    );
  },

  async getQuestionOptions(questionId: string): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getQuestionOptions', { questionId });
    return safeCall(
      supabase
        .from('options')
        .select('*')
        .eq('question_id', questionId)
    );
  },

  async getOptionsForQuestions(questionIds: string[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getOptionsForQuestions', { count: questionIds.length });
    return safeCall(
      supabase
        .from('options')
        .select('*')
        .in('question_id', questionIds)
    );
  },

  async createOptions(options: any[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.createOptions', { count: options.length });
    return safeCall(
      supabase
        .from('options')
        .insert(options)
        .select()
    );
  },

  async deleteOptionsByQuestionId(questionId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteOptionsByQuestionId', { questionId });
    return safeCall(
      supabase
        .from('options')
        .delete()
        .eq('question_id', questionId)
    );
  }
};
