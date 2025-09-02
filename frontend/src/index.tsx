import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import DynoAppV2 from './DynoAppV2';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <DynoAppV2 />
  </React.StrictMode>
);