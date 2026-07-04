import type { AgentEvent } from "@/lib/agent/types";

export type AgentEventWriter = {
  send(event: AgentEvent): void;
};

export function createAgentEventStream(
  writeEvents: (writer: AgentEventWriter) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer: AgentEventWriter = {
        send(event) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        },
      };

      try {
        await writeEvents(writer);
      } catch {
        writer.send({
          type: "error",
          message: "Agent review failed before completion.",
        });
      } finally {
        controller.close();
      }
    },
  });
}
