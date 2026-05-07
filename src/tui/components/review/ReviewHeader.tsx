import React, { memo } from "react";
import { Box, Text } from "ink";

interface ReviewHeaderProps {
  title: string;
}

const ReviewHeader: React.FC<ReviewHeaderProps> = ({ title }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyanBright">  ███████╗██╗  ██╗ ██████╗███████╗██╗     ███████╗██╗ ██████╗ ██████╗</Text>
      <Text color="cyanBright">  ██╔════╝╚██╗██╔╝██╔════╝██╔════╝██║     ██╔════╝██║██╔═══██╗██╔══██╗</Text>
      <Text color="cyanBright">  █████╗   ╚███╔╝ ██║     █████╗  ██║     ███████╗██║██║   ██║██████╔╝</Text>
      <Text color="cyanBright">  ██╔══╝   ██╔██╗ ██║     ██╔══╝  ██║     ╚════██║██║██║   ██║██╔══██╗</Text>
      <Text color="cyanBright">  ███████╗██╔╝ ██╗╚██████╗███████╗███████╗███████║██║╚██████╔╝██║  ██║</Text>
      <Text color="cyanBright">  ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝</Text>
      <Text color="white">— {title}</Text>
    </Box>
  );
};

export default memo(ReviewHeader);
