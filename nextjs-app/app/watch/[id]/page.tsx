"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Hls, { Level } from "hls.js";

const QUALITY_LABELS: Record<number, string> = {
  360: "360p",
  480: "480p",
  720: "720p HD",
  1080: "1080p FHD",
};

export default function WatchPage() {
  const { id } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<"PROCESSING" | "COMPLETED">("PROCESSING");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto

  useEffect(() => {
    if (status !== "COMPLETED") return;

    const video = videoRef.current;
    if (!video) return;

    const streamUrl = `/api/stream?path=${id}/master.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(data.levels);
        setCurrentLevel(-1); // start on auto
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        setError(`Stream error: ${data.details}`);
      });

      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
    } else {
      setError("HLS is not supported in this browser");
    }
  }, [status, id]);

  useEffect(() => {
    if (status === "COMPLETED") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${id}`);
        const data = await res.json();
        if (data.status === "COMPLETED") {
          setStatus("COMPLETED");
          clearInterval(interval);
        }
      } catch {
        console.error("Status check failed");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, id]);

  function changeQuality(levelIndex: number) {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-6 text-center">🎬 Now Streaming</h1>

        {status === "PROCESSING" ? (
          <div className="bg-gray-900 rounded-2xl p-12 text-center">
            <div className="animate-spin text-4xl mb-4">⚙️</div>
            <p className="text-gray-400 text-lg">Transcoding your video...</p>
            <p className="text-gray-600 text-sm mt-2">This may take a few minutes</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <video
                ref={videoRef}
                controls
                autoPlay
                className="w-full rounded-2xl"
              />
            </div>

            {/* Quality Switcher */}
            {levels.length > 0 && (
              <div className="mt-4 flex items-center gap-3 justify-center flex-wrap">
                <span className="text-gray-400 text-sm">Quality:</span>

                <button
                  onClick={() => changeQuality(-1)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    currentLevel === -1
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  Auto
                </button>

                {levels.map((level, index) => (
                  <button
                    key={index}
                    onClick={() => changeQuality(index)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                      currentLevel === index
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {QUALITY_LABELS[level.height] || `${level.height}p`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-red-400 text-center mt-4">{error}</p>
        )}

        <p className="text-gray-600 text-center text-sm mt-4">Video ID: {id}</p>
      </div>
    </main>
  );
}