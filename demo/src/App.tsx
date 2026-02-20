import { useCallback, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { JSBSimSdk } from "@sdk";

type ScenarioFile = {
  runtimePath: string;
  publicPath: string;
};

type FlightStage = "launch" | "burnout" | "coast" | "apogee" | "descent" | "landing";

type StageState = Record<FlightStage, boolean>;
type StageTimes = Partial<Record<FlightStage, number>>;

type ScenarioManifest = {
  scenario: string;
  model: string;
  scriptPath: string;
  telemetry: {
    altitudeFt: string;
    verticalVelocityFps: string;
    verticalAccelerationFps2: string;
    thrustProperty: string;
  };
  rocket: {
    thrustLbf: number;
    burnDurationSec: number;
    launchDelaySec: number;
    touchdownAltitudeFt: number;
  };
  files: ScenarioFile[];
};

type TelemetrySample = {
  time: number;
  altitude: number;
  velocity: number;
  acceleration: number;
};

const LOOP_INTERVAL_MS = 50;
const MAX_SAMPLES = 280;
const SCENARIO_MANIFEST_PATH = "/scenario/hobby-rocket/manifest.json";

const STAGE_SEQUENCE: FlightStage[] = [
  "launch",
  "burnout",
  "coast",
  "apogee",
  "descent",
  "landing",
];

const STAGE_LABELS: Record<FlightStage, string> = {
  launch: "Launch",
  burnout: "Burnout",
  coast: "Coast",
  apogee: "Apogee",
  descent: "Descent",
  landing: "Landing",
};

function createStageState(): StageState {
  return {
    launch: false,
    burnout: false,
    coast: false,
    apogee: false,
    descent: false,
    landing: false,
  };
}

function formatNumber(value: number, precision = 2): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(precision);
}

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === "string" || typeof error === "number" || typeof error === "boolean") {
    return String(error);
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return "Unknown error";
}

