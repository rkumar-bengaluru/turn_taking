import { useEffect, useState, useRef } from 'react';

interface Question {
  id: string;
  agent_question: string;
  user_answer: string;
  timeout: number;
  order: number;
  weight: number;
}

interface VoiceChatProps {
  questions: Question[];
  onAgentSpoken: (text: string) => void;
  onUserSpoken: (text: string, updatedQuestions: Question[]) => void;
}

export const useVoiceChat = ({ questions, onAgentSpoken, onUserSpoken }: VoiceChatProps) => {
  const [dedupedQuestions, setDedupedQuestions] = useState<Question[]>([]);
  const spokenQuestionIds = useRef<Set<string>>(new Set());

  // Deduplicate and sort questions once when `questions` prop changes
  useEffect(() => {
    const seen = new Set<string>();
    const unique = questions.filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
    const sorted = unique.sort((a, b) => a.order - b.order);
    setDedupedQuestions(sorted);
    // Reset spoken tracking when questions change
    spokenQuestionIds.current = new Set();
  }, [questions]);

  // Find the first unanswered question
  const currentQuestion = dedupedQuestions.find((q) => !q.user_answer);

  // Speak the current unanswered question (if any)
  useEffect(() => {
    if (!currentQuestion) return;

    // Avoid re-speaking the same question
    if (spokenQuestionIds.current.has(currentQuestion.id)) {
      return;
    }

    speakAgentQuestion(currentQuestion);
    spokenQuestionIds.current.add(currentQuestion.id);
  }, [currentQuestion]);

  const speakAgentQuestion = (question: Question) => {
    // Cancel any ongoing speech to avoid overlap
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(question.agent_question);
    utterance.onend = () => {
      onAgentSpoken(question.agent_question);
      listenToUser(question);
    };
    speechSynthesis.speak(utterance);
  };

  const listenToUser = (question: Question) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;

      setDedupedQuestions((prev) => {
        const updated = prev.map((q) =>
          q.id === question.id ? { ...q, user_answer: transcript } : q
        );
        onUserSpoken(transcript, updated);
        return updated;
      });

      recognition.stop(); // Ensure recognition stops after result
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      recognition.stop();
    };

    recognition.start();
  };
};