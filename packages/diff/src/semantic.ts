import type { SemanticJudge } from "./types.js";

export interface ClaudeSemanticOptions {
  /** Defaults to `process.env.WEBMCP_SEMANTIC_MODEL` or `claude-opus-5`. */
  model?: string;
  /** Defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
}

const SYSTEM = `You compare two descriptions of the SAME software tool: an old one and a new one.
Decide whether the described *behavior or effect* changed — e.g. it now also writes data,
adds a side effect, changes what it targets, or changes safety-relevant scope.
Pure rewording, clarification, typo fixes, and formatting are NOT behavior changes.
Respond with a compact JSON object: {"behaviorChanged": boolean, "rationale": string (<=200 chars)}.`;

/**
 * LLM-assisted description-drift detector. Runs only on tools whose description
 * text changed, so cost stays near zero. Requires `@anthropic-ai/sdk` to be
 * installed (an optional dependency) and an API key.
 */
export function createClaudeSemanticJudge(opts: ClaudeSemanticOptions = {}): SemanticJudge {
  const model = opts.model ?? process.env.WEBMCP_SEMANTIC_MODEL ?? "claude-opus-5";
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;

  let clientPromise:
    | Promise<{ messages: { create: (body: unknown) => Promise<unknown> } }>
    | undefined;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = (async () => {
        // Indirect specifier so TypeScript doesn't require the optional dep at build time.
        const specifier = "@anthropic-ai/sdk";
        let mod: { default: new (o: unknown) => unknown };
        try {
          mod = (await import(specifier)) as unknown as {
            default: new (o: unknown) => unknown;
          };
        } catch {
          throw new Error(
            "--semantic needs the '@anthropic-ai/sdk' package. Install it: npm i @anthropic-ai/sdk",
          );
        }
        if (!apiKey) throw new Error("--semantic needs ANTHROPIC_API_KEY to be set");
        const Anthropic = mod.default;
        return new Anthropic({ apiKey }) as {
          messages: { create: (body: unknown) => Promise<unknown> };
        };
      })();
    }
    return clientPromise;
  };

  return async ({ tool, before, after }) => {
    const client = await getClient();
    const response = (await client.messages.create({
      model,
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Tool: ${tool}\n\nOLD description:\n${before}\n\nNEW description:\n${after}`,
        },
      ],
    })) as { content: Array<{ type: string; text?: string }> };

    const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
    const match = text.match(/\{[\s\S]*\}/);
    try {
      const parsed = JSON.parse(match ? match[0] : text) as {
        behaviorChanged?: boolean;
        rationale?: string;
      };
      return {
        behaviorChanged: parsed.behaviorChanged === true,
        rationale: parsed.rationale ?? "",
      };
    } catch {
      return { behaviorChanged: false, rationale: "semantic judge returned unparseable output" };
    }
  };
}
