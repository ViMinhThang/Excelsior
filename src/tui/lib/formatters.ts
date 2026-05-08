export const truncateString = (str: string, maxLength: number = 50) => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
};

export const formatToolArgs = (args?: string, truncateLength: number = 50) => {
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed !== 'object' || parsed === null) return truncateString(args, truncateLength);
    
    return Object.entries(parsed).map(([k, v]) => {
      let valStr = '';
      if (typeof v === 'string') {
        valStr = `"${truncateString(v, truncateLength)}"`;
      } else {
        valStr = truncateString(JSON.stringify(v), truncateLength);
      }
      return { key: k, value: valStr };
    });
  } catch {
    return [{ key: 'args', value: truncateString(args.replace(/^{|}$/g, '').trim(), truncateLength) }];
  }
};
