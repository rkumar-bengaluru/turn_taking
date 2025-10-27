// pages/chatinterface.tsx
'use client';

import { useState, useEffect } from 'react';
import { useVoiceChat } from '../hooks/useVoiceChatv1';

const rawData = {
  test_name: 'Python Interview',
  role: 'Junior Developer',
  date: '2025-10-22T00:00:00Z',
  session_timeout: 60,
  questions: [
    {
      id: 'abbec480-6a20-4671-8769-4a6038b25c55',
      agent_question: 'Explain garbage collection in python',
      user_answer: '',
      timeout: 30,
      order: 0,
      weight: 0.5,
    },
    {
      id: 'c1387a1a-8f3b-4202-a198-8bbbb39264cd',
      agent_question: 'What is GIL and how does it impacts parallism in python?',
      user_answer: '',
      timeout: 30,
      order: 1,
      weight: 0.5,
    },
    {
      id: 'c1387a1a-8f3b-4202-a198-8bbbb39264c7',
      agent_question: 'Explain the difference between mutable and immutable data types in Python?',
      user_answer: '',
      timeout: 30,
      order: 3,
      weight: 0.5,
    },
    {
      id: 'c1387a1a-8f3b-4202-a198-8bbbb39264c8',
      agent_question: 'Describe the concept of Python namespaces and scope?',
      user_answer: '',
      timeout: 30,
      order: 2,
      weight: 0.5,
    },
    {
      id: 'c1387a1a-8f3b-4202-a198-8bbbb39264c9',
      agent_question: 'What are decorators in Python, and how do they work?',
      user_answer: '',
      timeout: 30,
      order: 4,
      weight: 0.5,
    }
  ],
};

interface ChatInterfaceProps {
  onExit: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onExit }) => {
  const [questions, setQuestions] = useState(() =>
    [...rawData.questions].sort((a, b) => a.order - b.order)
  );
  const [agentSpoken, setAgentSpoken] = useState('');
  const [userSpoken, setUserSpoken] = useState('');

  const handleExit = () => {
    onExit();
  };

  useVoiceChat({
    questions,
    onAgentSpoken: (text) => setAgentSpoken(text),
    onUserSpoken: (text, updatedQuestions) => {
      setUserSpoken(text);
      setQuestions(updatedQuestions);
    },
  });

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Voice Interview: {rawData.test_name}</h1>
      <div className="mb-4">
        <p className="font-semibold">Agent:</p>
        <p className="text-blue-600">{agentSpoken}</p>
      </div>
      <div className="mb-4">
        <p className="font-semibold">User:</p>
        <p className="text-green-600">{userSpoken}</p>
      </div>
      <div className="mt-6">
        <h2 className="font-semibold">Collected Answers:</h2>
        <ul className="list-disc pl-5">
          {questions.map((q) => (
            <li key={q.id}>
              <strong>{q.agent_question}</strong>: {q.user_answer || '...'}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Voice Chat</h2>
        <button onClick={handleExit}>Exit</button>
      </div>
    </main>
  );
}

export default ChatInterface;
