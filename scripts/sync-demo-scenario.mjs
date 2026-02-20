#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarioName = "hobby-rocket";
const scenarioBaseDir = path.join(rootDir, "demo/public/scenario");
const scenarioRoot = path.join(scenarioBaseDir, scenarioName);

const modelXml = `<?xml version="1.0"?>
<fdm_config name="Hobby Rocket" version="2.0" release="PRODUCTION"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="http://jsbsim.sourceforge.net/JSBSim.xsd">

  <fileheader>
    <author>JSBSim WASM Demo</author>
    <filecreationdate>2026-02-18</filecreationdate>
    <version>1.0</version>
    <description>Simple hobby rocket for launch, burnout, and ballistic descent.</description>
  </fileheader>

  <metrics>
    <wingarea unit="FT2">0.12</wingarea>
    <wingspan unit="FT">0.30</wingspan>
    <chord unit="FT">2.80</chord>
    <htailarea unit="FT2">0.0</htailarea>
    <htailarm unit="FT">0.0</htailarm>
    <vtailarea unit="FT2">0.0</vtailarea>
    <vtailarm unit="FT">0.0</vtailarm>
    <location name="AERORP" unit="IN">
      <x>0.0</x>
      <y>0.0</y>
      <z>0.0</z>
    </location>
    <location name="EYEPOINT" unit="IN">
      <x>0.0</x>
      <y>0.0</y>
      <z>0.0</z>
    </location>
    <location name="VRP" unit="IN">
      <x>0.0</x>
      <y>0.0</y>
      <z>0.0</z>
    </location>
  </metrics>

  <mass_balance>
    <ixx unit="SLUG*FT2">0.02</ixx>
    <iyy unit="SLUG*FT2">0.08</iyy>
    <izz unit="SLUG*FT2">0.08</izz>
    <emptywt unit="LBS">4.5</emptywt>
    <location name="CG" unit="IN">
      <x>0.0</x>
      <y>0.0</y>
      <z>0.0</z>
    </location>
  </mass_balance>

  <ground_reactions>
    <contact type="BOGEY" name="LAUNCH_RAIL">
      <location unit="IN">
        <x>0.0</x>
        <y>0.0</y>
        <z>0.0</z>
      </location>
      <static_friction>0.0</static_friction>
      <dynamic_friction>0.0</dynamic_friction>
      <rolling_friction>0.0</rolling_friction>
      <spring_coeff unit="LBS/FT">900.0</spring_coeff>
      <damping_coeff unit="LBS/FT/SEC">240.0</damping_coeff>
      <max_steer unit="DEG">0.0</max_steer>
      <brake_group>NONE</brake_group>
      <retractable>0</retractable>
    </contact>
  </ground_reactions>

  <external_reactions>
    <property>propulsion/rocket_thrust</property>

    <force name="rocket" frame="INERTIAL">
      <function>
        <property>propulsion/rocket_thrust</property>
      </function>
      <location unit="FT">
        <x>0.0</x>
        <y>0.0</y>
        <z>0.0</z>
      </location>
      <direction>
        <x>0.0</x>
        <y>0.0</y>
        <z>-1.0</z>
      </direction>
    </force>
  </external_reactions>

  <propulsion/>

  <aerodynamics>
    <axis name="DRAG">
      <function name="aero/coefficient/CD">
        <description>Simple drag approximation</description>
        <product>
          <property>aero/qbar-psf</property>
          <property>metrics/Sw-sqft</property>
          <value>0.55</value>
        </product>
      </function>
    </axis>
  </aerodynamics>

</fdm_config>
`;

const initXml = `<?xml version="1.0"?>
<initialize name="launchpad">
  <ubody unit="FT/SEC">0.0</ubody>
  <vbody unit="FT/SEC">0.0</vbody>
  <wbody unit="FT/SEC">0.0</wbody>
  <latitude unit="DEG">47.0</latitude>
  <longitude unit="DEG">122.0</longitude>
  <phi unit="DEG">0.0</phi>
  <theta unit="DEG">0.0</theta>
  <psi unit="DEG">0.0</psi>
  <altitude unit="FT">4.0</altitude>
</initialize>
`;

const scriptXml = `<?xml version="1.0" encoding="UTF-8"?>
<runscript xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="http://jsbsim.sf.net/JSBSimScript.xsd"
    name="hobby rocket launch">
  <description>Hobby rocket launch, burnout, coast, and descent.</description>
  <use aircraft="hobby_rocket" initialize="launchpad"/>
  <run start="0.0" end="90" dt="0.02"/>
</runscript>
`;

const generatedFiles = [
  { runtimePath: "aircraft/hobby_rocket/hobby_rocket.xml", contents: modelXml },
  { runtimePath: "aircraft/hobby_rocket/launchpad.xml", contents: initXml },
  { runtimePath: "scripts/hobby_rocket_launch.xml", contents: scriptXml },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(runtimePath, contents) {
  const destination = path.join(scenarioRoot, runtimePath);
  ensureDir(path.dirname(destination));
  fs.writeFileSync(destination, contents, "utf8");
}

function main() {
  if (fs.existsSync(scenarioBaseDir)) {
    fs.rmSync(scenarioBaseDir, { recursive: true, force: true });
  }

  ensureDir(scenarioRoot);

  for (const file of generatedFiles) {
    writeTextFile(file.runtimePath, file.contents);
  }

  const files = generatedFiles.map((file) => ({
    runtimePath: file.runtimePath,
    publicPath: `/scenario/${scenarioName}/${file.runtimePath}`,
  }));

  const manifest = {
    scenario: "hobby-rocket-launch",
    model: "hobby_rocket",
    scriptPath: "scripts/hobby_rocket_launch.xml",
    telemetry: {
      altitudeFt: "position/h-sl-ft",
      verticalVelocityFps: "velocities/h-dot-fps",
      verticalAccelerationFps2: "accelerations/a-pilot-z-ft_sec2",
      thrustProperty: "propulsion/rocket_thrust",
    },
    rocket: {
      thrustLbf: 24,
      burnDurationSec: 2.2,
      launchDelaySec: 0.15,
      touchdownAltitudeFt: 0.5,
    },
    files,
  };

  fs.writeFileSync(
    path.join(scenarioRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`Synced demo scenario with ${files.length} files.\n`);
}

main();
