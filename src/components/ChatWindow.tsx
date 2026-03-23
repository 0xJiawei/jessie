import { useEffect, useMemo, useRef } from "react";
import { useTr } from "../lib/i18n";
import { useChatStore } from "../store/useChatStore";
import MessageBubble from "./MessageBubble";

function ChatWindow() {
  const { t } = useTr();
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const lastMessage = activeConversation?.messages[activeConversation.messages.length - 1];
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!endRef.current) {
      return;
    }

    endRef.current.scrollIntoView({
      behavior: isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [activeConversation?.id, lastMessage?.id, lastMessage?.content, isStreaming]);

  return (
    <section className="relative z-10 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1040px] px-4 py-7 md:px-6">
        {activeConversation && activeConversation.messages.length > 0 ? (
          <div className="space-y-3.5">
            {activeConversation.messages.map((message) => {
              const isLastStreamingMessage =
                isStreaming &&
                message.role === "assistant" &&
                message.id === activeConversation.messages[activeConversation.messages.length - 1]?.id;

              return (
                <MessageBubble key={message.id} message={message} isStreaming={isLastStreamingMessage} />
              );
            })}
          </div>
        ) : (
          <div className="mx-auto mt-24 max-w-xl text-center">
            <p className="text-2xl font-medium tracking-tight">{t("Jessie desktop chat", "Jessie 桌面聊天")}</p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {t("Start a conversation from the input bar below.", "从下方输入框开始对话。")}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="rounded-md px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
            >
              {t("Dismiss", "关闭")}
            </button>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </section>
  );
}

export default ChatWindow;
