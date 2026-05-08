import React from 'react';
import { NavigationProvider } from './context/NavigationContext.js';
import { ReviewProvider } from './context/ReviewContext.js';
import Router from './components/navigation/Router.js';
import ErrorBoundary from './components/ErrorBoundary.js';

const App = () => (
  <ErrorBoundary>
    <ReviewProvider>
      <NavigationProvider>
        <Router />
      </NavigationProvider>
    </ReviewProvider>
  </ErrorBoundary>
);

export default App;
