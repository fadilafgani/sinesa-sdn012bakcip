export type RealtimeStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

export type RealtimeEvent =
  | 'SessionUpdated'
  | 'ParticipantJoined'
  | 'AnswerSubmitted'
  | 'ParticipantUpdated'
  | 'MyParticipantUpdated'
  | 'StageChanged'
  | 'QuestionChanged'
  | 'QuizFinished';
