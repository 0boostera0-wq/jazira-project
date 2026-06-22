import Sidebar from "@/components/Sidebar";
import AIAssistant from "@/components/AIAssistant";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-20 sm:px-6 lg:px-8">
        {children}
      </main>
      <AIAssistant />
    </div>
  );
}
