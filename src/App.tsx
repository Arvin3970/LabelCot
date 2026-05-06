import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import TemplateBuilder from "./pages/TemplateBuilder";
import Workspace from "./pages/Workspace";
import Header from "./components/Header";

const queryClient = new QueryClient();

const App = () => {
  console.log('Application initialized with static routing');

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background flex flex-col items-center">
          {/* Main container constrained to 1440px as requested */}
          <div className="w-full max-w-[1440px] flex-1 flex flex-col shadow-custom bg-card">
            <Header />
            <main className="flex-1 w-full relative">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/template-builder" element={<TemplateBuilder />} />
                <Route path="/workspace" element={<Workspace />} />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;