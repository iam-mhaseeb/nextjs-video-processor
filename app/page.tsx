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
  const [youtubeVideo, setYoutubeVideo] = useState<File | null>(null);
  const [pexelsVideo, setPexelsVideo] = useState<File | null>(null);
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
  }

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
  
    if (!youtubeVideo || !pexelsVideo) {
      setError("Please upload both videos.");
      setProcessing(false);
      return;
    }
  
    try {
      const ffmpeg = ffmpegRef.current;
  
      // Read videos as Uint8Array
      const youtubeVideoData = new Uint8Array(await youtubeVideo.arrayBuffer());
      const pexelsVideoData = new Uint8Array(await pexelsVideo.arrayBuffer());
  
      console.log('Writing YouTube video to FFmpeg FS');
      await ffmpeg.writeFile("youtube.mp4", youtubeVideoData);
  
      console.log('Writing Pexels video to FFmpeg FS');
      await ffmpeg.writeFile("pexels.mp4", pexelsVideoData);
  
      // Simple filter for debugging
      console.log('Running FFmpeg command');
      try {
        await ffmpeg.exec([
          "-i", "pexels.mp4",
          "-i", "youtube.mp4",
          "-filter_complex",
          "[1:v]scale=iw:ih,format=rgba[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2:shortest=1",
          "-c:a", "copy",
          "output.mp4"
        ]);
      } catch (error) {
        console.error("FFmpeg execution error:", error);
      }
      
  
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
      await ffmpeg.deleteFile("youtube.mp4");
      await ffmpeg.deleteFile("pexels.mp4");
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
            <Label htmlFor="youtube-file">YouTube Video File:</Label>
            <Input
              id="youtube-file"
              type="file"
              accept="video/*"
              onChange={(e) => handleFileChange(e, setYoutubeVideo)}
              required
              className="mt-1"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="pexels-file">Pexels Video File:</Label>
            <Input
              id="pexels-file"
              type="file"
              accept="video/*"
              onChange={(e) => handleFileChange(e, setPexelsVideo)}
              required
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
