import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Sparkles, Loader2, Trash2, LogOut, LogIn, UserPlus, MessageSquare, Image as ImageIcon, X, Plus, ChevronLeft, ChevronRight, Moon, Sun, Palette, Settings, Globe, ArrowDown } from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Translations
const translations = {
  en: {
    welcome: "Welcome Back",
    join: "Join the Conversation",
    signIn: "Sign In",
    signUp: "Sign Up",
    email: "Email address",
    password: "Password",
    noAccount: "Don't have an account? Sign up",
    hasAccount: "Already have an account? Sign in",
    newChat: "New Chat",
    recentChats: "Recent Chats",
    appearance: "Appearance",
    signOut: "Sign Out",
    hello: "Hello there!",
    welcomeMsg: "I'm your expressive Gemini assistant. How can I brighten your day or help with your tasks?",
    thinking: "Gemini is thinking",
    askAnything: "Ask Gemini anything...",
    settings: "Settings",
    language: "Language",
    userInfo: "User Information",
    themeColor: "Theme Color",
    darkMode: "Dark Mode",
    close: "Close",
    clearChat: "Clear Chat",
    deleteChat: "Delete Chat",
    noMessages: "Start a new conversation or upload an image to begin. I'm here to help!",
    scrollDown: "Scroll to bottom"
  },
  fr: {
    welcome: "Bon retour",
    join: "Rejoignez la conversation",
    signIn: "Se connecter",
    signUp: "S'inscrire",
    email: "Adresse e-mail",
    password: "Mot de passe",
    noAccount: "Vous n'avez pas de compte ? S'inscrire",
    hasAccount: "Vous avez déjà un compte ? Se connecter",
    newChat: "Nouvelle discussion",
    recentChats: "Discussions récentes",
    appearance: "Apparence",
    signOut: "Déconnexion",
    hello: "Bonjour !",
    welcomeMsg: "Je suis votre assistant Gemini expressif. Comment puis-je égayer votre journée ou vous aider dans vos tâches ?",
    thinking: "Gemini réfléchit",
    askAnything: "Demandez n'importe quoi à Gemini...",
    settings: "Paramètres",
    language: "Langue",
    userInfo: "Informations utilisateur",
    themeColor: "Couleur du thème",
    darkMode: "Mode sombre",
    close: "Fermer",
    clearChat: "Effacer la discussion",
    deleteChat: "Supprimer la discussion",
    noMessages: "Commencez une nouvelle conversation ou téléchargez une image pour débuter. Je suis là pour vous aider !",
    scrollDown: "Défiler vers le bas"
  }
};

interface Message {
  id?: string;
  role: 'user' | 'model';
  text: string;
  imageData?: string;
  timestamp: number;
}

interface Chat {
  id: number;
  title: string;
  createdAt: string;
}

interface UserData {
  id: number;
  email: string;
}

