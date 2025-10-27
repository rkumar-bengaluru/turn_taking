import React, { useState } from 'react';
import HomePage from './components/HomePage.tsx';
import ChatInterface from './components/ChatInterfacev3.tsx';

function App() {
  const [inChat, setInChat] = useState(false);

  if (inChat) {
    return <ChatInterface onExit={() => setInChat(false)} />;
  }

  return <HomePage onStartChat={() => setInChat(true)} />;
}

export default App;