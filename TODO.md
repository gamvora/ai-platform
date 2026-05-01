# Voice Call AI Upgrade TODO

## Plan Summary
Upgrade existing voice system to a production-grade ChatGPT Voice-like experience:
- Single voice engine module in `VoiceCallModal`
- Real-time STT → `/api/chat` → TTS loop
- Premium immersive UI + waveform animation
- Voice controls (voice, preview, pitch, speed, language), including mid-call switching
- Barge-in handling and preserved chat memory

## Steps

### 1. [ ] Refactor `src/app/chat/page.tsx`
- Remove duplicated legacy voice loop logic from chat page
- Keep standard chat send flow and conversation memory
- Add dedicated voice trigger button above chat input: `🎤 Voice Call`
- Open modal via `openVoiceCall` state
- Provide modal callback `onUserUtterance(text)` that:
  - appends user voice transcript to chat
  - calls `/api/chat`
  - appends assistant response
  - returns assistant text for TTS playback
- Render `<VoiceCallModal open={openVoiceCall} onClose={...} onUserUtterance={...} />`
- Disable regular text input while voice modal is active

### 2. [ ] Upgrade `src/components/VoiceCallModal.tsx`
- Add explicit setup and in-call states
- Ensure 3–5 voice options minimum in selector
- Keep voice preview before start and allow voice switch during call
- Keep pitch/speed/language controls
- Implement robust real-time recognition loop with graceful restart and interruption handling
- Implement immersive premium UI:
  - fullscreen gradient/glass panel
  - animated glowing orb + layered pulse rings
  - live mic level reactive waveform bars
  - modern End Call + Mute Mic + Pause/Resume controls
- Add concise realtime transcript hints (last user + AI snippet)
- Keep keyboard shortcut support (V toggle, Esc end)

### 3. [ ] Validate dependent component behavior
- `src/components/ChatInput.tsx`: disable while voice modal is open
- Confirm no broken imports/icons in chat page

### 4. [ ] Type-check / sanity verification
- Run TypeScript validation from `ai-platform`
- Fix any compile-time issues introduced by refactor

### 5. [ ] Final cleanup
- Mark completed checklist items
- Prepare implementation summary with integration notes
