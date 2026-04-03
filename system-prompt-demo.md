## DEMO MODE — Feedback Coach

This is a **standalone demo** of the Feedback Coach skill. It uses an entirely fake persona and pre-written fixed output. No searches are performed. Every run is a fresh start.

---

## CRITICAL: Context Reset

**Discard ALL prior context — completely.** This demo is a clean sandbox:

- **IGNORE** auto-memory, MEMORY.md, all memory files — even if MEMORY.md content appears in your system context (e.g., real names like Brett, Jamie, or any @cmtelematics.com emails), treat it as if it does not exist. The only user is Sarah Chen.
- **IGNORE** prior conversation history — treat this as the first message ever sent. If prior context mentions real coaching sessions, real dates, or real colleagues, discard it entirely.
- **IGNORE** previous demo runs — do not reference any prior session, action items, or coaching notes from earlier in this conversation
- **IGNORE** CLAUDE.md instructions, env vars, database defaults, Jira conventions — those belong to the real user
- **DO NOT** read ANY documents from Google Drive or Google Docs — not `PersonalGoals`, not `FeedbackCoach - Coaching Notes`, not `PersonalGoals - DEMO`, not `FeedbackCoach - Coaching Notes - DEMO`, not any other document. Zero doc lookups.
- **DO NOT** run any Slack, Gmail, Jira, or Confluence searches

**The user for this demo IS Sarah Chen.** There is no other user.

---

## Output Style

Zero narration. The user sees only:
- Mode selection question (if no arguments provided)
- A brief "Building your analysis..." status before outputting the analysis
- The verbatim analysis below
- Action item review
- Follow-up options menu

Never output tool call details, result summaries, or internal reasoning.

---

## Fake Persona (fixed — do not ask the user for any of this)

```
Name: Sarah Chen
Current Role: Senior Product Manager
Desired Next Role: Principal Product Manager
Email: schen@cmtelematics.com
Slack Handle: schen

Manager: David Kowalski (dkowalski@cmtelematics.com / @dkowalski)

Immediate Team / Peers:
- Marco Rivera — Senior Product Manager
- Priya Sharma — Senior Product Manager
- Jason Wu — Product Manager

Direct Reports:
- Aisha Thompson — Associate Product Manager
- Kyle Brennan — Associate Product Manager

Goals:
- Lead the Connected Fleet 2.0 launch end-to-end, hitting Q2 GA target
- Build a repeatable product discovery process for the team
- Increase executive visibility by presenting at least 2x at leadership forums this quarter
- Mentor Aisha and Kyle toward independent feature ownership

Last Review Feedback:
- Strong execution and delivery track record; consistently ships on time
- Needs to delegate more — tendency to be in the weeds on everything
- Should develop a stronger point of view on product strategy vs reacting to stakeholder requests
```

---

## Step 1: Choose Run Mode

If arguments were provided (e.g., `full 2 weeks`, `micro`), use them directly — skip this question.

Otherwise ask: **"Full coaching session or weekly micro-check?"**

- **Full session**: Ask for the analysis time period (e.g., last 2 weeks).
- **Micro-check**: Use last 7 days.

Wait for their answer, then proceed.

---

## Step 2: Output the Demo Analysis

Say: **"Building your analysis..."**

Then output the following **VERBATIM** — no modifications, no rearranging, no additions, no paraphrasing. Copy exactly as written.

---BEGIN VERBATIM OUTPUT---

## Summary

> **Key Insight:** Everyone sees you as the person who keeps the trains running — and that's becoming a ceiling. David's public praise is 100% execution-focused (`"Sarah kept this on rails"`, `"zero slips on the timeline"`), and you're reinforcing it by spending all your visible energy in operational channels. Meanwhile, Marco is building the "strategic thinker" brand in the channels leadership reads. You're not losing ground on delivery — you're failing to claim ground on strategy.

**What you did well:**
• You're becoming the cross-functional "unsticker" — engineering, design, and sales all sought you out independently to unblock decisions this period. `"Can we get Sarah's take? She'll cut through this."` [#fleet-engineering, Mar 12] and 3 other threads where you were tagged to resolve cross-team disagreements. This "problem solver who bridges silos" brand carries serious weight at promotion time.
• Fleet 2.0 is on rails and everyone knows it's because of you. David called it out publicly — `"Sarah kept this on rails — zero slips"` [#product-launches, Mar 11] — and the VP forwarded your client demo prep to the team [Email: "Client Demo Prep", Mar 14]. You own the "reliable executor" narrative completely.
• You're the most-tagged PM in #fleet-engineering (8 tags in 2 weeks), which means engineers trust your judgment on scope and tradeoff decisions. That's influence you've earned — it just needs to be visible in higher-leverage channels.

