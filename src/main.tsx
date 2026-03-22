import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import TestTable from './pages/TestTable.tsx';
import './index.css';

function Router() {
  const path = window.location.pathname;
  if (path === '/testtable') return <TestTable />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
