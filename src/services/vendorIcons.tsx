import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface VendorIconProps {
  size?: number;
  className?: string;
}

export function OpenAIIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2Z" opacity="0.2" fill="currentColor" />
      <path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24M2 12h6m8 0h6m-3.07-7.07-4.24 4.24m-5.66 5.66-4.24 4.24M12 2v6m0 8v6" />
    </svg>
  );
}

export function AnthropicIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.827 3.518h3.946L24 20.482h-4.004l-1.93-4.57H9.957l-1.892 4.57H4.02L10.233 3.518h3.594zm1.968 8.875-1.93-4.646-1.93 4.646h3.86z" />
    </svg>
  );
}

export function DeepSeekIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12s2-3 4-3 4 3 4 3-2 3-4 3-4-3-4-3Z" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function GeminiIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12Z" />
    </svg>
  );
}

export function MetaIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 16c2.5-3 4.5-5 7-5 2.5 0 3.5 1.5 3.5 3.5 0 3.5-3.5 6.5-6.5 6.5-2.5 0-4-1.5-4-5 0-3.5-1.5-5-4-5C5.5 11 2 14 2 17.5 2 19.5 3 21 5.5 21c2.5 0 4.5-2 6.5-5Z" />
    </svg>
  );
}

export function OllamaIcon({ size = 14, className }: VendorIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" />
      <path d="M9 15c1 1 3 1 4 0" />
    </svg>
  );
}

/**
 * 根据模型名称与端点 URL 自动映射对应的厂商图标
 */
export function getVendorIcon(modelName?: string, baseUrl?: string, size = 14, className?: string): React.ReactNode {
  const target = `${modelName ?? ''} ${baseUrl ?? ''}`.toLowerCase();

  if (/deepseek/i.test(target)) {
    return <DeepSeekIcon size={size} className={className} />;
  }
  if (/claude|anthropic/i.test(target)) {
    return <AnthropicIcon size={size} className={className} />;
  }
  if (/gpt|o1|o3|openai/i.test(target)) {
    return <OpenAIIcon size={size} className={className} />;
  }
  if (/gemini|google/i.test(target)) {
    return <GeminiIcon size={size} className={className} />;
  }
  if (/llama|meta/i.test(target)) {
    return <MetaIcon size={size} className={className} />;
  }
  if (/ollama|localhost:11434/i.test(target)) {
    return <OllamaIcon size={size} className={className} />;
  }
  if (/qwen|glm|mistral/i.test(target)) {
    return <Sparkles size={size} className={className} />;
  }

  return <Bot size={size} className={className} />;
}
