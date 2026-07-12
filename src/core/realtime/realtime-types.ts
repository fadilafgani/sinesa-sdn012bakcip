export type RealtimeStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

export type RealtimeEvent =
  | 'SessionUpdated'
  | 'ParticipantJoined'
  | 'ParticipantLeft'
  | 'AnswerSubmitted'
  | 'ParticipantUpdated'
  | 'MyParticipantUpdated'
  | 'StageChanged'
  | 'QuestionChanged'
  | 'TimerUpdated'
  | 'LeaderboardUpdated'
  | 'QuizFinished';