function formatTimeTick(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return `${numeric.toFixed(1)}s`;
}

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export default function App() {
  const sdkRef = useRef<JSBSimSdk | null>(null);
  const baselineAltitudeRef = useRef(0);
  const launchStartTimeRef = useRef<number | null>(null);
  const latestSampleRef = useRef<TelemetrySample | null>(null);
  const stageStateRef = useRef<StageState>(createStageState());
  const stageTimesRef = useRef<StageTimes>({});

  const [manifest, setManifest] = useState<ScenarioManifest | null>(null);
  const [status, setStatus] = useState("Preparing rocket simulation...");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchConsumed, setLaunchConsumed] = useState(false);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [currentStage, setCurrentStage] = useState<FlightStage | null>(null);
  const [stageState, setStageState] = useState<StageState>(createStageState());
  const [stageTimes, setStageTimes] = useState<StageTimes>({});

  const resetStageWidget = useCallback(() => {
    const freshState = createStageState();
    stageStateRef.current = freshState;
    stageTimesRef.current = {};
    setStageState(freshState);
    setStageTimes({});
    setCurrentStage(null);
  }, []);

  const completeStage = useCallback((stage: FlightStage, time: number) => {
    if (stageStateRef.current[stage]) {
      return;
    }

    const nextState = {
      ...stageStateRef.current,
      [stage]: true,
    };

    const nextTimes = {
      ...stageTimesRef.current,
      [stage]: time,
    };

    stageStateRef.current = nextState;
    stageTimesRef.current = nextTimes;

    setStageState(nextState);
    setStageTimes(nextTimes);
    setCurrentStage(stage);
  }, []);

  const appendSample = useCallback((sample: TelemetrySample) => {
    latestSampleRef.current = sample;

    setSamples((previous) => {
      const next = [...previous, sample];
      if (next.length <= MAX_SAMPLES) {
        return next;
      }

      return next.slice(next.length - MAX_SAMPLES);
    });
  }, []);

  const readTelemetry = useCallback(
    (sdk: JSBSimSdk, scenario: ScenarioManifest): TelemetrySample => {
      const time = sdk.getSimTime();
      const rawAltitude = sdk.getPropertyValue(scenario.telemetry.altitudeFt);
      const velocity = sdk.getPropertyValue(scenario.telemetry.verticalVelocityFps);
      const acceleration = sdk.getPropertyValue(scenario.telemetry.verticalAccelerationFps2);
      const altitude = rawAltitude - baselineAltitudeRef.current;

      return {
        time,
        altitude,
        velocity,
        acceleration,
      };
    },
    [],
  );

  const bootstrapScenario = useCallback(async () => {
    setLoading(true);
    setRunning(false);
    setLaunched(false);
    setLaunchConsumed(false);
    setStatus("Loading preconfigured hobby rocket...");

    launchStartTimeRef.current = null;
    latestSampleRef.current = null;
    resetStageWidget();

    if (sdkRef.current) {
      sdkRef.current.destroy();
      sdkRef.current = null;
    }

    try {
      const manifestResponse = await fetch(withBase(SCENARIO_MANIFEST_PATH));
      if (!manifestResponse.ok) {
        throw new Error(`Unable to load scenario manifest (${manifestResponse.status}).`);
      }

      const nextManifest = (await manifestResponse.json()) as ScenarioManifest;
      const sdk = await JSBSimSdk.create({
        moduleUrl: withBase("/wasm/jsbsim_wasm.mjs"),
        wasmUrl: withBase("/wasm/jsbsim_wasm.wasm"),
      });

      sdk.configurePaths({
        rootDir: "/runtime",
        aircraftPath: "aircraft",
        enginePath: "engine",
        systemsPath: "systems",
        outputPath: "output",
      });

      for (const file of nextManifest.files) {
        const bytes = await fetchBytes(withBase(file.publicPath));
        console.log(`Wrote ${bytes.length} bytes to ${file.runtimePath}`);
        sdk.writeDataFile(file.runtimePath, bytes);
      }

      const loaded = sdk.loadScript(nextManifest.scriptPath);
      if (!loaded) {
        throw new Error(`Failed to load scenario script: ${nextManifest.scriptPath}`);
      }

      if (!sdk.runIc()) {
        throw new Error("Failed to initialize the rocket scenario.");
      }

      sdk.setPropertyValue(nextManifest.telemetry.thrustProperty, 0);

      baselineAltitudeRef.current = sdk.getPropertyValue(nextManifest.telemetry.altitudeFt);

      const firstSample = readTelemetry(sdk, nextManifest);

      sdkRef.current = sdk;
      setManifest(nextManifest);
      setSamples([firstSample]);
      latestSampleRef.current = firstSample;

      setStatus("Rocket ready on launch rail. Press Launch.");
      setLoading(false);
      setRunning(false);
    } catch (error) {
      console.error("Demo startup failed", error);
      setStatus(`Startup failed: ${formatStartupError(error)}`);
      setLoading(false);
      setRunning(false);
      setLaunched(false);
      setLaunchConsumed(false);
    }
  }, [readTelemetry, resetStageWidget]);

  const startLaunch = useCallback(() => {
    const sdk = sdkRef.current;
    if (!sdk || !manifest || loading || launchConsumed) {
      return;
    }

    launchStartTimeRef.current = sdk.getSimTime() + manifest.rocket.launchDelaySec;
    setLaunchConsumed(true);
    setLaunched(true);
    setRunning(true);
    setStatus("Launch sequence armed.");
  }, [launchConsumed, loading, manifest]);

  const runStep = useCallback(() => {
    const sdk = sdkRef.current;
    if (!sdk || !manifest) {
      return;
    }

    const launchStart = launchStartTimeRef.current;

    if (launched && launchStart !== null) {
      const elapsed = sdk.getSimTime() - launchStart;
      const thrust =
        elapsed >= 0 && elapsed <= manifest.rocket.burnDurationSec ? manifest.rocket.thrustLbf : 0;
      sdk.setPropertyValue(manifest.telemetry.thrustProperty, thrust);
    }

    const previousSample = latestSampleRef.current;
    const keepRunning = sdk.run();
    const sample = readTelemetry(sdk, manifest);
    appendSample(sample);

    if (!keepRunning) {
      setRunning(false);
      setLaunched(false);
      setStatus("Simulation reached script end.");
      return;
    }

    if (!launched || launchStart === null) {
      return;
    }

    const elapsed = sample.time - launchStart;

    if (elapsed >= 0) {
      completeStage("launch", sample.time);
    }

    if (elapsed > manifest.rocket.burnDurationSec) {
      completeStage("burnout", sample.time);
    }

    if (stageStateRef.current.burnout && sample.velocity > 0) {
      completeStage("coast", sample.time);
    }

    let apogeeDetected = false;
    if (
      stageStateRef.current.coast &&
      !stageStateRef.current.apogee &&
      previousSample &&
      previousSample.velocity > 0 &&
      sample.velocity <= 0
    ) {
      completeStage("apogee", sample.time);
      apogeeDetected = true;
    }

    if (stageStateRef.current.apogee && sample.velocity < -0.5) {
      completeStage("descent", sample.time);
    }

    const touchedDown =
      elapsed > manifest.rocket.burnDurationSec + 0.8 &&
      sample.altitude <= manifest.rocket.touchdownAltitudeFt &&
      sample.velocity <= 0;

    if (touchedDown) {
      sdk.setPropertyValue(manifest.telemetry.thrustProperty, 0);
      completeStage("descent", sample.time);
      completeStage("landing", sample.time);
      setRunning(false);
      setLaunched(false);
      setStatus("Landing detected. Press Reload to launch again.");
      return;
    }

    if (elapsed < 0) {
      setStatus("Countdown...");
      return;
    }

    if (!stageStateRef.current.burnout) {
      setStatus("Boost phase.");
      return;
    }

    if (apogeeDetected) {
      setStatus("Apogee reached.");
      return;
    }

    if (!stageStateRef.current.apogee) {
      setStatus("Coasting after burnout.");
      return;
    }

    setStatus("Descent phase.");
  }, [appendSample, completeStage, launched, manifest, readTelemetry]);

  useEffect(() => {
    void bootstrapScenario();

    return () => {
      if (sdkRef.current) {
        sdkRef.current.destroy();
        sdkRef.current = null;
      }
    };
  }, [bootstrapScenario]);

  useEffect(() => {
    if (!running || loading || !manifest || !sdkRef.current) {
      return;
    }

    const timer = window.setInterval(() => {
      runStep();
    }, LOOP_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loading, manifest, runStep, running]);

  const latest = samples.at(-1);

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="kicker">JSBSim WASM Demo</p>
        <h1>Hobby Rocket Launch</h1>
        <p className="copy">
          Press Launch to ignite a preloaded model rocket. The demo tracks altitude, vertical
          velocity, and vertical acceleration from liftoff through burnout and touchdown.
        </p>
      </header>

      <section className="panel controls">
        <div className="status-line">
          <strong>Status:</strong>
          <span>{status}</span>
        </div>

        <div className="button-row">
          <button onClick={startLaunch} disabled={loading || !manifest || launchConsumed}>
            Launch
          </button>
          <button
            onClick={() => setRunning((value) => !value)}
            disabled={loading || !manifest || !launchConsumed || (!launched && !running)}
          >
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={() => void bootstrapScenario()} disabled={loading}>
            Reload
          </button>
        </div>
      </section>

      <section className="panel stage-panel">
        <h2>Flight Stage</h2>
        <div className="stage-grid">
          {STAGE_SEQUENCE.map((stage) => {
            const completed = stageState[stage];
            const isCurrent = currentStage === stage;
            const stamp = stageTimes[stage];

            return (
              <article
                key={stage}
                className={`stage-chip ${completed ? "completed" : "pending"} ${isCurrent ? "current" : ""}`}
              >
                <p className="stage-name">{STAGE_LABELS[stage]}</p>
                <p className="stage-meta">
                  {completed ? `${formatNumber(stamp ?? Number.NaN, 2)} s` : "waiting"}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <h2>Sim Time</h2>
          <p>{formatNumber(latest?.time ?? Number.NaN, 2)} s</p>
        </article>
        <article className="metric-card">
          <h2>Altitude</h2>
          <p>{formatNumber(latest?.altitude ?? Number.NaN, 1)} ft</p>
        </article>
        <article className="metric-card">
          <h2>Velocity</h2>
          <p>{formatNumber(latest?.velocity ?? Number.NaN, 1)} ft/s</p>
        </article>
        <article className="metric-card">
          <h2>Acceleration</h2>
          <p>{formatNumber(latest?.acceleration ?? Number.NaN, 1)} ft/s^2</p>
        </article>
      </section>

      <section className="panel charts">
        <h2>Telemetry Stream</h2>
        <p className="subtle">Samples: {samples.length}</p>

        <div className="chart-stack">
          <div className="chart-card">
            <h3>Altitude (ft)</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={samples}
                  syncId="telemetry-time"
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 32, 32, 0.14)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatTimeTick}
                    stroke="#425a58"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#425a58" tick={{ fontSize: 12 }} width={64} />
                  <Tooltip labelFormatter={(value) => `t=${formatTimeTick(value)}`} />
                  <Line
                    type="monotone"
                    dataKey="altitude"
                    stroke="#ea580c"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Vertical Velocity (ft/s)</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={samples}
                  syncId="telemetry-time"
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 32, 32, 0.14)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatTimeTick}
                    stroke="#425a58"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#425a58" tick={{ fontSize: 12 }} width={64} />
                  <Tooltip labelFormatter={(value) => `t=${formatTimeTick(value)}`} />
                  <Line
                    type="monotone"
                    dataKey="velocity"
                    stroke="#0f766e"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <h3>Vertical Acceleration (ft/s^2)</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={samples}
                  syncId="telemetry-time"
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 32, 32, 0.14)" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={formatTimeTick}
                    stroke="#425a58"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#425a58" tick={{ fontSize: 12 }} width={64} />
                  <Tooltip labelFormatter={(value) => `t=${formatTimeTick(value)}`} />
                  <Line
                    type="monotone"
                    dataKey="acceleration"
                    stroke="#0369a1"
                    strokeWidth={2.4}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
