import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Film,
  Image,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { Evidence, PublicCaseDTO } from "@mystery/shared";
import { DIFFICULTY_RULES, LocalGenerationDisclosure } from "@mystery/shared";
import {
  discoverClue,
  accuse,
  createCase,
  createDemoCase,
  establishSession,
  getCapabilities,
  getCase,
  getGenerationJob,
  getResult,
  requestHint,
} from "../api.js";

type Route =
  | { page: "home" }
  | { page: "creating"; jobId: string }
  | { page: "case"; caseId: string }
  | { page: "result"; caseId: string };

function routeFromLocation(): Route {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "creating" && parts[1])
    return { page: "creating", jobId: parts[1] };
  if (parts[0] === "room" && parts[1])
    return { page: "case", caseId: parts[1] };
  if (parts[0] === "result" && parts[1])
    return { page: "result", caseId: parts[1] };
  return { page: "home" };
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatTime(value: string, zone: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function EvidenceIcon({ type }: { type: Evidence["type"] }) {
  if (type === "chat")
    return <MessageSquareText size={17} aria-hidden="true" />;
  if (type === "photo") return <Image size={17} aria-hidden="true" />;
  if (type === "cctv") return <Film size={17} aria-hidden="true" />;
  return <FileText size={17} aria-hidden="true" />;
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [localModel, setLocalModel] = useState<{
    available: boolean;
    model: string;
    reason: string | null;
  } | null>(null);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    void establishSession()
      .then(() => {
        setSessionReady(true);
        void getCapabilities()
          .then((capabilities) =>
            setLocalModel({
              available: capabilities.localText.available,
              model: capabilities.localText.model,
              reason: capabilities.localText.reason ?? null,
            }),
          )
          .catch(() => {
            setLocalModel({
              available: false,
              model: "qwen3",
              reason:
                "Could not check the AI provider. Confirm the API is running.",
            });
          });
      })
      .catch((error: unknown) =>
        setSessionError(
          error instanceof Error
            ? error.message
            : "Could not start a guest session.",
        ),
      );
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (sessionError) return <ErrorPage message={sessionError} />;
  if (!sessionReady)
    return (
      <main className="loading-screen" aria-live="polite">
        Opening your case file…
      </main>
    );
  if (route.page === "case") {
    return (
      <CaseRoom
        caseId={route.caseId}
        onResult={() => go(`/result/${route.caseId}`)}
        onHome={() => go("/")}
      />
    );
  }
  if (route.page === "creating") {
    return <GenerationStatus jobId={route.jobId} />;
  }
  if (route.page === "result") {
    return <ResultPage caseId={route.caseId} onHome={() => go("/")} />;
  }
  return <HomePage localModel={localModel} />;
}

function HomePage({
  localModel,
}: {
  localModel: {
    available: boolean;
    model: string;
    reason: string | null;
  } | null;
}) {
  const [scenario, setScenario] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startDemo() {
    setBusy(true);
    setError("");
    try {
      const { caseId } = await createDemoCase();
      go(`/room/${caseId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The demo could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { jobId } = await createCase({
        scenario,
        difficulty,
        mediaTier: "standard",
      });
      go(`/creating/${jobId}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Case generation is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => go("/")}
          aria-label="AI Mystery Room home"
        >
          <span className="brand-mark">
            <Search size={20} />
          </span>
          <span>
            AI MYSTERY <b>ROOM</b>
          </span>
        </button>
        <span className="topbar-note">
          <LockKeyhole size={14} /> PRIVATE CASE FILE
        </span>
      </header>
      <section className="hero page-width">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> YOUR NEXT CASE IS WAITING
          </p>
          <h1>
            Every detail
            <br />
            has a <em>reason.</em>
          </h1>
          <p className="hero-lede">
            Step into a fictional investigation. Read the evidence, question the
            timeline, and decide who did it.
          </p>
          <div className="hero-meta">
            <span>
              <UserRound size={15} /> 3-5 suspects
            </span>
            <span>
              <FileText size={15} /> 6–8 exhibits
            </span>
            <span>
              <Clock3 size={15} /> One sitting
            </span>
          </div>
        </div>
        <div className="case-stamp" aria-hidden="true">
          <span>CASE FILE</span>
          <b>NO. 001</b>
          <i>UNSOLVED</i>
        </div>
      </section>
      <section className="composer-wrap page-width">
        <form
          className="composer panel"
          onSubmit={(event) => void submitScenario(event)}
        >
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Set the scene</h2>
              <p>What happened? Keep it fictional.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="scenario">
            YOUR MYSTERY PREMISE
          </label>
          <textarea
            id="scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            placeholder="A priceless watch disappears during a family reunion…"
            minLength={30}
            maxLength={600}
            rows={3}
          />
          <div className="field-foot">
            <span>30–600 characters · Fictional scenarios only</span>
            <span>{scenario.length}/600</span>
          </div>
          <div className="form-row">
            <div className="difficulty-control">
              <span className="field-label">DIFFICULTY</span>
              <div className="segmented" role="group" aria-label="Difficulty">
                {["easy", "medium", "hard"].map((item) => (
                  <button
                    type="button"
                    className={difficulty === item ? "selected" : ""}
                    key={item}
                    onClick={() => setDifficulty(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mode-control">
              <span className="field-label">AI CASE GENERATION</span>
              <div className="mode-pill">
                <ShieldCheck size={16} />
                {localModel?.available
                  ? "Model ready"
                  : localModel
                    ? "Model needed"
                    : "Checking…"}
                <span>{localModel?.available ? "READY" : "SETUP"}</span>
              </div>
              <small>
                {localModel?.available
                  ? `${localModel.model} · AI text generation`
                  : (localModel?.reason ?? "Checking AI provider…")}
              </small>
            </div>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p className="generation-notice" role="status">
            Case text uses the server-configured AI provider. Photo exhibits are
            schematic illustrations and CCTV is text-only.
          </p>
          <button
            className="primary-button full-width"
            type="submit"
            disabled={busy || scenario.trim().length < 30}
          >
            {busy ? "Starting generation…" : "Create my mystery"}{" "}
            <ArrowRight size={17} />
          </button>
          <div className="or-divider">
            <span>OR START RIGHT AWAY</span>
          </div>
          <button
            className="demo-button"
            type="button"
            onClick={() => void startDemo()}
            disabled={busy}
          >
            <Sparkles size={16} /> Play the seeded demo{" "}
            <ChevronRight size={16} />
          </button>
          <p className="demo-caption">
            A complete, fixed mystery · No AI calls or account needed
          </p>
        </form>
        <aside className="side-note">
          <div className="note-icon">
            <CircleHelp size={18} />
          </div>
          <h3>How it works</h3>
          <ol>
            <li>
              <span>1</span>Review the case and suspects
            </li>
            <li>
              <span>2</span>Compare evidence and timelines
            </li>
            <li>
              <span>3</span>Make one final accusation
            </li>
          </ol>
          <div className="privacy-note">
            <LockKeyhole size={14} /> Guest session · no signup
          </div>
        </aside>
      </section>
      <footer className="site-footer page-width">
        <span>FICTIONAL INVESTIGATION EXPERIENCE</span>
        <span>DEMO MEDIA IS CLEARLY LABELED</span>
      </footer>
    </main>
  );
}

function GenerationStatus({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<{
    step: string;
    progressPercent: number;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const job = await getGenerationJob(jobId);
        if (!active) return;
        setStatus({ step: job.step, progressPercent: job.progressPercent });
        if (job.status === "ready" && job.caseId) {
          go(`/room/${job.caseId}`);
          return;
        }
        if (job.status === "failed") {
          const messages: Record<string, string> = {
            GEMINI_BUSY:
              "Google Gemini is temporarily busy. Please try again in a few minutes.",
            GEMINI_QUOTA_EXCEEDED:
              "The Gemini project has reached its quota. Check quota in Google AI Studio or try later.",
            GEMINI_MODEL_UNAVAILABLE:
              "The configured Gemini model is unavailable. Update GEMINI_TEXT_MODEL on the server.",
            GEMINI_ACCESS_DENIED:
              "Gemini rejected access. Check the server API key and its project permissions.",
            GEMINI_REQUEST_INVALID:
              "Gemini rejected the generation request. The server configuration needs attention.",
            GEMINI_REQUEST_FAILED:
              "Could not reach Gemini. Check the internet connection and try again.",
            LOCAL_MODEL_UNAVAILABLE:
              "The configured AI provider is unavailable. Check the server configuration and home-page status.",
            LOCAL_MODEL_FAILED:
              "The AI provider could not finish this case. Try again or play the seeded demo.",
            INVALID_GENERATED_CASE:
              "The AI provider could not create a consistent case after two repairs. Try a simpler fictional premise.",
          };
          setError(
            messages[job.errorCode ?? ""] ??
              "AI case generation failed. Please try again.",
          );
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (reason) {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The generation status could not be loaded.",
        );
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return (
    <main className="loading-screen generation-screen">
      <div className="note-icon">
        <Sparkles size={20} />
      </div>
      <p className="eyebrow">AI MYSTERY GENERATION</p>
      <h1>
        {error ? "This case needs attention." : "Writing your case file…"}
      </h1>
      <p>
        {error ||
          "The AI provider is creating and checking the mystery. This can take a few minutes."}
      </p>
      {!error && (
        <div className="generation-progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Case generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status?.progressPercent ?? 0}
          >
            <span style={{ width: `${status?.progressPercent ?? 0}%` }} />
          </div>
          <span>
            {status?.step === "saving_case"
              ? "Saving validated case…"
              : "Drafting and validating the mystery…"}
          </span>
        </div>
      )}
      {error && (
        <button className="primary-button" onClick={() => go("/")}>
          Back to the lobby <ArrowRight size={16} />
        </button>
      )}
      <p className="demo-caption">
        Case text uses the configured AI provider. No video is generated.
      </p>
    </main>
  );
}

function CaseRoom({
  caseId,
  onResult,
  onHome,
}: {
  caseId: string;
  onResult: () => void;
  onHome: () => void;
}) {
  const [mystery, setMystery] = useState<PublicCaseDTO | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSuspect, setSelectedSuspect] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const hintLock = useRef(false);
  const hintKey = useRef<string | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const evidence = useMemo(
    () =>
      mystery?.evidence.find((item) => item.evidenceId === selectedId) ??
      mystery?.evidence[0],
    [mystery, selectedId],
  );
  const suspectUnderReview = mystery?.suspects.find(
    (suspect) => suspect.suspectId === selectedSuspect,
  );

  useEffect(() => {
    let active = true;
    void getCase(caseId)
      .then((data) => {
        if (!active) return;
        setMystery(data);
        setHints(data.hintsRevealed);
        setSelectedId(data.evidence[0]?.evidenceId ?? "");
        const first = data.evidence[0];
        if (first && !data.verdictSubmitted)
          void discoverClue(caseId, first.evidenceId)
            .then((updated) => {
              if (active) setMystery(updated);
            })
            .catch(() => {});
        setSelectedSuspect("");
        const saved = localStorage.getItem(`mystery-note-${caseId}`);
        if (saved) setNote(saved);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Case could not be loaded.",
        ),
      )
      .finally(() => setBusy(false));
    return () => {
      active = false;
    };
  }, [caseId]);

  async function revealHint() {
    if (hintLock.current) return;
    hintLock.current = true;
    setHintBusy(true);
    hintKey.current ??= crypto.randomUUID();
    try {
      const hint = await requestHint(caseId, hintKey.current);
      setHints((current) => [...current, hint.hintText]);
      setMystery((current) =>
        current ? { ...current, hintCount: hint.hintCount } : current,
      );
      hintKey.current = null;
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Hint is unavailable.",
      );
    } finally {
      hintLock.current = false;
      setHintBusy(false);
    }
  }

  async function submitVerdict() {
    try {
      await accuse(caseId, selectedSuspect, bookmarks);
      onResult();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your accusation could not be submitted.",
      );
      setConfirm(false);
    }
  }

  function toggleBookmark(id: string) {
    setBookmarks((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  if (busy)
    return <main className="loading-screen">Opening the evidence locker…</main>;
  if (error && !mystery) return <ErrorPage message={error} onHome={onHome} />;
  if (!mystery) return null;

  return (
    <main className="room-page">
      <header className="topbar room-topbar">
        <button className="wordmark" onClick={onHome}>
          <span className="brand-mark">
            <Search size={20} />
          </span>
          <span>
            AI MYSTERY <b>ROOM</b>
          </span>
        </button>
        <div className="room-top-meta">
          <span>CASE ROOM</span>
          <span>·</span>
          <span>{mystery.difficulty.toUpperCase()}</span>
        </div>
        <button
          className="text-button"
          onClick={() => {
            if (
              window.confirm(
                "Leave this case? Your local notes remain in this browser.",
              )
            )
              onHome();
          }}
        >
          <ArrowLeft size={15} /> Exit
        </button>
      </header>
      <section className="room-heading page-width">
        <p className="eyebrow">
          CASE FILE <span>/</span> {caseId.slice(-8).toUpperCase()}
        </p>
        <h1>{mystery.title}</h1>
        <p>{mystery.intro}</p>
        <div className="fiction-banner">
          <ShieldCheck size={16} /> {mystery.generatedMediaDisclosure}
        </div>
      </section>
      <div className="room-layout page-width">
        <aside className="evidence-panel panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">THE CASE FILE</p>
              <h2>Evidence</h2>
            </div>
            <span className="count-badge">
              {mystery.discoveredEvidenceIds.length}/{mystery.evidence.length}
            </span>
          </div>
          <div className="evidence-list" role="list">
            {mystery.evidence.map((item, index) => (
              <button
                key={item.evidenceId}
                className={`evidence-row ${selectedId === item.evidenceId ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(item.evidenceId);
                  void discoverClue(caseId, item.evidenceId)
                    .then(setMystery)
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Could not discover clue.",
                      ),
                    );
                }}
                role="listitem"
              >
                <span className="evidence-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="evidence-icon">
                  <EvidenceIcon type={item.type} />
                </span>
                <span className="evidence-name">
                  <b>{item.title}</b>
                  <small>
                    {item.type.toUpperCase()} ·{" "}
                    {formatTime(item.occurredAt, mystery.settingTimeZone)}
                  </small>
                </span>
                {bookmarks.includes(item.evidenceId) && (
                  <Bookmark
                    className="bookmark-small"
                    size={14}
                    fill="currentColor"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="panel-divider" />
          <div className="suspect-heading">
            <div>
              <p className="eyebrow">PERSONS OF INTEREST</p>
              <h2>Suspects</h2>
            </div>
            <span className="count-badge">{mystery.suspects.length}</span>
          </div>
          <div className="suspect-list">
            {mystery.suspects.map((suspect) => (
              <button
                key={suspect.suspectId}
                className={`suspect-row ${selectedSuspect === suspect.suspectId ? "chosen" : ""}`}
                onClick={() => setSelectedSuspect(suspect.suspectId)}
              >
                <span className="suspect-avatar">
                  {suspect.name
                    .split(" ")
                    .map((word) => word[0])
                    .join("")}
                </span>
                <span>
                  <b>{suspect.name}</b>
                  <small>{suspect.role}</small>
                </span>
                {selectedSuspect === suspect.suspectId && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="suspect-statement" aria-live="polite">
            <p className="eyebrow">STATEMENT</p>
            <b>
              {suspectUnderReview?.relationshipToCase ??
                "Select a suspect to review their statement."}
            </b>
            {suspectUnderReview && (
              <p>“{suspectUnderReview.visibleStatement}”</p>
            )}
            <small>
              Selecting a suspect does not submit your final accusation.
            </small>
          </div>
        </aside>
        <section className="detail-column">
          {evidence && (
            <EvidenceDetail
              evidence={evidence}
              zone={mystery.settingTimeZone}
              bookmarked={bookmarks.includes(evidence.evidenceId)}
              onBookmark={() => toggleBookmark(evidence.evidenceId)}
              localGenerated={
                mystery.generatedMediaDisclosure === LocalGenerationDisclosure
              }
            />
          )}
          <section className="panel notebook-panel">
            <div className="section-heading compact">
              <span className="note-icon">
                <FileText size={17} />
              </span>
              <div>
                <h2>Private notes</h2>
                <p>Saved only in this browser. Never sent to AI.</p>
              </div>
            </div>
            <textarea
              aria-label="Private case notes"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                localStorage.setItem(
                  `mystery-note-${caseId}`,
                  event.target.value,
                );
              }}
              placeholder="Track your timeline, questions, or theories…"
              rows={3}
            />
            <div className="notebook-foot">
              <span>PRIVATE · LOCAL TO THIS DEVICE</span>
              <span>{bookmarks.length} bookmarked</span>
            </div>
          </section>
          <section className="action-strip">
            <div className="hint-area">
              <div className="hint-heading">
                <CircleHelp size={17} />
                <b>Need a nudge?</b>
                <span>
                  {mystery.hintCount}/
                  {DIFFICULTY_RULES[mystery.difficulty].hints}
                </span>
              </div>
              {hints.map((hint, index) => (
                <p className="hint-card" key={`${index}-${hint}`}>
                  <span>HINT {index + 1}</span>
                  {hint}
                </p>
              ))}
              <button
                className="text-button hint-button"
                onClick={() => void revealHint()}
                disabled={
                  mystery.hintCount >=
                    DIFFICULTY_RULES[mystery.difficulty].hints || hintBusy
                }
              >
                {mystery.hintCount >= DIFFICULTY_RULES[mystery.difficulty].hints
                  ? "All hints revealed"
                  : hintBusy
                    ? "Opening hint…"
                    : "Reveal next hint"}{" "}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="verdict-area">
              <div>
                <p className="eyebrow">READY TO DECIDE?</p>
                <p>Your accusation is final.</p>
              </div>
              <button
                className="primary-button"
                onClick={() => setConfirm(true)}
                disabled={!selectedSuspect}
              >
                Make accusation <ArrowRight size={16} />
              </button>
            </div>
          </section>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      {confirm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirm(false);
          }}
        >
          <section
            className="confirm-dialog panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <p className="eyebrow">FINAL DECISION</p>
            <h2 id="confirm-title">
              Accuse{" "}
              {
                mystery.suspects.find(
                  (suspect) => suspect.suspectId === selectedSuspect,
                )?.name
              }
              ?
            </h2>
            <p>
              You can submit one accusation for this case. Afterward, the
              solution and score will be revealed.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setConfirm(false)}
              >
                Keep investigating
              </button>
              <button
                className="primary-button"
                onClick={() => void submitVerdict()}
                disabled={!selectedSuspect}
              >
                Submit final verdict <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function EvidenceDetail({
  evidence,
  zone,
  bookmarked,
  onBookmark,
  localGenerated,
}: {
  evidence: Evidence;
  zone: string;
  bookmarked: boolean;
  onBookmark: () => void;
  localGenerated: boolean;
}) {
  return (
    <article className="panel evidence-detail">
      <div className="detail-topline">
        <span className="type-chip">
          <EvidenceIcon type={evidence.type} /> {evidence.type.toUpperCase()}
        </span>
        <button
          className={`icon-button ${bookmarked ? "is-bookmarked" : ""}`}
          onClick={onBookmark}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark evidence"}
        >
          <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
        </button>
      </div>
      <p className="eyebrow exhibit-id">
        EXHIBIT {evidence.evidenceId.replace("ev_", "")}
      </p>
      <h2>{evidence.title}</h2>
      <p className="evidence-description">{evidence.description}</p>
      <div className="exhibit-content">
        {evidence.type === "chat" &&
          evidence.chat.messages.map((message) => (
            <div className="chat-message" key={message.messageId}>
              <div>
                <b>{message.senderName}</b>
                <time>{formatTime(message.sentAt, zone)}</time>
              </div>
              <p>{message.text}</p>
            </div>
          ))}
        {(evidence.type === "document" || evidence.type === "witness") && (
          <blockquote>{evidence.recordText}</blockquote>
        )}
        {evidence.type === "cctv" && (
          <div className="cctv-card">
            <div className="cctv-screen">
              <Film size={28} />
              <span>
                {localGenerated
                  ? "TEXT-ONLY CCTV · NO VIDEO"
                  : "DEMO RECORD · VIDEO NOT INCLUDED"}
              </span>
              <small>{formatTime(evidence.occurredAt, zone)}</small>
            </div>
            <p>
              <b>Accessible observation</b>
              <br />
              {evidence.cctv.transcript}
            </p>
          </div>
        )}
        {evidence.type === "photo" && localGenerated && (
          <LocalEvidenceIllustration
            evidenceId={evidence.evidenceId}
            description={evidence.description}
          />
        )}
        {evidence.type === "photo" && !localGenerated && (
          <div
            className="photo-placeholder"
            role="img"
            aria-label={evidence.description}
          >
            <Image size={32} />
            <span>ILLUSTRATIVE DEMO PLACEHOLDER</span>
            <small>Not an AI-generated image</small>
          </div>
        )}
      </div>
      <div className="detail-footer">
        <span>
          <Clock3 size={14} /> {formatTime(evidence.occurredAt, zone)}
        </span>
        <span>SIMULATED CASE RECORD</span>
      </div>
    </article>
  );
}

function LocalEvidenceIllustration({
  evidenceId,
  description,
}: {
  evidenceId: string;
  description: string;
}) {
  const variant = Number(evidenceId.replace(/\D/g, "")) % 3;
  return (
    <figure className={`local-illustration illustration-${variant}`}>
      <svg
        viewBox="0 0 640 260"
        role="img"
        aria-label={`Schematic illustration. ${description}`}
      >
        <rect
          x="24"
          y="24"
          width="592"
          height="212"
          rx="4"
          fill="#192a31"
          stroke="#6b654d"
        />
        <path
          d="M56 202V88l96-42 96 42v114M400 202V82h156v120M48 202h544"
          fill="none"
          stroke="#b48b57"
          strokeWidth="4"
        />
        <path
          d="M87 201v-70h48v70m147 0V96h64v105M427 110h42v40h-42zM489 110h42v40h-42z"
          fill="#263b40"
          stroke="#d3ab6e"
          strokeWidth="3"
        />
        {variant === 0 ? (
          <>
            <circle cx="326" cy="155" r="36" fill="#8f734d" />
            <circle cx="326" cy="155" r="27" fill="#1b2930" />
            <path
              d="M326 128v28l18 13"
              fill="none"
              stroke="#ebc483"
              strokeWidth="4"
            />
          </>
        ) : variant === 1 ? (
          <>
            <path
              d="M260 180l70-84 70 84z"
              fill="#7c6042"
              stroke="#e2bb79"
              strokeWidth="4"
            />
            <circle cx="330" cy="154" r="16" fill="#d9b477" />
          </>
        ) : (
          <>
            <rect
              x="281"
              y="115"
              width="98"
              height="72"
              rx="5"
              fill="#6c5740"
              stroke="#d6b77e"
              strokeWidth="4"
            />
            <path
              d="M298 133h64m-64 17h48m-48 17h55"
              stroke="#ead6ad"
              strokeWidth="4"
            />
          </>
        )}
      </svg>
      <figcaption>
        <span>LOCAL SCHEMATIC</span>
        <small>Code-drawn illustration · not a photograph or AI image</small>
      </figcaption>
    </figure>
  );
}

function ResultPage({
  caseId,
  onHome,
}: {
  caseId: string;
  onHome: () => void;
}) {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof getResult>
  > | null>(null);
  const [mystery, setMystery] = useState<PublicCaseDTO | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([getResult(caseId), getCase(caseId)])
      .then(([caseResult, caseData]) => {
        setResult(caseResult);
        setMystery(caseData);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "The result could not be opened.",
        ),
      );
  }, [caseId]);

  if (error) return <ErrorPage message={error} onHome={onHome} />;
  if (!result || !mystery)
    return <main className="loading-screen">Unsealing the final report…</main>;
  const culprit = mystery.suspects.find(
    (suspect) => suspect.suspectId === result.correctSuspectId,
  );
  return (
    <main className="result-page min-h-screen">
      <header className="topbar page-width">
        <button className="wordmark" onClick={onHome}>
          <span className="brand-mark">
            <Search size={20} />
          </span>
          <span>
            AI MYSTERY <b>ROOM</b>
          </span>
        </button>
        <span className="topbar-note">CASE CLOSED</span>
      </header>
      <section className="result-hero page-width">
        <div className="result-seal">
          <Check size={26} />
        </div>
        <p className="eyebrow">
          FINAL REPORT · {result.isCorrect ? "SOLVED" : "CASE REVEALED"}
        </p>
        <h1>
          {result.isCorrect
            ? "Well observed."
            : "The clues tell another story."}
        </h1>
        <p>
          The person responsible was <strong>{culprit?.name}</strong>.
        </p>
        <div className="score-card">
          <span>YOUR SCORE</span>
          <b>{result.score}</b>
          <small>{result.hintsUsed} hints used</small>
        </div>
      </section>
      <section className="result-content page-width">
        <article className="panel explanation-panel">
          <p className="eyebrow">THE DEDUCTION</p>
          <h2>How the evidence fits</h2>
          <p>{result.explanation}</p>
          <div className="proof-list">
            {result.proofChain.map((step, index) => {
              const exhibit = mystery.evidence.find(
                (item) => item.evidenceId === step.evidenceId,
              );
              return (
                <div className="proof-step" key={step.evidenceId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{exhibit?.title ?? step.evidenceId}</b>
                    <p>{step.inference}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="panel red-herring-panel">
          <p className="eyebrow">ALTERNATIVE LEADS</p>
          <h2>What misled you</h2>
          {result.redHerrings.map((item) => (
            <p className="red-herring-item" key={item.evidenceId}>
              <b>
                {
                  mystery.evidence.find(
                    (exhibit) => exhibit.evidenceId === item.evidenceId,
                  )?.title
                }
              </b>
              {item.explanation}
            </p>
          ))}
        </article>
      </section>
      <div className="result-footer page-width">
        <p>All characters and evidence are fictional.</p>
        <button className="primary-button" onClick={onHome}>
          Start a new mystery <ArrowRight size={16} />
        </button>
      </div>
    </main>
  );
}

function ErrorPage({
  message,
  onHome,
}: {
  message: string;
  onHome?: () => void;
}) {
  return (
    <main className="error-screen">
      <div className="error-icon">
        <CircleHelp size={25} />
      </div>
      <p className="eyebrow">CASE FILE UNAVAILABLE</p>
      <h1>We couldn't open this file.</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={onHome ?? (() => go("/"))}>
        Return to the lobby <ArrowRight size={16} />
      </button>
    </main>
  );
}
