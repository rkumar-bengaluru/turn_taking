import { useRef } from 'react';

// Types
interface WebSocketMessage {
  type: string;
  text?: string;
  [key: string]: any;
}

type MessageHandler = (data: WebSocketMessage) => void;

// Define SpeechRecognition interface for TypeScript
interface SpeechRecognition {
  new(): SpeechRecognition;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export const useVoiceChat = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlerRef = useRef<MessageHandler | null>(null);
  const statusRef = useRef<string>('disconnected');
  const agentIsSpeakingRef = useRef<boolean>(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const connect = (onMessage: MessageHandler): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Reuse existing connection if open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected, reusing connection');
        messageHandlerRef.current = onMessage;
        resolve();
        return;
      }

      // Clean up any closed or closing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket('ws://localhost:8080');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to WebSocket server');
        messageHandlerRef.current = onMessage;
        statusRef.current = 'connected';
        console.log('Sending:', JSON.stringify({ type: 'start' }));
        ws.send(JSON.stringify({ type: 'start' }));
        resolve();
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data) as WebSocketMessage;
        if (messageHandlerRef.current) {
          messageHandlerRef.current(data);
        }

        if (data.type === 'agent_message') {
          // Stop any ongoing speech or recognition to enforce turn-taking
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
          }
          window.speechSynthesis.pause();
          window.speechSynthesis.cancel();
          agentIsSpeakingRef.current = false;
          currentUtteranceRef.current = null;

          // Start speaking and listening concurrently
          if (!data.text) return 
          const speakPromise = speakText(data.text, agentIsSpeakingRef, currentUtteranceRef);
          listenToUser(agentIsSpeakingRef, wsRef, currentUtteranceRef, recognitionRef).then(
            (userText) => {
                console.log("user is interrupting....")
              // User spoke (possibly interrupted)
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'user_message',
                  text: userText
                }));
              }
            },
            (err) => {
              // No speech detected or error, start retry logic after agent finishes
              console.error('Listening failed:', err);
              speakPromise.then(() => {
                setTimeout(() => {
                  let attempts = 0;
                  const maxAttempts = 3;

                  const tryListening = async () => {
                    try {
                      const userText = await listenToUser(agentIsSpeakingRef, wsRef, currentUtteranceRef, recognitionRef);
                      if (userText.trim().toLowerCase() === 'can you hear me?') {
                        console.log('Ignoring agent phrase in transcription');
                        throw new Error('No speech detected');
                      }
                      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                          type: 'user_message',
                          text: userText
                        }));
                      }
                    } catch (err) {
                      console.error('Retry listening failed:', err);
                      attempts++;
                      if (err === 'No speech detected' && attempts < maxAttempts) {
                        if (recognitionRef.current) {
                          recognitionRef.current.stop();
                          recognitionRef.current = null;
                        }
                        window.speechSynthesis.pause();
                        window.speechSynthesis.cancel();
                        agentIsSpeakingRef.current = false;
                        currentUtteranceRef.current = null;
                        await speakText('Can you hear me?', agentIsSpeakingRef, currentUtteranceRef);
                        setTimeout(() => {
                          console.log(`Retry attempt ${attempts} of ${maxAttempts}`);
                          tryListening();
                        }, 500);
                      } else {
                        console.error('Closing session due to repeated failures or error:', err);
                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                          wsRef.current.send(JSON.stringify({
                            type: 'session_ended',
                            reason: 'No speech detected after multiple attempts'
                          }));
                          wsRef.current.close();
                        }
                      }
                    }
                  };

                  tryListening();
                }, 500);
              });
            }
          );
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusRef.current = 'error';
        reject(error);
      };

      ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
        statusRef.current = 'disconnected';
        wsRef.current = null;
        agentIsSpeakingRef.current = false;
        window.speechSynthesis.pause();
        window.speechSynthesis.cancel();
        currentUtteranceRef.current = null;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
      };
    });
  };

  const disconnect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      wsRef.current = null;
    }
    statusRef.current = 'disconnected';
    agentIsSpeakingRef.current = false;
    window.speechSynthesis.pause();
    window.speechSynthesis.cancel();
    currentUtteranceRef.current = null;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const speakText = (
    text: string,
    agentIsSpeakingRef: React.MutableRefObject<boolean>,
    currentUtteranceRef: React.MutableRefObject<SpeechSynthesisUtterance | null>
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Clear any existing speech
      window.speechSynthesis.pause();
      window.speechSynthesis.cancel();
      agentIsSpeakingRef.current = false;
      currentUtteranceRef.current = null;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onstart = () => {
        agentIsSpeakingRef.current = true;
        currentUtteranceRef.current = utterance;
        console.log('Agent speaking:', text);
      };
      utterance.onend = () => {
        agentIsSpeakingRef.current = false;
        currentUtteranceRef.current = null;
        console.log('Agent finished speaking');
        resolve();
      };
      utterance.onerror = (event) => {
        agentIsSpeakingRef.current = false;
        currentUtteranceRef.current = null;
        console.error('Speech synthesis error:', event.error);
        reject(event.error);
      };
      window.speechSynthesis.speak(utterance);
    });
  };

  const listenToUser = (
    agentIsSpeakingRef: React.MutableRefObject<boolean>,
    wsRef: React.MutableRefObject<WebSocket | null>,
    currentUtteranceRef: React.MutableRefObject<SpeechSynthesisUtterance | null>,
    recognitionRef: React.MutableRefObject<SpeechRecognition | null>,
    timeoutMs: number = 3000
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reject('SpeechRecognition not supported');
        return;
      }

      // Stop any existing recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let hasResult = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        hasResult = true;
        console.log('User said:', transcript);
        if (agentIsSpeakingRef.current) {
          console.log('User interrupted with:', transcript);
          // Force stop speech synthesis
          window.speechSynthesis.pause();
          window.speechSynthesis.cancel();
          agentIsSpeakingRef.current = false;
          currentUtteranceRef.current = null;
          // Send interruption immediately
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'user_message',
              text: transcript
            }));
          }
          recognition.stop();
          recognitionRef.current = null;
          resolve(transcript);
        } else {
          recognition.stop();
          recognitionRef.current = null;
          resolve(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        recognitionRef.current = null;
        if (event.error === 'not-allowed') {
          reject('Microphone access denied. Please allow microphone access.');
        } else {
          reject(event.error);
        }
      };

      recognition.onend = () => {
        console.log('Recognition ended, hasResult:', hasResult);
        if (!hasResult && !agentIsSpeakingRef.current) {
          recognitionRef.current = null;
          setTimeout(() => {
            reject('No speech detected');
          }, timeoutMs);
        }
      };

      recognition.start();
    });
  };

  return {
    connect,
    disconnect,
    sendMessage,
    get status() {
      return statusRef.current;
    },
    agentIsSpeakingRef
  };
};