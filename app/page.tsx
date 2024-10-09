'use client';

import { useState, useEffect, useRef } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import ProgressBar from "../components/ui/progress-bar";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export default function Home() {
  const [foregroundVideo, setForegroundVideo] = useState<File | null>(null);
  const [backgroundVideo, setBackgroundVideo] = useState<File | null>(null);
  const [backgroundMusic, setBackgroundMusic] = useState<File | null>(null); // MP3 input state
  const [muteForeground, setMuteForeground] = useState<boolean>(false);
  const [muteBackground, setMuteBackground] = useState<boolean>(false);
  const [addWaveform, setAddWaveform] = useState<boolean>(false); // Option to add waveform
  const [processing, setProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.2/dist/umd';
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    setLoaded(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
    const file = e.target.files ? e.target.files[0] : null;
    setter(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);

    if (!loaded) {
      setError("FFmpeg not loaded. Please refresh the page and try again.");
      setProcessing(false);
      return;
    }

    if (!foregroundVideo || !backgroundVideo) {
      setError("Please upload both videos.");
      setProcessing(false);
      return;
    }

    try {
      const ffmpeg = ffmpegRef.current;

      // Read videos as Uint8Array
      const foregroundVideoData = new Uint8Array(await foregroundVideo.arrayBuffer());
      const backgroundVideoData = new Uint8Array(await backgroundVideo.arrayBuffer());

      console.log('Writing foreground video to FFmpeg FS');
      await ffmpeg.writeFile("foreground.mp4", foregroundVideoData);

      console.log('Writing background video to FFmpeg FS');
      await ffmpeg.writeFile("background.mp4", backgroundVideoData);

      if (backgroundMusic) {
        console.log('Writing background music to FFmpeg FS');
        const backgroundMusicData = new Uint8Array(await backgroundMusic.arrayBuffer());
        await ffmpeg.writeFile("music.mp3", backgroundMusicData);
      }

      // Construct FFmpeg command to center the foreground video
      console.log('Running FFmpeg command');
      const filterComplex = [
        "[1:v]scale=iw:ih[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2:shortest=1"
      ];

      // Adjust audio filters based on mute options
      const audioFilters = [];
      if (muteForeground) audioFilters.push("[1:a]anull");
      if (muteBackground) audioFilters.push("[0:a]anull");

      // Add waveform if enabled
      if (backgroundMusic && addWaveform) {
        filterComplex.push(
          "[2:a]showwaves=s=1280x200:mode=cline:colors=cyan[waveform];[0:v][waveform]overlay=W-w:main_h-overlay_h"
        );
      }

      let command = [
        "-i", "background.mp4",
        "-i", "foreground.mp4"
      ];

      if (backgroundMusic) {
        command.push("-i", "music.mp3"); // Add background music input
      }

      command.push(
        "-filter_complex", filterComplex.join(';')
      );

      if (audioFilters.length > 0) {
        const audioFilterString = audioFilters.join(';');
        command.push("-filter_complex", `amix=inputs=1;${audioFilterString}`);
      }

      command.push(
        "-map", "0:v",       // Map the background video
        "-map", "2:a",       // Map the background music as audio
        "-shortest",         // Stops the video when the shortest stream ends
        "output.mp4"
      );

      // Print command for debugging
      console.log('FFmpeg command:', command.join(' '));

      await ffmpeg.exec(command);

      // Check if output file was created successfully
      console.log('Reading output video from FFmpeg FS');
      const data = await ffmpeg.readFile("output.mp4");
      const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "output.mp4";
      link.click();

      // Clean up
      URL.revokeObjectURL(url);
      await ffmpeg.deleteFile("foreground.mp4");
      await ffmpeg.deleteFile("background.mp4");
      if (backgroundMusic) {
        await ffmpeg.deleteFile("music.mp3");
      }
      await ffmpeg.deleteFile("output.mp4");

    } catch (error) {
      console.error("Error processing video:", error);
      setError(`An error occurred: ${(error as Error).message}. Please try again.`);
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="p-6 w-full max-w-md bg-white shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Video Processor</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label htmlFor="foreground-file">Foreground Video File:</Label>
            <Input
              id="foreground-file"
              type="file"
              accept="video/*"
              onChange={(e) => handleFileChange(e, setForegroundVideo)}
              required
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="background-file">Background Video File:</Label>
            <Input
              id="background-file"
              type="file"
              accept="video/*"
              onChange={(e) => handleFileChange(e, setBackgroundVideo)}
              required
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="music-file">Background Music File (MP3):</Label>
            <Input
              id="music-file"
              type="file"
              accept="audio/mp3"
              onChange={(e) => handleFileChange(e, setBackgroundMusic)} // Add background music input
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="mute-foreground">Mute Foreground Video:</Label>
            <input
              id="mute-foreground"
              type="checkbox"
              checked={muteForeground}
              onChange={() => setMuteForeground(!muteForeground)}
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="mute-background">Mute Background Video:</Label>
            <input
              id="mute-background"
              type="checkbox"
              checked={muteBackground}
              onChange={() => setMuteBackground(!muteBackground)}
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="add-waveform">Add Audio Waveform:</Label>
            <input
              id="add-waveform"
              type="checkbox"
              checked={addWaveform}
              onChange={() => setAddWaveform(!addWaveform)} // Toggle waveform
              className="mt-1"
            />
          </div>
          {error && (
            <div className="mb-4 text-red-500">
              {error}
            </div>
          )}
          {processing && (
            <div className="mb-4">
              <Label>Processing Video...</Label>
              <ProgressBar value={progress} max={100} className="mt-1" />
            </div>
          )}
          <Button type="submit" disabled={processing || !loaded} className="w-full">
            {processing ? "Processing..." : "Process Video"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
