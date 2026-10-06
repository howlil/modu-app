export interface TypingSession {
  id: string;
  startedAt: number;
  durationMs: number;
  wpm: number;
  accuracy: number;
  correctChars: number;
  wrongChars: number;
  mode: 'time' | 'words' | 'paragraph' | 'custom';
}
