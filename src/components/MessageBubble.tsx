import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = `${message.content}${isStreaming ? "|" : ""}`;
  const isTyping = !isUser && isStreaming && message.content.trim().length === 0;

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[90%] md:max-w-[88%]">
        <div
          className={`rounded-2xl border px-4 py-3 text-[15px] leading-7 shadow-sm ${
            isUser
              ? "border-transparent bg-[var(--message-user)] text-[var(--text-primary)]"
              : "border-[color:var(--border)] bg-[var(--message-assistant)] text-[var(--text-primary)]"
          }`}
        >
        {isTyping ? (
          <div className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)] [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-secondary)] [animation-delay:240ms]" />
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="mb-3 list-disc pl-6 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="mb-3 list-decimal pl-6 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="mb-1">{children}</li>,
              code: ({ className, children }) => {
                const isBlock = Boolean(className);

                return isBlock ? (
                  <code className="block overflow-x-auto rounded-xl bg-black/15 p-3 text-[13px]">
                    {children}
                  </code>
                ) : (
                  <code className="rounded bg-black/10 px-1.5 py-0.5 text-[13px]">{children}</code>
                );
              },
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline">
                  {children}
                </a>
              ),
            }}
          >
            {content || " "}
          </ReactMarkdown>
        )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
