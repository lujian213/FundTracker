import React from 'react';

const ThumbsUpIcon: React.FC<{ className?: string; title?: string }> = ({ className = '', title }) => (
  <span
    className={className}
    role="img"
    aria-label={title || '点赞'}
    title={title}
    style={{ fontSize: '16px', lineHeight: 1 }}
  >
    👍
  </span>
);

export default ThumbsUpIcon;