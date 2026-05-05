import React from 'react';
import { NavigationProvider } from './context/NavigationContext.js';
import Router from './components/navigation/Router.js';
import ErrorBoundary from './components/ErrorBoundary.js';

const App = () => (
  <ErrorBoundary>
    <NavigationProvider>
      <Router />
    </NavigationProvider>
  </ErrorBoundary>
);

export default App;
