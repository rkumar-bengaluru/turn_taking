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

export const useVoiceChat = ({
  questions,
  onAgentSpoken,
  onUserSpoken,
}: VoiceChatProps) => {
  const [dedupedQuestions, setDedupedQuestions] = useState<Question[]>([]);
  const spokenQuestionIds = useRef<Set<string>>(new Set());
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultRef = useRef(false);
  const hasNoMatchRef = useRef(false);
  const audioActiveRef = useRef(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
      }
    };
  }, []);

  // Deduplicate and sort questions when `questions` prop changes
  useEffect(() => {
    const seen = new Set<string>();
    const unique = questions.filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
    const sorted = unique.sort((a, b) => a.order - b.order);
    setDedupedQuestions(sorted);
    spokenQuestionIds.current = new Set();
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
  }, [questions]);

  // Find first unanswered question
  const currentQuestion = dedupedQuestions.find((q) => !q.user_answer);

  // Speak current question if not already spoken
  useEffect(() => {
    if (!currentQuestion) return;
    if (spokenQuestionIds.current.has(currentQuestion.id)) return;

    speakAgentQuestion(currentQuestion);
    spokenQuestionIds.current.add(currentQuestion.id);
  }, [currentQuestion]);

  const speakAgentQuestion = (question: Question) => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(question.agent_question);
    utterance.onend = () => {
      onAgentSpoken(question.agent_question);
      tryListening(question, 1);
    };
    speechSynthesis.speak(utterance);
  };

  const tryListening = (question: Question, attempt: number) => {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  hasResultRef.current = false;
  hasNoMatchRef.current = false;
  audioActiveRef.current = false;

  // Reset and start initial silence timer
  const startSilenceTimer = () => {
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(() => {
      console.log('Silence timeout — stopping recognition');
      recognition.stop();
    }, 2000); // short initial timeout
  };

  recognition.onaudiostart = () => {
    audioActiveRef.current = true;
    // User is speaking (or noise started) — cancel silence timer
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  };

  recognition.onaudioend = () => {
    audioActiveRef.current = false;
    // User stopped speaking — if no result yet, start silence timer
    if (!hasResultRef.current && !hasNoMatchRef.current) {
      startSilenceTimer();
    }
  };

  recognition.onresult = (event: any) => {
    hasResultRef.current = true;
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    const transcript = event.results[0][0].transcript;
    setDedupedQuestions((prev) => {
      const updated = prev.map((q) =>
        q.id === question.id ? { ...q, user_answer: transcript } : q
      );
      onUserSpoken(transcript, updated);
      return updated;
    });

    recognition.stop();
  };

  recognition.onnomatch = () => {
    hasNoMatchRef.current = true;
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    recognition.stop();
  };

  recognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error);
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    recognition.stop();
  };

  recognition.onend = () => {
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    if (hasResultRef.current) return;

    if (hasNoMatchRef.current) {
      if (attempt < 3) {
        console.log('Speech not understood. Retrying...');
        setTimeout(() => tryListening(question, attempt + 1), 300);
      } else {
        setDedupedQuestions((prev) => {
          const updated = prev.map((q) =>
            q.id === question.id ? { ...q, user_answer: '[Unintelligible]' } : q
          );
          onUserSpoken('[Unintelligible]', updated);
          return updated;
        });
      }
      return;
    }

    // No speech at all
    if (attempt < 3) {
      console.log(`No voice detected. Retrying attempt ${attempt + 1}`);
      setTimeout(() => tryListening(question, attempt + 1), 300);
    } else {
      setDedupedQuestions((prev) => {
        const updated = prev.map((q) =>
          q.id === question.id ? { ...q, user_answer: '[No response]' } : q
        );
        onUserSpoken('[No response]', updated);
        return updated;
      });
    }
  };

  recognition.start();
  startSilenceTimer(); // Start initial 2s silence timer
};

  const tryListening1 = (question: Question, attempt: number) => {
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

    // Reset outcome flags for this attempt
    hasResultRef.current = false;
    hasNoMatchRef.current = false;

    // Optional: UI feedback only (do NOT use for logic)
    recognition.onaudiostart = () => {
      console.log('Audio input detected (UI only)');
      // e.g., setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      hasResultRef.current = true;
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }

      const transcript = event.results[0][0].transcript;
      setDedupedQuestions((prev) => {
        const updated = prev.map((q) =>
          q.id === question.id ? { ...q, user_answer: transcript } : q
        );
        onUserSpoken(transcript, updated);
        return updated;
      });

      recognition.stop();
    };

    recognition.onnomatch = () => {
      hasNoMatchRef.current = true;
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      recognition.stop();
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      recognition.stop();
    };

    recognition.onend = () => {
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }

      // ✅ Success: result was captured
      if (hasResultRef.current) {
        return;
      }

      // 🗣️ Speech detected but not understood
      if (hasNoMatchRef.current) {
        if (attempt < 3) {
          console.log('Speech detected but not understood. Retrying...');
          setTimeout(() => tryListening(question, attempt + 1), 300);
        } else {
          console.log('Max retries: marking as [Unintelligible]');
          setDedupedQuestions((prev) => {
            const updated = prev.map((q) =>
              q.id === question.id ? { ...q, user_answer: '[Unintelligible]' } : q
            );
            onUserSpoken('[Unintelligible]', updated);
            return updated;
          });
        }
        return;
      }

      // 🤫 No speech detected (silence or only noise)
      if (attempt < 3) {
        console.log(`No voice detected. Retrying attempt ${attempt + 1}`);
        setTimeout(() => tryListening(question, attempt + 1), 300);
      } else {
        console.log('Max retries reached. Marking as [No response].');
        setDedupedQuestions((prev) => {
          const updated = prev.map((q) =>
            q.id === question.id ? { ...q, user_answer: '[No response]' } : q
          );
          onUserSpoken('[No response]', updated);
          return updated;
        });
      }
    };

    recognition.start();

    // ⏱️ Start 2-second silence timeout
    promptTimerRef.current = setTimeout(() => {
      console.log('4s silence timeout — stopping recognition');
      recognition.stop(); // triggers onend
    }, 2000);
  };
};