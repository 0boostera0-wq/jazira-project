"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import { genHandle } from "@/lib/profile";
import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";

export default function ProfileSetupPage() {
  const router = useRouter();
  const { userId, isLoaded, isSignedIn, needsProfileSetup, refreshUser } = useAuthUser();
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  // Already completed? Don't show setup again — go straight to dashboard.
  useEffect(() => {
    if (isLoaded && isSignedIn && !needsProfileSetup) {
      router.replace("/dashboard");
    }
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, needsProfileSetup, router]);

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) { setError("الاسم المعروض مطلوب"); return; }
    if (trimmed.length < 2) { setError("الاسم يجب أن يكون حرفين على الأقل"); return; }

    setLoading(true);
    setError("");

    const supabase = createClient();
    let avatar_url = null;

    // Upload avatar if selected (avatars bucket)
    if (avatarFile) {
      const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(path);
        avatar_url = `${publicUrl}?t=${Date.now()}`;
      }
    }

    // full_name is the public (non-unique) name. Only generate a unique username
    // handle if the row doesn't already have one (avoids unique-constraint clashes).
    const { data: existing } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    const updates = {
      id: userId,
      full_name: trimmed,
    };
    if (!existing?.username) updates.username = genHandle(trimmed);
    if (avatar_url) updates.avatar_url = avatar_url;

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(updates, { onConflict: "id" });

    if (profileError) {
      console.error("Profile upsert error:", profileError.message);
      setError("تعذّر حفظ الملف الشخصي. حاول مجدداً.");
      setLoading(false);
      return;
    }

    // Refresh auth context so needsProfileSetup flips to false BEFORE we navigate,
    // preventing the guard from bouncing us back here (infinite-loop fix).
    await refreshUser();
    router.replace("/dashboard");
  };

  // Loading state while auth resolves
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-soft">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const initial = displayName.trim().charAt(0) || "م";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12 from-cream to-white"
      style={{ background: "linear-gradient(135deg, #fffdf5 0%, #ffffff 100%)" }}
    >
      <Link href="/" className="mb-8">
        <BrandLogo size="lg" />
      </Link>

      <div
        className="glass-strong w-full max-w-md rounded-3xl p-8 shadow-lg"
        style={{ border: "1px solid rgba(201,168,106,0.25)" }}
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink mb-2">أهلاً في جزيرة! 🏝️</h1>
          <p className="text-sm text-ink-soft">
            اختر اسمك المعروض للمجتمع — لن يظهر بريدك الإلكتروني لأحد.
          </p>
        </div>

        {/* Avatar upload with first-letter fallback */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-gold-gradient text-4xl font-bold text-white overflow-hidden ring-4 ring-champagne-200 hover:ring-champagne-400 transition-all"
              aria-label="اختر صورة شخصية"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initial}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-gold text-white shadow-gold"
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              hidden
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              الاسم المعروض
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={50}
              placeholder="مثال: عبدالله"
              className="w-full rounded-xl border border-white/30 bg-white/50 px-4 py-2.5 text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              يمكن لأكثر من مستخدم اختيار نفس الاسم. يمكنك تغييره لاحقاً من الإعدادات.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !displayName.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                جاري الحفظ...
              </span>
            ) : (
              "ابدأ رحلتك في جزيرة ✨"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
