import { useEffect, useState, useRef } from "react";

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
  const promptTimerRef = useRef<number | null>(null);
  const questionMaxTimeoutRef = useRef<Map<string, number>>(new Map());
  const hasResultRef = useRef(false);
  const hasNoMatchRef = useRef(false);
  const audioActiveRef = useRef(false);
  const retryHandledRef = useRef(false);
  const questionStartTimeRef = useRef<Map<string, number>>(new Map());

  // Set silence timer to 6 seconds
  const SILENCE_TIMER: number = 2000;
  const MAX_TIMEOUT_TIMER: number = 30_000;

  const finalizeQuestion = (questionId: string) => {
    // Clear hard timeout
    const maxTimeout = questionMaxTimeoutRef.current.get(questionId);
    if (maxTimeout) {
      clearTimeout(maxTimeout);
      questionMaxTimeoutRef.current.delete(questionId);
    }
    // Clear silence timer
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    // Log duration
    const startTime = questionStartTimeRef.current.get(questionId);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`✅ Question ${questionId} completed in ${duration} ms`);
      questionStartTimeRef.current.delete(questionId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
      }
      questionMaxTimeoutRef.current.forEach(clearTimeout);
      questionMaxTimeoutRef.current.clear();
    };
  }, []);

  // Reset when questions change
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
    // Clear all timeouts
    questionMaxTimeoutRef.current.forEach(clearTimeout);
    questionMaxTimeoutRef.current.clear();
  }, [questions]);

  const currentQuestion = dedupedQuestions.find((q) => !q.user_answer);

  useEffect(() => {
    if (!currentQuestion || spokenQuestionIds.current.has(currentQuestion.id)) return;
    speakAgentQuestion(currentQuestion);
    spokenQuestionIds.current.add(currentQuestion.id);
  }, [currentQuestion]);

  const speakAgentQuestion = (question: Question) => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    questionStartTimeRef.current.set(question.id, Date.now());

    const maxTimeout = setTimeout(() => {
      setDedupedQuestions((prev) => {
        const alreadyAnswered = prev.some((q) => q.id === question.id && q.user_answer);
        if (alreadyAnswered) {
          finalizeQuestion(question.id);
          return prev;
        }
        console.warn(`[VOICE] MAX TIME (30s) exceeded for question: ${question.id}`);
        const updated = prev.map((q) =>
          q.id === question.id ? { ...q, user_answer: "[Timeout]" } : q
        );
        onUserSpoken("[Timeout]", updated);
        finalizeQuestion(question.id);
        questionStartTimeRef.current.delete(question.id);
        return updated;
      });
    }, MAX_TIMEOUT_TIMER); // 30 seconds

    questionMaxTimeoutRef.current.set(question.id, maxTimeout);

    const utterance = new SpeechSynthesisUtterance(question.agent_question);
    utterance.onend = () => {
      onAgentSpoken(question.agent_question);
      tryListening(question, 1);
    };
    speechSynthesis.speak(utterance);
  };

  const tryListening = (question: Question, attempt: number) => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not supported");
    finalizeQuestion(question.id);
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  hasResultRef.current = false;
  hasNoMatchRef.current = false;
  audioActiveRef.current = false;
  retryHandledRef.current = false;

  const listeningStartTime = Date.now();

  const startSilenceTimer = () => {
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
    }
    promptTimerRef.current = setTimeout(() => {
      console.log("Silence timeout (2s) — stopping recognition");
      recognition.stop();
    }, SILENCE_TIMER);
  };

  recognition.onaudiostart = () => {
    console.log("recognition.onaudiostart");
    audioActiveRef.current = true;
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
  };

  recognition.onaudioend = () => {
    console.log("recognition.onaudioend");
    audioActiveRef.current = false;
    if (!hasResultRef.current && !hasNoMatchRef.current) {
      console.log("VAD silence detected...");
      startSilenceTimer();
    }
  };

  recognition.onresult = (event: any) => {
    console.log("recognition.onresult", event.results[0][0].transcript);
    hasResultRef.current = true;
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    const transcript = event.results[0][0].transcript;
    setDedupedQuestions((prev) => {
      const updated = prev.map((q) =>
        q.id === question.id ? { ...q, user_answer: transcript } : q
      );
      onUserSpoken(transcript, updated);
      finalizeQuestion(question.id);
      return updated;
    });
    recognition.stop();
  };

  recognition.onnomatch = () => {
    console.log("recognition.onnomatch");
    hasNoMatchRef.current = true;
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    recognition.stop();
  };

  recognition.onerror = (event: any) => {
    console.error("Speech recognition error:", event.error);
    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    retryHandledRef.current = true;
    recognition.stop();
  };

  recognition.onend = () => {
    console.log("recognition.onend", attempt);
    if (retryHandledRef.current) return;
    retryHandledRef.current = true;

    if (promptTimerRef.current !== null) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    if (hasResultRef.current) return;

    const elapsedTime = Date.now() - listeningStartTime;
    if (elapsedTime >= SILENCE_TIMER * attempt || hasNoMatchRef.current) { // Adjusted to accumulate silence
      if (attempt < 1 && !hasNoMatchRef.current) {
        console.log(`No voice detected after ${elapsedTime}ms. Retrying attempt ${attempt + 1}`);
        setTimeout(() => tryListening(question, attempt + 1), 700); // Increased delay to 700ms
      } else {
        setDedupedQuestions((prev) => {
          const updated = prev.map((q) =>
            q.id === question.id
              ? { ...q, user_answer: hasNoMatchRef.current ? "[Unintelligible]" : "[No response]" }
              : q
          );
          onUserSpoken(hasNoMatchRef.current ? "[Unintelligible]" : "[No response]", updated);
          finalizeQuestion(question.id);
          return updated;
        });
      }
    }
  };

  recognition.start();
  startSilenceTimer();
};

  const tryListeningOld = (question: Question, attempt: number) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported");
      finalizeQuestion(question.id);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    hasResultRef.current = false;
    hasNoMatchRef.current = false;
    audioActiveRef.current = false;
    retryHandledRef.current = false;

    // Track when listening started for the 6-second silence window
    const listeningStartTime = Date.now();

    const startSilenceTimer = () => {
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
      }
      promptTimerRef.current = setTimeout(() => {
        console.log("Silence timeout (6s) — stopping recognition");
        recognition.stop();
      }, SILENCE_TIMER);
    };

    recognition.onaudiostart = () => {
      console.log("recognition.onaudiostart");
      audioActiveRef.current = true;
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
    };

    recognition.onaudioend = () => {
      console.log("recognition.onaudioend");
      audioActiveRef.current = false;
      if (!hasResultRef.current && !hasNoMatchRef.current) {
        console.log("VAD silence detected...");
        startSilenceTimer();
      }
    };

    recognition.onresult = (event: any) => {
      console.log("recognition.onresult", event.results[0][0].transcript);
      hasResultRef.current = true;
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      const transcript = event.results[0][0].transcript;
      setDedupedQuestions((prev) => {
        const updated = prev.map((q) =>
          q.id === question.id ? { ...q, user_answer: transcript } : q
        );
        onUserSpoken(transcript, updated);
        finalizeQuestion(question.id);
        return updated;
      });
      recognition.stop();
    };

    recognition.onnomatch = () => {
      console.log("recognition.onnomatch");
      hasNoMatchRef.current = true;
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      recognition.stop();
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
      retryHandledRef.current = true;
      recognition.stop();
    };

    recognition.onend = () => {
      console.log("recognition.onend", attempt);
      if (retryHandledRef.current) return;
      retryHandledRef.current = true;

      if (promptTimerRef.current !== null) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }

      if (hasResultRef.current) return;

      // Check if 6 seconds have elapsed since listening started
      const elapsedTime = Date.now() - listeningStartTime;
      if (elapsedTime >= SILENCE_TIMER || hasNoMatchRef.current) {
        if (attempt < 3 && !hasNoMatchRef.current) {
          console.log(`No voice detected. Retrying attempt ${attempt + 1}`);
          setTimeout(() => tryListening(question, attempt + 1), 300);
        } else {
          setDedupedQuestions((prev) => {
            const updated = prev.map((q) =>
              q.id === question.id
                ? { ...q, user_answer: hasNoMatchRef.current ? "[Unintelligible]" : "[No response]" }
                : q
            );
            onUserSpoken(hasNoMatchRef.current ? "[Unintelligible]" : "[No response]", updated);
            finalizeQuestion(question.id);
            return updated;
          });
        }
      } else {
        // Restart recognition if silence timer hasn't expired
        console.log("Restarting recognition due to early end");
        setTimeout(() => tryListening(question, attempt), 300);
      }
    };

    recognition.start();
    startSilenceTimer();
  };
};