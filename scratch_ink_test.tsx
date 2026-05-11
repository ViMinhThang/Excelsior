import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static } from 'ink';

const App = () => {
  const [items, setItems] = useState<string[]>([]);
  
  useEffect(() => {
    setTimeout(() => {
       setItems(["Initial Line"]);
    }, 100);
  }, []);

  return (
    <Box flexDirection="column">
      <Static items={items}>
        {(item) => <Text key={item} color="green">OUTPUT: {item}</Text>}
      </Static>
      <Text>Active Content</Text>
    </Box>
  );
};

render(<App />);
setTimeout(() => process.exit(0), 500);
