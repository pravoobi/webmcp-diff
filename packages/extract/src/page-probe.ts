/**
 * Browser-side probe. Shipped as a source string (not a transpiled function) so
 * bundler helpers like esbuild's `__name` never leak into `page.evaluate`.
 *
 * Evaluates to a {@link ProbeResult}. Reads the registered WebMCP tool list from
 * whichever surface is available and augments it with a DOM scan of declarative
 * form tools — so they are still reported where the polyfill doesn't materialize
 * them, and so we can label `source` and detect `toolautosubmit`.
 */
export interface ProbeTool {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations: Record<string, unknown>;
}

export interface ProbeResult {
  surface:
    | "document.modelContext"
    | "navigator.modelContext"
    | "navigator.modelContextTesting"
    | "none";
  tools: ProbeTool[];
  declarativeNames: string[];
  autoSubmitNames: string[];
}

export const PROBE_SCRIPT = /* js */ `(async () => {
  const doc = document;
  const nav = navigator;

  let surface = "none";
  let rawTools = [];
  if (doc.modelContext && typeof doc.modelContext.getTools === "function") {
    surface = "document.modelContext";
    rawTools = await doc.modelContext.getTools();
  } else if (nav.modelContext && typeof nav.modelContext.getTools === "function") {
    surface = "navigator.modelContext";
    rawTools = await nav.modelContext.getTools();
  } else if (nav.modelContextTesting && typeof nav.modelContextTesting.listTools === "function") {
    surface = "navigator.modelContextTesting";
    rawTools = nav.modelContextTesting.listTools();
  }

  const tools = rawTools.map((t) => {
    const o = t || {};
    let inputSchema = o.inputSchema;
    if (typeof inputSchema === "string") {
      try { inputSchema = JSON.parse(inputSchema); } catch (e) { inputSchema = undefined; }
    }
    return {
      name: String(o.name || ""),
      description: String(o.description || ""),
      inputSchema: inputSchema || { type: "object", properties: {} },
      annotations: (o.annotations && typeof o.annotations === "object") ? o.annotations : {},
    };
  });

  function synthesizeSchema(form) {
    const properties = {};
    const required = [];
    const seen = new Set();
    const controls = Array.prototype.slice.call(form.elements);
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      const name = c.name || "";
      if (!name || seen.has(name)) continue;
      if (c instanceof HTMLInputElement && ["submit", "button", "image", "reset"].indexOf(c.type) !== -1) continue;
      seen.add(name);
      let schema = { type: "string" };
      if (c instanceof HTMLSelectElement) {
        schema = { type: "string", enum: Array.prototype.slice.call(c.options).map((o) => o.value) };
      } else if (c instanceof HTMLInputElement) {
        if (c.type === "number" || c.type === "range") schema = { type: "number" };
        else if (c.type === "checkbox") schema = { type: "boolean" };
      }
      const desc = c.getAttribute && c.getAttribute("toolparamdescription");
      if (desc) schema.description = desc;
      properties[name] = schema;
      if (c.required) required.push(name);
    }
    const out = { type: "object", properties: properties };
    if (required.length) out.required = required;
    return out;
  }

  const declarativeNames = [];
  const autoSubmitNames = [];
  const byName = {};
  for (let i = 0; i < tools.length; i++) byName[tools[i].name] = tools[i];

  const forms = Array.prototype.slice.call(document.querySelectorAll("form[toolname][tooldescription]"));
  for (let i = 0; i < forms.length; i++) {
    const el = forms[i];
    const name = (el.getAttribute("toolname") || "").trim();
    if (!name) continue;
    declarativeNames.push(name);
    if (el.hasAttribute("toolautosubmit")) autoSubmitNames.push(name);
    if (!byName[name]) {
      tools.push({
        name: name,
        description: (el.getAttribute("tooldescription") || "").trim(),
        inputSchema: synthesizeSchema(el),
        annotations: {},
      });
    }
  }

  return { surface: surface, tools: tools, declarativeNames: declarativeNames, autoSubmitNames: autoSubmitNames };
})()`;
