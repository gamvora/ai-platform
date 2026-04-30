# TODO - Mobile Full Support + Bot Avatar

## Bot Avatar Customization
- [x] Analyze current files and requirements
- [x] Add `botAvatarUrl` to user preference types
- [x] Extend preferences API sanitization/defaults to support `botAvatarUrl`
- [x] Update chat page to fetch user preferences and pass bot avatar URL to messages
- [x] Update ChatMessage component to render custom bot avatar image (fallback to icon)
- [x] Add Settings > Preferences UI for:
  - [x] choosing from a large preset gallery
  - [x] uploading custom image
  - [x] saving selected URL in preferences

## Mobile Full Support
- [ ] Improve global mobile CSS (safe-area, tap targets, overflow guards)
- [ ] Improve Sidebar mobile drawer UX
- [ ] Improve ChatInput mobile UX
- [ ] Improve ChatMessage mobile readability
- [ ] Improve Chat page mobile layout
- [ ] Improve Dashboard mobile layout
- [ ] Run critical-path mobile testing (chat/settings/dashboard)
