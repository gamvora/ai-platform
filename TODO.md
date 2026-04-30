# TODO - Fix chat image analysis failures

- [x] 1) Investigate `/api/chat` and `toExternalImageRef` image handling path
- [x] 2) Update `src/lib/blackbox.ts` to convert external image URLs to data URI when possible
- [x] 3) Improve `/api/chat/route.ts` error handling for image-specific failures
- [ ] 4) Commit and push fixes
- [ ] 5) Validate critical-path behavior (chat with image + chat text-only)