type ThemeColor = 'purple' | 'blue' | 'green' | 'orange';
type Language = 'en' | 'fr';

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Theme & Language State
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [themeColor, setThemeColor] = useState<ThemeColor>(() => (localStorage.getItem('themeColor') as ThemeColor) || 'purple');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'en');

  const t = translations[language];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<any>(null);

  // Apply Theme
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', themeColor);
    localStorage.setItem('darkMode', isDarkMode.toString());
    localStorage.setItem('themeColor', themeColor);
    localStorage.setItem('language', language);
  }, [isDarkMode, themeColor, language]);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user);
        setIsAuthLoading(false);
      })
      .catch(() => setIsAuthLoading(false));
  }, []);

  // Fetch chats when user is logged in
  useEffect(() => {
    if (user) {
      fetchChats();
    }
  }, [user]);

  const fetchChats = async () => {
    const res = await fetch('/api/chats');
    const data = await res.json();
    setChats(data.chats || []);
  };

  const createNewChat = async () => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: language === 'en' ? 'New Conversation' : 'Nouvelle discussion' }),
    });
    const data = await res.json();
    setChats(prev => [data, ...prev]);
    setCurrentChatId(data.id);
    setMessages([]);
  };

  const loadChat = async (chatId: number) => {
    setCurrentChatId(chatId);
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const data = await res.json();
    setMessages(data.messages.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp).getTime()
    })));
  };

  const deleteChat = async (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setMessages([]);
    }
  };

  // Initialize Gemini Chat
  useEffect(() => {
    if (user) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      chatRef.current = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are a helpful and expressive AI assistant. Your responses should be warm, professional, and visually structured using markdown. You can analyze images if provided. You are part of a 'Material Expressive' themed application. Please respond in ${language === 'en' ? 'English' : 'French'}.`,
        },
      });
    }
  }, [user, language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isAtBottom);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Connection error');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setMessages([]);
    setCurrentChatId(null);
    setChats([]);
    setShowSettings(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.slice(0, 30) || (language === 'en' ? 'Image Analysis' : 'Analyse d\'image') }),
      });
      const data = await res.json();
      setChats(prev => [data, ...prev]);
      activeChatId = data.id;
      setCurrentChatId(activeChatId);
    }

    const userMessage: Message = {
      role: 'user',
      text: input,
      imageData: selectedImage || undefined,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    // Save user message
    await fetch(`/api/chats/${activeChatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userMessage),
    });

    try {
      let responseText = "";
      if (currentImage) {
        const base64Data = currentImage.split(',')[1];
        const res = await chatRef.current.sendMessage({
          message: {
            parts: [
              { text: currentInput || (language === 'en' ? "What is in this image?" : "Qu'y a-t-il dans cette image ?") },
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]
          }
        });
        responseText = res.text;
      } else {
        const res = await chatRef.current.sendMessage({ message: currentInput });
        responseText = res.text;
      }

      const modelMessage: Message = {
        role: 'model',
        text: responseText || "I'm sorry, I couldn't process that.",
        timestamp: Date.now(),
      };
      
      setMessages(prev => [...prev, modelMessage]);

      // Save model message
      await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelMessage),
      });

    } catch (error) {
      console.error("Gemini API Error:", error);
      const errorMessage: Message = {
        role: 'model',
        text: language === 'en' ? "I encountered an error. Please try again." : "J'ai rencontré une erreur. Veuillez réessayer.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-m3-surface">
        <Loader2 className="w-12 h-12 animate-spin text-m3-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-m3-surface p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md m3-card-elevated p-8 space-y-8"
        >
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-m3-primary-container rounded-3xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-m3-on-primary-container" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-m3-on-surface">
              {authMode === 'login' ? t.welcome : t.join}
            </h1>
            <p className="text-m3-on-surface-variant">
              {authMode === 'login' ? translations[language].welcomeMsg : translations[language].welcomeMsg}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="flex flex-col space-y-4">
              <input
                type="email"
                placeholder={t.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="m3-input"
                required
              />
              <input
                type="password"
                placeholder={t.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="m3-input"
                required
              />
            </div>

            {authError && (
              <p className="text-red-500 text-sm font-medium text-center">{authError}</p>
            )}

            <button type="submit" className="w-full m3-button-primary flex items-center justify-center gap-2">
              {authMode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {authMode === 'login' ? t.signIn : t.signUp}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-m3-primary font-semibold hover:underline"
            >
              {authMode === 'login' ? t.noAccount : t.hasAccount}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-m3-surface flex overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="bg-m3-surface-variant/10 border-r border-m3-outline/10 flex flex-col overflow-hidden"
      >
        <div className="p-6 flex flex-col h-full">
          <button 
            onClick={createNewChat}
            className="w-full m3-button-tonal flex items-center justify-center gap-2 mb-6 group"
          >
            <motion.div
              whileHover={{ rotate: 90 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Plus className="w-5 h-5" />
            </motion.div>
            {t.newChat}
          </button>

          <div className="flex-1 overflow-y-auto space-y-2">
            <h3 className="text-xs font-bold text-m3-on-surface-variant uppercase tracking-widest px-2 mb-4">{t.recentChats}</h3>
            {chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => loadChat(chat.id)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-2xl transition-all group flex items-center justify-between",
                  currentChatId === chat.id ? "bg-m3-primary-container text-m3-on-primary-container" : "hover:bg-m3-surface-variant/50 text-m3-on-surface"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                </div>
                <Trash2 
                  className="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all shrink-0" 
                  onClick={(e) => deleteChat(chat.id, e)}
                />
              </button>
            ))}
          </div>

          <div className="pt-6 border-t border-m3-outline/10 space-y-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-m3-surface-variant/50 text-m3-on-surface transition-all"
            >
              <Settings className="w-5 h-5 text-m3-on-surface-variant" />
              <span className="text-sm font-medium">{t.settings}</span>
            </button>
            
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-m3-primary flex items-center justify-center text-m3-on-primary text-xs font-bold">
                {user.email[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium truncate text-m3-on-surface">{user.email}</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Sidebar Toggle */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-8 h-12 bg-m3-surface-variant/50 hover:bg-m3-surface-variant rounded-full flex items-center justify-center text-m3-on-surface-variant transition-all"
        >
          {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>

        <header className="px-6 py-4 flex items-center justify-between bg-m3-surface/80 backdrop-blur-md border-b border-m3-outline/10 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-m3-primary flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-m3-on-primary" />
            </div>
            <h1 className="text-lg font-bold text-m3-on-surface">
              {currentChatId ? chats.find(c => c.id === currentChatId)?.title : t.newChat}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 md:hidden">
             <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-xl hover:bg-m3-surface-variant/50 text-m3-on-surface-variant"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scroll-smooth"
        >
          {messages.length === 0 && !isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <motion.div 
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-20 h-20 rounded-[32px] bg-m3-secondary-container flex items-center justify-center mb-2 shadow-lg"
              >
                <Bot className="w-10 h-10 text-m3-on-secondary-container" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-m3-on-surface">{language === 'en' ? 'Welcome to Expressive Chat' : 'Bienvenue sur Chat Expressif'}</h2>
                <p className="text-m3-on-surface-variant max-w-sm mx-auto">
                  {t.noMessages}
                </p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  transition: { type: "spring", stiffness: 260, damping: 20 }
                }}
                className={cn(
                  "flex w-full gap-4",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <motion.div 
                  whileHover={{ scale: 1.1 }}
                  className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-1 shadow-sm",
                    msg.role === 'user' ? "bg-m3-primary-container" : "bg-m3-secondary-container"
                  )}
                >
                  {msg.role === 'user' ? 
                    <User className="w-5 h-5 text-m3-on-primary-container" /> : 
                    <Bot className="w-5 h-5 text-m3-on-secondary-container" />
                  }
                </motion.div>
                
                <div className={cn(
                  "max-w-[85%] space-y-3",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-6 py-4 rounded-[28px] shadow-sm",
                    msg.role === 'user' 
                      ? "rounded-tr-none bg-m3-primary text-m3-on-primary" 
                      : "rounded-tl-none bg-m3-surface-variant/20 text-m3-on-surface border border-m3-outline/10"
                  )}>
                    {msg.imageData && (
                      <motion.img 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={msg.imageData} 
                        alt="Uploaded" 
                        className="max-w-full h-auto rounded-xl mb-3 border border-m3-outline/20"
                      />
                    )}
                    <div className={cn(
                      "markdown-body",
                      msg.role === 'user' ? "text-m3-on-primary" : "text-m3-on-surface"
                    )}>
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </div>
                  <div className={cn(
                    "text-[10px] font-bold uppercase tracking-widest opacity-50 px-2",
                    msg.role === 'user' ? "text-right text-m3-primary" : "text-left text-m3-on-surface-variant"
                  )}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-2xl bg-m3-secondary-container flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <Bot className="w-5 h-5 text-m3-on-secondary-container" />
              </div>
              <div className="px-6 py-5 rounded-[28px] rounded-tl-none bg-m3-surface-variant/20 border border-m3-outline/10 flex items-center gap-4 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
                <span className="text-sm text-m3-on-surface-variant font-bold uppercase tracking-widest animate-pulse">{t.thinking}</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              onClick={scrollToBottom}
              className="absolute bottom-32 right-8 w-12 h-12 bg-m3-primary text-m3-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-20"
              title={t.scrollDown}
            >
              <ArrowDown className="w-6 h-6" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <footer className="p-6 bg-m3-surface-variant/5 border-t border-m3-outline/10">
          <div className="max-w-4xl mx-auto space-y-4">
            {selectedImage && (
              <div className="relative inline-block">
                <img 
                  src={selectedImage} 
                  alt="Preview" 
                  className="h-24 w-auto rounded-2xl border-2 border-m3-primary shadow-lg"
                />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md hover:scale-110 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex gap-4 items-end">
              <div className="relative flex-1 bg-m3-surface-variant/20 border border-m3-outline/20 rounded-[28px] shadow-sm focus-within:ring-4 focus-within:ring-m3-primary/10 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t.askAnything}
                  rows={1}
                  className="w-full bg-transparent py-4 pl-6 pr-14 focus:outline-none text-m3-on-surface resize-none max-h-32"
                  style={{ height: 'auto' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-4 bottom-3 p-2 rounded-full hover:bg-m3-surface-variant/50 text-m3-on-surface-variant transition-all"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg shrink-0",
                  (input.trim() || selectedImage) && !isLoading 
                    ? "bg-m3-primary text-m3-on-primary shadow-m3-primary/30 hover:scale-105 active:scale-95" 
                    : "bg-m3-surface-variant text-m3-on-surface-variant cursor-not-allowed"
                )}
              >
                <Send className="w-6 h-6" />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg m3-card-elevated p-8 space-y-8 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-m3-primary-container flex items-center justify-center">
                    <Settings className="w-6 h-6 text-m3-on-primary-container" />
                  </div>
                  <h2 className="text-2xl font-bold text-m3-on-surface">{t.settings}</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-m3-surface-variant/50 text-m3-on-surface-variant transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Language Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-m3-on-surface-variant">
                    <Globe className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">{t.language}</h3>
                  </div>
                  <div className="flex gap-3">
                    {(['en', 'fr'] as Language[]).map(lang => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={cn(
                          "flex-1 py-3 rounded-2xl font-medium transition-all border-2",
                          language === lang 
                            ? "bg-m3-primary text-m3-on-primary border-m3-primary" 
                            : "bg-m3-surface-variant/30 text-m3-on-surface-variant border-transparent hover:border-m3-outline/20"
                        )}
                      >
                        {lang === 'en' ? 'English' : 'Français'}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Appearance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-m3-on-surface-variant">
                    <Palette className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">{t.appearance}</h3>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-m3-surface-variant/20 rounded-2xl">
                    <div className="flex gap-3">
                      {(['purple', 'blue', 'green', 'orange'] as ThemeColor[]).map(color => (
                        <button
                          key={color}
                          onClick={() => setThemeColor(color)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            themeColor === color ? "border-m3-primary scale-110" : "border-transparent opacity-60 hover:opacity-100",
                            color === 'purple' && "bg-[#6750A4]",
                            color === 'blue' && "bg-[#0061A4]",
                            color === 'green' && "bg-[#006D3B]",
                            color === 'orange' && "bg-[#8B5000]"
                          )}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-m3-primary/10 text-m3-primary font-bold transition-all"
                    >
                      {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                      {isDarkMode ? 'Light' : 'Dark'}
                    </button>
                  </div>
                </section>

                {/* User Info Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-m3-on-surface-variant">
                    <User className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">{t.userInfo}</h3>
                  </div>
                  <div className="p-4 bg-m3-surface-variant/20 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-m3-primary flex items-center justify-center text-m3-on-primary font-bold">
                        {user.email[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-m3-on-surface">{user.email}</span>
                        <span className="text-xs text-m3-on-surface-variant">User ID: {user.id}</span>
                      </div>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="p-2 rounded-xl hover:bg-red-50 text-red-600 transition-all"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </section>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full m3-button-primary"
              >
                {t.close}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
