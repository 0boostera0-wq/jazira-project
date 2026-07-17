'use client';

import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Video, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const MAX_VIDEO_DURATION = 30; // seconds
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function PostComposer({ onSubmit, isLoading }) {
  const { profile } = useAuth();
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'image' or 'video'
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const validateVideo = async (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (video.duration > MAX_VIDEO_DURATION) {
          setError(`مدة الفيديو يجب ألا تتجاوز ${MAX_VIDEO_DURATION} ثانية`);
          resolve(false);
        } else {
          resolve(true);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        setError('ملف الفيديو غير صالح');
        resolve(false);
      };

      video.src = url;
    });
  };

  const handleImageSelect = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError('حجم الصورة كبير جداً (50 MB max)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setMediaFile(file);
      setMediaType('image');
      setMediaPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoSelect = async (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError('حجم الفيديو كبير جداً (50 MB max)');
      return;
    }

    const isValid = await validateVideo(file);
    if (!isValid) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setMediaFile(file);
      setMediaType('video');
      setMediaPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!content.trim() && !mediaFile) {
      setError('أضف نصاً أو صورة/فيديو');
      return;
    }

    onSubmit({
      content: content.trim(),
      media: mediaFile,
      mediaType,
      mediaPreview,
    });

    // Reset form
    setContent('');
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    setError('');
  };

  return (
    <form onSubmit={handleSubmit} className="glass-strong rounded-3xl p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-gradient text-sm font-bold text-white">
          {(profile?.full_name || 'م')[0]}
        </div>
        <div>
          <p className="font-semibold text-ink">{profile?.full_name || 'مستخدم'}</p>
          <p className="text-xs text-ink-soft">شارك مع المجتمع</p>
        </div>
      </div>

      {/* Text Input */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="شارك إنجازك أو نتيجتك مع المجتمع..."
        rows={3}
        className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-gold/40"
        style={{ border: '1px solid rgba(201,168,106,0.3)' }}
      />

      {/* Error Message */}
      {error && (
        <p className="mt-2 text-sm text-red-600 bg-red-100 p-2 rounded-lg">
          {error}
        </p>
      )}

      {/* Media Preview */}
      {mediaPreview && (
        <div className="mt-4 relative">
          {mediaType === 'image' ? (
            <img
              src={mediaPreview}
              alt="preview"
              className="rounded-2xl max-h-64 w-full object-cover"
            />
          ) : (
            <video
              src={mediaPreview}
              className="rounded-2xl max-h-64 w-full object-cover"
              controls
            />
          )}
          <button
            type="button"
            onClick={clearMedia}
            aria-label="إزالة المرفق"
            className="absolute top-2 right-2 rounded-full bg-red-500 p-2 text-white hover:bg-red-600 transition"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {/* Image Upload */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-ink hover:bg-gold/20 transition disabled:opacity-50"
            title="صورة"
          >
            <ImageIcon size={18} />
            صورة
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            hidden
          />

          {/* Video Upload */}
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-ink hover:bg-gold/20 transition disabled:opacity-50"
            title="فيديو (30 ثانية max)"
          >
            <Video size={18} />
            فيديو
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoSelect}
            hidden
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || (!content.trim() && !mediaFile)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold to-champagne px-4 py-2 font-semibold text-white transition hover:shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          <Send size={18} className="-scale-x-100" />
          نشر
        </button>
      </div>

      {/* Help Text */}
      <p className="mt-3 text-xs text-ink-soft text-center">
        الفيديو: 30 ثانية max • الحد الأقصى: 50 MB
      </p>
    </form>
  );
}
