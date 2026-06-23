import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import ProfileSetupGuard from "@/components/ProfileSetupGuard";

// Lazy-load the AI assistant — it's large and not needed for initial paint
const AIAssistant = dynamic(() => import("@/components/AIAssistant"), {
  ssr: false,
});

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen">
      <ProfileSetupGuard />
      <Sidebar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-20 sm:px-6 lg:px-8">
        {children}
      </main>
      <AIAssistant />
    </div>
  );
}
