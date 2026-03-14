import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCw } from 'lucide-react';
import { formatTimestamp } from '../../lib/meetings-api';
import './RecordingPlayer.css';

export default function RecordingPlayer({ videoUrl, audioUrl, onTimeUpdate, onRetry }) {
  const mediaRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [retrying, setRetrying] = useState(false);

  const isVideo = !!videoUrl;
  const src = videoUrl || audioUrl;

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime);
      onTimeUpdate?.(el.currentTime);
    };
    const handleLoaded = () => setDuration(el.duration);
    const handleEnded = () => setPlaying(false);

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('loadedmetadata', handleLoaded);
    el.addEventListener('ended', handleEnded);

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('loadedmetadata', handleLoaded);
      el.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (playing) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
    setPlaying(!playing);
  };

  const seek = (e) => {
    if (!mediaRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    mediaRef.current.currentTime = pct * duration;
  };

  const changeSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  };

  const seekTo = (time) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
  };

  // Expose seekTo via ref callback pattern
  useEffect(() => {
    window.__ppPlayerSeek = seekTo;
    return () => { delete window.__ppPlayerSeek; };
  }, []);

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  if (!src) {
    return (
      <div className="recording-player-empty">
        No recording available yet
        {onRetry && (
          <button className="recording-retry-btn" onClick={handleRetry} disabled={retrying}>
            <RotateCw size={14} className={retrying ? 'spinning' : ''} />
            {retrying ? 'Fetching...' : 'Retry fetch'}
          </button>
        )}
      </div>
    );
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="recording-player">
      {isVideo ? (
        <video ref={mediaRef} src={src} className="recording-video" />
      ) : (
        <audio ref={mediaRef} src={src} />
      )}

      <div className="recording-controls">
        <button className="recording-btn" onClick={togglePlay}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <span className="recording-time">
          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
        </span>

        <div className="recording-progress" onClick={seek}>
          <div className="recording-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <button className="recording-btn recording-speed" onClick={changeSpeed}>
          {speed}x
        </button>

        <button className="recording-btn" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {isVideo && (
          <button className="recording-btn" onClick={() => mediaRef.current?.requestFullscreen()}>
            <Maximize size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
