"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
// import { ScrollArea } from '@/components/ui/scroll-area'; // Commented out as it's missing
import { Send, Paperclip, Bot, User, Loader2, FileText, Sparkles, AlertTriangle, X, Upload } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { askKaivo } from '@/lib/agent';
// import { api } from '@/lib/api'; // Removed legacy import

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    attachments?: string[];
}

const SUGGESTIONS = [
    "Help me start",
    "Help me upload",
    "Explain drift",
    "Build a plan",
    "Optimize budget"
];

export function ChatInterface() {
    const { t, currentLanguage: language } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: t('chat.welcome_msg'),
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = async (text?: string) => {
        const contentToSend = text || input;
        if (!contentToSend.trim() && !file) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: contentToSend,
            timestamp: new Date(),
            attachments: file ? [file.name] : undefined
        };

        setMessages((prev: Message[]) => [...prev, userMessage]);
        setInput('');
        setFile(null);
        setLoading(true);

        try {
            const response = await askKaivo(contentToSend);
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.explanation,
                timestamp: new Date()
            };
            setMessages((prev: Message[]) => [...prev, botMessage]);
        } catch (error) {
            console.error(error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "I'm having trouble connecting to the network right now. Please try again later.",
                timestamp: new Date()
            };
            setMessages((prev: Message[]) => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="h-[600px] flex flex-col shadow-lg border-primary/10">
            <CardHeader className="bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-5 w-5" />
                    {t('chat.title')}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden bg-background/50 backdrop-blur-sm">
                <div className="h-full overflow-y-auto p-4">
                    <div className="space-y-6">
                        {messages.map((msg: Message) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>
                                        {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5 text-primary" />}
                                    </div>
                                    <div className="space-y-1">
                                        <div className={`p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-card border rounded-tl-none'}`}>
                                            {msg.content}
                                        </div>
                                        {msg.attachments && (
                                            <div className="flex gap-2">
                                                {msg.attachments.map((att: string, i: number) => (
                                                    <div key={i} className="text-xs bg-muted px-2 py-1 rounded-md flex items-center gap-1">
                                                        <FileText className="h-3 w-3" /> {att}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="text-[10px] text-muted-foreground px-1 opacity-50">
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex gap-3 max-w-[80%]">
                                    <div className="h-8 w-8 rounded-full bg-card border flex items-center justify-center shrink-0">
                                        <Bot className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="p-3 rounded-2xl bg-card border text-sm flex items-center gap-1 rounded-tl-none">
                                        <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                        <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                        <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </div>
            </CardContent>

            {/* Suggestions */}
            {messages.length < 3 && (
                <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
                    {SUGGESTIONS.map(s => (
                        <button
                            key={s}
                            onClick={() => handleSend(s)}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "whitespace-nowrap rounded-full text-xs h-7")}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            <CardFooter className="p-4 border-t bg-background">
                <div className="flex flex-col w-full gap-2">
                    {file && (
                        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md text-sm w-fit">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                            <button className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-4 w-4 hover:bg-transparent")} onClick={() => setFile(null)}>
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                    <div className="flex w-full gap-2">
                        <div className="relative">
                            <input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
                            />
                            <button className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}>
                                <Paperclip className="h-5 w-5 text-muted-foreground" />
                            </button>
                        </div>
                        <Input
                            placeholder={t('chat.placeholder')}
                            value={input}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleSend(); }}
                            className="rounded-full"
                        />
                        <button onClick={() => handleSend()} disabled={(!input.trim() && !file) || loading} className={cn(buttonVariants({ size: "icon" }), "rounded-full shrink-0")}>
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </CardFooter>
        </Card>
    );
}
