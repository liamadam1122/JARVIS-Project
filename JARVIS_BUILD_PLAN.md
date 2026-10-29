# JARVIS Assistant — Build Plan

## Goal
Build a futuristic personal AI assistant, starting as a small web app and adding capabilities safely one at a time.

## First version (MVP)
- A clean, futuristic chat interface
- Send a text message and show the assistant's reply
- Loading state and readable error messages
- API key kept in a local environment file, never committed to GitHub

## Later versions
1. Voice input and spoken replies
2. Saved conversations
3. User-approved tools and app integrations
4. Optional proactive features, with clear controls and permissions

## Suggested beginner stack
- Next.js + TypeScript for the web app
- Tailwind CSS for styling
- A model API called from a server-side route
- GitHub for version history

## Safety rules
- Never put API keys, passwords, or private tokens in source code or GitHub.
- Start with read-only integrations; ask before sending messages, deleting files, spending money, or changing accounts.
- Do not give the assistant unrestricted access to the computer.
- Test each feature before adding the next one.

## First milestone
Run a basic app locally on the Mac before adding AI, voice, or account integrations.
