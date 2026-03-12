import React from 'react';

const ThumbsUpIcon: React.FC<{ className?: string; title?: string }> = ({ className = '', title }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : 'img'}
    focusable="false"
  >
    {title && <title>{title}</title>}
    <path d="M2 21h4V9H2v12zM22 10.5c0-.83-.67-1.5-1.5-1.5h-5.56l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L15.17 2 8.59 8.59C8.21 8.97 8 9.45 8 9.95V18c0 1.1.9 2 2 2h7.5c.83 0 1.5-.67 1.5-1.5V10.5z" fill="currentColor" />
  </svg>
);

export default ThumbsUpIcon;
