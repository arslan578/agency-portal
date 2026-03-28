import { ChatInterface } from '@/components/chat/ChatInterface';

export default function ChatPage() {
    return (
        <div className="container mx-auto py-10 max-w-3xl">
            <h1 className="text-3xl font-bold mb-6 text-center">Chat with Kaivo</h1>
            <ChatInterface />
        </div>
    );
}
