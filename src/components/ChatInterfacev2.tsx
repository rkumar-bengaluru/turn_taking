'use client';

import { useState } from 'react';
import { useVoiceChat } from '../hooks/useVoiceChatv2';

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
      id: 'c1387a1a-8f3b-4202-a198-8bbbb39264c8',
      agent_question: 'Describe the concept of Python namespaces and scope?',
      user_answer: '',
      timeout: 30,
      order: 2,
      weight: 0.5,
    },
  ],
};

interface Question {
  id: string;
  agent_question: string;
  user_answer: string;
  timeout: number;
  order: number;
  weight: number;
}

interface ChatInterfaceProps {
  onExit: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onExit }) => {
  const [questions, setQuestions] = useState<Question[]>(() =>
    [...rawData.questions].sort((a, b) => a.order - b.order)
  );
  const [agentSpoken, setAgentSpoken] = useState('');
  const [userSpoken, setUserSpoken] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);

    const [repeatRequested, setRepeatRequested] = useState(false);


  const handleExit = () => {
    onExit();
  };

  useVoiceChat({
  questions,
  onAgentSpoken: (text) => {
    setAgentSpoken(text);
    setRepeatRequested(false); // reset repeat flag
  },
  onUserSpoken: (text, updatedQuestions) => {
    setUserSpoken(text);
    setQuestions(updatedQuestions);
    setShowPrompt(false);
  },
});

  return (
    <main className="p-6 max-w-xl mx-auto relative">
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

      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <h2>Voice Chat</h2>
        <button onClick={handleExit}>Exit</button>
      </div>

      {showPrompt && pendingQuestion && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded shadow-lg max-w-md text-center">
      <p className="text-lg font-semibold mb-4">Did you hear the question?</p>
      <p className="italic text-gray-700 mb-6">"{pendingQuestion.agent_question}"</p>
      <div className="flex justify-center gap-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => {
            setRepeatRequested(true);
            setShowPrompt(false);
          }}
        >
          Repeat question
        </button>
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
          onClick={() => setShowPrompt(false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

    </main>
  );
};

export default ChatInterface;
