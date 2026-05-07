import React, { useState, useEffect } from 'react';
import { 
  Menu, X, Check, ChevronRight, Plus, Minus, RotateCcw, 
  Info, Hash, FileText, Loader2, Play, AlertCircle, Link as LinkIcon, 
  ExternalLink, Home, Star, Trash2, Award, BookOpen, Clock, Pause, Save, History,
  Pencil, MessageSquare, Search, Globe, LogOut
} from 'lucide-react';

// === IMPORTAÇÕES DO FIREBASE ===
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';

// === CONFIGURAÇÃO DO FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyBTml7VlWPDvG0qi8YUPqLUGjr8pI9JxcI",
  authDomain: "meu-croche.firebaseapp.com",
  projectId: "meu-croche",
  storageBucket: "meu-croche.firebasestorage.app",
  messagingSenderId: "730325080214",
  appId: "1:730325080214:web:a4ffe77a63dc7ae68a8ab7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'meu-croche';

const apiKey = "AIzaSyBu-3uzJAyKwLjvIPvdzWQ5OLLk5yCJPhM";

// Gerador de ID único
const generateId = () => Math.random().toString(36).substr(2, 9);

// Formatação de Tempo (segundos para HH:MM:SS)
const formatTime = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Formatação de Data
const formatDate = (dateString) => {
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Date(dateString).toLocaleDateString('pt-BR', options);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [appState, setAppState] = useState('board'); // 'board', 'new', 'loading', 'workspace', 'error', 'searching', 'searchResults'
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null); 
  const [errorMessage, setErrorMessage] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // ==========================================
  // EFEITO 1: INICIALIZAÇÃO DE AUTENTICAÇÃO
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // EFEITO 2: BUSCAR PROJETOS DO FIRESTORE
  // ==========================================
  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    const projectsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(projectsRef, 
      (snapshot) => {
        const loadedProjects = [];
        snapshot.forEach((doc) => {
          loadedProjects.push({ id: doc.id, ...doc.data() });
        });
        
        // Ordena por data de criação
        loadedProjects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setProjects(loadedProjects);
      }, 
      (error) => {
        console.error("Erro ao escutar projetos do Firestore: ", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Função para logar com o Google
  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Falha no login com Google", error);
      setAuthLoading(false);
    }
  };

  // Função para buscar receitas na web
  const searchWebRecipes = async (query) => {
    setAppState('searching');
    setErrorMessage('');

    const systemPrompt = `Você é um assistente de crochê e amigurumi. Use o Google Search para procurar opções de receitas REAIS e passo-a-passo gratuitas disponíveis na internet para o termo buscado. Priorize blogs, sites de artesãos ou catálogos que possuam a receita escrita na página.
    NUNCA INVENTE LINKS OU RECEITAS. Busque resultados reais.
    Retorne exatamente 3 opções. Se não achar 3, retorne as que achar.
    
    IMPORTANTE: Retorne APENAS um formato JSON válido com a estrutura abaixo. Não adicione nenhum texto explicativo antes ou depois.
    {
      "options": [
        {
          "title": "Título",
          "source": "Nome do site",
          "url": "URL real",
          "description": "Breve resumo"
        }
      ]
    }`;

    const payload = {
      contents: [{ parts: [{ text: `BUSCAR RECEITA DE: ${query}` }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ googleSearch: {} }]
    };

    // CORREÇÃO: Usando a tag -latest para garantir que a API encontre o modelo
    const urlEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(urlEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        
        if (!response.ok) {
          const errorDetails = await response.text();
          console.error("Erro HTTP da API:", errorDetails);
          throw new Error('HTTP Error');
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty text returned');
        
        // EXTRAÇÃO INTELIGENTE: Pega apenas o que está entre chaves
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Nenhum JSON válido encontrado na resposta');
        
        const parsedData = JSON.parse(jsonMatch[0]);
        
        if (parsedData.options && parsedData.options.length > 0) {
          setSearchResults(parsedData.options);
          setAppState('searchResults');
          return;
        } else {
          throw new Error('No results array found');
        }
      } catch (error) {
        console.error(`Falha na tentativa ${i + 1} de busca:`, error);
        if (i === 2) {
          setErrorMessage('Não consegui encontrar opções de receitas claras para esse termo. Tente buscar de outra forma (ex: "Urso amigurumi receita escrita").');
          setAppState('error');
        } else {
          await new Promise(r => setTimeout(r, 2000 * (i+1)));
        }
      }
    }
  };

  // Função para gerar a receita (de texto ou de URL)
  const generatePattern = async (input, isUrl = false) => {
    setAppState('loading');
    setErrorMessage('');

    let systemPrompt = `Você é um especialista na extração de dados de crochê e amigurumi.
    REGRA DE OURO: NÃO INVENTE NENHUMA CARREIRA. O resultado final deve conter estritamente as instruções fornecidas no texto ou no site consultado.
    
    ${isUrl ? "Você DEVE usar a ferramenta Google Search para acessar a URL fornecida pelo usuário, LER O CONTEÚDO EXATO que está na página, e extrair a receita de lá. Não invente passos se não estiverem na página." : ""}
    
    1. Identifique a contagem de pontos e as carreiras exatas.
    2. Limpe a linguagem e transforme em instruções diretas ("Carr 2: 6 aumentos (12 pts)").
    
    IMPORTANTE: Retorne APENAS um JSON válido.
    ESTRUTURA OBRIGATÓRIA JSON:
    {
      "projectName": "Nome da Peça",
      "sections": [
        {
          "id": "intro",
          "title": "Materiais",
          "type": "text",
          "icon": "🧶",
          "steps": [{"r": "", "text": "Lista de materiais"}]
        },
        {
          "id": "parte1",
          "title": "Cabeça",
          "type": "pattern",
          "icon": "🦖",
          "steps": [
            {"r": "1", "text": "Anel mágico", "pts": "6"}
          ]
        }
      ]
    }`;

    const payload = {
      contents: [{ parts: [{ text: isUrl ? `ACESSE E EXTRAIA A RECEITA DESTA URL: ${input}` : `DADOS DA RECEITA:\n\n${input}` }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    if (isUrl) {
      payload.tools = [{ googleSearch: {} }];
    }

    // CORREÇÃO: Usando a tag -latest
    const urlEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    for (let i = 0; i < 4; i++) {
      try {
        const response = await fetch(urlEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        
        if (!response.ok) {
          const errorDetails = await response.text();
          console.error("Erro HTTP da API:", errorDetails);
          throw new Error('HTTP Error');
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty text returned');
        
        // EXTRAÇÃO INTELIGENTE: Pega apenas o que está entre chaves
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Nenhum JSON válido encontrado na resposta');
        
        const parsedData = JSON.parse(jsonMatch[0]);
        
        const tempProject = {
          id: generateId(),
          isTemp: true,
          name: parsedData.projectName || 'Nova Receita',
          data: parsedData,
          progress: {},
          notes: {},
          timeSpent: 0,
          history: [],
          createdAt: new Date().toISOString()
        };

        setActiveProject(tempProject);
        setAppState('workspace');
        return;
      } catch (error) {
        console.error(`Falha na extração da receita (Tentativa ${i + 1}):`, error);
        if (i === 3) {
          setErrorMessage('Não foi possível processar a receita. O site pode estar bloqueado ou o texto estava confuso. Tente copiar e colar o texto manualmente.');
          setAppState('error');
        } else {
          await new Promise(r => setTimeout(r, 2000 * (i+1)));
        }
      }
    }
  };

  // ==========================================
  // FUNÇÕES DE MANIPULAÇÃO DE BANCO DE DADOS
  // ==========================================
  const handleUpdateProject = async (updatedProject) => {
    setActiveProject(updatedProject);
    if (!updatedProject.isTemp && user) {
      // Atualização otimista
      setProjects(currentProjects => currentProjects.map(p => p.id === updatedProject.id ? updatedProject : p));
      
      // Salva no Firestore
      try {
        const projectRef = doc(db, 'artifacts', appId, 'users', user.uid, 'projects', updatedProject.id);
        await setDoc(projectRef, updatedProject);
      } catch (error) {
        console.error("Erro ao atualizar projeto:", error);
      }
    }
  };

  const handleSaveProject = async (customName) => {
    const savedProject = {
      ...activeProject,
      isTemp: false,
      name: customName
    };
    setActiveProject(savedProject);
    
    // Atualização otimista
    setProjects(currentProjects => [savedProject, ...currentProjects.filter(p => p.id !== savedProject.id)]);
    
    // Salva no Firestore
    if (user) {
      try {
        const projectRef = doc(db, 'artifacts', appId, 'users', user.uid, 'projects', savedProject.id);
        await setDoc(projectRef, savedProject);
      } catch (error) {
        console.error("Erro ao salvar projeto:", error);
      }
    }
  };

  const handleDeleteProject = async (id) => {
    // Atualização otimista
    setProjects(currentProjects => currentProjects.filter(p => p.id !== id));
    if (activeProject?.id === id) {
      setActiveProject(null);
      setAppState('board');
    }

    // Exclui no Firestore
    if (user) {
      try {
        const projectRef = doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id);
        await deleteDoc(projectRef);
      } catch (error) {
        console.error("Erro ao deletar projeto:", error);
      }
    }
  };

  // --- RENDER ROUTING ---
  if (!user && appState !== 'searching' && appState !== 'loading' && appState !== 'error') {
    return <LoginScreen onLogin={handleGoogleLogin} loading={authLoading} />;
  }

  if (appState === 'loading') return <LoadingScreen message="Extraindo carreiras e montando seu ambiente de trabalho..." />;
  if (appState === 'searching') return <LoadingScreen message="Vasculhando a internet em busca de receitas reais..." />;
  if (appState === 'error') return <ErrorScreen message={errorMessage} onRetry={() => setAppState('new')} onCancel={() => setAppState('board')} />;
  
  if (appState === 'new') return <NewProjectScreen onGenerateText={(txt) => generatePattern(txt, false)} onSearchWeb={searchWebRecipes} onCancel={() => setAppState('board')} />;
  if (appState === 'searchResults') return <SearchResultsScreen results={searchResults} onSelect={(url) => generatePattern(url, true)} onCancel={() => setAppState('new')} />;
  
  if (appState === 'workspace') {
    if (!activeProject) return setAppState('board');
    return (
      <Workspace 
        project={activeProject} 
        onUpdateProject={handleUpdateProject} 
        onSaveNewProject={handleSaveProject}
        onDeleteProject={handleDeleteProject}
        onClose={() => { setActiveProject(null); setAppState('board'); }} 
      />
    );
  }

  return <BoardScreen projects={projects} user={user} onOpen={(project) => { setActiveProject(project); setAppState('workspace'); }} onNew={() => setAppState('new')} onDelete={handleDeleteProject} />;
}

// ==========================================
// TELA DE LOGIN (NOVA)
// ==========================================
function LoginScreen({ onLogin, loading }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-emerald-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-80 h-80 bg-green-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>

      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center relative z-10 border border-slate-100">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <BookOpen size={40} />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">Meu Crochê</h1>
        <p className="text-slate-500 mb-10 leading-relaxed">
          Sua biblioteca digital de receitas inteligente. Acompanhe seus pontos de qualquer lugar!
        </p>

        <button 
          onClick={onLogin} 
          disabled={loading}
          className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-4 px-6 rounded-xl shadow-sm hover:bg-slate-50 hover:shadow transition disabled:opacity-70 flex items-center justify-center gap-3"
        >
          {loading ? (
            <Loader2 className="animate-spin text-emerald-600" size={24} />
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Entrar com o Google
            </>
          )}
        </button>

        <div className="mt-8 text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
          Seus dados são salvos com segurança na nuvem <Check size={14} className="text-emerald-500"/>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAINEL (BOARD)
// ==========================================
function BoardScreen({ projects, user, onOpen, onNew, onDelete }) {
  const [projectToDelete, setProjectToDelete] = useState(null);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
              <BookOpen className="text-emerald-600" size={32}/> Minha Biblioteca
            </h1>
            <p className="text-slate-500 mt-1">Bem-vindo(a), {user?.displayName || 'Artesão'}! Gerencie suas receitas aqui.</p>
          </div>
          <div className="flex w-full md:w-auto items-center gap-3">
            <button onClick={onNew} className="flex-1 md:flex-none bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg flex items-center gap-2 transition justify-center">
              <Plus size={20}/> Adicionar
            </button>
            <button onClick={handleLogout} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 hover:text-red-600 shadow-sm flex items-center gap-2 transition justify-center" title="Sair da Conta">
              <LogOut size={20}/> Sair
            </button>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-300 flex flex-col items-center shadow-sm">
            <FileText size={64} className="text-slate-300 mb-4" />
            <h2 className="text-2xl font-bold text-slate-700 mb-2">Nenhuma receita salva</h2>
            <p className="text-slate-500 mb-8 max-w-md">Seu painel está vazio. Importe sua primeira receita ou busque na internet para começar a crochetá-la!</p>
            <button onClick={onNew} className="bg-emerald-100 text-emerald-800 px-6 py-3 rounded-xl font-bold hover:bg-emerald-200 transition">
              Nova Receita
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              const totalSteps = project.data.sections.filter(s=>s.type==='pattern').reduce((acc, s) => acc + (s.steps?.length || 0), 0);
              let completedSteps = 0;
              project.data.sections.filter(s=>s.type==='pattern').forEach(s => {
                completedSteps += (project.progress[s.id] || 0);
              });
              const progressPercent = totalSteps === 0 ? 0 : Math.min(100, Math.round((completedSteps / totalSteps) * 100));
              const completionsCount = project.history?.length || 0;

              return (
                <div key={project.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow flex flex-col relative group">
                  
                  <button onClick={(e) => { 
                    e.stopPropagation(); 
                    setProjectToDelete(project);
                  }} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 bg-white p-1.5 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition z-10" title="Excluir Receita">
                    <Trash2 size={18} />
                  </button>

                  <div className="p-6 flex-1 cursor-pointer" onClick={() => onOpen(project)}>
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-4xl">{project.data.sections[0]?.icon || '🧶'}</span>
                      {completionsCount > 0 && (
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <Award size={14} /> Feita {completionsCount}x
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold text-slate-800 mb-2 line-clamp-2">{project.name}</h3>
                    
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
                        <span>Progresso Atual</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div>
                      </div>
                    </div>

                    {completionsCount > 0 && (
                      <div className="mt-4 bg-slate-50 p-3 rounded-xl flex items-center justify-between border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400 font-bold uppercase">Última avaliação</span>
                          <div className="flex items-center gap-1 text-amber-400 mt-1">
                            {[1,2,3,4,5].map(star => (
                              <Star key={star} size={14} fill={star <= project.history[0].rating ? "currentColor" : "none"} className={star <= project.history[0].rating ? "text-amber-400" : "text-slate-300"} />
                            ))}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded bg-slate-200 text-slate-700">
                          {project.history[0].difficulty}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL: EXCLUIR DO PAINEL */}
        {projectToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 text-center">Excluir Receita?</h3>
              <p className="text-slate-600 mb-6 text-center">Tem certeza que deseja excluir a receita <b>"{projectToDelete.name}"</b> da biblioteca? Esta ação não pode ser desfeita na nuvem.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setProjectToDelete(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 transition">Cancelar</button>
                <button onClick={() => { onDelete(projectToDelete.id); setProjectToDelete(null); }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition">Sim, Excluir</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// ECRÃ PARA NOVA RECEITA (COM TABS)
// ==========================================
function NewProjectScreen({ onGenerateText, onSearchWeb, onCancel }) {
  const [tab, setTab] = useState('search'); // 'search' ou 'text'
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAlternative, setShowAlternative] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden mt-8 mb-8 relative">
        <button onClick={onCancel} className="absolute top-4 left-4 text-white hover:bg-white/20 p-2 rounded-lg transition z-10 flex items-center text-sm font-medium">
          <ChevronRight size={18} className="rotate-180" /> Cancelar
        </button>

        <div className="bg-emerald-600 p-8 pt-16 text-center text-white relative">
          <div className="flex justify-center mb-4">
            {tab === 'search' ? <Globe className="w-16 h-16 opacity-90" /> : <FileText className="w-16 h-16 opacity-90" />}
          </div>
          <h1 className="text-3xl font-extrabold mb-2">Importar Receita</h1>
          
          <div className="flex justify-center mt-6 bg-emerald-700/50 p-1 rounded-xl max-w-sm mx-auto">
            <button onClick={() => setTab('search')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === 'search' ? 'bg-white text-emerald-700 shadow' : 'text-emerald-100 hover:text-white'}`}>
              Procurar na Web
            </button>
            <button onClick={() => setTab('text')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === 'text' ? 'bg-white text-emerald-700 shadow' : 'text-emerald-100 hover:text-white'}`}>
              Colar Texto
            </button>
          </div>
        </div>
        
        <div className="p-6 sm:p-8">
          
          {tab === 'search' ? (
            <div className="animate-in fade-in">
              <h3 className="font-bold text-slate-800 mb-2">O que você quer crochetar hoje?</h3>
              <p className="text-sm text-slate-500 mb-6">Nós buscaremos receitas passo-a-passo reais na internet para você escolher.</p>
              
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: Polvo amigurumi, Urso de crochê..."
                className="w-full p-4 border-2 border-slate-200 rounded-xl mb-6 text-lg text-slate-800 focus:border-emerald-500 outline-none shadow-inner"
              />

              <button
                onClick={() => onSearchWeb(searchQuery)}
                disabled={!searchQuery.trim()}
                className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 flex justify-center items-center gap-2 text-lg"
              >
                Buscar Receitas <Search size={20} />
              </button>
            </div>
          ) : (
            <div className="animate-in fade-in">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" size={20} /> Obter a transcrição do YouTube
                </h3>
                
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => setShowAlternative(!showAlternative)}
                    className="text-sm font-bold text-slate-700 bg-white border border-slate-200 p-3 rounded-lg hover:bg-slate-50 flex justify-between items-center transition shadow-sm border-l-4 border-l-emerald-500"
                  >
                    <span className="flex items-center gap-2"><LinkIcon className="text-emerald-600" size={18}/> Usar Extrator de Texto</span>
                    <ChevronRight size={16} className={`transform transition-transform ${showAlternative ? 'rotate-90' : ''}`} />
                  </button>

                  {showAlternative && (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg text-sm text-slate-800">
                      <p className="mb-3">Use o Tactiq para extrair o texto completo do vídeo através do link:</p>
                      <div className="flex flex-col gap-2 mb-3">
                        <a href="https://tactiq.io/pt-br/ferramentas/transcricao-do-youtube" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white p-3 rounded-lg border border-emerald-200 hover:border-emerald-500 text-emerald-700 font-bold transition shadow-sm">
                          <ExternalLink size={18} /> Acessar Tactiq.io
                        </a>
                      </div>
                      <ol className="list-decimal pl-5 space-y-2 mt-4 text-slate-600">
                        <li>Copie o link do vídeo no YouTube.</li>
                        <li>Abra o site acima e cole o link.</li>
                        <li>Copie todo o texto gerado e cole na caixa abaixo.</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Cole aqui a transcrição gerada pelo Tactiq, o texto do PDF ou da internet..."
                className="w-full h-40 p-4 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-0 outline-none resize-none mb-6 text-slate-700 placeholder-slate-400 font-mono text-sm leading-relaxed shadow-inner"
              />

              <button
                onClick={() => onGenerateText(inputValue)}
                disabled={!inputValue.trim() || inputValue.length < 30}
                className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 flex justify-center items-center gap-2 text-lg"
              >
                Extrair Passo a Passo <Play fill="currentColor" size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ECRÃ DE RESULTADOS DA BUSCA NA WEB
// ==========================================
function SearchResultsScreen({ results, onSelect, onCancel }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white rounded-3xl shadow-xl overflow-hidden mt-8 mb-8">
        <div className="bg-emerald-600 p-6 flex items-center gap-4 text-white">
          <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-lg transition">
            <ChevronRight size={24} className="rotate-180" />
          </button>
          <h2 className="text-xl font-bold">Resultados da Busca</h2>
        </div>
        
        <div className="p-6">
          <p className="text-slate-600 mb-6">Encontramos estas opções reais na internet. Escolha uma para transformarmos no formato interativo:</p>
          
          <div className="space-y-4">
            {results.map((res, i) => (
              <div key={i} className="border-2 border-slate-200 rounded-2xl p-5 hover:border-emerald-500 transition-colors bg-white shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{res.source}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{res.title}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2">{res.description}</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto mt-2 md:mt-0">
                  <a 
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto text-slate-600 bg-slate-100 font-bold px-4 py-3 rounded-xl hover:bg-slate-200 transition shadow-sm flex items-center justify-center gap-2"
                    title="Abrir a página original em nova aba"
                  >
                    <ExternalLink size={16}/> Ver Original
                  </a>
                  <button 
                    onClick={() => onSelect(res.url)}
                    className="w-full sm:w-auto whitespace-nowrap bg-emerald-50 text-emerald-700 font-bold px-6 py-3 rounded-xl hover:bg-emerald-600 hover:text-white transition shadow-sm border border-emerald-200 hover:border-emerald-600 flex items-center justify-center gap-2"
                  >
                    Criar Tutorial <Play size={16}/>
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ECRÃS DE ESTADO
// ==========================================
function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-4 text-white">
      <Loader2 className="w-20 h-20 animate-spin text-emerald-200 mb-8" />
      <h2 className="text-2xl font-bold mb-2 animate-pulse text-center">{message}</h2>
    </div>
  );
}

function ErrorScreen({ message, onRetry, onCancel }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border-t-8 border-red-500">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Erro na operação</h2>
        <p className="text-slate-600 mb-8">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Voltar</button>
          <button onClick={onRetry} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700">Tentar Novamente</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// APLICAÇÃO DE TRABALHO (WORKSPACE)
// ==========================================
function Workspace({ project, onUpdateProject, onSaveNewProject, onDeleteProject, onClose }) {
  const [activeSectionId, setActiveSectionId] = useState(project.data.sections[0]?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stitchCount, setStitchCount] = useState(0);
  
  // Modais
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [localTimeSpent, setLocalTimeSpent] = useState(project.timeSpent || 0);

  useEffect(() => {
    let interval;
    if (timerRunning) {
      interval = setInterval(() => {
        setLocalTimeSpent(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!timerRunning && localTimeSpent !== project.timeSpent) {
      onUpdateProject({ ...project, timeSpent: localTimeSpent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  const PATTERN_SECTIONS = project.data.sections;
  const activeSection = PATTERN_SECTIONS.find(s => s.id === activeSectionId) || PATTERN_SECTIONS[0];
  const currentStepIndex = project.progress[activeSectionId] || 0;

  const handleCompleteStep = () => {
    const newProgress = { ...project.progress, [activeSectionId]: currentStepIndex + 1 };
    onUpdateProject({ ...project, progress: newProgress });
    setStitchCount(0);
  };

  const handleUndoStep = (index) => {
    const newProgress = { ...project.progress, [activeSectionId]: index };
    onUpdateProject({ ...project, progress: newProgress });
  };

  const resetProgress = () => {
    onUpdateProject({ ...project, progress: {}, timeSpent: 0 });
    setLocalTimeSpent(0);
    setStitchCount(0);
    setActiveSectionId(PATTERN_SECTIONS[0].id);
    setShowResetConfirm(false);
    setTimerRunning(false);
  };

  const isSectionComplete = (section) => section.type === 'pattern' && (project.progress[section.id] || 0) >= section.steps.length;

  const getSafeIcon = (iconStr) => {
    if (!iconStr) return '🧶';
    return iconStr.length > 2 ? '🧶' : iconStr;
  };

  const handleFinishPiece = (difficulty, rating) => {
    const historyEntry = {
      date: new Date().toISOString(),
      difficulty,
      rating,
      timeSpent: localTimeSpent
    };
    
    onUpdateProject({
      ...project,
      history: [historyEntry, ...(project.history || [])],
      progress: {}, 
      timeSpent: 0  
    });
    
    setLocalTimeSpent(0);
    setTimerRunning(false);
    setShowCompleteModal(false);
    setActiveSectionId(PATTERN_SECTIONS[0].id);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-emerald-600 text-white sticky top-0 z-40 shadow-md">
        <div className="flex items-center justify-between p-4 max-w-6xl mx-auto">
          
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-emerald-700 rounded-lg lg:hidden">
              <Menu size={24} />
            </button>
            <button onClick={() => { setTimerRunning(false); onClose(); }} className="p-2 hover:bg-emerald-700 rounded-lg hidden sm:block" title="Voltar ao Painel">
              <Home size={20} />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate max-w-[150px] sm:max-w-xs flex items-center gap-2">
                {project.name}
              </h1>
              {!project.isTemp && (
                <button onClick={() => setShowRenameModal(true)} className="text-emerald-200 hover:text-white transition p-1" title="Editar Nome">
                  <Pencil size={16} />
                </button>
              )}
            </div>
            {project.isTemp && (
              <span className="bg-amber-400 text-amber-900 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Não Salvo
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6">
            
            {/* TIMER WIDGET */}
            <div className="flex items-center bg-emerald-800/50 rounded-full pl-3 pr-1 py-1 shadow-inner border border-emerald-500/30">
              <Clock size={16} className={`mr-2 hidden sm:block ${timerRunning ? 'text-emerald-300 animate-pulse' : 'text-emerald-200'}`} />
              <span className="font-mono font-bold text-sm sm:text-base mr-3 tracking-wider">
                {formatTime(localTimeSpent)}
              </span>
              <button 
                onClick={() => setTimerRunning(!timerRunning)}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${timerRunning ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-md' : 'bg-white text-emerald-800 hover:bg-emerald-100 shadow-sm'}`}
              >
                {timerRunning ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" className="ml-0.5"/>}
              </button>
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="hidden sm:flex items-center gap-2">
              {project.isTemp ? (
                <button onClick={() => setShowSaveModal(true)} className="bg-white text-emerald-700 text-sm font-bold px-4 py-2 rounded-lg hover:bg-emerald-50 transition flex items-center gap-2 shadow-sm">
                  <Save size={16}/> Salvar na Biblioteca
                </button>
              ) : (
                <button onClick={() => setShowCompleteModal(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-sm border border-emerald-400">
                  <Award size={16}/> Concluir Peça
                </button>
              )}
            </div>
            
          </div>
        </div>
      </header>

      {/* LAYOUT PRINCIPAL */}
      <div className="max-w-6xl mx-auto flex">
        
        {/* OVERLAY MOBILE */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-[45] lg:hidden" onClick={() => setSidebarOpen(false)}/>}
        
        {/* SIDEBAR */}
        <aside className={`
          fixed lg:sticky top-0 left-0 h-screen lg:h-[calc(100vh-64px)] 
          w-72 bg-white shadow-xl lg:shadow-none lg:border-r border-slate-200
          z-[50] transform transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          overflow-y-auto pb-20 flex flex-col
        `}>
          <div className="p-4 lg:hidden flex justify-between items-center border-b border-slate-100 bg-emerald-50">
            <button onClick={() => { setTimerRunning(false); onClose(); }} className="text-emerald-700 font-bold flex items-center gap-1 text-sm"><Home size={16}/> Sair</button>
            <button onClick={() => setSidebarOpen(false)} className="text-emerald-700 p-1"><X size={20} /></button>
          </div>

          {/* AÇÕES MOBILE */}
          <div className="p-4 border-b border-slate-100 lg:hidden flex flex-col gap-2">
            {project.isTemp ? (
              <button onClick={() => { setSidebarOpen(false); setShowSaveModal(true); }} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <Save size={18}/> Salvar na Biblioteca
              </button>
            ) : (
              <button onClick={() => { setSidebarOpen(false); setShowCompleteModal(true); }} className="w-full bg-emerald-100 text-emerald-800 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                <Award size={18}/> Concluir Peça
              </button>
            )}
          </div>
          
          <div className="p-4 flex flex-col gap-2 flex-1">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">Índice da Receita</div>
            {PATTERN_SECTIONS.map((section) => {
              const isActive = activeSectionId === section.id;
              const isCompleted = isSectionComplete(section);
              return (
                <button
                  key={section.id}
                  onClick={() => { setActiveSectionId(section.id); setSidebarOpen(false); }}
                  className={`flex items-center w-full text-left p-3 rounded-xl transition-all
                    ${isActive ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="text-xl w-8 text-center flex-shrink-0">{getSafeIcon(section.icon)}</span>
                  <span className="flex-1 truncate pr-2">{section.title}</span>
                  {isCompleted && <Check size={18} className="text-emerald-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* MENUS INFERIORES SIDEBAR */}
          <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
              
             {project.history?.length > 0 && (
               <button onClick={() => {setSidebarOpen(false); setShowHistoryModal(true);}} className="w-full flex items-center justify-between p-3 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors border border-slate-200">
                 <span className="flex items-center gap-2 font-bold"><History size={16} className="text-emerald-600"/> Histórico</span>
                 <span className="bg-slate-200 text-xs px-2 py-0.5 rounded-full font-bold">{project.history.length}</span>
               </button>
             )}

             <button onClick={() => {setSidebarOpen(false); setShowResetConfirm(true);}} className="w-full flex items-center p-3 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors font-medium">
              <RotateCcw size={16} className="mr-2" /> Reiniciar Progresso
            </button>

            {!project.isTemp && (
              <button onClick={() => {
                setSidebarOpen(false);
                setShowDeleteConfirm(true);
              }} className="w-full flex items-center p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium mt-2">
                <Trash2 size={16} className="mr-2" /> Excluir Receita
              </button>
            )}
          </div>
        </aside>

        {/* ÁREA CENTRAL DE CONTEÚDO */}
        <main className="flex-1 p-4 sm:p-8 min-h-[calc(100vh-64px)] pb-40">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                {getSafeIcon(activeSection.icon)} {activeSection.title}
              </h2>
            </div>

            {/* SEÇÃO TEXTO */}
            {activeSection.type === 'text' && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                {activeSection.steps?.map((step, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-slate-700 whitespace-pre-line leading-relaxed">{step.text}</p>
                  </div>
                ))}
                {PATTERN_SECTIONS.length > 1 && (
                  <button onClick={() => setActiveSectionId(PATTERN_SECTIONS[1].id)} className="mt-8 w-full bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 transition shadow-md">
                    Começar o Passo a Passo
                  </button>
                )}
              </div>
            )}

            {/* SEÇÃO PADRÃO INTERATIVA */}
            {activeSection.type === 'pattern' && (
              <div className="space-y-4">
                {isSectionComplete(activeSection) ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-3xl text-center shadow-inner">
                    <Check size={48} className="mx-auto text-emerald-500 mb-4" />
                    <h3 className="text-2xl font-bold text-emerald-900 mb-6">Parte Concluída!</h3>
                    <div className="flex gap-3 justify-center flex-wrap">
                      <button onClick={() => handleUndoStep(activeSection.steps.length - 1)} className="px-6 py-3 bg-white text-slate-700 rounded-xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition">
                        Desfazer última
                      </button>
                      {PATTERN_SECTIONS.findIndex(s => s.id === activeSectionId) < PATTERN_SECTIONS.length - 1 && (
                        <button onClick={() => setActiveSectionId(PATTERN_SECTIONS[PATTERN_SECTIONS.findIndex(s => s.id === activeSectionId) + 1].id)} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700 transition">
                          Próxima Parte
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {activeSection.steps?.map((step, idx) => {
                      if (idx < currentStepIndex) {
                        return (
                          <div key={idx} className="bg-slate-100 p-4 rounded-xl flex items-center opacity-70 group hover:opacity-100 transition">
                            <Check size={20} className="text-emerald-500 mr-4 flex-shrink-0" />
                            <div className="flex-1">
                              <span className="text-xs font-bold text-slate-400 uppercase">{step.r}</span>
                              <p className="text-slate-500 line-through">{step.text}</p>
                            </div>
                            <button onClick={() => handleUndoStep(idx)} className="text-slate-400 hover:text-emerald-600 p-2" title="Desfazer"><RotateCcw size={18}/></button>
                          </div>
                        );
                      }
                      
                      if (idx === currentStepIndex) {
                        const isInfo = step.type === 'info';
                        return (
                          <div key={idx} className={`border-2 rounded-2xl p-6 shadow-lg transform transition-all ${isInfo ? 'bg-amber-50 border-amber-300' : 'bg-white border-emerald-500'}`}>
                            <div className="text-emerald-600 font-bold text-sm mb-2 uppercase">{step.r || 'Passo'}</div>
                            <div className="text-2xl font-extrabold mb-4 text-slate-800 leading-tight">{step.text}</div>
                            {step.pts && <div className="inline-block px-3 py-1 bg-slate-100 rounded-lg text-slate-600 font-bold mb-6 border border-slate-200 shadow-sm">Total final: {step.pts}</div>}
                            <button onClick={handleCompleteStep} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 shadow-md transition">
                              <Check size={20} /> Concluído
                            </button>
                          </div>
                        );
                      }

                      if (idx > currentStepIndex && idx <= currentStepIndex + 2) {
                        return (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 opacity-50 flex items-center blur-[0.5px]">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs mr-4 flex-shrink-0">{step.r || '-'}</div>
                            <p className="text-slate-400 line-clamp-2">{step.text}</p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO DE OBSERVAÇÕES / COMENTÁRIOS */}
            <div className="mt-10 bg-amber-50/50 border border-amber-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-amber-800 font-bold mb-3 flex items-center gap-2">
                <MessageSquare size={18} /> Minhas Observações ({activeSection.title})
              </h3>
              <textarea
                value={project.notes?.[activeSectionId] || ''}
                onChange={(e) => {
                  const newNotes = { ...(project.notes || {}), [activeSectionId]: e.target.value };
                  onUpdateProject({ ...project, notes: newNotes });
                }}
                placeholder="Adicione suas notas aqui (ex: mudei a cor da linha, usei agulha menor, pulei o ponto X...)"
                className="w-full p-4 rounded-xl border border-amber-200 bg-white focus:border-amber-400 focus:ring-0 outline-none resize-none text-slate-700 placeholder-slate-400 min-h-[120px]"
              />
            </div>

          </div>
        </main>
      </div>

      {/* CONTADOR DE PONTOS FLUTUANTE */}
      {activeSection.type === 'pattern' && !isSectionComplete(activeSection) && activeSection.steps[currentStepIndex]?.type !== 'info' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-slate-200 flex items-center p-2 z-30">
          <button onClick={() => setStitchCount(s => Math.max(0, s-1))} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition"><Minus size={24} /></button>
          <div className="w-20 text-center flex flex-col items-center justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase mb-[-4px]">Pontos</span>
            <span className="font-black text-3xl text-emerald-600">{stitchCount}</span>
          </div>
          <button onClick={() => setStitchCount(s => s+1)} className="w-12 h-12 flex items-center justify-center text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-full transition"><Plus size={24} /></button>
        </div>
      )}

      {/* MODAIS (Save, Rename, Reset, Complete, History) */}
      
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Save size={32} />
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Salvar Receita</h2>
            <p className="text-center text-slate-500 mb-6">Dê um nome a esta receita para guardá-la na sua Biblioteca. Seu progresso será sincronizado com a nuvem.</p>
            
            <input 
              type="text" 
              defaultValue={project.name}
              id="projectNameInput"
              className="w-full p-4 border-2 border-slate-200 rounded-xl mb-6 text-center text-lg font-bold text-slate-800 focus:border-emerald-500 outline-none"
            />

            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancelar</button>
              <button onClick={() => {
                const name = document.getElementById('projectNameInput').value;
                onSaveNewProject(name || 'Receita sem nome');
                setShowSaveModal(false);
              }} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Pencil size={32} />
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">Renomear Receita</h2>
            
            <input 
              type="text" 
              defaultValue={project.name}
              id="renameProjectInput"
              className="w-full p-4 border-2 border-slate-200 rounded-xl mb-6 text-center text-lg font-bold text-slate-800 focus:border-emerald-500 outline-none"
            />

            <div className="flex gap-3">
              <button onClick={() => setShowRenameModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancelar</button>
              <button onClick={() => {
                const newName = document.getElementById('renameProjectInput').value;
                if(newName) {
                  onUpdateProject({ ...project, name: newName });
                }
                setShowRenameModal(false);
              }} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-2 text-slate-800">Reiniciar Receita?</h3>
            <p className="text-slate-600 mb-6">Você tem certeza? Isso irá apagar todo o progresso e zerar o tempo atual para você começar do zero. O Histórico anterior será mantido.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 hover:bg-slate-100 rounded-lg font-medium text-slate-700">Cancelar</button>
              <button onClick={resetProgress} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold transition">Sim, Reiniciar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR RECEITA DE DENTRO DO WORKSPACE */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-slate-800 text-center">Excluir Receita?</h3>
            <p className="text-slate-600 mb-6 text-center">Tem certeza que deseja EXCLUIR definitivamente esta receita? Esta ação não pode ser desfeita e será removida também da nuvem.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 transition">Cancelar</button>
              <button onClick={() => { setShowDeleteConfirm(false); onDeleteProject(project.id); }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}

      {showCompleteModal && (
        <CompletionModal 
          timeSpent={localTimeSpent}
          isTemp={project.isTemp}
          onClose={() => setShowCompleteModal(false)}
          onPromptSave={() => {
            setShowCompleteModal(false);
            setShowSaveModal(true);
          }}
          onSave={(difficulty, rating) => handleFinishPiece(difficulty, rating)}
        />
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><History className="text-emerald-600"/> Histórico de Peças</h3>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="overflow-y-auto pr-2 flex-1 space-y-3">
              {project.history.map((entry, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-700">Feita em: {formatDate(entry.date)}</span>
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1"><Clock size={12}/> {formatTime(entry.timeSpent)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      entry.difficulty === 'Fácil' ? 'bg-green-100 text-green-700' :
                      entry.difficulty === 'Médio' ? 'bg-blue-100 text-blue-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      Dificuldade: {entry.difficulty}
                    </span>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(star => <Star key={star} size={14} fill={star <= entry.rating ? "#F59E0B" : "none"} className={star <= entry.rating ? "text-amber-500" : "text-slate-300"} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-componente do Modal de Conclusão da Peça
function CompletionModal({ timeSpent, isTemp, onClose, onPromptSave, onSave }) {
  const [difficulty, setDifficulty] = useState('Médio');
  const [rating, setRating] = useState(0);

  if (isTemp) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 text-center">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4"/>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Projeto Não Salvo!</h3>
          <p className="text-slate-600 mb-6">Para concluir a peça e salvar o tempo no histórico, você precisa primeiro salvar essa receita na sua Biblioteca.</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
            <button onClick={onPromptSave} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700">Salvar Agora</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
        <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
          <Award size={32} />
        </div>
        <h3 className="text-2xl font-bold text-center text-slate-800 mb-1">Parabéns!</h3>
        <p className="text-slate-500 text-center mb-6">Você concluiu a peça.</p>
        
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between mb-6">
          <span className="text-sm font-bold text-slate-600">Tempo de Confecção:</span>
          <span className="text-lg font-black text-emerald-600">{formatTime(timeSpent)}</span>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-700 mb-3 text-center">Nível de Dificuldade</label>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
            {['Fácil', 'Médio', 'Difícil'].map(lvl => (
              <button 
                key={lvl}
                onClick={() => setDifficulty(lvl)}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition shadow-sm ${difficulty === lvl ? 'bg-white text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-bold text-slate-700 mb-3 text-center">Sua Avaliação</label>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button 
                key={star} 
                onClick={() => setRating(star)}
                className="hover:scale-110 transition-transform focus:outline-none"
              >
                <Star size={36} fill={star <= rating ? "#F59E0B" : "transparent"} strokeWidth={1.5} className={star <= rating ? "text-amber-500" : "text-slate-300"} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Voltar</button>
          <button 
            disabled={rating === 0}
            onClick={() => onSave(difficulty, rating)} 
            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 disabled:bg-slate-300"
          >
            Registrar Histórico
          </button>
        </div>
      </div>
    </div>
  );
}