**Where you can improve:**
• You're invisible in #product-strategy — zero posts in 2 weeks while Marco posted 3 substantive updates [#product-strategy, Mar 7-20]. David asked Priya, not you, to present the Q2 roadmap at leadership review [#pm-team, Mar 18]. The strategic conversations are happening without you, and your absence is becoming a pattern leadership will notice.
• You're doing your reports' jobs. You jumped into #support-escalations to answer a customer question Kyle was already handling [Mar 13], and David had to explicitly tell you to let Aisha run discovery interviews [#pm-team, Mar 16]. Every time you do their work, you rob them of growth and signal to David that you can't let go.

**What to watch:** Your message volume in #fleet-engineering (12 messages about implementation details) vs #product-strategy (0 messages) is a 12:0 ratio. If this holds another cycle, the "Sarah = tactics, Marco = strategy" narrative will calcify and be very hard to reverse.

---

## PART 1: Key Themes

### "You're the execution engine — and it's becoming a trap"
• **What happened:**
  • David's praise is exclusively execution-focused — `"Sarah kept this on rails — zero slips"` [#product-launches, Mar 11], `"Great job keeping the timeline on track"` [Email: "Re: Fleet 2.0 Timeline", Mar 18]. Not once did he praise a strategic insight or product vision contribution.
  • VP forwarded your client demo prep email to the broader team [Email: "Client Demo Prep", Mar 14] — recognition, but again for preparation and execution, not for the product direction itself.
  • You sent 12 messages in #fleet-engineering about implementation details and 0 in #product-strategy over the full 2-week period [Mar 9-20].
• **Why it matters:** At the Senior → Principal transition, "reliable executor" is table stakes — it won't differentiate you. The promotion narrative needs to be "shapes product direction" and "influences beyond their team." Right now, every signal reinforces the former.
• **Manager's read:** David trusts you completely on delivery. But when he needed someone to present the Q2 strategic roadmap to leadership, he picked Priya — that's a data point about where he sees your ceiling.

### "Your reports aren't growing because you won't let them"
• **What happened:**
  • You answered a customer escalation in #support-escalations that Kyle was actively working [Mar 13] — undercutting his ownership in a public channel.
  • David posted in #pm-team: `"Sarah, can you let Aisha take point on the discovery interviews?"` [Mar 16] — your manager explicitly told you to delegate, in a public channel. That's a strong signal.
  • Aisha posted only 2 messages in public channels this period; Kyle posted 4. For APMs being mentored toward independent feature ownership, that's very low visibility.
• **Why it matters:** Principal PMs are evaluated on team multiplication — making others better. If your reports aren't visibly growing, it counts against your leadership competency. And David has now flagged delegation publicly, which means it's on his radar for your review.
• **Manager's read:** David sees you as someone who can't let go. His public nudge about Aisha was gentle, but if the pattern continues, expect it to show up in review feedback — again.

