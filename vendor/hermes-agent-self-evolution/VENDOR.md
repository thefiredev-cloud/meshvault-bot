# Vendored: Hermes Agent Self-Evolution (MIT skill-improve)

Pinned commit: `0a929e3aa20e15cf04dc7c28492a7d41a5139125`  
Source: https://github.com/NousResearch/hermes-agent-self-evolution  
License: MIT © 2026 Nous Research, as stated in upstream `README.md` and `pyproject.toml` (the upstream tree has no root `LICENSE` file).

Taken:

- `evolution/skills/` — skill-file load / evolve entry (Phase 1, MIT)
- `evolution/__init__.py`, `README.md`, `pyproject.toml`

Not taken:

- `evolution/code` Darwinian evolver path (upstream marks Darwinian Evolver as AGPL v3, external CLI only)

Mesh Bot ports the MIT skill-improve gates (size, no mid-conversation mutation, semantic purpose) in TypeScript. This snapshot does not run DSPy/GEPA and does not invent API keys.
