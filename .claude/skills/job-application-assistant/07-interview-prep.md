---
framework_version: 1.0.0
---

# Interview Preparation Guide

<!-- SETUP: STAR examples are personalized by running /setup based on your actual experience -->

## STAR Format

Structure answers as: **Situation** (context), **Task** (your responsibility), **Action** (what you did), **Result** (outcome).

Keep answers to 1-2 minutes. Be specific. End with what you learned or would do differently.

## Ready-Made STAR Examples

<!-- These are populated by /setup from your actual experience. Below are templates showing the format. -->

### 1. Imaji Coffee (full-stack architecture & end-to-end ownership)
**S:** Wanted to prove out full-stack, production-grade system design beyond coursework and short-term co-op assignments - a self-initiated e-commerce platform, not an assigned project.
**T:** Architect and build the entire stack solo: backend API, frontend, auth, payments, real-time features, and deployment.
**A:** Designed and built a Spring Boot 3 (Java 17) REST API with JWT auth and role-based access control (Admin/Customer), paired with a Vite/React 18/TypeScript frontend styled with HeroUI and Tailwind CSS. Added real-time customer chat over WebSocket+STOMP (with SockJS fallback), integrated Stripe and PayPal with webhook-driven order status updates, added Caffeine caching and Swagger API docs, then Dockerized the whole app and deployed it on AWS (Elastic Beanstalk for the backend, Amplify for the frontend) with CI/CD-ready configuration.
**R:** Shipped a live, publicly accessible e-commerce platform (imajiicoffee.cc) covering the full path from auth to payment to deployment - concrete evidence of being able to own a system end-to-end rather than a single layer.
**Use for:** "Tell me about a project you're proud of", "Describe a time you took ownership of something", "Walk me through your technical decision-making"

### 2. Ministry of Public and Business Service Delivery and Procurement (QA automation & root-cause debugging)
**S:** Joined a government software team's QA function during a co-op work term, responsible for catching issues before they reached developers or production.
**T:** Design and maintain automated test coverage, and turn failing tests into actionable defect reports developers can act on quickly.
**A:** Built and maintained automated test scripts in Selenium/Java/Maven, running suites through Azure DevOps CI/CD pipelines. When tests failed, traced root causes rather than just flagging the symptom, and documented defects clearly to speed up developer turnaround. Also reviewed requirements directly with developers and analysts up front to design edge-case-aware test cases, and supported manual/exploratory testing during early development phases.
**R:** Contributed to the team's continuous QA process improvement by catching issues earlier in the cycle and giving developers debugging-ready defect reports instead of raw failures.
**Use for:** "Tell me about a time you found a critical bug", "How do you approach quality/testing?", "Describe working cross-functionally with developers"

### 3. FPT Software (fast ramp-up & delivering under Agile/Scrum)
**S:** Joined FPT Software's Java outsourcing team for a Japan-based client shortly after completing Java & Spring Boot training - a new stack, a new client, and an unfamiliar low-code platform (OutSystems) all within the same role.
**T:** Get productive quickly: build secure REST APIs for the client, then take on migrating existing Python and React applications onto OutSystems.
**A:** Designed and deployed Spring Boot + MySQL API endpoints with proper CORS/CSRF handling, and optimized SQL queries across Azure DB and MySQL to improve data access speed. Migrated Python and React applications to OutSystems, improving query aggregates there for faster response times, and built reusable JavaScript functions/components to cut repeated processing work.
**R:** Consistently delivered on schedule within Agile/Scrum sprints despite ramping up on Spring Boot, a new client's codebase, and OutSystems in quick succession.
**Use for:** "How do you learn a new technology quickly?", "Tell me about working with an unfamiliar tool/platform", "Describe delivering under a deadline"

### 4. Focus Grove (solving a tricky technical problem)
**S:** Building a personal productivity app with a live timer feature, discovered that browser tab throttling silently breaks naive timer implementations - a subtle correctness bug that would only show up after the tab was backgrounded for a while.
**T:** Make the timer reliable regardless of tab state or reloads, without a backend to fall back on.
**A:** Engineered a wall-clock-based timer hook (rather than relying on `setInterval` ticks) so elapsed time is always computed from real timestamps, making it resilient to tab throttling and page reloads. Also built a pluggable auth layer (a mock adapter plus Supabase Google OAuth) and an offline-first sync layer that writes to localStorage first and queues cloud sync to Supabase (with row-level security) when back online.
**R:** Shipped a timer that stays accurate across backgrounded tabs and reloads, plus an app that keeps working offline and syncs safely when connectivity returns - both non-obvious problems solved through root-cause thinking rather than surface fixes.
**Use for:** "Tell me about a hard technical problem you solved", "Describe debugging something subtle", "How do you handle edge cases?"

<!-- Add more STAR examples as needed. Aim for 4-6 covering different competencies. -->

## Common Tough Questions

### "Why did you leave [previous company]?"
> [PREPARE YOUR ANSWER - be honest, forward-looking, no negativity about former employer]

### "You don't have [specific skill/experience]."
> [PREPARE YOUR ANSWER - acknowledge the gap, bridge to adjacent experience, show willingness to learn]

### "Where do you see yourself in 5 years?"
> [PREPARE YOUR ANSWER - show ambition aligned with the role's growth path]

### "What's your biggest weakness?"
> [PREPARE YOUR ANSWER - genuine weakness with concrete mitigation strategy]

### "Why this company specifically?"
> Customize per company. Must reference: specific projects, company values, market position, or team structure. Never give a generic answer.

## Questions You Should Ask Interviewers

### About the Role
- "What does a typical week look like in this role?"
- "What would success look like in the first 6 months?"
- "What's the biggest challenge the team is facing right now?"

### About the Team
- "How big is the team, and how do you divide work?"
- "What does the development/project lifecycle look like, from idea to production?"
- "How do you onboard new team members?"

### About Tech & Growth
- "What's your current tech stack for [relevant area]?"
- "Is there room to grow into more architectural or strategic decisions?"
- "How does the team stay current with new tools and methods?"

### About Culture (use these to prevent disappointment)
- "How would you describe the team culture?"
- "What does professional development look like here?"
- "Is there flexibility for remote/hybrid work?"
- "What's the balance between development/new projects and maintenance work?"
- "How would you describe the leadership style in this team?"
- "What do people who thrive here have in common?"

## Phone/Video Interview Tips
- Have STAR examples written out (use this file)
- Keep a glass of water nearby
- Smile when speaking (it changes your tone)
- Ask for clarification if a question is vague
- It's OK to take 5 seconds to think before answering
- End with: "Is there anything else you'd like to know about my background?"

## After the Application (Best Practice)

### Follow-Up Etiquette
- **Don't call to "stand out"** or to learn more about the role post-submission - this risks a negative impression
- If the employer specified a timeline, respect it and wait
- If no timeline was given and significant time has passed (2+ weeks), a brief call to ask about status is acceptable
- If you have genuinely new, relevant information to share, a short follow-up is fine

### Thank-You Notes
- When you receive any update (interview invitation, rejection, or status update), send a brief thank-you message
- Express appreciation for their time and the process
- Keep it short (2-3 sentences)

## Roleplay Guidelines
When the user asks for interview practice:
1. Ask which role/company to simulate
2. Start with easy warm-up questions ("Tell me about yourself")
3. Progress to role-specific technical questions
4. Include 1-2 behavioral questions using the competencies from the job posting
5. End with a tough question or curveball
6. After each answer, give brief feedback: what worked, what to sharpen
7. Suggest which STAR example would work best for each question
