import React from 'react';

interface HomePageProps {
  onStartChat: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onStartChat }) => {
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5'
    }}>
      <h1>Voice Agent Prototype</h1>
      <button 
        onClick={onStartChat}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          marginTop: '20px',
          cursor: 'pointer'
        }}
      >
        Chat with Agent
      </button>
    </div>
  );
};

export default HomePage;