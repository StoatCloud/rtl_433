const byId = (id) => document.getElementById(id);

function asInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function renderSwitchRows(state) {
  const discovered = Object.values(state.discovered ?? {});
  const adopted = state.adopted ?? {};
  if (!discovered.length) {
    return "<tr><td colspan='6'>No switches discovered yet.</td></tr>";
  }

  return discovered
    .map((sw) => {
      const adoptedEntry = adopted[sw.payload];
      return `<tr>
        <td><code>${sw.payload}</code></td>
        <td>${sw.pressCount}</td>
        <td>${sw.rawCount}</td>
        <td>${sw.confidence}</td>
        <td>${sw.bits.join(", ")}</td>
        <td>${adoptedEntry ? `Adopted as <strong>${adoptedEntry.name}</strong>` : "Not adopted"}</td>
      </tr>`;
    })
    .join("");
}

async function refreshState() {
  const state = await window.kineticApi.getState();
  byId("state-json").textContent = JSON.stringify(state, null, 2);
  byId("discovered-table-body").innerHTML = renderSwitchRows(state);
}

async function runAnalysis() {
  byId("analysis-output").textContent = "Running analysis...";
  try {
    const result = await window.kineticApi.runAnalysis({
      frequency: asInt(byId("analysis-frequency").value, 433920000),
      durationSeconds: asInt(byId("analysis-duration").value, 30),
      binaryPath: byId("binary-path").value || "rtl_433"
    });
    byId("analysis-output").textContent = JSON.stringify(result, null, 2);
    if (result.recommendation?.decoder) {
      byId("discovery-decoder").value = result.recommendation.decoder;
      byId("export-decoder").value = result.recommendation.decoder;
    }
    await refreshState();
  } catch (error) {
    byId("analysis-output").textContent = `Error: ${error.message}`;
  }
}

async function runDiscovery() {
  byId("discovery-output").textContent = "Running discovery...";
  try {
    const result = await window.kineticApi.runDiscovery({
      frequency: asInt(byId("discovery-frequency").value, 433920000),
      durationSeconds: asInt(byId("discovery-duration").value, 60),
      sampleRate: asInt(byId("discovery-sample-rate").value, 250000),
      decoder: byId("discovery-decoder").value,
      binaryPath: byId("binary-path").value || "rtl_433"
    });
    byId("discovery-output").textContent = JSON.stringify(result, null, 2);
    await refreshState();
  } catch (error) {
    byId("discovery-output").textContent = `Error: ${error.message}`;
  }
}

async function adoptSwitch() {
  byId("adopt-output").textContent = "Saving adoption...";
  try {
    const result = await window.kineticApi.adoptSwitch({
      payload: byId("adopt-payload").value,
      name: byId("adopt-name").value
    });
    byId("adopt-output").textContent = JSON.stringify(result, null, 2);
    await refreshState();
  } catch (error) {
    byId("adopt-output").textContent = `Error: ${error.message}`;
  }
}

async function exportHa() {
  byId("export-output").textContent = "Generating bundle...";
  try {
    const result = await window.kineticApi.exportHaBundle({
      frequency: asInt(byId("export-frequency").value, 433920000),
      decoder: byId("export-decoder").value,
      mqttUrl: byId("export-mqtt-url").value,
      mqttEventTopic: byId("export-mqtt-topic").value
    });
    byId("export-output").textContent = JSON.stringify(result, null, 2);
    await refreshState();
  } catch (error) {
    byId("export-output").textContent = `Error: ${error.message}`;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  byId("run-analysis").addEventListener("click", runAnalysis);
  byId("run-discovery").addEventListener("click", runDiscovery);
  byId("adopt-switch").addEventListener("click", adoptSwitch);
  byId("export-ha").addEventListener("click", exportHa);
  await refreshState();
});
