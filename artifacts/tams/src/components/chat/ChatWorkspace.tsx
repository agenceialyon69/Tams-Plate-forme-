import ChatPage from "@/pages/chat";

export default function ChatWorkspace() {
  return (
    <div data-testid="chat-workspace" className="flex min-h-0 flex-1 overflow-hidden">
      <ChatPage />
    </div>
  );
}
