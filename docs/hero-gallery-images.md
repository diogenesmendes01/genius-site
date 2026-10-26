# Hero gallery: image provenance

The gallery adds two illustrative scenes with different teachers and desk settings. These images are generated representations of online classes; they are not presented as portraits of actual GENIUS teachers or students. The existing image caption must remain visible.

## Generation and optimization

- Mode: built-in `image_gen` tool, two separate generation calls. No fallback CLI or API credentials.
- The existing `public/assets/hero-class-v8.webp` was visually inspected as a composition and warmth reference. No input image was passed to either generation call; both new scenes were generated from the prompts below.
- Native outputs: 1672 × 941 pixels, landscape (approximately 16:9).
- PNG originals are preserved in the local project at `output/imagegen/hero-gallery/`, outside this PR worktree.
- Final files were encoded to WebP using Pillow, quality 88, method 6. No resizing, upscaling, compositing, cropping or retouching was performed.
- Each optimized file was inspected after conversion. The laptop and teacher stay clear, the left side is quiet for the existing headline, the warm lighting matches the approved direction, and the small Brazilian flag exists only behind the teacher inside the call.
- Both files are well below 300 KB. They should load after the initial hero image, so they do not compete with first paint.

| Scene | Asset | Dimensions | Bytes |
| --- | --- | --- | ---: |
| Conversation with a female teacher in a warm wood study | `public/assets/hero-class-conversation.webp` | 1672 × 941 | 86,846 |
| Practice with a male teacher, a lighter desk and a different angle | `public/assets/hero-class-practice.webp` | 1672 × 941 | 97,408 |

## Native output paths

Conversation:
`C:/Users/Mendes/.codex/generated_images/01a0afff-0897-73d3-ac0f-613e34f8802d/exec-50b07a9f-856b-4d1d-8d29-e7c779049488.png`

Practice:
`C:/Users/Mendes/.codex/generated_images/01a0afff-0897-73d3-ac0f-613e34f8802d/exec-57724153-6eac-4082-9694-fa1853bda5d4.png`

Local archival copies:
- `output/imagegen/hero-gallery/hero-class-conversation.png`
- `output/imagegen/hero-gallery/hero-class-practice.png`

## Exact prompt: conversation

```text
Use case: photorealistic-natural.
Asset type: a premium live Portuguese school website hero photo, a single real-looking 16:9 landscape photograph at approximately 2048 x 1152. Generate one image, not a collage.

Scene: a student's warm, tidy home study at late afternoon. A substantial walnut desk, simple cream ceramic mug, a plain open paper notebook with no writing, a subtle green plant and a laptop. The student's shoulder in a soft natural linen shirt is only a small, out-of-focus fragment at the far lower right, never obscuring the screen. No student face is visible. This is a real live lesson seen over the student's shoulder, not a portrait shoot.

Main subject: the sharply photographed laptop screen shows a Brazilian female teacher around 44 years old, medium brown skin, naturally curly dark shoulder-length hair, understated dark headset with microphone, soft terracotta blouse, engaged and naturally smiling while explaining a conversation exercise. Her face has natural visible skin texture and expressive features, not airbrushed. Her hands, if visible, are anatomically plausible and relaxed. Her screen background is a beautiful warm home office with oak shelving, a shaded warm lamp, a plant, and exactly one small Brazilian table flag clearly behind her INSIDE the video call. No flag anywhere in the student's room.

Composition is critical: left 0–39% of the whole image is quiet dark navy wall and subtly shaded desk, usable negative space for the site's separate white headline and button. Do not generate text there. The laptop dominates the central/right area, spanning approximately x40%–85%; the teacher's face centered at x61% of the full image, near y40%. Keep the laptop screen front-facing enough to see the teacher well, with a mild realistic perspective; not pushed against the right edge. Warm wood fills the base. The teacher, laptop bezel and keyboard should be crisp and detailed; foreground shoulder and room background naturally defocused. Clear optical focus, believable screen reflections, documentary editorial DSLR photo, 50mm lens, natural window light, warm skin and brown shadows. The overall navy/cream/walnut palette feels expensive yet real, without a heavy blue filter over the teacher.

Make this a genuinely different scene from a generic bright-window desk: cozy walnut reading alcove, no large window in frame, evening lamp warmth balanced by natural daylight. No landscape, no Rio, no tourism, no landmark. No text, numbers, letters, logos, watermark, call interface, subtitles, promotional graphics, writing on mugs, writing on desk, or legible book spines. No illustration, no 3D render, no waxy AI skin, no oversaturated colors, no lens flare. The product is clearly a teacher in a live laptop class.
```

## Exact prompt: practice

```text
Use case: photorealistic-natural.
Asset type: premium live Portuguese school website hero, ONE photograph in wide 16:9 landscape, approximately 2048 x 1152, not a collage.

Primary request: show a genuinely candid live Portuguese lesson with a different scene and different people. Camera is behind a student's right shoulder, aimed at a laptop on a honey-oak desk in a warm daylight study. Only a small out-of-focus piece of the student's back in a muted charcoal knit shirt and their forearm near the notebook can appear in the lower right. Do not show their face and do not let them obscure the screen.

Main product: laptop screen showing an expressive Brazilian male teacher about 35 years old, deep brown skin, short natural textured hair, neatly trimmed facial hair, dark over-ear headset with small boom microphone, relaxed light sand-colored cotton shirt. Naturally attentive mid-conversation, a small genuine smile, one relaxed hand gesturing near lower edge. Real skin pores, small natural imperfections, absolutely photographic, not an airbrushed advertising model. Inside his video call is a beautiful tidy study with a wood console, soft neutral wall, subtle framed abstract art, green plant, and exactly one small Brazilian table flag in the background behind him. The flag belongs inside the laptop video image only. No Brazilian objects outside it.

Precise site composition: leftmost 0–39% of the entire frame is empty deep navy wall and quiet shaded desk, kept visually simple for separately overlaid website headline. No text in the photograph. Laptop is large at the center/right, from x39% to x84% of the whole frame, with the teacher's face centered around x60% and y39%. Keep the teacher comfortably inward from the right edge. Unlike a straight-on laptop product packshot, this scene has a subtle 10-degree desk/laptop angle, but the display is sufficiently front-facing that the teacher's face is completely clear and natural. A plain pale ceramic cup at the left of the laptop, a small plant, an unmarked open paper notebook and pen at lower right. Daylight softly crosses the honey wood from a window outside the frame, no window or view required. Keep the foreground student's shoulder smaller than 13% of the picture.

Natural editorial photography with a high quality full-frame DSLR and 50mm lens, realistic screen luminance and restrained reflections, sharp teacher face and laptop, warm beige highlights and gentle brown shadows, soft background bokeh. The real light is warm and balanced, not orange, and the face is not covered by navy filters. The whole photo supports a navy/cream/gold website without generating any page graphics.

Avoid entirely: any letters or typography, book spine text, call UI, logos, watermarks, landmarks, Rio city views, beaches, tourism, maps, waving large flag, giant bright window, staged stock smile, waxy skin, fake 3D rendering, blur on the teacher, or anatomy defects. The laptop live lesson, not the room or student, is the unmistakable focal point.
```
