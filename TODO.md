# Image Page Loading + Model Label TODO

## Plan Summary
تحسين تجربة صفحة الصور بحيث الصورة لا تظهر إلا بعد نجاح تحميلها فعليًا، مع بقاء loading واضح ومعالجة أخطاء أفضل، وإظهار اسم المودل المستخدم تحت كل صورة.

## Steps

### 1. [ ] Update `src/app/image/page.tsx` (preload flow)
- Add client-side image preloading before inserting generated image into gallery
- Keep `loading=true` until preload success/failure is resolved
- Prevent broken/half-loaded images from being added

### 2. [ ] Update `src/app/image/page.tsx` (error handling)
- Improve error messages for API failure and image-load failure
- Keep existing proxy/fallback behavior for rendering

### 3. [ ] Update API + UI data shape for model label
- Ensure model used is returned with each generated image item from API
- Display model name under each image card and inside lightbox details

### 4. [ ] Run focused verification
- Verify generation loading behavior and model label rendering in `/image`
- Validate error behavior when generation or image loading fails
