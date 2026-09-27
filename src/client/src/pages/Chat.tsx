import React, { useState, useEffect, useRef } from 'react';
import { chatApi } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: any;
  timestamp?: string;
  modelProvider?: string;
  requiresPermission?: any;
  toolCalls?: any[];
}

export function ChatPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConvId) {
      loadMessages(currentConvId);
    }
  }, [currentConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await chatApi.conversations();
      setConversations(data.conversations || []);
      if (data.conversations?.length > 0 && !currentConvId) {
        setCurrentConvId(data.conversations[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const data = await chatApi.messages(convId);
      setMessages(data.messages || []);
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const data = await chatApi.send(currentInput, currentConvId || undefined);
      
      if (!currentConvId) {
        setCurrentConvId(data.conversationId);
        loadConversations();
      }

      const assistantMessage: Message = {
        id: data.message.id,
        role: 'assistant',
        content: data.message.content,
        intent: data.message.intent,
        timestamp: data.message.timestamp,
        modelProvider: data.message.modelProvider,
        requiresPermission: data.message.requiresPermission,
        toolCalls: data.message.toolCalls
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (e: any) {
      setError(e.error || 'Failed to send message');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setCurrentConvId(null);
    setMessages([]);
  };

  return (
    <div className="flex h-[calc(100vh-0px)] lg:h-screen">
      {/* Conversations sidebar - desktop */}
      <div className="hidden lg:flex w-72 bg-[#14141E] border-r border-[#2A2A3D] flex-col">
        <div className="p-4 border-b border-[#2A2A3D]">
          <button
            onClick={startNewChat}
            className="w-full py-2.5 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-medium text-sm transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setCurrentConvId(conv.id)}
              className={`w-full text-left p-3 rounded-xl transition-colors ${
                currentConvId === conv.id ? 'bg-[#1C1C2A] text-white' : 'hover:bg-[#1C1C2A]/50 text-[#9CA3AF] hover:text-white'
              }`}
            >
              <div className="font-medium text-sm truncate">{conv.title}</div>
              <div className="text-xs text-[#6B7280] mt-1">{new Date(conv.updated_at).toLocaleDateString()}</div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-4 text-center text-[#6B7280] text-sm">No conversations yet</div>
          )}
        </div>
      </div>

      {/* Chat main */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0F]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center max-w-2xl mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-3xl mb-6">M</div>
              <h1 className="text-2xl lg:text-3xl font-bold mb-3">Welcome to MANISK OS</h1>
              <p className="text-[#9CA3AF] mb-8 leading-relaxed">
                Your Personal AI Operating System. I understand context, remember approved information, plan tasks, use tools with permissions, verify actions, and recover from failures.
              </p>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full text-left">
                {[
                  { title: 'Remember something', prompt: 'Remember that I prefer concise responses' },
                  { title: 'Create a task', prompt: 'Create a task to research AI trends' },
                  { title: 'Check schedule', prompt: 'What is my schedule today?' },
                  { title: 'System status', prompt: 'Show system health and status' }
                ].map(card => (
                  <button
                    key={card.title}
                    onClick={() => setInput(card.prompt)}
                    className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] hover:border-[#7C3AED]/50 hover:bg-[#1C1C2A] transition-all text-left"
                  >
                    <div className="font-medium text-sm mb-1">{card.title}</div>
                    <div className="text-xs text-[#9CA3AF]">"{card.prompt}"</div>
                  </button>
                ))}
              </div>

              <div className="mt-8 p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] w-full text-left">
                <div className="text-xs font-medium text-[#A78BFA] mb-2">How I help</div>
                <div className="text-xs text-[#9CA3AF] leading-relaxed">
                  I can remember information, help plan tasks, manage your schedule, research topics, and take actions — always with your permission for sensitive operations.
                </div>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-[#7C3AED] text-white' 
                    : 'bg-[#14141E] border border-[#2A2A3D] text-[#EDE9FE]'
                }`}>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                  
                  {msg.requiresPermission && (
                    <div className="mt-3 p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">
                      <div className="text-xs font-medium text-[#F59E0B] mb-1">Permission Required</div>
                      <div className="text-xs text-[#EDE9FE]/80">
                        This action needs your approval to proceed
                      </div>
                      <div className="text-[10px] text-[#9CA3AF] mt-1">{msg.requiresPermission.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#14141E] border border-[#2A2A3D] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#7C3AED] animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-[#7C3AED] animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-sm text-[#EF4444]">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-[#2A2A3D] bg-[#14141E]/50 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask, plan, remember, or take action..."
                className="w-full py-3.5 px-4 pr-12 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm placeholder:text-[#6B7280]"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <span className="text-sm">↑</span>
              </button>
            </div>
          </div>
          <div className="max-w-4xl mx-auto mt-2 flex items-center justify-between text-[10px] text-[#6B7280]">
            <span>MANISK — your Personal AI assistant</span>
            <span className="hidden lg:inline">Press Enter to send • Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}
