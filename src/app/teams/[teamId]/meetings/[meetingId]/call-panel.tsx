"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/styles";
import { endMeetingCall, startMeetingCall, type CallFinish, type CallOpen } from "@/lib/actions/call";

type Cue = { speakerLabel: string | null; text: string; startMs: number; endMs: number };
type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function CallPanel(props: { teamId: string; meetingId: string; isOrganizer: boolean; dailyReady: boolean; language: "en" | "ka"; ended: boolean; isDemo: boolean; live: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<{ leave: () => Promise<unknown>; destroy: () => void; stopTranscription: () => void } | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const joinedAt = useRef(0);
  const dailyCues = useRef<Cue[]>([]);
  const browserCues = useRef<Cue[]>([]);
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState(false);
  const [join, setJoin] = useState<Extract<CallOpen, { url: string }> | null>(null);
  const [status, setStatus] = useState("Not started");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CallFinish | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  useEffect(() => {
    if (!join) return;
    let cancel = false;
    let speech: SpeechRec | null = null;
    const started = Date.now();
    joinedAt.current = started;
    void (async () => {
      const daily = await import("@daily-co/daily-js");
      if (cancel || !containerRef.current) return;
      const existing = daily.default.getCallInstance();
      existing?.destroy();
      const frame = daily.default.createFrame(containerRef.current, {
        showLeaveButton: true,
        iframeStyle: { position: "absolute", inset: "0", width: "100%", height: "100%", border: "0" },
      });
      frameRef.current = frame;
      const browser = () => {
        if (props.isDemo) return;
        speech = startBrowserSpeech(started, browserCues, speechRef, setStatus, props.language) ?? speech;
      };
      frame.on("transcription-started", () => setStatus("Daily transcription is on."));
      frame.on("transcription-error", (event) => {
        if (props.isDemo) return;
        setStatus(`Daily transcription did not start${event.errorMsg ? `: ${event.errorMsg}` : ""}. Capturing this microphone instead.`);
        browser();
      });
      frame.on("transcription-message", (event) => {
        if (props.isDemo) return;
        const raw = event.rawResponse ?? {};
        const interim = raw.is_final === false && raw.speech_final !== true;
        const text = event.text?.trim();
        if (!text || interim) return;
        const startMs = Math.max(0, event.timestamp instanceof Date ? event.timestamp.getTime() - started : Date.now() - started);
        const previous = dailyCues.current.at(-1);
        if (previous?.text === text) return;
        dailyCues.current.push({ speakerLabel: event.participantId ? `Speaker ${event.participantId.slice(0, 4)}` : null, text, startMs, endMs: startMs });
      });
      frame.on("joined-meeting", () => {
        if (props.isDemo) return;
        if (join.transcription === "unavailable") browser();
        else if (props.isOrganizer) frame.startTranscription(join.transcriptionOptions);
      });
      await frame.join({ url: join.url, token: join.token });
      if (!cancel) setStatus(props.isDemo ? "Demo huddle live. Say anything; the Georgian script is fixed." : join.transcription === "daily" ? "In the call. Waiting for Daily transcription." : "In the call. Daily transcription storage was not enabled; this microphone is being captured.");
    })().catch(() => setError("The call could not be opened in this browser."));
    return () => {
      cancel = true;
      speech?.stop();
      frameRef.current?.destroy();
      frameRef.current = null;
    };
  }, [join, props.isOrganizer, props.language, props.isDemo]);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const opened = await startMeetingCall({ teamId: props.teamId, meetingId: props.meetingId, consented: true });
      if ("error" in opened) setError(opened.error);
      else setJoin(opened);
    } catch {
      setError("The call could not be started. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function endCall() {
    setPending(true);
    setError(null);
    setCallEnded(true);
    speechRef.current?.stop();
    const frame = frameRef.current;
    try {
      frame?.stopTranscription();
      await frame?.leave();
    } catch {
      // Leaving still continues to the transcript request.
    }
    frame?.destroy();
    frameRef.current = null;
    const segments = dailyCues.current.length > 0 ? dailyCues.current : browserCues.current;
    const origin = dailyCues.current.length > 0 ? "daily-live" : "browser";
    try {
      const finished = await endMeetingCall({ teamId: props.teamId, meetingId: props.meetingId, origin, consented: true, segments });
      setResult(finished);
    } catch {
      setError("Processing could not finish. Retry processing to retrieve the stored transcript.");
    } finally {
      setJoin(null);
      setPending(false);
      setStatus("Call ended.");
      router.refresh();
    }
  }

  if (!props.dailyReady) return <p className="text-warning">Daily is not set up on this server yet.</p>;

  return (
    <div className="space-y-3">
      {!props.isDemo && <p className="text-muted">{props.language === "ka" ? "Georgian" : "English"} transcript with speaker labels. Meeting notes and Linear tickets are generated in English.</p>}
      <p role="status" className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={`size-1.5 rounded-full ${join ? "bg-success" : "bg-muted/40"}`} />
        {!join && !result && !props.ended && !callEnded ? props.live ? "Call live. Join when you're ready." : props.isOrganizer ? "Ready to start" : "Waiting for the organizer to start the call." : status}
      </p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!join && !result && !props.ended && !callEnded && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label className="flex items-start gap-2 text-muted accent-accent">
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} className="mt-1" />
            <span>{props.isDemo ? "Use the fixed Georgian script for this demo, regardless of speech. Ending the huddle creates two real Linear issues." : `Transcribe this call in ${props.language === "ka" ? "Georgian" : "English"}. Agreed work can create Linear issues or add updates to existing issues in this project. Participants receive notes, the transcript, and issue links in the app.`}</span>
          </label>
          <button type="submit" className={buttonClass.primary} disabled={!consented || pending || (!props.isOrganizer && !props.live)}>
            {pending ? "Joining…" : props.live || !props.isOrganizer ? "Join call" : props.isDemo ? "Start huddle" : "Start call"}
          </button>
        </form>
      )}
      {join && (
        <>
          <div ref={containerRef} className="relative aspect-video max-h-[70dvh] w-full overflow-hidden rounded-md bg-black" />
          {join.persistenceWarning && <p className="text-warning">{join.persistenceWarning}</p>}
          {props.isOrganizer ? (
            <button type="button" className={buttonClass.primary} onClick={() => void endCall()} disabled={pending}>
              {pending ? "Updating Linear…" : "End and send to Linear"}
            </button>
          ) : (
            <p className="text-muted">Only the organizer can end the call and create tasks.</p>
          )}
        </>
      )}
      {result && <CallOutcome result={result} />}
      {(result?.error || props.ended || callEnded) && !join && props.isOrganizer && (
        <button type="button" className={buttonClass.secondary} onClick={() => void endCall()} disabled={pending}>
          {pending ? "Retrying…" : props.isDemo ? "Retry this take" : "Retry processing"}
        </button>
      )}
    </div>
  );
}

