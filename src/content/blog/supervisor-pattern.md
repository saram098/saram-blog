---
title: "Stop Building One Big Agent: The Supervisor Pattern for Production LLM Systems"
description: "One agent with twenty tools looks clean in a demo and falls apart in production. Here is the supervisor pattern we use instead, with Semantic Kernel code."
pubDate: 2026-09-22
tags: ["agents", "semantic-kernel", "azure-ai", "architecture"]
cover: "/images/post-01-supervisor.png"
---

Every agentic AI project I have seen starts the same way. One agent, one system prompt, one growing list of tools. It works beautifully in the demo. Then you add the ninth tool and the agent starts calling the wrong one. You add a tenth and it stops calling any of them.

This is not a prompt engineering problem. It is an architecture problem, and it has a well understood fix.

## Why the single agent breaks

The failure has three causes, and they compound.

**Tool selection degrades with tool count.** The model picks from your tool list using the tool names and descriptions in context. At five tools this is easy. At twenty, several tools have overlapping descriptions and the model has to make a judgment call on every turn. Accuracy drops, and it drops non-linearly.

**The system prompt becomes a contract nobody can honour.** When one agent handles billing questions, order tracking, refunds and escalation, its prompt has to encode the rules for all four. Those rules conflict. The refund policy says never refund after 30 days; the retention playbook says make exceptions for high value customers. You end up with a 2000 token prompt of edge cases, and the model applies the wrong branch roughly as often as you would expect.

**You cannot evaluate it.** When a single agent handles five jobs and accuracy is 82 percent, that number tells you nothing actionable. Which job is failing? You cannot tell, so you cannot fix it.

## The supervisor pattern

Split the work. One supervisor agent does routing and nothing else. Specialist agents do one job each, with a short prompt and three to five tools.

```
                    ┌─────────────┐
    user turn ─────▶│ Supervisor  │
                    │  (routing   │
                    │   only)     │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   Orders    │  │  Billing    │  │ Escalation  │
   │  3 tools    │  │  4 tools    │  │  2 tools    │
   └─────────────┘  └─────────────┘  └─────────────┘
```

The supervisor has no business tools at all. Its only job is to read the turn and hand off. That constraint is what makes it reliable: a model choosing between four clearly distinct specialists is doing a much easier task than a model choosing between twenty overlapping tools.

## Implementation with Semantic Kernel

Semantic Kernel's agent framework maps onto this directly. Here is the shape.

```python
from semantic_kernel import Kernel
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

kernel = Kernel()
kernel.add_service(AzureChatCompletion(
    deployment_name="gpt-4o",
    endpoint=AZURE_OPENAI_ENDPOINT,
    api_key=AZURE_OPENAI_KEY,
))

orders_agent = ChatCompletionAgent(
    kernel=kernel,
    name="orders",
    instructions=(
        "You handle order status and delivery questions only. "
        "Look up the order, report its status and expected delivery. "
        "If the customer asks about money, say you are handing off to billing."
    ),
    plugins=[OrderLookupPlugin(), DeliveryPlugin(), TrackingPlugin()],
)

billing_agent = ChatCompletionAgent(
    kernel=kernel,
    name="billing",
    instructions=(
        "You handle invoices, charges and refund eligibility only. "
        "Never approve a refund yourself. State eligibility and the amount, "
        "then hand off to escalation for approval."
    ),
    plugins=[InvoicePlugin(), ChargesPlugin(), RefundPolicyPlugin(), PaymentMethodPlugin()],
)
```

Note what the instructions do. Each one says what the agent handles, and just as importantly, where its authority ends. The billing agent is explicitly forbidden from approving refunds. That boundary lives in a 40 token prompt instead of buried in paragraph nine of a monolith.

The supervisor looks like this:

```python
SUPERVISOR_INSTRUCTIONS = """
Route the customer's message to exactly one specialist. Do not answer yourself.

orders     - order status, delivery dates, tracking, shipping problems
billing    - invoices, charges, refund eligibility, payment methods
escalation - refund approval, complaints, anything a specialist handed off
general    - greetings, thanks, anything outside the three above

Respond with only the specialist name.
"""

supervisor = ChatCompletionAgent(
    kernel=kernel,
    name="supervisor",
    instructions=SUPERVISOR_INSTRUCTIONS,
    plugins=[],
)

ROUTES = {
    "orders": orders_agent,
    "billing": billing_agent,
    "escalation": escalation_agent,
    "general": general_agent,
}

async def handle(message: str, thread):
    decision = await supervisor.get_response(messages=message, thread=thread)
    target = ROUTES.get(decision.content.strip().lower(), general_agent)
    return await target.get_response(messages=message, thread=thread)
```

Four routes, mutually exclusive, described in one line each. This is a classification task the model is extremely good at, which is the entire point.

## The three things that actually matter in production

The pattern above is the easy part. These are the parts that decide whether it survives contact with real traffic.

### 1. Shared state, not shared context

The naive implementation passes the full conversation history to every specialist. That reintroduces the context bloat you just escaped. Instead, keep a structured state object that every agent reads and writes, and give each specialist only the last few turns plus that state.

```python
@dataclass
class ConversationState:
    customer_id: str
    order_ids: list[str]
    verified: bool
    handoff_reason: str | None
    resolution: str | None
```

The specialist gets the state, not the transcript. Token cost stays flat as the conversation grows, and handoffs carry intent explicitly instead of hoping the next agent infers it from history.

### 2. Route once, then commit

A supervisor that re-routes on every turn will ping-pong. The customer asks about their order, gets routed to orders, then says "and why was I charged twice", and now you are mid-turn switching agents while the orders agent has an open tool call.

Route on the first turn of a topic and stay there. Let the specialist explicitly signal a handoff when it decides the topic has changed. The specialist knows more about whether it can handle the turn than the supervisor does.

### 3. Evaluate per route

This is the payoff. Once work is split, you can measure each route independently.

```python
ROUTE_EVAL_SETS = {
    "orders": load_cases("evals/orders.jsonl"),
    "billing": load_cases("evals/billing.jsonl"),
    "escalation": load_cases("evals/escalation.jsonl"),
}
```

Now "accuracy is 82 percent" becomes "routing is 96 percent, orders is 94 percent, billing is 71 percent". Billing is the problem, and you can go fix billing without touching anything else. That is the difference between a system you can improve and a system you can only rewrite.

## What this costs you

Two supervisor turns per conversation instead of one agent turn. In practice the routing call is cheap: a short prompt, a one word completion, and you can run it on a smaller and faster deployment than the specialists. The latency cost is typically a few hundred milliseconds, and you usually win it back because the specialists have far less context to process.

The real cost is engineering discipline. Four agents means four prompts, four eval sets and four sets of tools to maintain. If your system genuinely does one job with four tools, do not do this. The pattern earns its complexity somewhere around the point where you have three distinct job families or more than eight tools.

## When to reach for it

Use the supervisor pattern when you can name three or more distinct job families in your system, when tool count is past eight and selection accuracy is visibly degrading, or when your system prompt has grown branches that contradict each other.

Stay with a single agent when the job is genuinely one thing. Most systems that fail with one agent were never one thing to begin with, and the demo just did not reveal it yet.

---

*Saram Hai is CTO of The Botss, where he builds agentic AI systems in production. Find him on [LinkedIn](https://linkedin.com/in/saram-hai-ai).*
