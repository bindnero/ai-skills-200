# 09 · AI & Agents

Building systems that call language models and act on the result — reliably, at a cost that makes sense, and without handing an attacker the keys.

25 skills. Each row links to the bundle — read it before doing the work it describes.

## Instructions

Getting the model to do the right thing reliably.

| Skill | Use it when |
| --- | --- |
| [`prompt-engineering`](../skills/ai-agents/prompt-engineering/SKILL.md) | Crafts and iterates production prompts with few-shot examples, CoT/ToT reasoning scaffolds, XML or delimiter-based structure, and token-level diffing. Use when a prompt underperforms, when output format or instruction-following drifts, or when you need to A/B test prompt variants against an eval set. |
| [`system-prompt-design`](../skills/ai-agents/system-prompt-design/SKILL.md) | Authors durable system prompts as structured operating manuals with precedence-ordered rules, identity blocks, tool policy sections, and output contracts. Use when creating a new production system prompt, when editing an agent's persona or tool-use policy, or when system prompt rules are being silently ignored. |
| [`structured-output-enforcement`](../skills/ai-agents/structured-output-enforcement/SKILL.md) | Forces machine-parseable LLM output via strict JSON Schema, constrained decoding, grammar constraints, and repair loops. Use when output must be parsed by code without failure, when building agent actions as structured objects, or when JSON parsing breaks intermittently. |
| [`function-schema-design`](../skills/ai-agents/function-schema-design/SKILL.md) | Designs function and tool schemas with descriptive naming, flat typed parameters, enums, defaults, and token-lean definitions. Use when authoring API tool definitions for an agent, when a tool is mis-selected, or when the tool list is inflating prompt tokens. |
| [`hallucination-mitigation`](../skills/ai-agents/hallucination-mitigation/SKILL.md) | Reduces fabricated facts with grounded citation requirements, abstention policies, retrieval-backed verification, and confidence-aware routing. Use when agents invent citations, cite documents that do not exist, or state facts with no basis in the source material. |

## Agent design

The loop, the tools, and the orchestration.

| Skill | Use it when |
| --- | --- |
| [`agent-architecture`](../skills/ai-agents/agent-architecture/SKILL.md) | Structures LLM agents as a loop of perceive-decide-act-observe with bounded tool budgets, typed state, and explicit termination conditions. Use when deciding whether to build an agent at all, when picking single-agent versus pipeline versus supervisor topologies, or when an agent loops, stalls, or never terminates. |
| [`tool-calling-design`](../skills/ai-agents/tool-calling-design/SKILL.md) | Builds tool definitions and execution loops with strict JSON Schema parameters, parallel-call batching, typed results, and tool-result truncation. Use when wiring an agent to external APIs, when tools are called wrongly or not at all, or when you need to reduce round trips per task. |
| [`multi-agent-orchestration`](../skills/ai-agents/multi-agent-orchestration/SKILL.md) | Coordinates teams of specialized agents with supervisor routing, blackboard shared state, handoff protocols, and per-agent concurrency limits. Use when one agent cannot hold every tool and policy, when splitting work across domain specialists, or when sub-agents conflict or duplicate effort. |
| [`agent-memory-systems`](../skills/ai-agents/agent-memory-systems/SKILL.md) | Implements agent memory across working scratchpads, episodic logs, semantic stores, and retrieval policies with decay and consolidation. Use when an assistant must remember past sessions, when long-term facts need to be recalled accurately, or when stored memories start conflicting. |
| [`human-in-the-loop-workflows`](../skills/ai-agents/human-in-the-loop-workflows/SKILL.md) | Designs approval gates, confidence thresholds, edit-and-resume handoffs, and durable pause states for agent actions. Use when an agent must stop for approval before acting, when confidence-based auto-execution is needed, or when human edits must be reflected back into agent state. |
| [`autonomous-agent-workflows`](../skills/ai-agents/autonomous-agent-workflows/SKILL.md) | Runs long-horizon agents with durable queues, resumable checkpoints, retry and backoff policy, budget ceilings, and idempotent side effects. Use when building agents that work for hours across many steps, or when long-running jobs must survive restarts without duplicating work. |
| [`context-window-management`](../skills/ai-agents/context-window-management/SKILL.md) | Budgets and prunes agent context using compaction, structured note-taking, retrieval-on-demand, and turn summarization with token accounting. Use when context grows too large to fit, when performance degrades mid-conversation, or when "lost in the middle" recall failures appear. |

## Retrieval

Getting the right text in front of the model.

