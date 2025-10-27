import React, { useEffect, useRef, useState } from 'react';
import { useVoiceChat } from '../hooks/useVoiceChat';
// import { useVoiceChat } from '../hooks/useVoice';

interface ChatInterfaceProps {
  onExit: () => void;
}

interface Message {
  id: string;
  role: 'agent' | 'user';
  text: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onExit }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { connect, disconnect, sendMessage, status } = useVoiceChat();

  const addMessage = (role: 'agent' | 'user', text: string) => {
    const newMessage = { id: Date.now().toString(), role, text };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleExit = () => {
    disconnect();
    onExit();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const initializeChat = async () => {
      await connect((data) => {
        if (data.type === 'agent_message') {
          if (!data?.text) return 
          addMessage('agent', data.text);
          // Agent will speak automatically in the hook
        }
      });
    };

    initializeChat();

    return () => {
      disconnect();
    };
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Voice Chat</h2>
        <button onClick={handleExit}>Exit</button>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ 
            textAlign: msg.role === 'agent' ? 'left' : 'right',
            margin: '8px 0',
            maxWidth: '80%'
          }}>
            <strong>{msg.role === 'agent' ? 'Agent' : 'You'}:</strong> {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #eee', textAlign: 'center' }}>
        Status: <strong>{status}</strong>
      </div>
    </div>
  );
};

export default ChatInterface;