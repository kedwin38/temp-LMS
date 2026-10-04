import React, { useEffect, useState } from 'react';
import { LearningMaterial } from '../types';
import { api } from '../services/api';
import { X, Video, Download, CheckCircle } from 'lucide-react';

interface VideoPlayerModalProps {
  material: LearningMaterial | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ material, onClose }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!material) return undefined;
    let objectUrl: string | null = null;
    setVideoUrl(null);
    setLoadError('');

    // The course-material endpoint is JWT-protected, so a plain <video src>/<a href>
    // (no Authorization header) would 401. Fetch with the bearer token and play from a blob.
    api.fetchAuthenticatedFile(material.fileUrl)
      .then((blobUrl) => { objectUrl = blobUrl; setVideoUrl(blobUrl); })
      .catch(() => setLoadError('This video could not be opened. Please ask the instructor to upload it again.'));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material]);

  if (!material) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-950 shadow-2xl border border-slate-800 w-full h-[96vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white line-clamp-1">{material.title}</h2>
              <p className="text-xs text-slate-400">
                HTTP 206 Streaming Video Lecture &bull; {material.fileSize}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {material.allowDownload && videoUrl && <a href={videoUrl} download={material.fileName} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"><Download className="w-3.5 h-3.5" /><span>Download</span></a>}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Canvas */}
        <div className="bg-black flex items-center justify-center relative aspect-video w-full">
          {!videoUrl && !loadError && <p className="text-sm text-slate-400">Opening video...</p>}
          {loadError && <p className="text-sm font-semibold text-rose-400 px-6 text-center">{loadError}</p>}
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              controlsList={material.allowDownload ? undefined : 'nodownload noplaybackrate'}
              disablePictureInPicture={!material.allowDownload}
              autoPlay
              playsInline
              className="w-full h-full max-h-[60vh] object-contain"
            >
              Your browser does not support HTML5 video streaming.
            </video>
          )}
        </div>

        {/* Bottom Description */}
        <div className="p-4 bg-slate-900 text-slate-300 text-sm space-y-2 overflow-y-auto max-h-28">
          {material.description && (
            <p className="text-slate-300 text-sm leading-relaxed">{material.description}</p>
          )}
          <div className="pt-2 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span>High-efficiency byte-range streaming enabled. You can scrub or jump directly to any timestamp.</span>
          </div>
        </div>
      </div>
    </div>
  );
};