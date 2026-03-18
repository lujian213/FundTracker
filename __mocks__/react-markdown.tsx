import React from 'react';

const ReactMarkdown = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="react-markdown">{children}</div>;
};

export default ReactMarkdown;