| Skill | Use it when |
| --- | --- |
| [`rag-pipeline-design`](../skills/ai-agents/rag-pipeline-design/SKILL.md) | Builds retrieval-augmented generation pipelines covering ingestion, query rewriting, hybrid search, reranking, and grounded answer generation with citations. Use when building a knowledge-base chatbot, connecting a LLM to private documents, or diagnosing answers that miss or fabricate document content. |
| [`embedding-strategies`](../skills/ai-agents/embedding-strategies/SKILL.md) | Selects and operates embedding models covering dimension choice, Matryoshka truncation, domain fine-tuning, batch throughput, and embedding-drift monitoring. Use when choosing a vector model, when chunk vectors need rebuilding after a model change, or when similarity scores stop discriminating. |
| [`vector-index-selection`](../skills/ai-agents/vector-index-selection/SKILL.md) | Chooses and operates vector search indexes across HNSW, IVF-PQ, disk-backed, and managed services, tuning ef_search, nprobe, filters, and recall-latency tradeoffs. Use when picking a vector database, when p99 search latency misses target, or when filtered search returns fewer results than expected. |
| [`chunking-strategies`](../skills/ai-agents/chunking-strategies/SKILL.md) | Splits documents into retrievable units using structure-aware, semantic, and late-chunking methods with tuned size and overlap. Use when setting chunk size or overlap, when a chunk starts mid-argument, or when retrieval returns fragments that lose context. |

## Operating it

Cost, quality measurement, and model choice.

| Skill | Use it when |
| --- | --- |
| [`llm-cost-optimization`](../skills/ai-agents/llm-cost-optimization/SKILL.md) | Reduces LLM spend with prompt caching, model routing by difficulty, batch APIs, quantization, and per-workload budget accounting. Use when inference cost or latency breaches budget, or when planning spend for a production agent workload. |
| [`llm-evaluation`](../skills/ai-agents/llm-evaluation/SKILL.md) | Builds and runs LLM eval suites with graded rubrics, pairwise model-graded comparison, deterministic graders, and statistical significance checks. Use when changing a model, prompt, or retrieval setup and needing evidence it helped, or when quality has regressed in production. |
| [`model-selection-strategy`](../skills/ai-agents/model-selection-strategy/SKILL.md) | Selects and routes between frontier, mid-tier, small, and specialized models using capability tiers, eval-driven benchmarks, latency budgets, and fallback chains. Use when choosing a model for a workload, when a model upgrade is proposed, or when building a multi-model routing strategy. |
| [`llm-debugging`](../skills/ai-agents/llm-debugging/SKILL.md) | Diagnoses LLM failures by capturing full traces, classifying failure modes, bisecting prompt and model changes, and inspecting token and tool-call state. Use when output quality drops unexpectedly, when agents loop or stall, or when a regression appears after a model or prompt change. |
| [`streaming-ui-patterns`](../skills/ai-agents/streaming-ui-patterns/SKILL.md) | Implements LLM streaming in interfaces using SSE, partial JSON rendering, tool-call streaming, cancellation, and reconnectable streams. Use when building chat or agent interfaces, when showing incremental output, or when streams disconnect mid-response. |

## Safety

Keeping the model inside its boundaries.

| Skill | Use it when |
| --- | --- |
| [`agent-safety-guardrails`](../skills/ai-agents/agent-safety-guardrails/SKILL.md) | Constrains agent behaviour with layered input, output, tool, and action guardrails plus refusal and escalation policies. Use when an agent touches production data, money, or external systems, when defining what the agent must refuse, or when compliance requires auditable controls. |
| [`prompt-injection-defense`](../skills/ai-agents/prompt-injection-defense/SKILL.md) | Defends LLM agents against prompt injection from web pages, retrieved documents, tool output, and files using taint tracking, trust separation, and output validation. Use when agents browse or read user-supplied content, when indirect injection payloads are suspected, or when designing untrusted-content pipelines. |

## Extending agents

Giving an agent new capabilities and teaching it new tricks.

| Skill | Use it when |
| --- | --- |
| [`agent-skill-authoring`](../skills/ai-agents/agent-skill-authoring/SKILL.md) | Authors agent skills with progressive disclosure using SKILL.md frontmatter, layered references, and trigger-precise descriptions. Use when writing or editing a SKILL.md for an agent, when a skill never triggers, or when skills bloat context. |
| [`mcp-server-design`](../skills/ai-agents/mcp-server-design/SKILL.md) | Builds Model Context Protocol servers exposing typed tools, resources, and prompts with stdio or HTTP transport and session handling. Use when publishing tools to MCP clients, when debugging capability negotiation, or when exposing internal APIs to an agent runtime. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
