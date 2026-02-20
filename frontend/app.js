const form = document.getElementById('create-run-form');
const runStatus = document.getElementById('run-status');
const responseEl = document.getElementById('response');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const imageRef = data.get('image_ref');
  const allowedTools = String(data.get('allowed_tools') || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const toolName = String(data.get('tool_name') || '').trim();

  let toolInput = {};
  try {
    toolInput = JSON.parse(String(data.get('tool_input') || '{}'));
  } catch {
    responseEl.textContent = 'Invalid JSON in tool input.';
    return;
  }

  runStatus.textContent = 'Creating run...';
  responseEl.textContent = '-';

  try {
    const createRes = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image_ref: imageRef,
        allowed_tools: allowedTools,
        network_policy_profile: 'deny-all',
      }),
    });

    const createBody = await createRes.json();
    if (!createRes.ok) throw new Error(JSON.stringify(createBody));

    const runId = createBody.run_id;
    runStatus.textContent = `Run created: ${runId}. Invoking tool...`;

    const invokeRes = await fetch(`/api/runs/${runId}/tools/${encodeURIComponent(toolName)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: toolInput }),
    });
    const invokeBody = await invokeRes.json();

    const statusRes = await fetch(`/api/runs/${runId}`);
    const statusBody = await statusRes.json();

    runStatus.textContent = `Run ${runId}: ${statusBody.status}`;
    responseEl.textContent = JSON.stringify({ create: createBody, invoke: invokeBody, status: statusBody }, null, 2);
  } catch (error) {
    runStatus.textContent = 'Error';
    responseEl.textContent = String(error.message || error);
  }
});