function CallOutcome({ result }: { result: CallFinish }) {
  return (
    <div className="space-y-2">
      {result.transcriptNote && <p className="text-muted">{result.transcriptNote}</p>}
      {result.error && <p role="alert" className="text-danger">{result.error}</p>}
      {result.persistenceWarning && <p className="text-warning">{result.persistenceWarning}</p>}
      {result.summary && <p>{result.summary}</p>}
      {result.linearNames && (
        <div>
          <p className="font-medium">Visible Linear teams and projects</p>
          <ul className="list-disc pl-5">
            {result.linearNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {result.tasks.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {result.tasks.map((task) => (
            <li key={`${task.title}-${task.url ?? task.error}`} className="flex items-center justify-between gap-4 px-3 py-2">
              <span>{task.title}{task.url && <span className="ml-2 text-xs text-muted">{task.operation === "updated" ? "Updated" : "Created"}</span>}{task.error && <span className="block text-xs text-danger">{task.error}</span>}</span>
              {task.url ? (
                <a href={task.url} target="_blank" rel="noreferrer" className="text-accent">
                  {task.identifier ?? "Open in Linear"}
                </a>
              ) : (
                <span className="text-xs text-muted">{task.error ?? "Not created"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!result.error && result.tasks.length === 0 && <p className="text-muted">No agreed tasks, so no Linear issues were created.</p>}
    </div>
  );
}

function startBrowserSpeech(
  started: number,
  cues: RefObject<Cue[]>,
  speechRef: RefObject<SpeechRec | null>,
  setStatus: (status: string) => void,
  language: "en" | "ka",
): SpeechRec | null {
  if (speechRef.current) return speechRef.current;
  const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const ctor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!ctor) {
    setStatus("Daily transcription is unavailable, and this browser has no speech recognition.");
    return null;
  }
  const recognition = new ctor() as SpeechRec;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language === "ka" ? "ka-GE" : "en-US";
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) continue;
      const text = result[0]?.transcript.trim();
      if (!text) continue;
      const startMs = Math.max(0, Date.now() - started);
      cues.current.push({ speakerLabel: "This device", text, startMs, endMs: startMs });
    }
  };
  recognition.onerror = () => setStatus("Browser speech recognition stopped.");
  speechRef.current = recognition;
  recognition.start();
  setStatus("Capturing this microphone with browser speech recognition. This is not Daily transcription.");
  return recognition;
}
