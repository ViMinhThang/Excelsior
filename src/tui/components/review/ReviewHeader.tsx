import React, { memo } from "react";
import AppHeader from "../shared/AppHeader.js";

interface ReviewHeaderProps {
  title: string;
}

const ReviewHeader: React.FC<ReviewHeaderProps> = ({ title }) => {
  return <AppHeader subtitle={title} />;
};

export default memo(ReviewHeader);
