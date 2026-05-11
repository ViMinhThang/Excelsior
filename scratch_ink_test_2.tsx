import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static } from 'ink';

const PRE_FILLED = ["Pre-filled Line"];

const App = () => {
  return (
    <Box flexDirection="column">
      <Static items={PRE_FILLED}>
        {(item) => <Text key={item} color="blue">OUTPUT: {item}</Text>}
      </Static>
      <Text>Active Content</Text>
    </Box>
  );
};

render(<App />);
setTimeout(() => process.exit(0), 500);
