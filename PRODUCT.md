# MeshVault

Status: active build. Product-facing name: MeshVault. Company: MeshVault.

## Purpose

MeshVault is a private agent work surface for running bots on computers the owner controls. It preserves MeshVault's Windows-authoritative runtime and native companion work.

## Product contract

- Match Grok Bot's public interaction model: bots, chats, computers, routines, plugins, take control, and action prompts where a tool requires them.
- Do not add a separate approval dashboard, approval levels, or a second policy system.
- Keep model choice visible per bot and support cloud and local providers through explicit connections.
- Keep SaaS access behind Composio. Do not put reusable connector credentials in the browser bundle.
- Treat network reachability and MeshVault device pairing as separate states.

## Host boundaries

- Windows owns durable bot runtime, state, plugins, backups, and the vault master.
- Mac desktop owns development, Apple builds, and agent browsing.
- MacBook Air and phones are client and command surfaces.
- DGX Spark and ASUS GX10 are inference-only.

## Visual direction

Quiet, compact, and operational. Use the MeshVault node mark, graphite neutrals, restrained motion, and one clear action per view. Keep a simple bot-first information architecture.

## Acceptance

The complete product is accepted only when a real phone can start a bot task, the Windows-owned computer visibly executes it, the desktop can take control, evidence returns to the same thread, and the task survives a restart. Repository tests and mock data do not prove that loop.

## Current slice

This branch establishes provenance, MeshVault identity, a buildable web package, a Docker context that excludes local secrets, and a bounded 3D Brain surface. It also implements owner-scoped personal Composio MCP OAuth plus separate native pairing and Meshnet states, and the fleet gateway model lane (`MESHVAULT_GATEWAY_URL`, `MESHVAULT_GATEWAY_KEY`, and `MESHVAULT_GATEWAY_MODELS` register an OpenAI-compatible endpoint as a provider). Proven locally 2026-08-14: signup, gateway model connect, bot creation, gateway-generated interview, Docker computer provisioning, a file written by the bot, and a thread answer from Grok through the fleet LiteLLM gateway. The live SPKI-pinned Windows Brain reader, Windows WSL computers, native packaging, real Composio sign-in, physical phone pairing, and cross-device restart acceptance remain open.
