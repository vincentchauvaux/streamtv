"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaPlaylist } from "hls.js";
import type { ChannelItem } from "@/types/channel";
import { streamUrlValidationMessage } from "@/lib/stream-url";
import { useSettings } from "@/providers/settings-provider";
import { PlayerContext } from "./player-context";
import {
  useHlsPlayer,
  usePlayerActions,
  usePlayerKeyboard,
  useProgressTracking,
  useSubtitleActions,
} from "./player-hooks";
import { PlayerOverlay } from "./overlay";
import { PlayerControls } from "./controls";
import { PlayerTimeline } from "./timeline";

type Props = {
  channel: ChannelItem | null;
  resumePosition?: number;
  onProgress?: (positionSec: number, sessionDurationSec: number) => void;
};

export function VideoPlayer({ channel, resumePosition = 0, onProgress }: Props) {
  const { updateSetting } = useSettings();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [subtitleTracks, setSubtitleTracks] = useState<MediaPlaylist[]>([]);
  const [activeSubtitleTrackId, setActiveSubtitleTrackId] = useState(-1);

  useEffect(() => {
    if (!channel) return;
    setError(null);
    setPlaying(false);
    setSubtitleTracks([]);
    setActiveSubtitleTrackId(-1);
    const urlError = streamUrlValidationMessage(channel.url);
    if (urlError) {
      setLoading(false);
      setError(urlError);
      return;
    }
    if (channel.status === "OFFLINE") {
      setLoading(false);
      setError("Chaîne hors ligne");
      return;
    }
    setLoading(true);
  }, [channel?.id, channel?.status, channel?.url, resumePosition]);

  const onReady = useCallback(() => {
    setLoading(false);
    setPlaying(true);
  }, []);

  const onError = useCallback((msg: string) => {
    setLoading(false);
    setError(msg);
  }, []);

  const onSubtitleTrackChanged = useCallback(
    (trackId: number) => {
      setActiveSubtitleTrackId(trackId);
      updateSetting("subtitlesEnabled", trackId >= 0);
    },
    [updateSetting]
  );

  const { videoRef, hlsRef, subtitlesUserEnabledRef } = useHlsPlayer(
    channel,
    resumePosition,
    onReady,
    onError,
    {
      onSubtitleTracksUpdated: setSubtitleTracks,
      onSubtitleTrackChanged: onSubtitleTrackChanged,
    }
  );
  const { togglePlay, toggleMute, goFullscreen } = usePlayerActions(videoRef);
  const { setSubtitleTrack } = useSubtitleActions(
    hlsRef,
    subtitlesUserEnabledRef,
    onSubtitleTrackChanged
  );

  useProgressTracking(channel, onProgress);

  const handleTogglePlay = useCallback(() => {
    togglePlay();
    const video = videoRef.current;
    if (video) setPlaying(!video.paused);
  }, [togglePlay, videoRef]);

  const handleToggleMute = useCallback(() => {
    const m = toggleMute();
    if (m !== undefined) setMuted(m);
  }, [toggleMute]);

  usePlayerKeyboard(channel, videoRef, handleTogglePlay, setMuted);

  const contextValue = useMemo(
    () => ({
      videoRef,
      state: { playing, muted, loading, error, showControls },
      subtitleState: {
        tracks: subtitleTracks,
        activeTrackId: activeSubtitleTrackId,
      },
      actions: {
        setPlaying,
        setMuted,
        setLoading,
        setError,
        setShowControls,
        togglePlay: handleTogglePlay,
        toggleMute: handleToggleMute,
        goFullscreen,
        setSubtitleTrack,
      },
    }),
    [
      videoRef,
      playing,
      muted,
      loading,
      error,
      showControls,
      subtitleTracks,
      activeSubtitleTrackId,
      handleTogglePlay,
      handleToggleMute,
      goFullscreen,
      setSubtitleTrack,
    ]
  );

  if (!channel) return null;

  return (
    <PlayerContext.Provider value={contextValue}>
      <div
        className="animate-fade-in overflow-hidden rounded-2xl border border-border bg-black shadow-2xl shadow-black/40"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => playing && setShowControls(false)}
      >
        <div
          className="group relative aspect-video w-full bg-black"
          onClick={handleTogglePlay}
        >
          <video
            ref={videoRef}
            className="h-full w-full"
            playsInline
            onPlay={() => {
              setPlaying(true);
              setShowControls(false);
            }}
            onPause={() => {
              setPlaying(false);
              setShowControls(true);
            }}
          />
          <PlayerOverlay channel={channel} />
          <PlayerTimeline />
        </div>
        <PlayerControls channel={channel} />
      </div>
    </PlayerContext.Provider>
  );
}

export { VideoPlayer as default };
