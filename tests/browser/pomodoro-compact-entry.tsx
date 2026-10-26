import React from 'react';
import { createRoot } from 'react-dom/client';
import PomodoroTimer from '/src/components/PomodoroTimer';
import '/src/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing compact Pomodoro QA root');

createRoot(root).render(React.createElement(PomodoroTimer, { compact: true }));
