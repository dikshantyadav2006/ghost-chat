import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { SignalClientEvents, SignalServerEvents } from "@ghost/protocol";
import { SignalHub, registerHealthRoute } from "./hub.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3003")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: corsOrigins });

  const io = new Server<SignalClientEvents, SignalServerEvents>(app.server, {
    cors: { origin: corsOrigins },
    serveClient: false,
  });

  const hub = new SignalHub(io, undefined, process.env.ROOMS_FILE || undefined);
  registerHealthRoute(app, hub);

  await app.listen({ port, host });
}

void main();
