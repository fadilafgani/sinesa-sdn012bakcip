import { apiClient } from '@/core/api-client';
import { safeCall, cachedSafeCall, clearQueryCache } from '@/shared/services/base.service';
import type { ServiceResponse } from '@/shared/services/base.service';
import type { Question, Option } from '@/types';

export const QuestionService = {
  async getQuestions(quizId: string): Promise<ServiceResponse<Question[]>> {
    console.log('[SYNC] QuestionService.getQuestions', { quizId });
    return cachedSafeCall(`questions_${quizId}`, 15000, () =>
      apiClient.get<Question[]>('/questions', { params: { quiz_id: quizId } })
    );
  },

  async createQuestion(question: any): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.createQuestion', question);
    const res = await safeCall<Question>(
      apiClient.post<Question>('/questions', question)
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async updateQuestion(id: string, updates: Partial<Question>): Promise<ServiceResponse<Question>> {
    console.log('[SYNC] QuestionService.updateQuestion', { id, updates });
    const res = await safeCall<Question>(
      apiClient.put<Question>('/questions', updates, { params: { id } })
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async deleteQuestion(id: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestion', { id });
    const res = await safeCall<void>(
      apiClient.delete<void>('/questions', { params: { id } })
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async deleteQuestionsByQuizId(quizId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteQuestionsByQuizId', { quizId });
    const res = await safeCall<void>(
      apiClient.delete<void>('/questions', { params: { quiz_id: quizId } })
    );
    if (res.success) {
      clearQueryCache('questions');
    }
    return res;
  },

  async getQuestionOptions(questionId: string): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getQuestionOptions', { questionId });
    return cachedSafeCall(`options_${questionId}`, 15000, () =>
      apiClient.get<Option[]>('/questions', { params: { question_id: questionId, type: 'options' } })
    );
  },

  async getOptionsForQuestions(questionIds: string[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.getOptionsForQuestions', { count: questionIds.length });
    const cacheKey = `options_qids_${questionIds.slice().sort().join('_')}`;
    return cachedSafeCall(cacheKey, 15000, () =>
      apiClient.get<Option[]>('/questions', { params: { question_ids: questionIds.join(','), type: 'options' } })
    );
  },

  async createOptions(options: any[]): Promise<ServiceResponse<Option[]>> {
    console.log('[SYNC] QuestionService.createOptions', { count: options.length });
    const res = await safeCall<Option[]>(
      apiClient.post<Option[]>('/questions', { action: 'create_options', options }, { params: { type: 'options' } })
    );
    if (res.success) {
      clearQueryCache('options');
    }
    return res;
  },

  async deleteOptionsByQuestionId(questionId: string): Promise<ServiceResponse<void>> {
    console.log('[SYNC] QuestionService.deleteOptionsByQuestionId', { questionId });
    const res = await safeCall<void>(
      apiClient.delete<void>('/questions', { params: { question_id: questionId, type: 'options' } })
    );
    if (res.success) {
      clearQueryCache('options');
    }
    return res;
  }
};
