export type RealtimeStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'RECONNECTED'
  | 'POLLING_FALLBACK'
  | 'DISCONNECTED'
  | 'ERROR';

export type RealtimeEvent =
  | 'SessionUpdated'
  | 'ParticipantJoined'
  | 'ParticipantLeft'
  | 'ParticipantsSynced'
  | 'AnswerSubmitted'
  | 'ParticipantUpdated'
  | 'MyParticipantUpdated'
  | 'StageChanged'
  | 'QuestionChanged'
  | 'TimerUpdated'
  | 'TimerTick'
  | 'CountdownTick'
  | 'LeaderboardUpdated'
  | 'QuizFinished';
