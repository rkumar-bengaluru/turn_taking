import { useRef } from "react";

// Types
interface WebSocketMessage {
  type: string;
  text?: string;
  [key: string]: any;
}

type MessageHandler = (data: WebSocketMessage) => void;

export const useVoiceChat = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlerRef = useRef<MessageHandler | null>(null);
  const statusRef = useRef<string>("disconnected");
  const agentIsSpeakingRef = useRef<boolean>(false);

  const connect = (onMessage: MessageHandler): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Reuse existing connection if open
      // if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      //   console.log('WebSocket already connected, reusing connection');
      //   messageHandlerRef.current = onMessage;
      //   resolve();
      //   return;
      // }

      // Clean up any closed or closing connection
      // if (wsRef.current) {
      //   wsRef.current.close();
      //   wsRef.current = null;
      // }

      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Connected to WebSocket server");
        messageHandlerRef.current = onMessage;
        statusRef.current = "connected";
        console.log("Sending:", JSON.stringify({ type: "start" }));
        ws.send(JSON.stringify({ type: "start" }));
        resolve();
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data) as WebSocketMessage;
        if (messageHandlerRef.current) {
          messageHandlerRef.current(data);
        }

        if (data.type === "agent_message") {
          // Stop any ongoing speech or recognition to enforce turn-taking
          window.speechSynthesis.cancel();
          agentIsSpeakingRef.current = false;

          // Speak agent message
          if (!data?.text) return;
          speakText(data.text,data.audioData, agentIsSpeakingRef).then(() => {
            // Delay to avoid microphone picking up residual audio
            setTimeout(() => {
              let attempts = 0;
              const maxAttempts = 3;

              const tryListening = async () => {
                try {
                  const userText = await listenToUser(
                    agentIsSpeakingRef,
                    wsRef,
                  );
                  // Filter out agent phrases
                  if (userText.trim().toLowerCase() === "can you hear me?") {
                    console.log("Ignoring agent phrase in transcription");
                    throw new Error("No speech detected");
                  }
                  if (
                    wsRef.current &&
                    wsRef.current.readyState === WebSocket.OPEN
                  ) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "user_message",
                        text: userText,
                      }),
                    );
                  }
                } catch (err) {
                  console.error("Listening failed:", err);
                  attempts++;
                  if (err === "No speech detected" && attempts < maxAttempts) {
                    // Stop any ongoing speech before retry prompt
                    window.speechSynthesis.cancel();
                    agentIsSpeakingRef.current = false;
                    await speakText("Can you hear me?", "", agentIsSpeakingRef);
                    setTimeout(() => {
                      console.log(
                        `Retry attempt ${attempts} of ${maxAttempts}`,
                      );
                      tryListening();
                    }, 500);
                  } else {
                    console.error(
                      "Closing session due to repeated failures or error:",
                      err,
                    );
                    if (
                      wsRef.current &&
                      wsRef.current.readyState === WebSocket.OPEN
                    ) {
                      wsRef.current.send(
                        JSON.stringify({
                          type: "session_ended",
                          reason: "No speech detected after multiple attempts",
                        }),
                      );
                      wsRef.current.close();
                    }
                  }
                }
              };

              tryListening();
            }, 3000); // 500ms delay after agent speech
          });
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        statusRef.current = "error";
        reject(error);
      };

      ws.onclose = () => {
        console.log("Disconnected from WebSocket server");
        statusRef.current = "disconnected";
        wsRef.current = null;
        agentIsSpeakingRef.current = false;
        window.speechSynthesis.cancel();
      };
    });
  };

  const disconnect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      wsRef.current = null;
    }
    statusRef.current = "disconnected";
    agentIsSpeakingRef.current = false;
    window.speechSynthesis.cancel();
  };

  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const speakText = (
    text: string,
    audioData: string | undefined,
    agentIsSpeakingRef: React.MutableRefObject<boolean>,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!audioData) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onstart = () => {
          agentIsSpeakingRef.current = true;
          console.log("Agent speaking:", text);
        };
        utterance.onend = () => {
          agentIsSpeakingRef.current = false;
          console.log("Agent finished speaking");
          resolve();
        };
        utterance.onerror = (event) => {
          agentIsSpeakingRef.current = false;
          console.error("Speech synthesis error:", event.error);
          reject(event.error);
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
      if (audioData) {
        const audio = new Audio();
        audio.src = `data:audio/wav;base64,${audioData}`;
        audio.oncanplay = () => {
          agentIsSpeakingRef.current = true;
          // console.log("Agent audio playing:", audio.src);
          audio.play().catch((err) => {
            agentIsSpeakingRef.current = false;
            console.error("Audio playback error:", err);
            reject(err);
          });
        };

        audio.onended = () => {
          agentIsSpeakingRef.current = false;
          console.log("Agent audio finished");
          resolve();
        };

        audio.onerror = () => {
          agentIsSpeakingRef.current = false;
          console.error("Audio loading error");
          reject("Audio loading error");
        };
      }
    });
  };

  const listenToUser = (
    agentIsSpeakingRef: React.MutableRefObject<boolean>,
    wsRef: React.MutableRefObject<WebSocket | null>,
    timeoutMs: number = 5000,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reject("SpeechRecognition not supported");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let hasResult = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        hasResult = true;
        console.log("User said:", transcript);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "user_message",
              text: transcript,
            }),
          );
        }
        if (agentIsSpeakingRef.current) {
          console.log("User interrupted with:", transcript);
          window.speechSynthesis.cancel();
          agentIsSpeakingRef.current = false;
          // Send interruption immediately
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("sending message");
            wsRef.current.send(
              JSON.stringify({
                type: "user_message",
                text: transcript,
              }),
            );
          }
          resolve(transcript);
        } else {
          resolve(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        reject(event.error);
      };

      recognition.onend = () => {
        console.log("Recognition ended, hasResult:", hasResult);
        if (!hasResult && !agentIsSpeakingRef.current) {
          setTimeout(() => {
            reject("No speech detected");
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
    agentIsSpeakingRef, // Expose for UI feedback if needed
  };
};