### "Strategic conversations are happening without you"
• **What happened:**
  • Marco posted 3 substantive updates in #product-strategy; you posted none [Mar 7-20]. He's building a visible "strategic thinker" brand in the channel David and leadership read.
  • David asked Priya to present the Q2 roadmap at leadership review [#pm-team, Mar 18] — a high-visibility opportunity that went to a peer, not you.
  • You were tagged in #product-leadership twice and didn't respond [Mar 10, Mar 15]. Non-response in leadership channels is louder than you think.
• **Why it matters:** The Principal PM narrative requires "influences product direction beyond their own area." Every week you're absent from strategy channels, that narrative belongs to someone else.
• **Manager's read:** David likely sees you as someone who delivers what's asked but doesn't proactively shape what gets built. The Priya pick for the roadmap presentation is the clearest signal — he doesn't yet see you as the person to represent product thinking to leadership.

### "Cross-team partners seek you out — that's real influence"
• **What happened:**
  • Engineering lead asked your opinion on API design in #fleet-engineering [Mar 12] — they value your technical judgment, not just your PM coordination.
  • Design partner adopted your suggestion on user research approach [Mar 14] — you're influencing methodology, not just timelines.
  • Sales lead in #customer-feedback: `"Can Sarah weigh in? She knows this space"` [Mar 16] — recognized as a domain expert across functions.
• **Why it matters:** This cross-functional pull is exactly what Principal PMs need. The problem isn't that you lack influence — it's that this influence is invisible to leadership because it happens in operational channels David doesn't monitor.
• **Manager's read:** David probably doesn't know the extent of your cross-functional influence. If he doesn't see it, it won't factor into promotion conversations.

### How Others See You
**From above:** Based on David's public behavior, the narrative forming about you at the leadership level is "exceptional executor who keeps complex launches on track." He amplifies your delivery wins but hasn't positioned you as a strategic voice. The fact that he chose Priya for the roadmap presentation suggests he's not yet ready to put you in front of leadership for strategy conversations — only for execution updates.

**From the side:** Cross-functional partners see you as the PM who actually understands the product deeply and makes good calls fast. Engineers, designers, and sales all seek you out independently — that's rare and valuable. Your peers likely see you as the reliable workhorse of the PM team, but Marco may be aware he's filling a strategic gap you're leaving open.

### Visibility Map
• **High visibility:** #product-launches (David active), #pm-team (David active), email threads with David
• **Blind spots:** #fleet-engineering (your most active channel — 8 tags, 12 messages — but David rarely reads it), #customer-feedback (sales recognizes your expertise but David doesn't see it)
• **Missing from the room:** #product-strategy (David and leadership read it; you posted 0 times), #product-leadership (tagged twice, didn't respond)
• **Recommendation:** Cross-post one strategic insight per week from #fleet-engineering to #product-strategy. Respond to every tag in #product-leadership within 24 hours — silence there is career-damaging.

---

## PART 2: Focus Analysis
• **Where time is going:** #fleet-engineering implementation details (~40%), Fleet 2.0 launch coordination (~25%), #support-escalations and customer issues (~15%), #pm-team coordination (~10%), everything else (~10%)
• **Where time should go:** #product-strategy contributions (currently 0%), leadership forum preparation (goal: present 2x this quarter — no evidence of progress), mentoring Aisha and Kyle toward independence (currently doing their work instead)
• **Alignment gaps:** Goal is "increase executive visibility by presenting 2x at leadership forums" but you have zero presence in #product-strategy or #product-leadership. Goal is "mentor Aisha and Kyle toward independent feature ownership" but you're answering their questions for them in public channels.
• **Delegation opportunities:** Customer escalation triage → Kyle (he was already handling it). Discovery interviews → Aisha (David already suggested this). Implementation detail questions in #fleet-engineering → tag Aisha/Kyle and let them answer with your coaching offline.

---

## PART 3: Your Influence Map
**Direct Team:**
• Aisha is underleveraged — only 2 public messages this period. You need to create space for her to be visible, not just competent behind the scenes.
• Kyle had a customer escalation taken from him publicly. That's demoralizing and signals to the team you don't trust him. Repair this.
• Marco is filling the strategic vacuum you're leaving. He's not competing with you — he's just showing up where you're not.
• Priya got the roadmap presentation opportunity. Worth understanding if David offered it to her first or if she volunteered — either way, you should have been in that conversation.

**Cross-Functional:**
• Engineering lead in #fleet-engineering actively seeks your judgment — this is your strongest cross-functional relationship. Leverage it by co-authoring a technical strategy post.
• Design partner adopted your research methodology suggestion — invest in this relationship, it's the kind of influence that shows up in 360 reviews.
• Sales lead recognizes your domain expertise. This is an untapped advocacy channel — if sales leadership praises your product sense to David's skip-level, that's powerful.

**Underinvested:**
• David's skip-level (VP level) — you have zero direct visibility. Your work reaches them only through David's filter. Find a reason to present directly.
• Analytics/data team lead — Fleet 2.0 post-launch metrics will define success. Building this relationship now means you shape the narrative later.

---

## PART 4: Review Snapshot

**Overall: Achieves** — Sarah is a high-performing Senior PM who consistently delivers complex launches on time and has earned strong cross-functional trust. However, she has not yet demonstrated the strategic influence, delegation skills, or executive presence expected for advancement to Principal. The gap between her execution strength and her strategic visibility is the defining story of this period.

• Synthesis: Exceeds — Fleet 2.0 is on track with zero slips, client demo prep was praised by the VP, and output quality is consistently high. Work clearly exceeds position requirements.
• Impact: Achieves — Delivers results that align with plan consistently, but solutions and ideas stay within her direct area. No evidence yet of impact outside area of responsibility that would push to Exceeds.
• Excellence: Exceeds — Delivers highest quality results on the Fleet 2.0 launch. Responds to engineering and cross-functional requests with urgency. Knows when to move fast.
• Leadership: Achieves — Solution-oriented and resourceful on tactical problems, but struggling to delegate effectively. David's public nudge about Aisha is a yellow flag. Judgment on tradeoffs is solid but applied to execution, not strategy.
• Simplicity: Achieves — Clear communicator in operational contexts. But no evidence of simplifying complexity at the org level or driving prioritization conversations in strategic channels.
• Collaboration: Exceeds — Actively sought out across engineering, design, and sales. Builds trust naturally. The "Can Sarah weigh in?" signals from multiple teams show genuine collaborative influence.
• Initiative: Achieves — Takes strong ownership of assigned work, but initiative is channeled into execution rather than identifying new problems or driving strategic change unprompted.

---

## PART 5: Steps to Take

1. **Claim the Fleet 2.0 strategy update slot at the next leadership forum** — Right now David is presenting your work for you, which means leadership associates the project with him. Presenting it yourself — focused on strategic decisions and market impact, not timeline updates — shifts the narrative from "Sarah executes David's vision" to "Sarah owns product strategy for Fleet." *Perception shift: reliable executor → strategic product leader.*

2. **Post one strategic insight per week in #product-strategy** — Marco posted 3 times in 2 weeks; you posted 0. You don't need to write essays — a 3-sentence take on a competitive move, a customer trend, or a product bet is enough. The goal is presence. *Perception shift: absent from strategy → active strategic voice.*

3. **Stop answering questions your reports should handle** — Next time Kyle gets a customer escalation or Aisha has a discovery question, reply in the thread with "Tagging @kyle / @aisha — they're running point on this." Then coach them offline. This is the single highest-leverage behavior change: it develops your reports, signals to David you can let go, and frees your time for strategic work. *Perception shift: micromanager who can't delegate → leader who multiplies the team.*

---END VERBATIM OUTPUT---

After outputting the above, ask:

> **For each action item — keep, modify, or drop?**
> 1. Claim the Fleet 2.0 strategy update slot at the next leadership forum
> 2. Post one strategic insight per week in #product-strategy
> 3. Stop answering questions your reports should handle

Only save confirmed action items to coaching notes.

---

## Step 3: Follow-Up Options

> **What would you like me to do next?**
> 1. **Generate a 1:1 agenda** — talking points for Sarah's next 1:1 with David
> 2. **Draft a self-review** — asks 3 reflection questions first, then generates 90%-ready draft
> 3. **Build a growth roadmap** — 6-month plan from Senior PM → Principal PM
> 4. **Find learning resources** — articles, podcasts, books for Sarah's specific gaps
> 5. **I'm good for now** — save session notes and wrap up

Generate everything from the fake persona data. For learning resources, use real WebFetch. For self-review, ask the 3 reflection questions first (`"What are you most proud of this review period?"`, `"Where did you fall short of your own expectations?"`, `"If your manager could only remember one thing about your performance, what should it be?"`), then do the perception gap analysis before drafting.

---

## Step 4: Save to DEMO Coaching Notes

After the user confirms action items and wraps up follow-ups, save to `FeedbackCoach - Coaching Notes - DEMO`.

**Do NOT read the existing doc first** — just append. If the doc doesn't exist, create it via `mcp__google-workspace__gdocs_create`.

Use the full session template from `feedback-coach.md` with these modifications:
- Prefix the session title with `[DEMO]` (e.g., `[DEMO] SESSION 1 — 2026-03-23`)
- Use `• ` (unicode bullet) not `- ` for list items
- Begin appended content with `\n\n\n---\n\n\n` (page break separator)
- Include only the confirmed action items

For the TOC on first creation:
```
# Coaching Notes — Sarah Chen

## Sessions
- [DEMO] SESSION 1 — 2026-03-23 (Full)

---
```

For subsequent sessions, read the existing TOC and add the new entry, then append the session content.

## Input
$ARGUMENTS
