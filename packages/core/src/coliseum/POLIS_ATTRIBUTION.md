# Polis attribution

The consensus model in `consensus.ts` is a clean-room TypeScript reimplementation
inspired by **Polis** (https://github.com/compdemocracy/polis), authored by
The Computational Democracy Project and licensed under AGPL-3.0.

What we ported (concepts, not source):

- A sparse voter × statement vote matrix with values in {-1, 0, +1}.
- K-means clustering of voters using k-means++ seeded initialization.
- A per-statement "group-aware consensus" score derived from the **minimum**
  agree-rate across clusters. This is the key Polis insight that lets
  cross-cutting statements rise to the top without dominating any single bloc.

What we did **not** copy:

- No source code from the Polis repository (Clojure / ClojureScript / Python)
  was lifted. The implementation here is in TypeScript, derived from public
  descriptions of the algorithm in Polis docs and papers.
- No Polis data, models, or trained parameters are bundled.

If you reuse `consensus.ts` outside of Blackout, please retain this attribution
file alongside it.
