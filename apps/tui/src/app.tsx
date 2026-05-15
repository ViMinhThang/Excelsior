import React from 'react';
import { NavigationProvider } from './context/NavigationContext.js';
import { AgentHostProvider } from './context/AgentHostContext.js';
import Router from './components/navigation/Router.js';
import ErrorBoundary from './components/ErrorBoundary.js';

const App = () => (
  <ErrorBoundary>
    <AgentHostProvider>
      <NavigationProvider>
        <Router />
      </NavigationProvider>
    </AgentHostProvider>
  </ErrorBoundary>
);

export default App;
